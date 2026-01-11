import type { Tool, ToolResult } from '@stina/extension-api/runtime'
import type { WorkRepository } from '../db/repository.js'
import type { WorkSettingsUpdate } from '../types.js'

export function createGetSettingsTool(repository: WorkRepository): Tool {
  return {
    id: 'work_settings_get',
    name: 'Get Work Settings',
    description: 'Get work extension settings.',
    parameters: {
      type: 'object',
      properties: {},
    },
    async execute(): Promise<ToolResult> {
      try {
        const settings = await repository.getSettings()
        return { success: true, data: settings }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

export function createUpdateSettingsTool(
  repository: WorkRepository,
  onChange?: () => void
): Tool {
  return {
    id: 'work_settings_update',
    name: 'Update Work Settings',
    description: 'Update work extension settings.',
    parameters: {
      type: 'object',
      properties: {
        defaultReminderMinutes: { type: 'number' },
        allDayReminderTime: { type: 'string' },
      },
    },
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      try {
        const update = params as WorkSettingsUpdate
        const settings = await repository.updateSettings(update)
        onChange?.()
        return { success: true, data: settings }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
