/**
 * Recurring template tools for Work Manager extension.
 */

import type { Tool, ToolResult, ExecutionContext } from '@stina/extension-api/runtime'
import { WorkRepository } from '../storage/index.js'
import type { RecurringTemplate, RecurringTemplateInput, RecurringFrequency, RecurringOverlapPolicy } from '../types.js'

// Tool factories for recurring template management

const FREQUENCY_OPTIONS: RecurringFrequency[] = ['daily', 'weekly', 'monthly', 'yearly']
const OVERLAP_OPTIONS: RecurringOverlapPolicy[] = ['skip_if_open', 'allow_multiple', 'replace_open']

const normalizeFrequency = (value: unknown): RecurringFrequency | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (FREQUENCY_OPTIONS.includes(normalized as RecurringFrequency)) {
    return normalized as RecurringFrequency
  }
  return undefined
}

const normalizeOverlapPolicy = (value: unknown): RecurringOverlapPolicy | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (OVERLAP_OPTIONS.includes(normalized as RecurringOverlapPolicy)) {
    return normalized as RecurringOverlapPolicy
  }
  return undefined
}

const normalizeLeadTimeUnit = (value: unknown): 'hours' | 'days' | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'hours' || normalized === 'days') return normalized
  return undefined
}

/**
 * Creates a tool for listing recurring templates.
 * @returns The list recurring templates tool
 */
