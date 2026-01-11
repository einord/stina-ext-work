import type {
  WorkProjectRecord,
  WorkTodoRecord,
  WorkSubItemRecord,
  WorkCommentRecord,
} from './schema.js'

export type WorkTodoStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled'

interface DatabaseAPI {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>
}

export interface WorkTodoSummary {
  id: string
  title: string
  description: string
  icon: string
  status: WorkTodoStatus
  date: string
  time: string
  comments: Array<{ id: string; text: string; createdAt: string }>
  subItems: Array<{ id: string; text: string; completedAt: string | null }>
  commentCount: number
}

export interface WorkGroupSummary {
  id: string
  title: string
  collapsed: boolean
  items: WorkTodoSummary[]
}

const NO_PROJECT_GROUP = 'no-project'

export class WorkRepository {
  private db: DatabaseAPI
  private initialized = false

  constructor(db: DatabaseAPI) {
    this.db = db
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS ext_work_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )

    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS ext_work_group_state (
        group_id TEXT PRIMARY KEY,
        collapsed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`
    )

    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS ext_work_todos (
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
      `CREATE TABLE IF NOT EXISTS ext_work_subitems (
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
      `CREATE TABLE IF NOT EXISTS ext_work_comments (
        id TEXT PRIMARY KEY,
        todo_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
    )

    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS ext_work_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )

    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS ext_work_todos_due_idx
       ON ext_work_todos(due_at)`
    )

    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS ext_work_todos_project_idx
       ON ext_work_todos(project_id)`
    )

    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS ext_work_subitems_todo_idx
       ON ext_work_subitems(todo_id)`
    )

    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS ext_work_comments_todo_idx
       ON ext_work_comments(todo_id)`
    )

    this.initialized = true
  }

  async listPanelGroups(): Promise<WorkGroupSummary[]> {
    await this.initialize()

    const projects = await this.db.execute<{
      id: string
      name: string
      description: string | null
      created_at: string
      updated_at: string
    }>(
      `SELECT id, name, description, created_at, updated_at
       FROM ext_work_projects
       ORDER BY name ASC`
    )

    const groupStates = await this.db.execute<{ group_id: string; collapsed: number }>(
      `SELECT group_id, collapsed FROM ext_work_group_state`
    )

    const todos = await this.db.execute<{
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
    }>(
      `SELECT id, project_id, title, description, icon, status, due_at, date, time, all_day
       FROM ext_work_todos
       ORDER BY due_at ASC`
    )

    const subItems = await this.db.execute<{
      id: string
      todo_id: string
      text: string
      completed_at: string | null
      sort_order: number
      created_at: string
    }>(
      `SELECT id, todo_id, text, completed_at, sort_order, created_at
       FROM ext_work_subitems
       ORDER BY sort_order ASC, created_at ASC`
    )

    const comments = await this.db.execute<{
      id: string
      todo_id: string
      text: string
      created_at: string
    }>(
      `SELECT id, todo_id, text, created_at
       FROM ext_work_comments
       ORDER BY created_at ASC`
    )

    const subItemsByTodo = new Map<string, WorkSubItemRecord[]>()
    for (const subItem of subItems) {
      const entry = subItemsByTodo.get(subItem.todo_id) ?? []
      entry.push({
        id: subItem.id,
        todoId: subItem.todo_id,
        text: subItem.text,
        completedAt: subItem.completed_at,
        sortOrder: subItem.sort_order,
        createdAt: subItem.created_at,
        updatedAt: subItem.created_at,
      })
      subItemsByTodo.set(subItem.todo_id, entry)
    }

    const commentsByTodo = new Map<string, WorkCommentRecord[]>()
    for (const comment of comments) {
      const entry = commentsByTodo.get(comment.todo_id) ?? []
      entry.push({
        id: comment.id,
        todoId: comment.todo_id,
        text: comment.text,
        createdAt: comment.created_at,
      })
      commentsByTodo.set(comment.todo_id, entry)
    }

    const collapsedByGroup = new Map(groupStates.map((state) => [state.group_id, !!state.collapsed]))

    const groups: WorkGroupSummary[] = []

    for (const project of projects) {
      const groupId = project.id
      groups.push({
        id: groupId,
        title: project.name,
        collapsed: collapsedByGroup.get(groupId) ?? false,
        items: [],
      })
    }

    groups.push({
      id: NO_PROJECT_GROUP,
      title: 'No Project',
      collapsed: collapsedByGroup.get(NO_PROJECT_GROUP) ?? false,
      items: [],
    })

    const groupIndex = new Map(groups.map((group) => [group.id, group]))

    for (const todo of todos) {
      const groupId = todo.project_id ?? NO_PROJECT_GROUP
      const group = groupIndex.get(groupId)
      if (!group) continue

      const todoComments = commentsByTodo.get(todo.id) ?? []
      const todoSubItems = subItemsByTodo.get(todo.id) ?? []

      group.items.push({
        id: todo.id,
        title: todo.title,
        description: todo.description ?? '',
        icon: todo.icon,
        status: todo.status,
        date: todo.date,
        time: todo.time,
        comments: todoComments.map((comment) => ({
          id: comment.id,
          text: comment.text,
          createdAt: comment.createdAt,
        })),
        subItems: todoSubItems.map((item) => ({
          id: item.id,
          text: item.text,
          completedAt: item.completedAt ?? null,
        })),
        commentCount: todoComments.length,
      })
    }

    const groupsWithSort = groups.map((group) => {
      const earliest = group.items[0]?.date ? `${group.items[0].date}T${group.items[0].time}` : null
      return { group, earliest }
    })

    groupsWithSort.sort((a, b) => {
      if (!a.earliest && !b.earliest) return 0
      if (!a.earliest) return 1
      if (!b.earliest) return -1
      return a.earliest.localeCompare(b.earliest)
    })

    return groupsWithSort.map(({ group }) => group)
  }

  async setGroupCollapsed(groupId: string, collapsed: boolean): Promise<boolean> {
    await this.initialize()

    if (groupId !== NO_PROJECT_GROUP) {
      const project = await this.db.execute<{ id: string }>(
        `SELECT id FROM ext_work_projects WHERE id = ?`,
        [groupId]
      )
      if (project.length === 0) return false
    }

    const now = new Date().toISOString()
    await this.db.execute(
      `INSERT INTO ext_work_group_state (group_id, collapsed, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(group_id) DO UPDATE SET collapsed = excluded.collapsed, updated_at = excluded.updated_at`,
      [groupId, collapsed ? 1 : 0, now]
    )

    return true
  }

  async toggleSubItem(todoId: string, subItemId: string): Promise<boolean> {
    await this.initialize()

    const existing = await this.db.execute<{ completed_at: string | null }>(
      `SELECT completed_at FROM ext_work_subitems WHERE id = ? AND todo_id = ?`,
      [subItemId, todoId]
    )

    if (existing.length === 0) return false

    const completedAt = existing[0].completed_at
    const nextValue = completedAt ? null : new Date().toISOString()

    await this.db.execute(
      `UPDATE ext_work_subitems SET completed_at = ? WHERE id = ? AND todo_id = ?`,
      [nextValue, subItemId, todoId]
    )

    return true
  }

  async hasTodo(id: string): Promise<boolean> {
    await this.initialize()
    const rows = await this.db.execute<{ id: string }>(
      `SELECT id FROM ext_work_todos WHERE id = ?`,
      [id]
    )
    return rows.length > 0
  }
}
