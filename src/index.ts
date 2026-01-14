/**
 * Work Manager Extension for Stina
 */

import { initializeExtension, type ExtensionContext, type Disposable } from '@stina/extension-api/runtime'
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
    execute: (params: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string }>
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
}

type SchedulerAPI = {
  schedule: (job: SchedulerJobRequest) => Promise<void>
  cancel: (jobId: string) => Promise<void>
  onFire: (callback: (payload: SchedulerFirePayload) => void) => Disposable
}

type ChatAPI = {
  appendInstruction: (message: { text: string; conversationId?: string }) => Promise<void>
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

  if (!context.database) {
    context.log.warn('Database permission missing; Work Manager disabled')
    return { dispose: () => undefined }
  }

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

  const getReminderJobId = (todoId: string): string => `todo.reminder:${todoId}`

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

  const scheduleTodo = async (todo: WorkTodo): Promise<void> => {
    if (!scheduler) return
    try {
      if (!isTodoActive(todo)) {
        await scheduler.cancel(getReminderJobId(todo.id))
        return
      }

      const settings = await repository.getSettings()
      const reminderAt = resolveReminderAt(todo, settings)
      if (!reminderAt) {
        await scheduler.cancel(getReminderJobId(todo.id))
        return
      }

      await scheduler.schedule({
        id: getReminderJobId(todo.id),
        schedule: { type: 'at', at: reminderAt },
        payload: { todoId: todo.id },
        misfire: 'run_once',
      })
    } catch (error) {
      context.log.warn('Failed to schedule todo reminder', {
        id: todo.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const cancelTodo = async (todoId: string): Promise<void> => {
    if (!scheduler) return
    try {
      await scheduler.cancel(getReminderJobId(todoId))
    } catch (error) {
      context.log.warn('Failed to cancel todo reminder', {
        id: todoId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const scheduleAllTodos = async (): Promise<void> => {
    if (!scheduler) return
    try {
      const pageSize = 200
      let offset = 0

      while (true) {
        const todos = await repository.listTodos({ limit: pageSize, offset })
        if (todos.length === 0) break

        for (const todo of todos) {
          await scheduleTodo(todo)
        }

        if (todos.length < pageSize) break
        offset += pageSize
      }
    } catch (error) {
      context.log.warn('Failed to schedule reminders for todos', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const schedulerDisposable = scheduler?.onFire((payload) => {
    void (async () => {
      try {
        if (!chat) return
        const todoId = payload.payload?.todoId
        if (!todoId || typeof todoId !== 'string') return

        const todo = await repository.getTodo(todoId)
        if (!todo || !isTodoActive(todo)) return

        const settings = await repository.getSettings()
        const profile = await resolveUserProfile()
        const message = buildInstructionMessage(todo, payload, settings, {
          userName: profile?.name,
          userLanguage: profile?.language,
        })
        await chat.appendInstruction({ text: message })
      } catch (error) {
        context.log.warn('Failed to handle scheduler fire', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })()
  })

  // State for edit modal
  let editingTodoId: string | null = null
  let editingTodoData: {
    title?: string
    description?: string
    status?: string
    dueAt?: string
  } = {}

  const emitEditModalRefresh = () => emitEvent('work.editModal.changed')

  // Register UI actions for component-based panels
  const actionDisposables = actionsApi
    ? [
        actionsApi.register({
          id: 'getGroups',
          async execute() {
            try {
              const groups = await repository.listPanelGroups()
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
          id: 'toggleSubitem',
          async execute(params) {
            try {
              const todoId = params.todoId as string
              const subitemId = params.subitemId as string
              if (!todoId || !subitemId) {
                return { success: false, error: 'Missing todoId or subitemId' }
              }
              const toggled = await repository.toggleSubItem(todoId, subitemId)
              if (toggled) {
                emitTodoRefresh()
              }
              return { success: toggled }
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }
            }
          },
        }),
        actionsApi.register({
          id: 'getEditingTodo',
          async execute() {
            try {
              if (!editingTodoId) {
                return { success: true, data: null }
              }
              const todo = await repository.getTodo(editingTodoId)
              if (!todo) {
                return { success: true, data: null }
              }
              // Merge with edited data
              return {
                success: true,
                data: {
                  ...todo,
                  title: editingTodoData.title ?? todo.title,
                  description: editingTodoData.description ?? todo.description,
                  status: editingTodoData.status ?? todo.status,
                  dueAt: editingTodoData.dueAt ?? todo.dueAt,
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
          id: 'editTodo',
          async execute(params) {
            const todoId = params.todoId as string
            if (!todoId) {
              return { success: false, error: 'Missing todoId' }
            }
            editingTodoId = todoId
            editingTodoData = {} // Reset edited data
            emitEditModalRefresh()
            return { success: true }
          },
        }),
        actionsApi.register({
          id: 'updateEditField',
          async execute(params) {
            const field = params.field as string
            const value = params.value as string
            if (field === 'title') {
              editingTodoData.title = value
            } else if (field === 'description') {
              editingTodoData.description = value
            } else if (field === 'status') {
              editingTodoData.status = value
            } else if (field === 'dueAt') {
              editingTodoData.dueAt = value
            }
            emitEditModalRefresh()
            return { success: true }
          },
        }),
        actionsApi.register({
          id: 'closeEditModal',
          async execute() {
            editingTodoId = null
            editingTodoData = {}
            emitEditModalRefresh()
            return { success: true }
          },
        }),
        actionsApi.register({
          id: 'saveEditTodo',
          async execute() {
            try {
              if (!editingTodoId) {
                return { success: false, error: 'No todo being edited' }
              }

              // Get current todo to merge with edited data
              const currentTodo = await repository.getTodo(editingTodoId)
              if (!currentTodo) {
                return { success: false, error: 'Todo not found' }
              }

              await repository.upsertTodo(editingTodoId, {
                title: editingTodoData.title ?? currentTodo.title,
                description: editingTodoData.description ?? currentTodo.description,
                status: (editingTodoData.status ?? currentTodo.status) as import('./types.js').WorkTodoStatus,
                dueAt: editingTodoData.dueAt ?? currentTodo.dueAt,
              })

              editingTodoId = null
              editingTodoData = {}
              emitEditModalRefresh()
              emitTodoRefresh()
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
    context.tools!.register(createUpsertProjectTool(repository, emitProjectRefresh)),
    context.tools!.register(createDeleteProjectTool(repository, emitProjectRefresh)),

    context.tools!.register(createListTodosTool(repository)),
    context.tools!.register(createGetTodoTool(repository)),
    context.tools!.register(
      createUpsertTodoTool(repository, (todo) => {
        emitTodoRefresh()
        void scheduleTodo(todo)
      })
    ),
    context.tools!.register(
      createDeleteTodoTool(repository, (todoId) => {
        emitTodoRefresh()
        void cancelTodo(todoId)
      })
    ),

    context.tools!.register(createAddCommentTool(repository, emitTodoRefresh)),
    context.tools!.register(createDeleteCommentTool(repository, emitTodoRefresh)),

    context.tools!.register(createAddSubItemTool(repository, emitTodoRefresh)),
    context.tools!.register(createDeleteSubItemTool(repository, emitTodoRefresh)),

    context.tools!.register(createListSettingsTool(repository)),
    context.tools!.register(createGetSettingsTool(repository)),
    context.tools!.register(
      createUpdateSettingsTool(repository, () => {
        emitSettingsRefresh()
        void scheduleAllTodos()
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
    actions: actionsApi ? ['getGroups', 'toggleSubitem', 'getEditingTodo', 'editTodo', 'updateEditField', 'closeEditModal', 'saveEditTodo'] : [],
  })

  void scheduleAllTodos()

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
