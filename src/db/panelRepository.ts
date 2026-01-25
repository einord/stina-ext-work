import type { WorkPanelGroup, WorkTodoStatus } from '../types.js'
import { NO_PROJECT_GROUP } from './constants.js'
import { normalizeOptionalString } from './utils.js'
import type { WorkDb } from './workDb.js'

const STATUS_CONFIG: Record<
  WorkTodoStatus,
  { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'danger' }
> = {
  not_started: { label: 'Not started', variant: 'default' },
  in_progress: { label: 'In progress', variant: 'primary' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
}

/**
 * Formats date and time for display. Shows time only if not an all-day event.
 */
function formatDateTime(date: string, time: string, allDay: boolean): string {
  if (allDay) {
    return date
  }
  const timePart = time.substring(0, 5)
  return `${date} ${timePart}`
}

export class PanelRepository {
  private readonly db: WorkDb

  constructor(db: WorkDb) {
    this.db = db
  }

  async listGroups(): Promise<WorkPanelGroup[]> {
    await this.db.initialize()

    const userId = this.db.getUserId()

    const projects = await this.db.execute<{
      id: string
      name: string
      description: string | null
    }>(
      `SELECT id, name, description
       FROM ext_work_manager_projects
       WHERE user_id = ?
       ORDER BY name ASC`,
      [userId]
    )

    const groupStates = await this.db.execute<{ group_id: string; collapsed: number }>(
      `SELECT group_id, collapsed FROM ext_work_manager_group_state WHERE user_id = ?`,
      [userId]
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
       FROM ext_work_manager_todos
       WHERE user_id = ?
       ORDER BY due_at ASC`,
      [userId]
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
       WHERE user_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
      [userId]
    )

    const comments = await this.db.execute<{
      id: string
      todo_id: string
      text: string
      created_at: string
    }>(
      `SELECT id, todo_id, text, created_at
       FROM ext_work_manager_comments
       WHERE user_id = ?
       ORDER BY created_at ASC`,
      [userId]
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

      const allDay = !!todo.all_day
      const statusConfig = STATUS_CONFIG[todo.status]

      group.items.push({
        id: todo.id,
        title: todo.title,
        description: todo.description ?? '',
        icon: todo.icon,
        status: todo.status,
        statusLabel: statusConfig.label,
        statusVariant: statusConfig.variant,
        date: todo.date,
        time: todo.time,
        dateTime: formatDateTime(todo.date, todo.time, allDay),
        allDay,
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

    const userId = this.db.getUserId()

    if (groupId !== NO_PROJECT_GROUP) {
      const project = await this.db.execute<{ id: string }>(
        `SELECT id FROM ext_work_manager_projects WHERE id = ? AND user_id = ?`,
        [groupId, userId]
      )
      if (project.length === 0) return false
    }

    const now = new Date().toISOString()

    // Check if record exists for this user/group combination
    const existing = await this.db.execute<{ group_id: string }>(
      `SELECT group_id FROM ext_work_manager_group_state WHERE group_id = ? AND user_id = ?`,
      [groupId, userId]
    )

    if (existing.length > 0) {
      await this.db.execute(
        `UPDATE ext_work_manager_group_state SET collapsed = ?, updated_at = ? WHERE group_id = ? AND user_id = ?`,
        [collapsed ? 1 : 0, now, groupId, userId]
      )
    } else {
      await this.db.execute(
        `INSERT INTO ext_work_manager_group_state (group_id, collapsed, updated_at, user_id)
         VALUES (?, ?, ?, ?)`,
        [groupId, collapsed ? 1 : 0, now, userId]
      )
    }

    return true
  }
}
