/**
 * Recurring templates repository using Storage API.
 */

import type { StorageAPI } from '@stina/extension-api/runtime'
import type { RecurringTemplate, RecurringTemplateInput, ListRecurringTemplatesOptions } from '../types.js'
import type { RecurringTemplateDocument } from './types.js'
import { COLLECTIONS } from './constants.js'
import { generateId, normalizeOptionalString } from './utils.js'

/**
 * Computes total lead time in minutes from a value and unit.
 * @param value - The numeric lead time value
 * @param unit - The unit ('hours' or 'days')
 * @returns Total lead time in minutes
 */
const computeLeadTimeMinutes = (value: number, unit: 'hours' | 'days'): number => {
  return unit === 'hours' ? value * 60 : value * 24 * 60
}

/**
 * Repository for managing recurring templates using the Storage API.
 */
export class RecurringTemplatesRepository {
  private readonly storage: StorageAPI

  /**
   * Creates a new RecurringTemplatesRepository instance.
   * @param storage - The Storage API instance (should be user-scoped)
   */
  constructor(storage: StorageAPI) {
    this.storage = storage
  }

  /**
   * @summary Lists recurring templates with optional filtering by enabled status.
   * Results are sorted by createdAt in ascending order.
   * @param options - Filtering options
   * @returns Array of recurring templates
   */
  async list(options: ListRecurringTemplatesOptions = {}): Promise<RecurringTemplate[]> {
    const { enabledOnly = false } = options

    const docs = await this.storage.find<RecurringTemplateDocument & { _id: string }>(
      COLLECTIONS.RECURRING_TEMPLATES,
      {},
      { sort: { createdAt: 'asc' } }
    )

    let results = docs.map((doc) => this.toTemplate(doc._id, doc))

    if (enabledOnly) {
      results = results.filter((template) => template.enabled)
    }

    return results
  }

  /**
   * @summary Gets a recurring template by its ID.
   * @param id - The template ID
   * @returns The recurring template if found, null otherwise
   */
  async get(id: string): Promise<RecurringTemplate | null> {
    const doc = await this.storage.get<RecurringTemplateDocument>(COLLECTIONS.RECURRING_TEMPLATES, id)
    if (!doc) return null
    return this.toTemplate(id, doc)
  }

  /**
   * @summary Creates or updates a recurring template.
   * When creating, title, icon, and frequency are required.
   * Automatically computes leadTimeMinutes from leadTimeValue and leadTimeUnit.
   * @param id - Optional template ID (generated with 'rtpl' prefix if not provided)
   * @param input - Template data to create/update
   * @returns The created or updated recurring template
   */
  async upsert(id: string | undefined, input: RecurringTemplateInput): Promise<RecurringTemplate> {
    const now = new Date().toISOString()
    const normalizedId = normalizeOptionalString(id)
    const templateId = normalizedId ?? generateId('rtpl')
    const existing = await this.get(templateId)

    if (existing) {
      const normalizedProjectId = input.projectId !== undefined
        ? normalizeOptionalString(input.projectId) ?? null
        : existing.projectId ?? null

      const leadTimeValue = input.leadTimeValue ?? existing.leadTimeValue
      const leadTimeUnit = input.leadTimeUnit ?? existing.leadTimeUnit
      const leadTimeMinutes = computeLeadTimeMinutes(leadTimeValue, leadTimeUnit)

      const doc: RecurringTemplateDocument = {
        title: input.title ?? existing.title,
        description: input.description !== undefined ? (input.description ?? undefined) : existing.description,
        projectId: normalizedProjectId,
        icon: input.icon ?? existing.icon,
        frequency: input.frequency ?? existing.frequency,
        daysOfWeek: input.daysOfWeek !== undefined ? input.daysOfWeek : existing.daysOfWeek,
        dayOfMonth: input.dayOfMonth !== undefined ? input.dayOfMonth : existing.dayOfMonth,
        months: input.months !== undefined ? input.months : existing.months,
        monthOfYear: input.monthOfYear !== undefined ? input.monthOfYear : existing.monthOfYear,
        timeOfDay: input.timeOfDay !== undefined ? input.timeOfDay : existing.timeOfDay,
        isAllDay: input.isAllDay ?? existing.isAllDay,
        leadTimeValue,
        leadTimeUnit,
        leadTimeMinutes,
        reminderMinutes: input.reminderMinutes !== undefined ? input.reminderMinutes : existing.reminderMinutes,
        overlapPolicy: input.overlapPolicy ?? existing.overlapPolicy,
        lastGeneratedDueAt: existing.lastGeneratedDueAt,
        enabled: input.enabled ?? existing.enabled,
        createdAt: existing.createdAt,
        updatedAt: now,
      }

      await this.storage.put(COLLECTIONS.RECURRING_TEMPLATES, templateId, doc)
      return this.toTemplate(templateId, doc)
    }

    // Create new template
    if (!input.title || !input.icon) {
      throw new Error('Recurring template title and icon are required')
    }
    if (!input.frequency) {
      throw new Error('Recurring template frequency is required')
    }

    const leadTimeValue = input.leadTimeValue ?? 0
    const leadTimeUnit = input.leadTimeUnit ?? 'days'
    const leadTimeMinutes = computeLeadTimeMinutes(leadTimeValue, leadTimeUnit)
    const normalizedProjectId = normalizeOptionalString(input.projectId) ?? null

    const doc: RecurringTemplateDocument = {
      title: input.title,
      description: input.description ?? undefined,
      projectId: normalizedProjectId,
      icon: input.icon,
      frequency: input.frequency,
      daysOfWeek: input.daysOfWeek ?? null,
      dayOfMonth: input.dayOfMonth ?? null,
      months: input.months ?? null,
      monthOfYear: input.monthOfYear ?? null,
      timeOfDay: input.timeOfDay ?? null,
      isAllDay: input.isAllDay ?? false,
      leadTimeValue,
      leadTimeUnit,
      leadTimeMinutes,
      reminderMinutes: input.reminderMinutes ?? null,
      overlapPolicy: input.overlapPolicy ?? 'skip_if_open',
      lastGeneratedDueAt: null,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    }

    await this.storage.put(COLLECTIONS.RECURRING_TEMPLATES, templateId, doc)
    return this.toTemplate(templateId, doc)
  }

