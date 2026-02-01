/**
 * Settings repository using Storage API.
 */

import type { StorageAPI } from '@stina/extension-api/runtime'
import type { WorkSettings, WorkSettingsUpdate } from '../types.js'
import type { SettingsDocument } from './types.js'
import { COLLECTIONS, SETTINGS_ID } from './constants.js'

const DEFAULT_SETTINGS: WorkSettings = {
  defaultReminderMinutes: null,
  allDayReminderTime: null,
  reminderLocale: null,
}

/**
 * Repository for managing user settings using the Storage API.
 */
export class SettingsRepository {
  private readonly storage: StorageAPI

  /**
   * Creates a new SettingsRepository instance.
   * @param storage - The Storage API instance (should be user-scoped)
   */
  constructor(storage: StorageAPI) {
    this.storage = storage
  }

  /**
   * Gets the current settings for the user.
   * Returns default settings if no settings have been saved.
   * @returns The user's settings
   */
  async get(): Promise<WorkSettings> {
    const doc = await this.storage.get<SettingsDocument>(COLLECTIONS.SETTINGS, SETTINGS_ID)
    if (!doc) return { ...DEFAULT_SETTINGS }

    return {
      defaultReminderMinutes: doc.defaultReminderMinutes,
      allDayReminderTime: doc.allDayReminderTime,
      reminderLocale: doc.reminderLocale,
    }
  }

  /**
   * Updates the user's settings.
   * @param update - Partial settings to update
   * @returns The updated settings
   */
  async update(update: WorkSettingsUpdate): Promise<WorkSettings> {
    const current = await this.get()
    const next: WorkSettings = {
      defaultReminderMinutes:
        update.defaultReminderMinutes !== undefined
          ? update.defaultReminderMinutes
          : current.defaultReminderMinutes,
      allDayReminderTime:
        update.allDayReminderTime !== undefined
          ? update.allDayReminderTime
          : current.allDayReminderTime,
      reminderLocale:
        update.reminderLocale !== undefined ? update.reminderLocale : current.reminderLocale,
    }

    const doc: SettingsDocument = {
      defaultReminderMinutes: next.defaultReminderMinutes,
      allDayReminderTime: next.allDayReminderTime,
      reminderLocale: next.reminderLocale,
    }

    await this.storage.put(COLLECTIONS.SETTINGS, SETTINGS_ID, doc)
    return next
  }
}
