export type WorkTodoStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled'

export interface WorkComment {
  id: string
  text: string
  createdAt: string
}

export interface WorkSubItem {
  id: string
  text: string
  completedAt: string | null
}

export interface WorkTodo {
  id: string
  title: string
  description: string
  icon: string
  status: WorkTodoStatus
  date: string
  time: string
  comments: WorkComment[]
  subItems: WorkSubItem[]
}

export interface WorkGroup {
  id: string
  title: string
  collapsed: boolean
  items: WorkTodo[]
}

const state: { groups: WorkGroup[] } = {
  groups: [
    {
      id: 'project-alpha',
      title: 'Project Alpha',
      collapsed: false,
      items: [
        {
          id: 'todo-1',
          title: 'Prepare kickoff deck',
          description: 'Draft agenda, timeline, and responsibilities.',
          icon: 'presentation',
          status: 'in_progress',
          date: '2025-02-10',
          time: '09:00',
          comments: [
            {
              id: 'comment-1',
              text: 'Need to add updated timeline from product.',
              createdAt: '2025-02-08T14:20:00+01:00'
            }
          ],
          subItems: [
            {
              id: 'sub-1',
              text: 'Collect requirements',
              completedAt: '2025-02-08T10:00:00+01:00'
            },
            {
              id: 'sub-2',
              text: 'Draft slides',
              completedAt: null
            }
          ]
        }
      ]
    },
    {
      id: 'no-project',
      title: 'No Project',
      collapsed: false,
      items: [
        {
          id: 'todo-2',
          title: 'Schedule weekly review',
          description: 'Find a 30-minute slot for the team review.',
          icon: 'calendar-check',
          status: 'not_started',
          date: '2025-02-11',
          time: '11:00',
          comments: [],
          subItems: []
        }
      ]
    }
  ]
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function listGroups(): WorkGroup[] {
  return clone(state.groups)
}

export function setGroupCollapsed(groupId: string, collapsed: boolean): boolean {
  const group = state.groups.find((item) => item.id === groupId)
  if (!group) return false
  group.collapsed = collapsed
  return true
}

export function toggleSubItem(todoId: string, subItemId: string): boolean {
  for (const group of state.groups) {
    const todo = group.items.find((item) => item.id === todoId)
    if (!todo) continue
    const subItem = todo.subItems.find((item) => item.id === subItemId)
    if (!subItem) return false
    subItem.completedAt = subItem.completedAt ? null : new Date().toISOString()
    return true
  }
  return false
}
