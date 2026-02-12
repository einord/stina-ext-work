/**
 * Panel repository using Storage API.
 */

import type { StorageAPI } from '@stina/extension-api/runtime'
import type { WorkPanelGroup, WorkTodoStatus } from '../types.js'
import type { CommentDocument, GroupStateDocument, ProjectDocument, SubItemDocument, TodoDocument } from './types.js'
import { COLLECTIONS, NO_PROJECT_GROUP } from './constants.js'
import { normalizeOptionalString } from './utils.js'

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

/**
 * Repository for panel data aggregation using the Storage API.
 */
export class PanelRepository {
  private readonly storage: StorageAPI

  /**
   * Creates a new PanelRepository instance.
   * @param storage - The Storage API instance (should be user-scoped)
   */
  constructor(storage: StorageAPI) {
    this.storage = storage
  }

  /**
   * Lists all groups (projects + ungrouped) with their todos for the panel display.
   * @returns Array of panel groups with items
   */
  async listGroups(): Promise<WorkPanelGroup[]> {
    const today = new Date().toISOString().slice(0, 10)

    // Fetch all data in parallel
    const [projectDocs, groupStateDocs, todoDocs, subItemDocs, commentDocs] = await Promise.all([
      this.storage.find<ProjectDocument & { _id: string }>(
        COLLECTIONS.PROJECTS,
        {},
        { sort: { name: 'asc' } }
      ),
      this.storage.find<GroupStateDocument & { _id: string }>(COLLECTIONS.GROUP_STATE),
      this.storage.find<TodoDocument & { _id: string }>(
        COLLECTIONS.TODOS,
        {},
        { sort: { dueAt: 'asc' } }
      ),
      this.storage.find<SubItemDocument & { _id: string }>(
        COLLECTIONS.SUBITEMS,
        {},
        { sort: { sortOrder: 'asc' } }
      ),
      this.storage.find<CommentDocument & { _id: string }>(
        COLLECTIONS.COMMENTS,
        {},
        { sort: { createdAt: 'asc' } }
      ),
    ])

    // Build maps for efficient lookups
    const subItemsByTodo = new Map<string, Array<{ id: string; text: string; completedAt: string | null }>>()
    for (const subItem of subItemDocs) {
      const entry = subItemsByTodo.get(subItem.todoId) ?? []
      entry.push({
        id: subItem._id,
        text: subItem.text,
        completedAt: subItem.completedAt ?? null,
      })
      subItemsByTodo.set(subItem.todoId, entry)
    }

    const commentsByTodo = new Map<string, Array<{ id: string; text: string; createdAt: string }>>()
    for (const comment of commentDocs) {
      const entry = commentsByTodo.get(comment.todoId) ?? []
      entry.push({
        id: comment._id,
        text: comment.text,
        createdAt: comment.createdAt,
      })
      commentsByTodo.set(comment.todoId, entry)
    }

    const collapsedByGroup = new Map(
      groupStateDocs.map((state) => [state.groupId, state.collapsed])
    )

    // Build groups
    const groups: WorkPanelGroup[] = []

    for (const project of projectDocs) {
      groups.push({
        id: project._id,
        title: project.name,
        collapsed: collapsedByGroup.get(project._id) ?? false,
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

    // Populate groups with todos (skip finished tasks older than today)
    for (const todo of todoDocs) {
      const isFinished = todo.status === 'completed' || todo.status === 'cancelled'
      if (isFinished && todo.date < today) continue

      const projectId = normalizeOptionalString(todo.projectId)
      const groupId = projectId ?? NO_PROJECT_GROUP
      const group = groupIndex.get(groupId) ?? groupIndex.get(NO_PROJECT_GROUP)
      if (!group) continue

      const todoComments = commentsByTodo.get(todo._id) ?? []
      const todoSubItems = subItemsByTodo.get(todo._id) ?? []
      const statusConfig = STATUS_CONFIG[todo.status]

      group.items.push({
        id: todo._id,
        title: todo.title,
        description: todo.description ?? '',
        icon: todo.icon,
        status: todo.status,
        statusLabel: statusConfig.label,
        statusVariant: statusConfig.variant,
        date: todo.date,
        time: todo.time,
        dateTime: formatDateTime(todo.date, todo.time, todo.allDay),
        allDay: todo.allDay,
        comments: todoComments,
        subItems: todoSubItems,
        commentCount: todoComments.length,
      })
    }

    // Remove groups with no visible items
    const visibleGroups = groups.filter((group) => group.items.length > 0)

    // Sort groups by earliest todo date
    const groupsWithSort = visibleGroups.map((group) => {
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

  /**
   * Sets the collapsed state of a group.
   * @param groupId - The group ID (project ID or 'no-project')
   * @param collapsed - Whether the group should be collapsed
   * @returns true if successful, false if group not found
   */
  async setGroupCollapsed(groupId: string, collapsed: boolean): Promise<boolean> {
    // Validate group exists (if not the special no-project group)
    if (groupId !== NO_PROJECT_GROUP) {
      const project = await this.storage.get(COLLECTIONS.PROJECTS, groupId)
      if (!project) return false
    }

    // Create a deterministic ID for the group state
    const stateId = `state_${groupId}`

    const doc: GroupStateDocument = {
      groupId,
      collapsed,
      updatedAt: new Date().toISOString(),
    }

    await this.storage.put(COLLECTIONS.GROUP_STATE, stateId, doc)
    return true
  }
}
