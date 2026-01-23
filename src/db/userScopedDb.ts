import type { WorkDb } from './workDb.js'

/**
 * A wrapper around WorkDb that provides user-scoped database access.
 * All repositories use this to ensure data isolation between users.
 */
export class UserScopedDb {
  private readonly db: WorkDb
  private readonly userId: string

  constructor(db: WorkDb, userId: string) {
    this.db = db
    this.userId = userId
  }

  /**
   * Executes a SQL query against the underlying database.
   */
  async execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.db.execute<T>(sql, params)
  }

  /**
   * Returns the current user ID for filtering/inserting data.
   */
  getUserId(): string {
    return this.userId
  }

  /**
   * Initializes the underlying database.
   */
  async initialize(): Promise<void> {
    return this.db.initialize()
  }
}
