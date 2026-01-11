import type { Tool, ToolResult } from '@stina/extension-api/runtime'
import type { WorkRepository } from '../db/repository.js'
import type { WorkSubItemInput } from '../types.js'

interface DeleteSubItemParams {
  todoId: string
  subItemId: string
}

export function createAddSubItemTool(
  repository: WorkRepository,
  onChange?: () => void
): Tool {
  return {
    id: 'work_subitems_add',
    name: 'Add Subitem',
    description: 'Add a subitem to a todo.',
    parameters: {
      type: 'object',
      properties: {
        todoId: { type: 'string' },
        text: { type: 'string' },
        sortOrder: { type: 'number' },
      },
      required: ['todoId', 'text'],
    },
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      try {
        const input = params as WorkSubItemInput
        const subItem = await repository.addSubItem(input)
        onChange?.()
        return { success: true, data: subItem }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

export function createDeleteSubItemTool(
  repository: WorkRepository,
  onChange?: () => void
): Tool {
  return {
    id: 'work_subitems_delete',
    name: 'Delete Subitem',
    description: 'Delete a subitem from a todo.',
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
        const { todoId, subItemId } = params as unknown as DeleteSubItemParams
        if (!todoId || !subItemId) {
          return { success: false, error: 'todoId and subItemId are required' }
        }
        const deleted = await repository.deleteSubItem(todoId, subItemId)
        if (!deleted) return { success: false, error: 'Subitem not found' }
        onChange?.()
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