export function createListRecurringTemplatesTool(): Tool {
  return {
    id: 'work_recurring_list',
    name: 'List Recurring Templates',
    description: 'List recurring todo templates. Returns all templates by default, set enabledOnly to true to only see active ones.',
    parameters: {
      type: 'object',
      properties: {
        enabledOnly: {
          type: 'boolean',
          description: 'Set to true to only return enabled templates. Default: false.',
        },
      },
    },
    async execute(params: Record<string, unknown>, execContext: ExecutionContext): Promise<ToolResult> {
      try {
        if (!execContext.userId) return { success: false, error: 'User context required' }
        const repo = new WorkRepository(execContext.userStorage)
        const templates = await repo.listRecurringTemplates({
          enabledOnly: params.enabledOnly === true,
        })
        return { success: true, data: { count: templates.length, templates } }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

/**
 * Creates a tool for getting a recurring template by ID.
 * @returns The get recurring template tool
 */
export function createGetRecurringTemplateTool(): Tool {
  return {
    id: 'work_recurring_get',
    name: 'Get Recurring Template',
    description: 'Get recurring template details by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The recurring template ID.' },
      },
      required: ['id'],
    },
    async execute(params: Record<string, unknown>, execContext: ExecutionContext): Promise<ToolResult> {
      try {
        if (!execContext.userId) return { success: false, error: 'User context required' }
        const repo = new WorkRepository(execContext.userStorage)
        const id = params.id as string
        if (!id) return { success: false, error: 'Recurring template id is required' }
        const template = await repo.getRecurringTemplate(id)
        if (!template) return { success: false, error: 'Recurring template not found' }
        return { success: true, data: template }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

/**
 * Creates a tool for creating/updating recurring templates.
 * @param onChange - Optional callback when a template is created or updated
 * @returns The upsert recurring template tool
 */
export function createUpsertRecurringTemplateTool(
  onChange?: (template: RecurringTemplate, execContext: ExecutionContext) => void
): Tool {
  return {
    id: 'work_recurring_upsert',
    name: 'Add/Update Recurring Template',
    description:
      'Create or update a recurring todo template. ' +
      'frequency must be one of: daily, weekly, monthly, yearly. ' +
      'For weekly: set daysOfWeek as array of 0-6 (0=Sunday, 1=Monday, ..., 6=Saturday). ' +
      'For monthly: set dayOfMonth (1-31) and optionally months (array of 1-12) to restrict. ' +
      'For yearly: set monthOfYear (1-12) and dayOfMonth (1-31). ' +
      'timeOfDay is HH:MM format or null for all-day. ' +
      'overlapPolicy controls what happens when a todo from this template is still open: skip_if_open (default), allow_multiple, replace_open.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Template ID for updates. Omit to create new.' },
        title: { type: 'string', description: 'Title for generated todos.' },
        description: { type: 'string', description: 'Description for generated todos.' },
        projectId: { type: 'string', description: 'Project ID to assign generated todos to.' },
        icon: { type: 'string', description: 'Icon name from huge-icons library.' },
        frequency: { type: 'string', description: 'Recurrence frequency: daily, weekly, monthly, yearly.' },
        daysOfWeek: {
          type: 'array',
          items: { type: 'number' },
          description: 'Days of week for weekly frequency (0=Sun, 1=Mon, ..., 6=Sat).',
        },
        dayOfMonth: { type: 'number', description: 'Day of month (1-31) for monthly/yearly.' },
        months: {
          type: 'array',
          items: { type: 'number' },
          description: 'Months to restrict (1-12) for monthly frequency.',
        },
        monthOfYear: { type: 'number', description: 'Month (1-12) for yearly frequency.' },
        timeOfDay: { type: 'string', description: 'Time of day (HH:MM) for generated todos. Null for all-day.' },
        isAllDay: { type: 'boolean', description: 'Whether generated todos are all-day events.' },
        leadTimeValue: { type: 'number', description: 'Lead time value (create todo this much before due time).' },
        leadTimeUnit: { type: 'string', description: 'Lead time unit: hours or days.' },
        reminderMinutes: { type: 'number', description: 'Minutes before due time to send reminder. Null for no reminder.' },
        overlapPolicy: { type: 'string', description: 'Overlap policy: skip_if_open, allow_multiple, replace_open.' },
        enabled: { type: 'boolean', description: 'Whether template is active. Default: true.' },
      },
    },
    async execute(params: Record<string, unknown>, execContext: ExecutionContext): Promise<ToolResult> {
      try {
        if (!execContext.userId) return { success: false, error: 'User context required' }
        const repo = new WorkRepository(execContext.userStorage)

        const input: RecurringTemplateInput & { id?: string } = {
          ...(params as RecurringTemplateInput),
        }

        // Normalize fields
        if (params.frequency !== undefined) {
          const freq = normalizeFrequency(params.frequency)
          if (!freq) {
            return { success: false, error: `Invalid frequency "${String(params.frequency)}". Allowed: ${FREQUENCY_OPTIONS.join(', ')}` }
          }
          input.frequency = freq
        }
        if (params.overlapPolicy !== undefined) {
          const policy = normalizeOverlapPolicy(params.overlapPolicy)
          if (!policy) {
            return { success: false, error: `Invalid overlapPolicy "${String(params.overlapPolicy)}". Allowed: ${OVERLAP_OPTIONS.join(', ')}` }
          }
          input.overlapPolicy = policy
        }
        if (params.leadTimeUnit !== undefined) {
          const unit = normalizeLeadTimeUnit(params.leadTimeUnit)
          if (!unit) {
            return { success: false, error: `Invalid leadTimeUnit "${String(params.leadTimeUnit)}". Allowed: hours, days` }
          }
          input.leadTimeUnit = unit
        }

        const id = params.id as string | undefined
        const template = await repo.upsertRecurringTemplate(id, input)
        onChange?.(template, execContext)
        return { success: true, data: template }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

/**
 * Creates a tool for deleting recurring templates.
 * @param onDelete - Optional callback when a template is deleted
 * @returns The delete recurring template tool
 */
export function createDeleteRecurringTemplateTool(
  onDelete?: (templateId: string, execContext: ExecutionContext) => void
): Tool {
  return {
    id: 'work_recurring_delete',
    name: 'Delete Recurring Template',
    description: 'Delete a recurring template by ID. Existing todos created from this template will not be affected.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The recurring template ID to delete.' },
      },
      required: ['id'],
    },
    async execute(params: Record<string, unknown>, execContext: ExecutionContext): Promise<ToolResult> {
      try {
        if (!execContext.userId) return { success: false, error: 'User context required' }
        const repo = new WorkRepository(execContext.userStorage)
        const id = params.id as string
        if (!id) return { success: false, error: 'Recurring template id is required' }
        const deleted = await repo.deleteRecurringTemplate(id)
        if (!deleted) return { success: false, error: 'Recurring template not found' }
        onDelete?.(id, execContext)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
