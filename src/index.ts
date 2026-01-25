/**
 * Work Manager Extension for Stina
 */

import { initializeExtension, type ExtensionContext, type ExecutionContext, type Disposable } from '@stina/extension-api/runtime'
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
import { WorkRepository } from './db/repository.js'
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

type DatabaseApi = {
  execute: <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>
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

function activate(context: ExtensionContext): Disposable {
  context.log.info('Activating Work Manager extension')

  // Debug: log available context keys to understand the structure
  const contextKeys = Object.keys(context)
  context.log.info('Context keys available', { keys: contextKeys })

  if (!context.database) {
    context.log.warn('Database permission missing; Work Manager disabled')
    return { dispose: () => undefined }
  }

  // Repository is created without a user scope - use repository.withUser(userId) for user-scoped operations
  const repository = new WorkRepository(context.database as DatabaseApi)
  void repository.initialize()

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
   * Schedule a reminder for a todo item.
   * @param todo The todo to schedule
   * @param userId The user ID to scope the reminder to
   */
  const scheduleTodo = async (todo: WorkTodo, userId: string): Promise<void> => {
    if (!scheduler) return
    try {
      const jobId = getReminderJobId(todo.id, userId)

      if (!isTodoActive(todo)) {
        await scheduler.cancel(jobId)
        return
      }

      const userRepo = repository.withUser(userId)
      const settings = await userRepo.getSettings()
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
   * Cancel a scheduled reminder for a todo item.
   * @param todoId The todo ID
   * @param userId The user ID
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
   * Schedule reminders for all active todos for a specific user.
   * @param userId The user ID to schedule reminders for
   */
  const scheduleAllTodosForUser = async (userId: string): Promise<void> => {
    if (!scheduler) return
    try {
      const userRepo = repository.withUser(userId)
      const pageSize = 200
      let offset = 0

      while (true) {
        const todos = await userRepo.listTodos({ limit: pageSize, offset })
        if (todos.length === 0) break

        for (const todo of todos) {
          await scheduleTodo(todo, userId)
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

        // Use user-scoped repository
        const userRepo = repository.withUser(currentUserId)
        const todo = await userRepo.getTodo(todoId)
        if (!todo || !isTodoActive(todo)) return

        const settings = await userRepo.getSettings()
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
              const userRepo = repository.withUser(execContext.userId)
              const groups = await userRepo.listPanelGroups()
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
              const userRepo = repository.withUser(execContext.userId)
              const settings = await userRepo.getSettings()
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
              const userRepo = repository.withUser(execContext.userId)
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

              await userRepo.updateSettings(update)
              emitSettingsRefresh()
              void scheduleAllTodosForUser(execContext.userId)

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

    context.tools!.register(createListProjectsTool(repository)),
    context.tools!.register(createGetProjectTool(repository)),
    context.tools!.register(createUpsertProjectTool(repository, (_userId) => emitProjectRefresh())),
    context.tools!.register(createDeleteProjectTool(repository, (_userId) => emitProjectRefresh())),

    context.tools!.register(createListTodosTool(repository)),
    context.tools!.register(createGetTodoTool(repository)),
    context.tools!.register(
      createUpsertTodoTool(repository, (todo, userId) => {
        emitTodoRefresh()
        void scheduleTodo(todo, userId)
      })
    ),
    context.tools!.register(
      createDeleteTodoTool(repository, (todoId, userId) => {
        emitTodoRefresh()
        void cancelTodo(todoId, userId)
      })
    ),

    context.tools!.register(createAddCommentTool(repository, (_userId) => emitTodoRefresh())),
    context.tools!.register(createDeleteCommentTool(repository, (_userId) => emitTodoRefresh())),

    context.tools!.register(createAddSubItemTool(repository, (_userId) => emitTodoRefresh())),
    context.tools!.register(createDeleteSubItemTool(repository, (_userId) => emitTodoRefresh())),

    context.tools!.register(createListSettingsTool(repository)),
    context.tools!.register(createGetSettingsTool(repository)),
    context.tools!.register(
      createUpdateSettingsTool(repository, (_settings, userId) => {
        emitSettingsRefresh()
        void scheduleAllTodosForUser(userId)
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

  // Note: Reminder scheduling now happens per-user when todos are created/updated
  // via scheduleTodo() called from the tool callbacks

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
