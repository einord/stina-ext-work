import type { RecurringTemplate } from '../types.js'

/**
 * Parses a time-of-day string (HH:MM) to hours and minutes.
 * Returns { hours: 0, minutes: 0 } if invalid.
 */
export const parseTimeOfDay = (time: string | null | undefined): { hours: number; minutes: number } => {
  if (!time) return { hours: 0, minutes: 0 }
  const match = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return { hours: 0, minutes: 0 }
  const hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return { hours: 0, minutes: 0 }
  return { hours, minutes }
}

/**
 * Combines a date with a time-of-day to produce a timestamp.
 * The date is treated as local time.
 */
export const combineDateTime = (date: Date, timeOfDay: string | null | undefined): Date => {
  const { hours, minutes } = parseTimeOfDay(timeOfDay)
  const result = new Date(date)
  result.setHours(hours, minutes, 0, 0)
  return result
}

/**
 * Checks if a given date matches the frequency rules of a recurring template.
 * @param date The date to check (should be start-of-day in local time)
 * @param template The recurring template
 * @returns true if the date matches the template's frequency pattern
 */
export const matchesFrequency = (date: Date, template: RecurringTemplate): boolean => {
  const dayOfWeek = date.getDay() // 0=Sun, 1=Mon, ...6=Sat
  const dayOfMonth = date.getDate() // 1-31
  const month = date.getMonth() + 1 // 1-12

  switch (template.frequency) {
    case 'daily':
      return true

    case 'weekly': {
      const days = template.daysOfWeek
      if (!days || days.length === 0) return true // every day if no days specified
      return days.includes(dayOfWeek)
    }

    case 'monthly': {
      // Check day of month
      const targetDay = template.dayOfMonth
      if (targetDay != null) {
        // Handle months shorter than targetDay (e.g., day 31 in February → last day)
        const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
        const effectiveDay = Math.min(targetDay, lastDayOfMonth)
        if (dayOfMonth !== effectiveDay) return false
      }
      // Check month restriction
      const allowedMonths = template.months
      if (allowedMonths && allowedMonths.length > 0) {
        if (!allowedMonths.includes(month)) return false
      }
      return true
    }

    case 'yearly': {
      const targetMonth = template.monthOfYear
      const targetDay = template.dayOfMonth
      if (targetMonth != null && month !== targetMonth) return false
      if (targetDay != null) {
        const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
        const effectiveDay = Math.min(targetDay, lastDayOfMonth)
        if (dayOfMonth !== effectiveDay) return false
      }
      return true
    }

    default:
      return false
  }
}

/**
 * Computes upcoming occurrence timestamps for a recurring template.
 * Looks ahead from `now` and returns up to `maxCount` future occurrences as timestamps (ms).
 * @param template The recurring template
 * @param now The current time
 * @param maxCount Maximum number of occurrences to find (default: 6)
 * @returns Array of timestamps (ms since epoch) for upcoming occurrences
 */
export const computeUpcomingOccurrences = (
  template: RecurringTemplate,
  now: Date,
  maxCount: number = 6
): number[] => {
  const results: number[] = []
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)

  // Safety limit to prevent infinite loops
  const maxDaysToCheck = maxCount * 450

  for (let i = 0; i < maxDaysToCheck && results.length < maxCount; i++) {
    const checkDate = new Date(startOfDay)
    checkDate.setDate(checkDate.getDate() + i)

    if (matchesFrequency(checkDate, template)) {
      const occurrenceTime = combineDateTime(checkDate, template.timeOfDay)
      // Include occurrences from start of today onward.
      // Past occurrences within today are included so processTemplate can
      // generate them if they haven't been created yet (avoids missing
      // an occurrence when the poll runs seconds after the scheduled time).
      if (occurrenceTime.getTime() >= startOfDay.getTime()) {
        results.push(occurrenceTime.getTime())
      }
    }
  }

  return results.sort((a, b) => a - b)
}
