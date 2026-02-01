/**
 * Settings tools for Work Manager extension.
 */

import type { Tool, ToolResult, ExecutionContext } from '@stina/extension-api/runtime'
import { WorkRepository } from '../storage/index.js'
import type { WorkSettings, WorkSettingsUpdate } from '../types.js'

interface ListSettingsItem {
  id: string
  label: string
  description?: string
}

const normalizeNullableNumber = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed === 'null' || trimmed === 'none') return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const normalizeNullableString = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  return null
}

/**
 * Creates a tool for listing available settings.
 * @returns The list settings tool
 */
export function createListSettingsTool(): Tool {
  return {
    id: 'work_settings_list',
    name: 'List Work Settings',
    description: 'List work extension settings entries.',
    parameters: {
      type: 'object',
      properties: {},
    },
    async execute(_params: Record<string, unknown>, _execContext: ExecutionContext): Promise<ToolResult> {
      try {
        const items: ListSettingsItem[] = [
          {
            id: 'settings',
            label: 'Reminder Settings',
            description: 'Default reminders and locale.',
          },
        ]
        return { success: true, data: { count: items.length, settings: items } }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

/**
 * Creates a tool for getting current settings.
 * @returns The get settings tool
 */
export function createGetSettingsTool(): Tool {
  return {
    id: 'work_settings_get',
    name: 'Get Work Settings',
    description: 'Get work extension settings.',
    parameters: {
      type: 'object',
      properties: {},
    },
    async execute(_params: Record<string, unknown>, execContext: ExecutionContext): Promise<ToolResult> {
      try {
        if (!execContext.userId) {
          return { success: false, error: 'User context required' }
        }
        const repo = new WorkRepository(execContext.userStorage)
        const settings = await repo.getSettings()
        return { success: true, data: settings }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

/**
 * Creates a tool for updating settings.
 * @param onChange - Optional callback when settings are updated
 * @returns The update settings tool
 */
export function createUpdateSettingsTool(
  onChange?: (settings: WorkSettings, userId: string) => void
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
        reminderLocale: { type: 'string' },
      },
    },
    async execute(params: Record<string, unknown>, execContext: ExecutionContext): Promise<ToolResult> {
      try {
        if (!execContext.userId) {
          return { success: false, error: 'User context required' }
        }
        const repo = new WorkRepository(execContext.userStorage)
        const update: WorkSettingsUpdate = {
          defaultReminderMinutes: normalizeNullableNumber(params.defaultReminderMinutes),
          allDayReminderTime: normalizeNullableString(params.allDayReminderTime),
          reminderLocale: normalizeNullableString(params.reminderLocale),
        }
        const settings = await repo.updateSettings(update)
        onChange?.(settings, execContext.userId)
        return { success: true, data: settings }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
