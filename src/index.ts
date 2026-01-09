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

type EventsApi = { emit: (name: string, payload?: Record<string, unknown>) => Promise<void> }

function activate(context: ExtensionContext): Disposable {
  context.log.info('Activating Work Manager extension')

  const emitRefresh = () => {
    const eventsApi = (context as ExtensionContext & { events?: EventsApi }).events
    if (!eventsApi) return
    void eventsApi.emit('work.todos.updated', {
      at: new Date().toISOString(),
    })
  }

  const disposables = [
    context.tools!.register(createPanelListTool()),
    context.tools!.register(createToggleGroupTool(emitRefresh)),
    context.tools!.register(createToggleSubItemTool(emitRefresh)),
    context.tools!.register(createEditTodoTool(emitRefresh)),
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
