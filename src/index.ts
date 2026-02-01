/**
 * Work Manager Extension for Stina
 *
 * Manages work projects, todos, reminders, and settings using the
 * Extension Storage System.
 */

import { initializeExtension, type ExtensionContext, type ExecutionContext, type Disposable, type StorageAPI } from '@stina/extension-api/runtime'
import {
  createListProjectsTool,
  createGetProjectTool,
  createUpsertProjectTool,
  createDeleteProjectTool,
  createListTodosTool,
  createGetTodoTool,
  createUpsertTodoTool,
  createDeleteTodoTool,
  createAddCommentTool,
  createDeleteCommentTool,
  createAddSubItemTool,
  createDeleteSubItemTool,
  createListSettingsTool,
  createGetSettingsTool,
  createUpdateSettingsTool,
} from './tools/index.js'
import { WorkRepository } from './storage/index.js'
import { buildInstructionMessage, isTodoActive, resolveReminderAt } from './reminders.js'
import type { SchedulerFirePayload } from './reminders.js'
import type { WorkTodo } from './types.js'

type EventsApi = { emit: (name: string, payload?: Record<string, unknown>) => Promise<void> }

type ActionsApi = {
  register: (action: {
    id: string
    execute: (params: Record<string, unknown>, execContext: ExecutionContext) => Promise<{ success: boolean; data?: unknown; error?: string }>
  }) => { dispose: () => void }
}

type SchedulerJobRequest = {
  id: string
  schedule: { type: 'at'; at: string }
  payload?: Record<string, unknown>
  misfire?: 'run_once' | 'skip'
  userId: string
}

type SchedulerAPI = {
  schedule: (job: SchedulerJobRequest) => Promise<void>
  cancel: (jobId: string) => Promise<void>
  onFire: (callback: (payload: SchedulerFirePayload, execContext: ExecutionContext) => void) => Disposable
}

type ChatAPI = {
  appendInstruction: (message: { text: string; conversationId?: string; userId?: string }) => Promise<void>
}

type UserApi = {
  getProfile: () => Promise<{
    firstName?: string
    nickname?: string
    language?: string
    timezone?: string
  }>
}

/**
 * Activates the Work Manager extension.
 * @param context - The extension context provided by the host
 * @returns A disposable for cleanup
 */
