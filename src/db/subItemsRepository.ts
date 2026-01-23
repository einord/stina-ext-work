import type { WorkSubItem, WorkSubItemInput } from '../types.js'
import type { UserScopedDb } from './userScopedDb.js'
import { generateId } from './utils.js'

export class SubItemsRepository {
  private readonly db: UserScopedDb

  constructor(db: UserScopedDb) {
    this.db = db
  }

  async add(input: WorkSubItemInput): Promise<WorkSubItem> {
    await this.db.initialize()

    if (!input.todoId || !input.text) {
      throw new Error('Todo id and text are required')
    }

    const now = new Date().toISOString()
    const subItemId = generateId('sub')
    const sortOrder = input.sortOrder ?? 0
    const userId = this.db.getUserId()

    await this.db.execute(
      `INSERT INTO ext_work_manager_subitems (id, todo_id, text, completed_at, sort_order, created_at, updated_at, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [subItemId, input.todoId, input.text, null, sortOrder, now, now, userId]
    )

    return {
      id: subItemId,
      todoId: input.todoId,
      text: input.text,
      completedAt: null,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    }
  }

  async delete(todoId: string, subItemId: string): Promise<boolean> {
    await this.db.initialize()

    const userId = this.db.getUserId()
    const rows = await this.db.execute<{ id: string }>(
      `SELECT id FROM ext_work_manager_subitems WHERE id = ? AND todo_id = ? AND user_id = ?`,
      [subItemId, todoId, userId]
    )

    if (rows.length === 0) return false

    await this.db.execute(
      `DELETE FROM ext_work_manager_subitems WHERE id = ? AND todo_id = ? AND user_id = ?`,
      [subItemId, todoId, userId]
    )

    return true
  }

  async list(todoId: string): Promise<WorkSubItem[]> {
    await this.db.initialize()

    const userId = this.db.getUserId()
    const rows = await this.db.execute<{
      id: string
      todo_id: string
      text: string
      completed_at: string | null
      sort_order: number
      created_at: string
      updated_at: string
    }>(
      `SELECT id, todo_id, text, completed_at, sort_order, created_at, updated_at
       FROM ext_work_manager_subitems
       WHERE todo_id = ? AND user_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
      [todoId, userId]
    )

    return rows.map((row) => ({
      id: row.id,
      todoId: row.todo_id,
      text: row.text,
      completedAt: row.completed_at,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async toggle(todoId: string, subItemId: string): Promise<boolean> {
    await this.db.initialize()

    const userId = this.db.getUserId()
    const rows = await this.db.execute<{ completed_at: string | null }>(
      `SELECT completed_at FROM ext_work_manager_subitems WHERE id = ? AND todo_id = ? AND user_id = ?`,
      [subItemId, todoId, userId]
    )

    const row = rows[0]
    if (!row) return false

    const nextValue = row.completed_at ? null : new Date().toISOString()

    await this.db.execute(
      `UPDATE ext_work_manager_subitems SET completed_at = ?, updated_at = ? WHERE id = ? AND todo_id = ? AND user_id = ?`,
      [nextValue, new Date().toISOString(), subItemId, todoId, userId]
    )

    return true
  }
}