  /**
   * @summary Deletes a recurring template by its ID.
   * @param id - The template ID to delete
   * @returns true if the template was deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const exists = await this.storage.get(COLLECTIONS.RECURRING_TEMPLATES, id)
    if (!exists) return false

    await this.storage.delete(COLLECTIONS.RECURRING_TEMPLATES, id)
    return true
  }

  /**
   * @summary Updates the lastGeneratedDueAt timestamp for a recurring template.
   * Used after generating a todo from the template to track the last occurrence.
   * @param id - The template ID
   * @param lastGeneratedDueAt - ISO timestamp of the last generated occurrence
   */
  async updateLastGenerated(id: string, lastGeneratedDueAt: string): Promise<void> {
    const doc = await this.storage.get<RecurringTemplateDocument>(COLLECTIONS.RECURRING_TEMPLATES, id)
    if (!doc) {
      throw new Error(`Recurring template not found: ${id}`)
    }

    const updatedDoc: RecurringTemplateDocument = {
      ...doc,
      lastGeneratedDueAt,
      updatedAt: new Date().toISOString(),
    }

    await this.storage.put(COLLECTIONS.RECURRING_TEMPLATES, id, updatedDoc)
  }

  /**
   * Converts a stored document to a RecurringTemplate.
   */
  private toTemplate(id: string, doc: RecurringTemplateDocument): RecurringTemplate {
    return {
      id,
      title: doc.title,
      description: doc.description,
      projectId: doc.projectId,
      icon: doc.icon,
      frequency: doc.frequency as RecurringTemplate['frequency'],
      daysOfWeek: doc.daysOfWeek,
      dayOfMonth: doc.dayOfMonth,
      months: doc.months,
      monthOfYear: doc.monthOfYear,
      timeOfDay: doc.timeOfDay,
      isAllDay: doc.isAllDay,
      leadTimeValue: doc.leadTimeValue,
      leadTimeUnit: doc.leadTimeUnit as RecurringTemplate['leadTimeUnit'],
      leadTimeMinutes: doc.leadTimeMinutes,
      reminderMinutes: doc.reminderMinutes,
      overlapPolicy: doc.overlapPolicy as RecurringTemplate['overlapPolicy'],
      lastGeneratedDueAt: doc.lastGeneratedDueAt,
      enabled: doc.enabled,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }
  }
}