function activate(context: ExtensionContext): Disposable {
  context.log.info('Activating Work Manager extension')

  // Debug: log available context keys
  const contextKeys = Object.keys(context)
  context.log.info('Context keys available', { keys: contextKeys })

  if (!context.storage) {
    context.log.warn('Storage permission missing; Work Manager disabled')
    return { dispose: () => undefined }
  }

  const eventsApi = (context as ExtensionContext & { events?: EventsApi }).events
  const emitEvent = (name: string) => {
    if (!eventsApi) return
    void eventsApi.emit(name, { at: new Date().toISOString() })
  }

  const emitTodoRefresh = () => emitEvent('work.todo.changed')
  const emitProjectRefresh = () => emitEvent('work.project.changed')
  const emitSettingsRefresh = () => emitEvent('work.settings.changed')

  const scheduler = (context as ExtensionContext & { scheduler?: SchedulerAPI }).scheduler
  const chat = (context as ExtensionContext & { chat?: ChatAPI }).chat
  const userApi = (context as ExtensionContext & { user?: UserApi }).user
  const actionsApi = (context as ExtensionContext & { actions?: ActionsApi }).actions

  const getReminderJobId = (todoId: string, userId: string): string => {
    return `todo.reminder:${userId}:${todoId}`
  }

  const resolveUserProfile = async (): Promise<{
    name?: string
    language?: string | null
  }> => {
    if (!userApi) return {}
    try {
      const profile = await userApi.getProfile()
      return {
        name: profile.nickname ?? profile.firstName,
        language: profile.language ?? null,
      }
    } catch (error) {
      context.log.warn('Failed to load user profile', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {}
    }
  }

  /**
   * Schedules a reminder for a todo item.
   * @param todo - The todo to schedule
   * @param userId - The user ID to scope the reminder to
   * @param userStorage - The user-scoped storage API
   */
  const scheduleTodo = async (todo: WorkTodo, userId: string, userStorage: StorageAPI): Promise<void> => {
    if (!scheduler) return
    try {
      const jobId = getReminderJobId(todo.id, userId)

      if (!isTodoActive(todo)) {
        await scheduler.cancel(jobId)
        return
      }

      const repo = new WorkRepository(userStorage)
      const settings = await repo.getSettings()
      const reminderAt = resolveReminderAt(todo, settings)
      if (!reminderAt) {
        await scheduler.cancel(jobId)
        return
      }

      await scheduler.schedule({
        id: jobId,
        schedule: { type: 'at', at: reminderAt },
        payload: { todoId: todo.id, userId },
        misfire: 'run_once',
        userId,
      })
    } catch (error) {
      context.log.warn('Failed to schedule todo reminder', {
        id: todo.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Cancels a scheduled reminder for a todo item.
   * @param todoId - The todo ID
   * @param userId - The user ID
   */
  const cancelTodo = async (todoId: string, userId: string): Promise<void> => {
    if (!scheduler) return
    try {
      await scheduler.cancel(getReminderJobId(todoId, userId))
    } catch (error) {
      context.log.warn('Failed to cancel todo reminder', {
        id: todoId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Schedules reminders for all active todos for a specific user.
   * @param userId - The user ID to schedule reminders for
   * @param userStorage - The user-scoped storage API
   */
  const scheduleAllTodosForUser = async (userId: string, userStorage: StorageAPI): Promise<void> => {
    if (!scheduler) return
    try {
      const repo = new WorkRepository(userStorage)
      const pageSize = 200
      let offset = 0

      while (true) {
        const todos = await repo.listTodos({ limit: pageSize, offset })
        if (todos.length === 0) break

        for (const todo of todos) {
          await scheduleTodo(todo, userId, userStorage)
        }

        if (todos.length < pageSize) break
        offset += pageSize
      }
    } catch (error) {
      context.log.warn('Failed to schedule reminders for todos', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const schedulerDisposable = scheduler?.onFire((payload, execContext) => {
    void (async () => {
      try {
        if (!chat) return

        // Verify the reminder belongs to this user using request-scoped context
        const payloadUserId = payload.payload?.userId as string | undefined
        const currentUserId = execContext.userId
        if (!currentUserId || payloadUserId !== currentUserId) return

        const todoId = payload.payload?.todoId
        if (!todoId || typeof todoId !== 'string') return

        // Use user-scoped storage from execution context
        const repo = new WorkRepository(execContext.userStorage)
        const todo = await repo.getTodo(todoId)
        if (!todo || !isTodoActive(todo)) return

        const settings = await repo.getSettings()
        const profile = await resolveUserProfile()
        const message = buildInstructionMessage(todo, payload, settings, {
          userName: profile?.name,
          userLanguage: profile?.language,
        })
        await chat.appendInstruction({ text: message, userId: currentUserId })
      } catch (error) {
        context.log.warn('Failed to handle scheduler fire', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })()
  })

  // Register UI actions for component-based panels and settings
  const actionDisposables = actionsApi
    ? [
        actionsApi.register({
          id: 'getGroups',
          async execute(_params: Record<string, unknown>, execContext: ExecutionContext) {
            try {
              if (!execContext.userId) {
                return { success: false, error: 'User context required' }
              }
              const repo = new WorkRepository(execContext.userStorage)
              const groups = await repo.listPanelGroups()
              return { success: true, data: groups }
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }
            }
          },
        }),
        actionsApi.register({
          id: 'getSettings',
          async execute(_params: Record<string, unknown>, execContext: ExecutionContext) {
            try {
              if (!execContext.userId) {
                return { success: false, error: 'User context required' }
              }
              const repo = new WorkRepository(execContext.userStorage)
              const settings = await repo.getSettings()
              // Convert values to strings for Select components
              return {
                success: true,
                data: {
                  defaultReminderMinutes: String(settings.defaultReminderMinutes),
                  allDayReminderTime: settings.allDayReminderTime ?? '',
                  reminderLocale: settings.reminderLocale ?? 'auto',
                },
              }
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }
            }
          },
        }),
        actionsApi.register({
          id: 'updateSetting',
          async execute(params: Record<string, unknown>, execContext: ExecutionContext) {
            try {
              if (!execContext.userId) {
                return { success: false, error: 'User context required' }
              }
              const repo = new WorkRepository(execContext.userStorage)
              const key = params.key as string
              const value = params.value as string

              const update: Record<string, unknown> = {}
              if (key === 'defaultReminderMinutes') {
                update[key] = value === 'null' ? null : parseInt(value, 10)
              } else if (key === 'allDayReminderTime') {
                update[key] = value || null
              } else if (key === 'reminderLocale') {
                update[key] = value === 'auto' ? null : value
              }

              await repo.updateSettings(update)
              emitSettingsRefresh()
              void scheduleAllTodosForUser(execContext.userId, execContext.userStorage)

              return { success: true }
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }
            }
          },
        }),
      ]
    : []

  const disposables = [
    ...actionDisposables,

    context.tools!.register(createListProjectsTool()),
    context.tools!.register(createGetProjectTool()),
    context.tools!.register(createUpsertProjectTool((_userId) => emitProjectRefresh())),
    context.tools!.register(createDeleteProjectTool((_userId) => emitProjectRefresh())),

    context.tools!.register(createListTodosTool()),
    context.tools!.register(createGetTodoTool()),
    context.tools!.register(
      createUpsertTodoTool((_todo, _userId) => {
        emitTodoRefresh()
        // Note: We can't easily pass userStorage here since we don't have execContext
        // The scheduler will get the storage from its own execContext when it fires
      })
    ),
    context.tools!.register(
      createDeleteTodoTool((todoId, userId) => {
        emitTodoRefresh()
        void cancelTodo(todoId, userId)
      })
    ),

    context.tools!.register(createAddCommentTool((_userId) => emitTodoRefresh())),
    context.tools!.register(createDeleteCommentTool((_userId) => emitTodoRefresh())),

    context.tools!.register(createAddSubItemTool((_userId) => emitTodoRefresh())),
    context.tools!.register(createDeleteSubItemTool((_userId) => emitTodoRefresh())),

    context.tools!.register(createListSettingsTool()),
    context.tools!.register(createGetSettingsTool()),
    context.tools!.register(
      createUpdateSettingsTool((_settings, _userId) => {
        emitSettingsRefresh()
        // Note: Scheduling happens in the action or would need execContext
      })
    ),
    ...(schedulerDisposable ? [schedulerDisposable] : []),
  ]

  context.log.info('Work Manager registered', {
    tools: [
      'work_projects_list',
      'work_projects_get',
      'work_projects_upsert',
      'work_projects_delete',
      'work_todos_list',
      'work_todos_get',
      'work_todos_upsert',
      'work_todos_delete',
      'work_comments_add',
      'work_comments_delete',
      'work_subitems_add',
      'work_subitems_delete',
      'work_settings_list',
      'work_settings_get',
      'work_settings_update',
    ],
    actions: actionsApi ? ['getGroups', 'getSettings', 'updateSetting'] : [],
  })

  return {
    dispose: () => {
      for (const disposable of disposables) {
        disposable.dispose()
      }
      context.log.info('Work Manager extension deactivated')
    },
  }
}

function deactivate(): void {
  // Cleanup handled by disposable returned from activate
}

initializeExtension({ activate, deactivate })
