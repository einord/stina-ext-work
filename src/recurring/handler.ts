import type { StorageAPI } from '@stina/extension-api/runtime'
import type { RecurringTemplate, WorkTodo, WorkTodoInput } from '../types.js'
import { WorkRepository } from '../storage/repository.js'
import { computeUpcomingOccurrences } from './scheduler.js'

export interface RecurringHandlerCallbacks {
  onTodoCreated?: (todo: WorkTodo, userId: string, userStorage: StorageAPI) => void
  onTodoCancelled?: (todoId: string, userId: string) => void
  log?: {
    info: (msg: string, data?: Record<string, unknown>) => void
    warn: (msg: string, data?: Record<string, unknown>) => void
  }
}

/**
 * Processes all enabled recurring templates for a user and creates todos as needed.
 * Called periodically by the background worker.
 */
export const handleRecurringTemplates = async (
  userStorage: StorageAPI,
  userId: string,
  callbacks?: RecurringHandlerCallbacks,
): Promise<void> => {
  const repo = new WorkRepository(userStorage)
  const templates = await repo.listRecurringTemplates({ enabledOnly: true })

  if (templates.length === 0) return

  const now = new Date()

  for (const template of templates) {
    try {
      await processTemplate(repo, template, now, userId, userStorage, callbacks)
    } catch (error) {
      callbacks?.log?.warn('Failed to process recurring template', {
        templateId: template.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/**
 * Processes a single recurring template, creating todos if their lead time has been reached.
 */
const processTemplate = async (
  repo: WorkRepository,
  template: RecurringTemplate,
  now: Date,
  userId: string,
  userStorage: StorageAPI,
  callbacks?: RecurringHandlerCallbacks,
): Promise<void> => {
  const occurrences = computeUpcomingOccurrences(template, now, 6)

  const leadMs = template.leadTimeMinutes * 60 * 1000
  let latestGeneratedDueAt = template.lastGeneratedDueAt
    ? new Date(template.lastGeneratedDueAt).getTime()
    : 0

  for (const dueAtMs of occurrences) {
    // Skip if already generated
    if (dueAtMs <= latestGeneratedDueAt) continue

    // Skip if it's too early (lead time not reached yet)
    const createAtMs = dueAtMs - leadMs
    if (now.getTime() < createAtMs) continue

    // Apply overlap policy
    const shouldCreate = await applyOverlapPolicy(repo, template, userId, callbacks)
    if (!shouldCreate) continue

    // Create todo from template
    const dueAt = new Date(dueAtMs)
    const todo = await createTodoFromTemplate(repo, template, dueAt)

    callbacks?.log?.info('Created todo from recurring template', {
      todoId: todo.id,
      templateId: template.id,
      dueAt: dueAt.toISOString(),
    })

    callbacks?.onTodoCreated?.(todo, userId, userStorage)

    // Update tracking
    latestGeneratedDueAt = dueAtMs
    await repo.updateRecurringTemplateLastGenerated(template.id, dueAt.toISOString())
  }
}

/**
 * Applies the overlap policy for a recurring template.
 * Returns true if a new todo should be created.
 */
const applyOverlapPolicy = async (
  repo: WorkRepository,
  template: RecurringTemplate,
  userId: string,
  callbacks?: RecurringHandlerCallbacks,
): Promise<boolean> => {
  if (template.overlapPolicy === 'allow_multiple') return true

  const activeTodos = await repo.listActiveTodosByTemplateId(template.id)

  if (template.overlapPolicy === 'skip_if_open') {
    if (activeTodos.length > 0) {
      callbacks?.log?.info('Skipping recurring todo: open todo exists (skip_if_open)', {
        templateId: template.id,
        activeTodoCount: activeTodos.length,
      })
      return false
    }
    return true
  }

  if (template.overlapPolicy === 'replace_open') {
    // Cancel all existing open todos from this template
    for (const todo of activeTodos) {
      await repo.upsertTodo(todo.id, { status: 'cancelled' })
      callbacks?.onTodoCancelled?.(todo.id, userId)
      callbacks?.log?.info('Cancelled existing todo (replace_open)', {
        todoId: todo.id,
        templateId: template.id,
      })
    }
    return true
  }

  return true
}

/**
 * Creates a new todo from a recurring template.
 */
const createTodoFromTemplate = async (
  repo: WorkRepository,
  template: RecurringTemplate,
  dueAt: Date,
): Promise<WorkTodo> => {
  const isAllDay = template.isAllDay
  const dueAtIso = dueAt.toISOString()

  const input: WorkTodoInput & { recurringTemplateId: string } = {
    title: template.title,
    description: template.description,
    projectId: template.projectId,
    icon: template.icon,
    status: 'not_started',
    dueAt: dueAtIso,
    allDay: isAllDay,
    reminderMinutes: template.reminderMinutes,
    recurringTemplateId: template.id,
  }

  return repo.upsertTodo(undefined, input)
}
