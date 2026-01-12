import type { WorkSettings, WorkSettingsUpdate } from '../types.js'
import type { WorkDb } from './workDb.js'

const DEFAULT_SETTINGS: WorkSettings = {
  defaultReminderMinutes: null,
  allDayReminderTime: null,
  reminderLocale: null,
}

export class SettingsRepository {
  private readonly db: WorkDb

  constructor(db: WorkDb) {
    this.db = db
  }

  async get(): Promise<WorkSettings> {
    await this.db.initialize()

    const rows = await this.db.execute<{ key: string; value: string }>(
      `SELECT key, value FROM ext_work_manager_settings`
    )

    const settings: WorkSettings = { ...DEFAULT_SETTINGS }

    for (const row of rows) {
      if (row.key === 'defaultReminderMinutes') {
        settings.defaultReminderMinutes = JSON.parse(row.value) as number | null
      }
      if (row.key === 'allDayReminderTime') {
        settings.allDayReminderTime = JSON.parse(row.value) as string | null
      }
      if (row.key === 'reminderLocale') {
        settings.reminderLocale = JSON.parse(row.value) as string | null
      }
    }

    return settings
  }

  async update(update: WorkSettingsUpdate): Promise<WorkSettings> {
    await this.db.initialize()

    const now = new Date().toISOString()
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

    const entries: Array<[string, string]> = [
      ['defaultReminderMinutes', JSON.stringify(next.defaultReminderMinutes)],
      ['allDayReminderTime', JSON.stringify(next.allDayReminderTime)],
      ['reminderLocale', JSON.stringify(next.reminderLocale)],
    ]

    for (const [key, value] of entries) {
      await this.db.execute(
        `INSERT INTO ext_work_manager_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, now]
      )
    }

    return next
  }
}
