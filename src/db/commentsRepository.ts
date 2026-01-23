import type { WorkComment, WorkCommentInput } from '../types.js'
import type { UserScopedDb } from './userScopedDb.js'
import { generateId } from './utils.js'

export class CommentsRepository {
  private readonly db: UserScopedDb

  constructor(db: UserScopedDb) {
    this.db = db
  }

  async add(input: WorkCommentInput): Promise<WorkComment> {
    await this.db.initialize()

    if (!input.todoId || !input.text) {
      throw new Error('Todo id and text are required')
    }

    const createdAt = input.createdAt ?? new Date().toISOString()
    const commentId = generateId('comment')
    const userId = this.db.getUserId()

    await this.db.execute(
      `INSERT INTO ext_work_manager_comments (id, todo_id, text, created_at, user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [commentId, input.todoId, input.text, createdAt, userId]
    )

    return {
      id: commentId,
      todoId: input.todoId,
      text: input.text,
      createdAt,
    }
  }

  async delete(todoId: string, commentId: string): Promise<boolean> {
    await this.db.initialize()

    const userId = this.db.getUserId()
    const rows = await this.db.execute<{ id: string }>(
      `SELECT id FROM ext_work_manager_comments WHERE id = ? AND todo_id = ? AND user_id = ?`,
      [commentId, todoId, userId]
    )

    if (rows.length === 0) return false

    await this.db.execute(
      `DELETE FROM ext_work_manager_comments WHERE id = ? AND todo_id = ? AND user_id = ?`,
      [commentId, todoId, userId]
    )

    return true
  }

  async list(todoId: string): Promise<WorkComment[]> {
    await this.db.initialize()

    const userId = this.db.getUserId()
    const rows = await this.db.execute<{
      id: string
      todo_id: string
      text: string
      created_at: string
    }>(
      `SELECT id, todo_id, text, created_at
       FROM ext_work_manager_comments
       WHERE todo_id = ? AND user_id = ?
       ORDER BY created_at ASC`,
      [todoId, userId]
    )

    return rows.map((row) => ({
      id: row.id,
      todoId: row.todo_id,
      text: row.text,
      createdAt: row.created_at,
    }))
  }
}
