export const generateId = (prefix: string): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export const normalizeQuery = (query: string): string => query.trim().toLowerCase()

export const normalizeOptionalString = (value?: string | null): string | null | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export const deriveDateTime = (
  dueAt?: string,
  date?: string,
  time?: string,
  allDay?: boolean
) => {
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
