import type { WorkPanelGroup, WorkTodoStatus } from '../types.js'
import { NO_PROJECT_GROUP } from './constants.js'
import { normalizeOptionalString } from './utils.js'
import type { WorkDb } from './workDb.js'

export class PanelRepository {
  private readonly db: WorkDb

  constructor(db: WorkDb) {
    this.db = db
  }

  async listGroups(): Promise<WorkPanelGroup[]> {
    await this.db.initialize()

    const projects = await this.db.execute<{
      id: string
      name: string
      description: string | null
    }>(
      `SELECT id, name, description
       FROM ext_work_manager_projects
       ORDER BY name ASC`
    )

    const groupStates = await this.db.execute<{ group_id: string; collapsed: number }>(
      `SELECT group_id, collapsed FROM ext_work_manager_group_state`
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
       FROM ext_work_manager_todos
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
       FROM ext_work_manager_subitems
       ORDER BY sort_order ASC, created_at ASC`
    )

    const comments = await this.db.execute<{
      id: string
      todo_id: string
      text: string
      created_at: string
    }>(
      `SELECT id, todo_id, text, created_at
       FROM ext_work_manager_comments
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

    const collapsedByGroup = new Map(
      groupStates.map((state) => [state.group_id, !!state.collapsed])
    )

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
      const projectId = normalizeOptionalString(todo.project_id)
      const groupId = projectId ?? NO_PROJECT_GROUP
      const group = groupIndex.get(groupId) ?? groupIndex.get(NO_PROJECT_GROUP)
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
    await this.db.initialize()

    if (groupId !== NO_PROJECT_GROUP) {
      const project = await this.db.execute<{ id: string }>(
        `SELECT id FROM ext_work_manager_projects WHERE id = ?`,
        [groupId]
      )
      if (project.length === 0) return false
    }

    const now = new Date().toISOString()
    await this.db.execute(
      `INSERT INTO ext_work_manager_group_state (group_id, collapsed, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(group_id) DO UPDATE SET collapsed = excluded.collapsed, updated_at = excluded.updated_at`,
      [groupId, collapsed ? 1 : 0, now]
    )

    return true
  }
}
