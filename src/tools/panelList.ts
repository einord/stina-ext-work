import type { Tool, ToolResult } from '@stina/extension-api/runtime'
import { listGroups, type WorkGroup } from '../data/store.js'

interface PanelListResult {
  groups: Array<WorkGroup & { items: Array<WorkGroup['items'][number] & { commentCount: number }> }>
}

export function createPanelListTool(): Tool {
  return {
    id: 'work_panel_list',
    name: 'List Work Panel',
    description: 'List todo groups for the work panel.',
    parameters: {
      type: 'object',
      properties: {},
    },
    async execute(): Promise<ToolResult> {
      try {
        const groups = listGroups().map((group) => ({
          ...group,
          items: group.items.map((item) => ({
            ...item,
            commentCount: item.comments.length,
          })),
        }))

        const data: PanelListResult = { groups }
        return { success: true, data }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}
