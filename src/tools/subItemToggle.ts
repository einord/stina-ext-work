import type { Tool, ToolResult } from '@stina/extension-api/runtime'
import type { WorkRepository } from '../db/repository.js'

interface ToggleSubItemParams {
  todoId: string
  subItemId: string
}

export function createToggleSubItemTool(
  repository: WorkRepository,
  onChange?: () => void
): Tool {
  return {
    id: 'work_subitem_toggle',
    name: 'Toggle Work Subitem',
    description: 'Toggle completion for a work todo subitem.',
    parameters: {
      type: 'object',
      properties: {
        todoId: { type: 'string' },
        subItemId: { type: 'string' },
      },
      required: ['todoId', 'subItemId'],
    },
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      try {
        const { todoId, subItemId } = params as unknown as ToggleSubItemParams
        const updated = await repository.toggleSubItem(todoId, subItemId)
        if (!updated) {
          return { success: false, error: 'Subitem not found' }
        }
        onChange?.()
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}
