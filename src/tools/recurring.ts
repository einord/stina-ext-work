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

/** Parses a value that should be a number (may arrive as string from AI tools). */
const normalizeOptionalNumber = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed.toLowerCase() === 'null') return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/** Normalizes a string value that may be "null" or empty to actual null. */
const normalizeNullableString = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed.toLowerCase() === 'null') return null
    return trimmed
  }
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

        // --- Normalize frequency FIRST (needed to know which fields are relevant) ---
        let frequency: RecurringFrequency | undefined
        if (params.frequency !== undefined) {
          frequency = normalizeFrequency(params.frequency)
          if (!frequency) {
            return { success: false, error: `Invalid frequency "${String(params.frequency)}". Allowed: ${FREQUENCY_OPTIONS.join(', ')}` }
          }
        }

        // --- Normalize overlap policy ---
        let overlapPolicy: RecurringOverlapPolicy | undefined
        if (params.overlapPolicy !== undefined) {
          overlapPolicy = normalizeOverlapPolicy(params.overlapPolicy)
          if (!overlapPolicy) {
            return { success: false, error: `Invalid overlapPolicy "${String(params.overlapPolicy)}". Allowed: ${OVERLAP_OPTIONS.join(', ')}` }
          }
        }

        // --- Normalize lead time (value before unit, since unit validation depends on value) ---
        let leadTimeValue: number | undefined
        if (params.leadTimeValue !== undefined) {
          const v = normalizeOptionalNumber(params.leadTimeValue)
          if (v === null || v === 0) {
            leadTimeValue = 0
          } else if (v !== undefined) {
            if (v < 0) return { success: false, error: 'leadTimeValue cannot be negative' }
            leadTimeValue = v
          }
        }

        let leadTimeUnit: 'hours' | 'days' | undefined
        if (params.leadTimeUnit !== undefined) {
          const unit = normalizeLeadTimeUnit(params.leadTimeUnit)
          if (!unit) {
            // Only reject invalid unit if leadTimeValue is actually meaningful
            if (leadTimeValue !== undefined && leadTimeValue > 0) {
              return { success: false, error: `Invalid leadTimeUnit "${String(params.leadTimeUnit)}". Allowed: hours, days` }
            }
            leadTimeUnit = 'days'
          } else {
            leadTimeUnit = unit
          }
        }

        // --- Normalize numeric fields, treating 0 as null for day/month fields ---
        let dayOfMonth: number | null | undefined
        if (params.dayOfMonth !== undefined) {
          const v = normalizeOptionalNumber(params.dayOfMonth)
          if (v === 0 || v === null) {
            dayOfMonth = null
          } else if (v !== undefined) {
            if (v < 1 || v > 31 || !Number.isInteger(v)) {
              return { success: false, error: 'dayOfMonth must be an integer between 1 and 31' }
            }
            dayOfMonth = v
          }
        }

        let monthOfYear: number | null | undefined
        if (params.monthOfYear !== undefined) {
          const v = normalizeOptionalNumber(params.monthOfYear)
          if (v === 0 || v === null) {
            monthOfYear = null
          } else if (v !== undefined) {
            if (v < 1 || v > 12 || !Number.isInteger(v)) {
              return { success: false, error: 'monthOfYear must be an integer between 1 and 12' }
            }
            monthOfYear = v
          }
        }

        // --- Normalize reminderMinutes (0 = no reminder) ---
        let reminderMinutes: number | null | undefined
        if (params.reminderMinutes !== undefined) {
          const v = normalizeOptionalNumber(params.reminderMinutes)
          reminderMinutes = (v === 0 || v === null) ? null : v
        }

        // --- Normalize and validate arrays ---
        let daysOfWeek: number[] | null | undefined
        if (params.daysOfWeek !== undefined) {
          if (Array.isArray(params.daysOfWeek)) {
            const arr = params.daysOfWeek.map(Number).filter((n) => Number.isFinite(n))
            if (arr.length === 0) {
              daysOfWeek = null
            } else {
              if (!arr.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
                return { success: false, error: 'daysOfWeek values must be integers between 0 (Sunday) and 6 (Saturday)' }
              }
              daysOfWeek = arr
            }
          } else if (params.daysOfWeek === null) {
            daysOfWeek = null
          }
        }

        let months: number[] | null | undefined
        if (params.months !== undefined) {
          if (Array.isArray(params.months)) {
            const arr = params.months.map(Number).filter((n) => Number.isFinite(n))
            if (arr.length === 0) {
              months = null
            } else {
              if (!arr.every((m) => Number.isInteger(m) && m >= 1 && m <= 12)) {
                return { success: false, error: 'months values must be integers between 1 and 12' }
              }
              months = arr
            }
          } else if (params.months === null) {
            months = null
          }
        }

        // --- Normalize boolean fields (may arrive as strings from AI) ---
        const normalizeBoolean = (v: unknown): boolean | undefined => {
          if (typeof v === 'boolean') return v
          if (typeof v === 'string') {
            const s = v.trim().toLowerCase()
            if (s === 'true') return true
            if (s === 'false') return false
          }
          return undefined
        }

        const isAllDay = params.isAllDay !== undefined ? normalizeBoolean(params.isAllDay) : undefined
        const enabled = params.enabled !== undefined ? normalizeBoolean(params.enabled) : undefined

        // --- Strip irrelevant fields based on frequency ---
        if (frequency === 'daily') {
          daysOfWeek = null; dayOfMonth = null; months = null; monthOfYear = null
        } else if (frequency === 'weekly') {
          dayOfMonth = null; months = null; monthOfYear = null
        } else if (frequency === 'monthly') {
          daysOfWeek = null; monthOfYear = null
        } else if (frequency === 'yearly') {
          daysOfWeek = null; months = null
        }

        // --- Build input object explicitly from known fields ---
        const input: RecurringTemplateInput & { id?: string } = {}
        if (params.id !== undefined) input.id = params.id as string
        if (params.title !== undefined) input.title = params.title as string
        if (params.description !== undefined) input.description = normalizeNullableString(params.description) ?? undefined
        if (params.projectId !== undefined) input.projectId = normalizeNullableString(params.projectId)
        if (params.icon !== undefined) input.icon = params.icon as string
        if (frequency !== undefined) input.frequency = frequency
        if (daysOfWeek !== undefined) input.daysOfWeek = daysOfWeek
        if (dayOfMonth !== undefined) input.dayOfMonth = dayOfMonth
        if (months !== undefined) input.months = months
        if (monthOfYear !== undefined) input.monthOfYear = monthOfYear
        if (params.timeOfDay !== undefined) input.timeOfDay = normalizeNullableString(params.timeOfDay)
        if (isAllDay !== undefined) input.isAllDay = isAllDay
        if (leadTimeValue !== undefined) input.leadTimeValue = leadTimeValue
        if (leadTimeUnit !== undefined) input.leadTimeUnit = leadTimeUnit
        if (reminderMinutes !== undefined) input.reminderMinutes = reminderMinutes
        if (overlapPolicy !== undefined) input.overlapPolicy = overlapPolicy
        if (enabled !== undefined) input.enabled = enabled

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
