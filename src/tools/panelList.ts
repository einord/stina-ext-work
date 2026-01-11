import type { Tool, ToolResult } from '@stina/extension-api/runtime'
import type { WorkRepository } from '../db/repository.js'

export function createPanelListTool(repository: WorkRepository): Tool {
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
        const groups = await repository.listPanelGroups()
        return { success: true, data: { groups } }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}
