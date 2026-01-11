import type {
  ListProjectsOptions,
  ListTodosOptions,
  WorkComment,
  WorkCommentInput,
  WorkPanelGroup,
  WorkProject,
  WorkProjectInput,
  WorkSettings,
  WorkSettingsUpdate,
  WorkSubItem,
  WorkSubItemInput,
  WorkTodo,
  WorkTodoInput,
  WorkTodoStatus,
} from '../types.js'

interface DatabaseAPI {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>
}

const NO_PROJECT_GROUP = 'no-project'
const DEFAULT_SETTINGS: WorkSettings = {
  defaultReminderMinutes: null,
  allDayReminderTime: null,
}

const generateId = (prefix: string): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const normalizeQuery = (query: string): string => query.trim().toLowerCase()

const deriveDateTime = (dueAt?: string, date?: string, time?: string, allDay?: boolean) => {
  if (date && time) return { date, time }
  if (dueAt && dueAt.length >= 16) {
    const derivedDate = dueAt.slice(0, 10)
    const derivedTime = dueAt.slice(11, 16)
    return {
      date: date ?? derivedDate,
      time: time ?? (allDay ? '00:00' : derivedTime),
    }
  }
  return {
    date: date ?? '',
    time: time ?? (allDay ? '00:00' : ''),
  }
}

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

  async listProjects(options: ListProjectsOptions = {}): Promise<WorkProject[]> {
    await this.initialize()

    const { query, limit = 50, offset = 0 } = options
    const params: unknown[] = []

    let sql = `SELECT id, name, description, created_at, updated_at
       FROM ext_work_projects`

    if (query) {
      sql += ` WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ?`
      const normalized = `%${normalizeQuery(query)}%`
      params.push(normalized, normalized)
    }

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

  async getProject(id: string): Promise<WorkProject | null> {
    await this.initialize()

    const rows = await this.db.execute<{
      id: string
      name: string
      description: string | null
      created_at: string
      updated_at: string
    }>(
      `SELECT id, name, description, created_at, updated_at
       FROM ext_work_projects
       WHERE id = ?`,
      [id]
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

  async upsertProject(id: string | undefined, input: WorkProjectInput): Promise<WorkProject> {
    await this.initialize()

    const now = new Date().toISOString()
    const projectId = id ?? generateId('proj')
    const existing = await this.getProject(projectId)

    if (existing) {
      const name = input.name ?? existing.name
      const description = input.description ?? existing.description ?? null
      await this.db.execute(
        `UPDATE ext_work_projects
         SET name = ?, description = ?, updated_at = ?
         WHERE id = ?`,
        [name, description, now, projectId]
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
      `INSERT INTO ext_work_projects (id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [projectId, input.name, input.description ?? null, now, now]
    )

    return {
      id: projectId,
      name: input.name,
      description: input.description ?? undefined,
      createdAt: now,
      updatedAt: now,
    }
  }

  async deleteProject(id: string): Promise<boolean> {
    await this.initialize()

    const rows = await this.db.execute<{ id: string }>(
      `SELECT id FROM ext_work_projects WHERE id = ?`,
      [id]
    )

    if (rows.length === 0) return false

    await this.db.execute(
      `UPDATE ext_work_todos SET project_id = NULL WHERE project_id = ?`,
      [id]
    )

    await this.db.execute(`DELETE FROM ext_work_projects WHERE id = ?`, [id])
    return true
  }

  async listTodos(options: ListTodosOptions = {}): Promise<WorkTodo[]> {
    await this.initialize()

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
       FROM ext_work_todos`

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

  async getTodo(id: string): Promise<WorkTodo | null> {
    await this.initialize()

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
       FROM ext_work_todos
       WHERE id = ?`,
      [id]
    )

    const row = rows[0]
    if (!row) return null

    const [comments, subItems] = await Promise.all([
      this.listComments(id),
      this.listSubItems(id),
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

  async upsertTodo(id: string | undefined, input: WorkTodoInput): Promise<WorkTodo> {
    await this.initialize()

    const now = new Date().toISOString()
    const todoId = id ?? generateId('todo')
    const existing = await this.getTodo(todoId)

    if (existing) {
      const merged: WorkTodo = {
        ...existing,
        projectId: input.projectId ?? existing.projectId ?? null,
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
        `UPDATE ext_work_todos
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

    await this.db.execute(
      `INSERT INTO ext_work_todos (
        id, project_id, title, description, icon, status, due_at, date, time, all_day, reminder_minutes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        todoId,
        input.projectId ?? null,
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
      projectId: input.projectId ?? null,
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

  async deleteTodo(id: string): Promise<boolean> {
    await this.initialize()

    const rows = await this.db.execute<{ id: string }>(
      `SELECT id FROM ext_work_todos WHERE id = ?`,
      [id]
    )

    if (rows.length === 0) return false

    await this.db.execute(`DELETE FROM ext_work_comments WHERE todo_id = ?`, [id])
    await this.db.execute(`DELETE FROM ext_work_subitems WHERE todo_id = ?`, [id])
    await this.db.execute(`DELETE FROM ext_work_todos WHERE id = ?`, [id])

    return true
  }

  async addSubItem(input: WorkSubItemInput): Promise<WorkSubItem> {
    await this.initialize()

    if (!input.todoId || !input.text) {
      throw new Error('Todo id and text are required')
    }

    const now = new Date().toISOString()
    const subItemId = generateId('sub')
    const sortOrder = input.sortOrder ?? 0

    await this.db.execute(
      `INSERT INTO ext_work_subitems (id, todo_id, text, completed_at, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [subItemId, input.todoId, input.text, null, sortOrder, now, now]
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

  async deleteSubItem(todoId: string, subItemId: string): Promise<boolean> {
    await this.initialize()

    const rows = await this.db.execute<{ id: string }>(
      `SELECT id FROM ext_work_subitems WHERE id = ? AND todo_id = ?`,
      [subItemId, todoId]
    )

    if (rows.length === 0) return false

    await this.db.execute(
      `DELETE FROM ext_work_subitems WHERE id = ? AND todo_id = ?`,
      [subItemId, todoId]
    )

    return true
  }

  async listSubItems(todoId: string): Promise<WorkSubItem[]> {
    await this.initialize()

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
       FROM ext_work_subitems
       WHERE todo_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
      [todoId]
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
      `UPDATE ext_work_subitems SET completed_at = ?, updated_at = ? WHERE id = ? AND todo_id = ?`,
      [nextValue, new Date().toISOString(), subItemId, todoId]
    )

    return true
  }

  async addComment(input: WorkCommentInput): Promise<WorkComment> {
    await this.initialize()

    if (!input.todoId || !input.text) {
      throw new Error('Todo id and text are required')
    }

    const createdAt = input.createdAt ?? new Date().toISOString()
    const commentId = generateId('comment')

    await this.db.execute(
      `INSERT INTO ext_work_comments (id, todo_id, text, created_at)
       VALUES (?, ?, ?, ?)`,
      [commentId, input.todoId, input.text, createdAt]
    )

    return {
      id: commentId,
      todoId: input.todoId,
      text: input.text,
      createdAt,
    }
  }

  async deleteComment(todoId: string, commentId: string): Promise<boolean> {
    await this.initialize()

    const rows = await this.db.execute<{ id: string }>(
      `SELECT id FROM ext_work_comments WHERE id = ? AND todo_id = ?`,
      [commentId, todoId]
    )

    if (rows.length === 0) return false

    await this.db.execute(
      `DELETE FROM ext_work_comments WHERE id = ? AND todo_id = ?`,
      [commentId, todoId]
    )

    return true
  }

  async listComments(todoId: string): Promise<WorkComment[]> {
    await this.initialize()

    const rows = await this.db.execute<{
      id: string
      todo_id: string
      text: string
      created_at: string
    }>(
      `SELECT id, todo_id, text, created_at
       FROM ext_work_comments
       WHERE todo_id = ?
       ORDER BY created_at ASC`,
      [todoId]
    )

    return rows.map((row) => ({
      id: row.id,
      todoId: row.todo_id,
      text: row.text,
      createdAt: row.created_at,
    }))
  }

  async getSettings(): Promise<WorkSettings> {
    await this.initialize()

    const rows = await this.db.execute<{ key: string; value: string }>(
      `SELECT key, value FROM ext_work_settings`
    )

    const settings: WorkSettings = { ...DEFAULT_SETTINGS }

    for (const row of rows) {
      if (row.key === 'defaultReminderMinutes') {
        settings.defaultReminderMinutes = JSON.parse(row.value) as number | null
      }
      if (row.key === 'allDayReminderTime') {
        settings.allDayReminderTime = JSON.parse(row.value) as string | null
      }
    }

    return settings
  }

  async updateSettings(update: WorkSettingsUpdate): Promise<WorkSettings> {
    await this.initialize()

    const now = new Date().toISOString()
    const current = await this.getSettings()
    const next: WorkSettings = {
      defaultReminderMinutes:
        update.defaultReminderMinutes !== undefined
          ? update.defaultReminderMinutes
          : current.defaultReminderMinutes,
      allDayReminderTime:
        update.allDayReminderTime !== undefined
          ? update.allDayReminderTime
          : current.allDayReminderTime,
    }

    const entries: Array<[string, string]> = [
      ['defaultReminderMinutes', JSON.stringify(next.defaultReminderMinutes)],
      ['allDayReminderTime', JSON.stringify(next.allDayReminderTime)],
    ]

    for (const [key, value] of entries) {
      await this.db.execute(
        `INSERT INTO ext_work_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, now]
      )
    }

    return next
  }

  async listPanelGroups(): Promise<WorkPanelGroup[]> {
    await this.initialize()

    const projects = await this.db.execute<{
      id: string
      name: string
      description: string | null
    }>(
      `SELECT id, name, description
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
    }>(
      `SELECT id, project_id, title, description, icon, status, due_at, date, time
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

    const subItemsByTodo = new Map<string, Array<{ id: string; text: string; completedAt: string | null }>>()
    for (const subItem of subItems) {
      const entry = subItemsByTodo.get(subItem.todo_id) ?? []
      entry.push({
        id: subItem.id,
        text: subItem.text,
        completedAt: subItem.completed_at,
      })
      subItemsByTodo.set(subItem.todo_id, entry)
    }

    const commentsByTodo = new Map<string, Array<{ id: string; text: string; createdAt: string }>>()
    for (const comment of comments) {
      const entry = commentsByTodo.get(comment.todo_id) ?? []
      entry.push({
        id: comment.id,
        text: comment.text,
        createdAt: comment.created_at,
      })
      commentsByTodo.set(comment.todo_id, entry)
    }

    const collapsedByGroup = new Map(groupStates.map((state) => [state.group_id, !!state.collapsed]))

    const groups: WorkPanelGroup[] = []

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
        comments: todoComments,
        subItems: todoSubItems,
        commentCount: todoComments.length,
      })
    }

    const groupsWithSort = groups.map((group) => {
      const firstTodo = group.items[0]
      const earliest = firstTodo ? `${firstTodo.date}T${firstTodo.time}` : null
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

  async hasTodo(id: string): Promise<boolean> {
    await this.initialize()
    const rows = await this.db.execute<{ id: string }>(
      `SELECT id FROM ext_work_todos WHERE id = ?`,
      [id]
    )
    return rows.length > 0
  }
}
