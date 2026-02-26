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
  recurringTemplateId?: string | null
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
  recurringTemplateId?: string | null
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
  includeCompleted?: boolean
  limit?: number
  offset?: number
}

export interface WorkTodoPanelItem {
  id: string
  title: string
  description: string
  icon: string
  status: WorkTodoStatus
  statusLabel: string
  statusVariant: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  date: string
  time: string
  dateTime: string
  allDay: boolean
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

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type RecurringOverlapPolicy = 'skip_if_open' | 'allow_multiple' | 'replace_open'

export interface RecurringTemplate {
  id: string
  title: string
  description?: string
  projectId?: string | null
  icon: string
  frequency: RecurringFrequency
  daysOfWeek?: number[] | null       // 0-6 (Sun-Sat) for weekly
  dayOfMonth?: number | null          // 1-31 for monthly/yearly
  months?: number[] | null            // 1-12 restriction for monthly
  monthOfYear?: number | null         // 1-12 for yearly
  timeOfDay?: string | null           // HH:MM
  isAllDay: boolean
  leadTimeValue: number               // numeric value
  leadTimeUnit: 'hours' | 'days'      // unit for lead time
  leadTimeMinutes: number             // computed total in minutes
  reminderMinutes?: number | null
  overlapPolicy: RecurringOverlapPolicy
  lastGeneratedDueAt?: string | null  // ISO timestamp of last generated occurrence
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface RecurringTemplateInput {
  title?: string
  description?: string | null
  projectId?: string | null
  icon?: string
  frequency?: RecurringFrequency
  daysOfWeek?: number[] | null
  dayOfMonth?: number | null
  months?: number[] | null
  monthOfYear?: number | null
  timeOfDay?: string | null
  isAllDay?: boolean
  leadTimeValue?: number
  leadTimeUnit?: 'hours' | 'days'
  reminderMinutes?: number | null
  overlapPolicy?: RecurringOverlapPolicy
  enabled?: boolean
}

export interface ListRecurringTemplatesOptions {
  enabledOnly?: boolean
}
