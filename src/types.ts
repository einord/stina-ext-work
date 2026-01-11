export type WorkTodoStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled'

export interface WorkProject {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

export interface WorkProjectInput {
  name?: string
  description?: string
}

export interface WorkSubItem {
  id: string
  todoId: string
  text: string
  completedAt?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface WorkSubItemInput {
  todoId?: string
  text?: string
  sortOrder?: number
}

export interface WorkComment {
  id: string
  todoId: string
  text: string
  createdAt: string
}

export interface WorkCommentInput {
  todoId?: string
  text?: string
  createdAt?: string
}

export interface WorkTodo {
  id: string
  projectId?: string | null
  title: string
  description?: string
  icon: string
  status: WorkTodoStatus
  dueAt: string
  date: string
  time: string
  allDay: boolean
  reminderMinutes?: number | null
  createdAt: string
  updatedAt: string
  comments?: WorkComment[]
  subItems?: WorkSubItem[]
}

export interface WorkTodoInput {
  projectId?: string | null
  title?: string
  description?: string
  icon?: string
  status?: WorkTodoStatus
  dueAt?: string
  date?: string
  time?: string
  allDay?: boolean
  reminderMinutes?: number | null
}

export interface WorkSettings {
  defaultReminderMinutes: number | null
  allDayReminderTime: string | null
  reminderLocale: string | null
}

export interface WorkSettingsUpdate {
  defaultReminderMinutes?: number | null
  allDayReminderTime?: string | null
  reminderLocale?: string | null
}

export interface ListProjectsOptions {
  query?: string
  limit?: number
  offset?: number
}

export interface ListTodosOptions {
  query?: string
  projectId?: string
  status?: WorkTodoStatus
  limit?: number
  offset?: number
}

export interface WorkTodoPanelItem {
  id: string
  title: string
  description: string
  icon: string
  status: WorkTodoStatus
  date: string
  time: string
  commentCount: number
  comments: Array<{ id: string; text: string; createdAt: string }>
  subItems: Array<{ id: string; text: string; completedAt: string | null }>
}

export interface WorkPanelGroup {
  id: string
  title: string
  collapsed: boolean
  items: WorkTodoPanelItem[]
}
