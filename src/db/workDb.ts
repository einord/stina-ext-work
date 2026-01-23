import { NO_PROJECT_GROUP } from './constants.js'

export interface DatabaseAPI {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>
}

export class WorkDb {
  private readonly db: DatabaseAPI
  private initialized = false

  constructor(db: DatabaseAPI) {
    this.db = db
  }

  /**
   * Safely adds a column to a table, ignoring errors if the column already exists.
   */
  private async safeAddColumn(table: string, column: string, type: string): Promise<void> {
    try {
      await this.db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
        throw error
      }
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS ext_work_manager_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )

    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS ext_work_manager_group_state (
        group_id TEXT PRIMARY KEY,
        collapsed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`
    )

    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS ext_work_manager_todos (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        icon TEXT NOT NULL,
        status TEXT NOT NULL,
        due_at TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        all_day INTEGER NOT NULL DEFAULT 0,
        reminder_minutes INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )

    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS ext_work_manager_subitems (
        id TEXT PRIMARY KEY,
        todo_id TEXT NOT NULL,
        text TEXT NOT NULL,
        completed_at TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )

    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS ext_work_manager_comments (
        id TEXT PRIMARY KEY,
        todo_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
    )

    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS ext_work_manager_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )

    // Multi-user migration: Add user_id columns to all tables
    const tables = [
      'ext_work_manager_projects',
      'ext_work_manager_todos',
      'ext_work_manager_subitems',
      'ext_work_manager_comments',
      'ext_work_manager_group_state',
    ]

    for (const table of tables) {
      await this.safeAddColumn(table, 'user_id', 'TEXT')
    }

    // Migrate existing records to 'legacy' user
    for (const table of tables) {
      await this.db.execute(
        `UPDATE ${table} SET user_id = 'legacy' WHERE user_id IS NULL`
      )
    }

    // Create user_settings table for per-user settings
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS ext_work_manager_user_settings (
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        user_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (key, user_id)
      )`
    )

    // Migrate existing settings to 'legacy' user
    await this.db.execute(
      `INSERT OR IGNORE INTO ext_work_manager_user_settings (key, value, user_id, updated_at)
       SELECT key, value, 'legacy', updated_at FROM ext_work_manager_settings`
    )

    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS ext_work_manager_todos_due_idx
       ON ext_work_manager_todos(due_at)`
    )

    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS ext_work_manager_todos_project_idx
       ON ext_work_manager_todos(project_id)`
    )

    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS ext_work_manager_subitems_todo_idx
       ON ext_work_manager_subitems(todo_id)`
    )

    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS ext_work_manager_comments_todo_idx
       ON ext_work_manager_comments(todo_id)`
    )

    // User-scoped indexes for efficient filtering
    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS ext_work_manager_projects_user_idx
       ON ext_work_manager_projects(user_id)`
    )

    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS ext_work_manager_todos_user_idx
       ON ext_work_manager_todos(user_id)`
    )

    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS ext_work_manager_group_state_user_idx
       ON ext_work_manager_group_state(user_id)`
    )

    await cleanupProjectReferences(this.db)

    this.initialized = true
  }

  async execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.db.execute<T>(sql, params)
  }
}

async function cleanupProjectReferences(db: DatabaseAPI): Promise<void> {
  await db.execute(
    `UPDATE ext_work_manager_todos
     SET project_id = NULL
     WHERE project_id IS NOT NULL AND TRIM(project_id) = ''`
  )

  await db.execute(
    `UPDATE ext_work_manager_todos
     SET status = 'not_started'
     WHERE status IN ('pending', 'todo', 'open')`
  )

  await db.execute(
    `UPDATE ext_work_manager_todos
     SET status = 'in_progress'
     WHERE status IN ('inprogress', 'in-progress')`
  )

  await db.execute(
    `UPDATE ext_work_manager_todos
     SET status = 'completed'
     WHERE status IN ('complete', 'done')`
  )

  await db.execute(
    `UPDATE ext_work_manager_todos
     SET status = 'cancelled'
     WHERE status = 'canceled'`
  )

  await db.execute(
    `UPDATE ext_work_manager_todos
     SET project_id = NULL
     WHERE project_id IS NOT NULL
       AND project_id NOT IN (SELECT id FROM ext_work_manager_projects)`
  )

  await db.execute(
    `DELETE FROM ext_work_manager_group_state
     WHERE group_id IS NOT NULL
       AND group_id != ?
       AND group_id NOT IN (SELECT id FROM ext_work_manager_projects)`,
    [NO_PROJECT_GROUP]
  )
}
