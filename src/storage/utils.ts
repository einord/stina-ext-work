/**
 * Utility functions for storage operations.
 */

/**
 * Generates a unique ID with a given prefix.
 * @param prefix - The prefix for the ID
 * @returns A unique ID string
 */
export const generateId = (prefix: string): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Normalizes a search query for case-insensitive matching.
 * @param query - The search query
 * @returns Normalized lowercase query
 */
export const normalizeQuery = (query: string): string => query.trim().toLowerCase()

/**
 * Normalizes an optional string value.
 * @param value - The value to normalize
 * @returns null if empty/whitespace, undefined if undefined, otherwise trimmed string
 */
export const normalizeOptionalString = (value?: string | null): string | null | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Derives date and time values from dueAt or explicit date/time values.
 * @param dueAt - ISO datetime string
 * @param date - Optional explicit date (YYYY-MM-DD)
 * @param time - Optional explicit time (HH:MM)
 * @param allDay - Whether this is an all-day event
 * @returns Object with date and time strings
 */
export const deriveDateTime = (
  dueAt?: string,
  date?: string,
  time?: string,
  allDay?: boolean
): { date: string; time: string } => {
  const normalizedDate = normalizeOptionalString(date) ?? undefined
  const normalizedTime = normalizeOptionalString(time) ?? undefined

  if (normalizedDate && normalizedTime) {
    return { date: normalizedDate, time: normalizedTime }
  }

  if (dueAt && dueAt.length >= 16) {
    const derivedDate = dueAt.slice(0, 10)
    const derivedTime = dueAt.slice(11, 16)
    return {
      date: normalizedDate ?? derivedDate,
      time: normalizedTime ?? (allDay ? '00:00' : derivedTime),
    }
  }

  return {
    date: normalizedDate ?? '',
    time: normalizedTime ?? (allDay ? '00:00' : ''),
  }
}

/**
 * Checks if a string contains another string (case-insensitive).
 * @param haystack - The string to search in
 * @param needle - The string to search for
 * @returns true if needle is found in haystack
 */
export const containsIgnoreCase = (haystack: string | undefined, needle: string): boolean => {
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
}
