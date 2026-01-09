import type { Tool, ToolResult } from '@stina/extension-api/runtime'

interface EditTodoParams {
  id: string
}

export function createEditTodoTool(onChange?: () => void): Tool {
  return {
    id: 'work_todo_edit',
    name: 'Edit Work Todo',
    description: 'Open or update work todo details.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      try {
        const { id } = params as unknown as EditTodoParams
        if (!id) {
          return { success: false, error: 'Todo id is required' }
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
