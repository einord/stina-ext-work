import type { ListProjectsOptions, WorkProject, WorkProjectInput } from '../types.js'
import type { UserScopedDb } from './userScopedDb.js'
import { generateId, normalizeQuery } from './utils.js'

export class ProjectsRepository {
  private readonly db: UserScopedDb

  constructor(db: UserScopedDb) {
    this.db = db
  }

  async list(options: ListProjectsOptions = {}): Promise<WorkProject[]> {
    await this.db.initialize()

    const { query, limit = 50, offset = 0 } = options
    const userId = this.db.getUserId()
    const params: unknown[] = [userId]
    const conditions: string[] = ['user_id = ?']

    if (query) {
      conditions.push(`(LOWER(name) LIKE ? OR LOWER(description) LIKE ?)`)
      const normalized = `%${normalizeQuery(query)}%`
      params.push(normalized, normalized)
    }

    let sql = `SELECT id, name, description, created_at, updated_at
       FROM ext_work_manager_projects
       WHERE ${conditions.join(' AND ')}`

    sql += ` ORDER BY name ASC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const rows = await this.db.execute<{
      id: string
      name: string
      description: string | null
      created_at: string
      updated_at: string
    }>(sql, params)

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async get(id: string): Promise<WorkProject | null> {
    await this.db.initialize()

    const userId = this.db.getUserId()
    const rows = await this.db.execute<{
      id: string
      name: string
      description: string | null
      created_at: string
      updated_at: string
    }>(
      `SELECT id, name, description, created_at, updated_at
       FROM ext_work_manager_projects
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    )

    const row = rows[0]
    if (!row) return null

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async upsert(id: string | undefined, input: WorkProjectInput): Promise<WorkProject> {
    await this.db.initialize()

    const now = new Date().toISOString()
    const userId = this.db.getUserId()
    const projectId = id ?? generateId('proj')
    const existing = await this.get(projectId)

    if (existing) {
      const name = input.name ?? existing.name
      const description = input.description ?? existing.description ?? null
      await this.db.execute(
        `UPDATE ext_work_manager_projects
         SET name = ?, description = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [name, description, now, projectId, userId]
      )
      return {
        id: projectId,
        name,
        description: description ?? undefined,
        createdAt: existing.createdAt,
        updatedAt: now,
      }
    }

    if (!input.name) {
      throw new Error('Project name is required')
    }

    await this.db.execute(
      `INSERT INTO ext_work_manager_projects (id, name, description, created_at, updated_at, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [projectId, input.name, input.description ?? null, now, now, userId]
    )

    return {
      id: projectId,
      name: input.name,
      description: input.description ?? undefined,
      createdAt: now,
      updatedAt: now,
    }
  }

  async delete(id: string): Promise<boolean> {
    await this.db.initialize()

    const userId = this.db.getUserId()
    const rows = await this.db.execute<{ id: string }>(
      `SELECT id FROM ext_work_manager_projects WHERE id = ? AND user_id = ?`,
      [id, userId]
    )

    if (rows.length === 0) return false

    await this.db.execute(
      `UPDATE ext_work_manager_todos SET project_id = NULL WHERE project_id = ? AND user_id = ?`,
      [id, userId]
    )

    await this.db.execute(
      `DELETE FROM ext_work_manager_projects WHERE id = ? AND user_id = ?`,
      [id, userId]
    )
    return true
  }
}
