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

    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS ext_work_manager_todos_due_idx
       ON ext_work_manager_todos(due_at)`
    )

    // Migration: Add last_notification_sent_at column if it doesn't exist
    await addColumnIfNotExists(
      this.db,
      'ext_work_manager_todos',
      'last_notification_sent_at',
      'TEXT'
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

    await cleanupProjectReferences(this.db)

    this.initialized = true
  }

  async execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.db.execute<T>(sql, params)
  }
}

async function addColumnIfNotExists(
  db: DatabaseAPI,
  table: string,
  column: string,
  type: string
): Promise<void> {
  const columns = await db.execute<{ name: string }>(
    `PRAGMA table_info(${table})`
  )
  const exists = columns.some((col) => col.name === column)
  if (!exists) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
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
