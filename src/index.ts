/**
 * Work Manager Extension for Stina
 */

import { initializeExtension, type ExtensionContext, type Disposable } from '@stina/extension-api/runtime'
import {
  createPanelListTool,
  createToggleGroupTool,
  createToggleSubItemTool,
  createEditTodoTool,
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

  const emitRefresh = () => {
    const eventsApi = (context as ExtensionContext & { events?: EventsApi }).events
    if (!eventsApi) return
    void eventsApi.emit('work.todos.updated', {
      at: new Date().toISOString(),
    })
  }

  const disposables = [
    context.tools!.register(createPanelListTool(repository)),
    context.tools!.register(createToggleGroupTool(repository, emitRefresh)),
    context.tools!.register(createToggleSubItemTool(repository, emitRefresh)),
    context.tools!.register(createEditTodoTool(repository, emitRefresh)),
  ]

  context.log.info('Work Manager tools registered', {
    tools: ['work_panel_list', 'work_panel_toggle_group', 'work_subitem_toggle', 'work_todo_edit'],
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
