/**
 * Work Manager Extension for Stina
 */

import { initializeExtension, type ExtensionContext, type Disposable } from '@stina/extension-api/runtime'
import {
  createPanelListTool,
  createToggleGroupTool,
  createToggleSubItemTool,
  createEditTodoTool,
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
  createGetSettingsTool,
  createUpdateSettingsTool,
} from './tools/index.js'
import { WorkRepository } from './db/repository.js'

type EventsApi = { emit: (name: string, payload?: Record<string, unknown>) => Promise<void> }

type DatabaseApi = {
  execute: <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>
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

  const emitTodoRefresh = () => emitEvent('work.todos.updated')
  const emitProjectRefresh = () => emitEvent('work.projects.updated')
  const emitSettingsRefresh = () => emitEvent('work.settings.updated')

  const disposables = [
    context.tools!.register(createPanelListTool(repository)),
    context.tools!.register(createToggleGroupTool(repository, emitTodoRefresh)),
    context.tools!.register(createToggleSubItemTool(repository, emitTodoRefresh)),
    context.tools!.register(createEditTodoTool(repository, emitTodoRefresh)),

    context.tools!.register(createListProjectsTool(repository)),
    context.tools!.register(createGetProjectTool(repository)),
    context.tools!.register(createUpsertProjectTool(repository, emitProjectRefresh)),
    context.tools!.register(createDeleteProjectTool(repository, emitProjectRefresh)),

    context.tools!.register(createListTodosTool(repository)),
    context.tools!.register(createGetTodoTool(repository)),
    context.tools!.register(createUpsertTodoTool(repository, emitTodoRefresh)),
    context.tools!.register(createDeleteTodoTool(repository, emitTodoRefresh)),

    context.tools!.register(createAddCommentTool(repository, emitTodoRefresh)),
    context.tools!.register(createDeleteCommentTool(repository, emitTodoRefresh)),

    context.tools!.register(createAddSubItemTool(repository, emitTodoRefresh)),
    context.tools!.register(createDeleteSubItemTool(repository, emitTodoRefresh)),

    context.tools!.register(createGetSettingsTool(repository)),
    context.tools!.register(createUpdateSettingsTool(repository, emitSettingsRefresh)),
  ]

  context.log.info('Work Manager tools registered', {
    tools: [
      'work_panel_list',
      'work_panel_toggle_group',
      'work_subitem_toggle',
      'work_todo_edit',
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
      'work_settings_get',
      'work_settings_update',
    ],
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
