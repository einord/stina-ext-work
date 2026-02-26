import type { StorageAPI, Disposable } from '@stina/extension-api/runtime'
import { handleRecurringTemplates, type RecurringHandlerCallbacks } from './handler.js'

const POLL_INTERVAL_MS = 60_000  // 60 seconds
const ACTIVE_USERS_KEY = 'recurringActiveUsers'

export interface BackgroundWorkersAPI {
  start(config: BackgroundTaskConfig, callback: BackgroundTaskCallback): Promise<Disposable>
  stop(taskId: string): Promise<void>
  getStatus(): Promise<BackgroundTaskHealth[]>
}

export interface BackgroundTaskConfig {
  id: string
  name: string
  userId: string
  restartPolicy: {
    type: 'always' | 'on-failure' | 'never'
    maxRestarts?: number
    initialDelayMs?: number
    maxDelayMs?: number
  }
  payload?: Record<string, unknown>
}

export interface BackgroundTaskContext {
  readonly signal: AbortSignal
  reportHealth(status: string): void
  readonly log: {
    info(msg: string, data?: Record<string, unknown>): void
    warn(msg: string, data?: Record<string, unknown>): void
    error(msg: string, data?: Record<string, unknown>): void
  }
  readonly userId: string
  readonly userStorage: StorageAPI
}

export type BackgroundTaskCallback = (context: BackgroundTaskContext) => Promise<void>

export interface BackgroundTaskHealth {
  taskId: string
  name: string
  userId: string
  status: 'pending' | 'running' | 'stopped' | 'failed' | 'restarting'
  restartCount: number
  lastHealthStatus?: string
  lastHealthTime?: string
  error?: string
}

const getTaskId = (userId: string): string => `recurring-poll:${userId}`

/**
 * Utility to sleep for a given duration, respecting an AbortSignal.
 * Resolves early (with 'aborted') if the signal fires.
 */
const abortableSleep = (ms: number, signal: AbortSignal): Promise<'timeout' | 'aborted'> => {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve('aborted')
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve('timeout')
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve('aborted')
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Manages the recurring templates background worker lifecycle.
 * Tracks which users have active templates and starts/stops workers accordingly.
 */
export class RecurringWorkerManager {
  private readonly backgroundWorkers: BackgroundWorkersAPI
  private readonly extensionStorage: StorageAPI
  private readonly runningWorkers = new Map<string, Disposable>()
  private readonly callbacks: RecurringHandlerCallbacks
  private readonly log: {
    info(msg: string, data?: Record<string, unknown>): void
    warn(msg: string, data?: Record<string, unknown>): void
  }

  constructor(options: {
    backgroundWorkers: BackgroundWorkersAPI
    extensionStorage: StorageAPI
    callbacks: RecurringHandlerCallbacks
    log: {
      info(msg: string, data?: Record<string, unknown>): void
      warn(msg: string, data?: Record<string, unknown>): void
    }
  }) {
    this.backgroundWorkers = options.backgroundWorkers
    this.extensionStorage = options.extensionStorage
    this.callbacks = options.callbacks
    this.log = options.log
  }

  /**
   * Restores workers for all previously active users.
   * Should be called during extension activation.
   */
  async restoreWorkers(): Promise<void> {
    const userIds = await this.getActiveUserIds()
    this.log.info('Restoring recurring workers', { userCount: userIds.length })
    for (const userId of userIds) {
      await this.ensureWorkerRunning(userId)
    }
  }

  /**
   * Ensures a background worker is running for the given user.
   * If already running, does nothing.
   */
  async ensureWorkerRunning(userId: string): Promise<void> {
    const taskId = getTaskId(userId)
    if (this.runningWorkers.has(userId)) return

    try {
      const callbacks = this.callbacks
      const disposable = await this.backgroundWorkers.start(
        {
          id: taskId,
          name: `Recurring templates (${userId})`,
          userId,
          restartPolicy: {
            type: 'on-failure',
            maxRestarts: 0, // 0 = unlimited restarts per BackgroundWorkers API spec
            initialDelayMs: 5000,
            maxDelayMs: 60000,
          },
        },
        async (ctx: BackgroundTaskContext) => {
          ctx.log.info('Recurring worker started')
          while (!ctx.signal.aborted) {
            try {
              await handleRecurringTemplates(ctx.userStorage, ctx.userId, {
                ...callbacks,
                log: ctx.log,
              })
              ctx.reportHealth(`Last check: ${new Date().toISOString()}`)
            } catch (error) {
              ctx.log.warn('Error in recurring handler tick', {
                error: error instanceof Error ? error.message : String(error),
              })
            }
            const result = await abortableSleep(POLL_INTERVAL_MS, ctx.signal)
            if (result === 'aborted') break
          }
          ctx.log.info('Recurring worker stopped')
        }
      )

      this.runningWorkers.set(userId, disposable)
      await this.addActiveUserId(userId)
      this.log.info('Recurring worker started for user', { userId, taskId })
    } catch (error) {
      this.log.warn('Failed to start recurring worker', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Stops the background worker for a user (e.g., when all templates are disabled/deleted).
   */
  async stopWorker(userId: string): Promise<void> {
    const disposable = this.runningWorkers.get(userId)
    if (disposable) {
      disposable.dispose()
      this.runningWorkers.delete(userId)
    }
    try {
      await this.backgroundWorkers.stop(getTaskId(userId))
    } catch {
      // Worker might already be stopped
    }
    await this.removeActiveUserId(userId)
    this.log.info('Recurring worker stopped for user', { userId })
  }

  /**
   * Checks if a user has any enabled templates and starts/stops worker accordingly.
   * Call this after template create/update/delete operations.
   */
  async syncWorkerForUser(userId: string, userStorage: StorageAPI): Promise<void> {
    const { WorkRepository } = await import('../storage/repository.js')
    const repo = new WorkRepository(userStorage)
    const templates = await repo.listRecurringTemplates({ enabledOnly: true })

    if (templates.length > 0) {
      await this.ensureWorkerRunning(userId)
    } else {
      await this.stopWorker(userId)
    }
  }

  /**
   * Stops all running workers. Called during extension deactivation.
   */
  async dispose(): Promise<void> {
    for (const [userId] of this.runningWorkers) {
      await this.stopWorker(userId)
    }
    this.runningWorkers.clear()
  }

  // --- Active users tracking in extension storage ---

  private async getActiveUserIds(): Promise<string[]> {
    try {
      const doc = await this.extensionStorage.get('settings', ACTIVE_USERS_KEY) as { userIds?: string[] } | null
      return doc?.userIds ?? []
    } catch {
      return []
    }
  }

  private async addActiveUserId(userId: string): Promise<void> {
    const userIds = await this.getActiveUserIds()
    if (!userIds.includes(userId)) {
      userIds.push(userId)
      await this.extensionStorage.put('settings', ACTIVE_USERS_KEY, { userIds })
    }
  }

  private async removeActiveUserId(userId: string): Promise<void> {
    const userIds = await this.getActiveUserIds()
    const filtered = userIds.filter((id) => id !== userId)
    await this.extensionStorage.put('settings', ACTIVE_USERS_KEY, { userIds: filtered })
  }
}
