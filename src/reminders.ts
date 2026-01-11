import type { WorkSettings, WorkTodo } from './types.js'

export interface SchedulerFirePayload {
  id: string
  payload?: Record<string, unknown>
  scheduledFor: string
  firedAt: string
  delayMs: number
}

const ACTIVE_STATUSES = new Set(['not_started', 'in_progress'])

const resolveLocale = (settings: WorkSettings): 'sv' | 'en' => {
  const stored = settings.reminderLocale?.toLowerCase()
  if (stored && stored !== 'auto') {
    if (stored.startsWith('sv')) return 'sv'
    if (stored.startsWith('en')) return 'en'
  }

  const envLocale =
    (typeof process !== 'undefined' && (process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES)) ||
    undefined

  if (envLocale?.toLowerCase().startsWith('sv')) return 'sv'
  return 'en'
}

const formatDelayMinutes = (delayMs: number): string | null => {
  if (delayMs <= 0) return null
  const minutes = Math.round(delayMs / 60000)
  if (minutes <= 0) return null
  return String(minutes)
}

const extractOffset = (iso: string): string => {
  const match = iso.match(/(Z|[+-]\d{2}:\d{2})$/)
  return match ? match[1] : 'Z'
}

const withSeconds = (time: string): string => {
  if (time.length === 5) return `${time}:00`
  return time
}

export const isTodoActive = (todo: WorkTodo): boolean => {
  return ACTIVE_STATUSES.has(todo.status)
}

export const resolveReminderAt = (
  todo: WorkTodo,
  settings: WorkSettings
): string | null => {
  if (!todo.dueAt) return null

  const reminderMinutes =
    todo.reminderMinutes !== undefined && todo.reminderMinutes !== null
      ? todo.reminderMinutes
      : settings.defaultReminderMinutes

  if (todo.allDay && settings.allDayReminderTime) {
    const datePart = todo.dueAt.slice(0, 10)
    const offset = extractOffset(todo.dueAt)
    const timePart = withSeconds(settings.allDayReminderTime)
    return `${datePart}T${timePart}${offset}`
  }

  if (reminderMinutes === null || reminderMinutes === undefined) {
    return null
  }

  const dueDate = new Date(todo.dueAt)
  if (Number.isNaN(dueDate.getTime())) return null
  const reminderAt = new Date(dueDate.getTime() - reminderMinutes * 60 * 1000)
  return reminderAt.toISOString()
}

export const buildInstructionMessage = (
  todo: WorkTodo,
  firePayload: SchedulerFirePayload,
  settings: WorkSettings
): string => {
  const locale = resolveLocale(settings)
  const delayMinutes = formatDelayMinutes(firePayload.delayMs)
  const todoJson = JSON.stringify(todo)

  if (locale === 'sv') {
    return [
      '[Automatiskt meddelande ang. TODO-påminnelse]',
      `Tidpunkten för att-göra-posten (id: ${todo.id}) är nu. Berätta för användaren att ` +
        `'${todo.title}' infaller nu och anpassa meddelandet efter uppgiftens innehåll.`,
      delayMinutes
        ? `Observera: Påminnelsen är försenad med ${delayMinutes} minuter ` +
          `(schemalagd: ${firePayload.scheduledFor}, utlöst: ${firePayload.firedAt}).`
        : null,
      `Todo-data: ${todoJson}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    '[Automatic TODO reminder]',
    `The time for the todo (id: ${todo.id}) is now. Tell the user that ` +
      `'${todo.title}' is due now and tailor the message to the task's content.`,
    delayMinutes
      ? `Note: This reminder is delayed by ${delayMinutes} minutes ` +
        `(scheduled: ${firePayload.scheduledFor}, fired: ${firePayload.firedAt}).`
      : null,
    `Todo payload: ${todoJson}`,
  ]
    .filter(Boolean)
    .join('\n')
}
