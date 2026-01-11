import type { Tool, ToolResult } from '@stina/extension-api/runtime'
import type { WorkRepository } from '../db/repository.js'

interface ToggleGroupParams {
  groupId: string
  collapsed: boolean
}

export function createToggleGroupTool(
  repository: WorkRepository,
  onChange?: () => void
): Tool {
  return {
    id: 'work_panel_toggle_group',
    name: 'Toggle Work Group',
    description: 'Toggle collapsed state for a work group.',
    parameters: {
      type: 'object',
      properties: {
        groupId: { type: 'string' },
        collapsed: { type: 'boolean' },
      },
      required: ['groupId', 'collapsed'],
    },
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      try {
        const { groupId, collapsed } = params as unknown as ToggleGroupParams
        const updated = await repository.setGroupCollapsed(groupId, collapsed)
        if (!updated) {
          return { success: false, error: 'Group not found' }
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
