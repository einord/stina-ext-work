import type { ListTodosOptions, WorkTodo, WorkTodoInput, WorkTodoStatus } from '../types.js'
import { deriveDateTime, generateId, normalizeOptionalString, normalizeQuery } from './utils.js'
import type { WorkDb } from './workDb.js'
import type { CommentsRepository } from './commentsRepository.js'
import type { SubItemsRepository } from './subItemsRepository.js'

export class TodosRepository {
  private readonly db: WorkDb
  private readonly comments: CommentsRepository
  private readonly subItems: SubItemsRepository

  constructor(db: WorkDb, comments: CommentsRepository, subItems: SubItemsRepository) {
    this.db = db
    this.comments = comments
    this.subItems = subItems
  }

  async list(options: ListTodosOptions = {}): Promise<WorkTodo[]> {
    await this.db.initialize()

    const { query, projectId, status, limit = 50, offset = 0 } = options
    const params: unknown[] = []
    const conditions: string[] = []

    if (query) {
      const normalized = `%${normalizeQuery(query)}%`
      conditions.push(`(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)`)
      params.push(normalized, normalized)
    }

    if (projectId) {
      conditions.push(`project_id = ?`)
      params.push(projectId)
    }

    if (status) {
      conditions.push(`status = ?`)
      params.push(status)
    }

    let sql = `SELECT id, project_id, title, description, icon, status, due_at, date, time, all_day, reminder_minutes, created_at, updated_at
       FROM ext_work_manager_todos`

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }

    sql += ` ORDER BY due_at ASC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const rows = await this.db.execute<{
      id: string
      project_id: string | null
      title: string
      description: string | null
      icon: string
      status: WorkTodoStatus
      due_at: string
      date: string
      time: string
      all_day: number
      reminder_minutes: number | null
      created_at: string
      updated_at: string
    }>(sql, params)

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id ?? null,
      title: row.title,
      description: row.description ?? undefined,
      icon: row.icon,
      status: row.status,
      dueAt: row.due_at,
      date: row.date,
      time: row.time,
      allDay: !!row.all_day,
      reminderMinutes: row.reminder_minutes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async get(id: string): Promise<WorkTodo | null> {
    await this.db.initialize()

    const rows = await this.db.execute<{
      id: string
      project_id: string | null
      title: string
      description: string | null
      icon: string
      status: WorkTodoStatus
      due_at: string
      date: string
      time: string
      all_day: number
      reminder_minutes: number | null
      created_at: string
      updated_at: string
    }>(
      `SELECT id, project_id, title, description, icon, status, due_at, date, time, all_day, reminder_minutes, created_at, updated_at
       FROM ext_work_manager_todos
       WHERE id = ?`,
      [id]
    )

    const row = rows[0]
    if (!row) return null

    const [comments, subItems] = await Promise.all([
      this.comments.list(id),
      this.subItems.list(id),
    ])

    return {
      id: row.id,
      projectId: row.project_id ?? null,
      title: row.title,
      description: row.description ?? undefined,
      icon: row.icon,
      status: row.status,
      dueAt: row.due_at,
      date: row.date,
      time: row.time,
      allDay: !!row.all_day,
      reminderMinutes: row.reminder_minutes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      comments,
      subItems,
    }
  }

  async upsert(id: string | undefined, input: WorkTodoInput): Promise<WorkTodo> {
    await this.db.initialize()

    const now = new Date().toISOString()
    const normalizedId = normalizeOptionalString(id)
    const todoId = normalizedId ?? generateId('todo')
    const existing = await this.get(todoId)
    const normalizedProjectId = normalizeOptionalString(input.projectId)

    if (existing) {
      const projectId =
        normalizedProjectId === undefined ? existing.projectId ?? null : normalizedProjectId
      const merged: WorkTodo = {
        ...existing,
        projectId,
        title: input.title ?? existing.title,
        description: input.description ?? existing.description ?? undefined,
        icon: input.icon ?? existing.icon,
        status: input.status ?? existing.status,
        dueAt: input.dueAt ?? existing.dueAt,
        date: input.date ?? existing.date,
        time: input.time ?? existing.time,
        allDay: input.allDay ?? existing.allDay,
        reminderMinutes:
          input.reminderMinutes !== undefined ? input.reminderMinutes : existing.reminderMinutes,
        createdAt: existing.createdAt,
        updatedAt: now,
      }

      const derived = deriveDateTime(merged.dueAt, merged.date, merged.time, merged.allDay)

      await this.db.execute(
        `UPDATE ext_work_manager_todos
         SET project_id = ?, title = ?, description = ?, icon = ?, status = ?, due_at = ?, date = ?, time = ?, all_day = ?, reminder_minutes = ?, updated_at = ?
         WHERE id = ?`,
        [
          merged.projectId,
          merged.title,
          merged.description ?? null,
          merged.icon,
          merged.status,
          merged.dueAt,
          derived.date,
          derived.time,
          merged.allDay ? 1 : 0,
          merged.reminderMinutes ?? null,
          now,
          todoId,
        ]
      )

      return {
        ...merged,
        date: derived.date,
        time: derived.time,
        updatedAt: now,
      }
    }

    if (!input.title || !input.icon || !input.status) {
      throw new Error('Todo title, icon, and status are required')
    }

    const dueAt = input.dueAt ?? ''
    const derived = deriveDateTime(dueAt, input.date, input.time, input.allDay)

    if (!dueAt) {
      throw new Error('Todo dueAt is required')
    }

    const projectId = normalizedProjectId ?? null

    await this.db.execute(
      `INSERT INTO ext_work_manager_todos (
        id, project_id, title, description, icon, status, due_at, date, time, all_day, reminder_minutes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        todoId,
        projectId,
        input.title,
        input.description ?? null,
        input.icon,
        input.status,
        dueAt,
        derived.date,
        derived.time,
        input.allDay ? 1 : 0,
        input.reminderMinutes ?? null,
        now,
        now,
      ]
    )

    return {
      id: todoId,
      projectId,
      title: input.title,
      description: input.description ?? undefined,
      icon: input.icon,
      status: input.status,
      dueAt,
      date: derived.date,
      time: derived.time,
      allDay: input.allDay ?? false,
      reminderMinutes: input.reminderMinutes ?? null,
      createdAt: now,
      updatedAt: now,
    }
  }

  async delete(id: string): Promise<boolean> {
    await this.db.initialize()

    const rows = await this.db.execute<{ id: string }>(
      `SELECT id FROM ext_work_manager_todos WHERE id = ?`,
      [id]
    )

    if (rows.length === 0) return false

    await this.db.execute(`DELETE FROM ext_work_manager_comments WHERE todo_id = ?`, [id])
    await this.db.execute(`DELETE FROM ext_work_manager_subitems WHERE todo_id = ?`, [id])
    await this.db.execute(`DELETE FROM ext_work_manager_todos WHERE id = ?`, [id])

    return true
  }

  async has(id: string): Promise<boolean> {
    await this.db.initialize()
    const rows = await this.db.execute<{ id: string }>(
      `SELECT id FROM ext_work_manager_todos WHERE id = ?`,
      [id]
    )
    return rows.length > 0
  }
}
