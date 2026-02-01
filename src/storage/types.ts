/**
 * Storage document types for Work Manager extension.
 * These types represent the stored document structure in the Storage API.
 */

import type { WorkTodoStatus } from '../types.js'

/**
 * Project document stored in the 'projects' collection.
 */
export interface ProjectDocument {
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

/**
 * Todo document stored in the 'todos' collection.
 */
export interface TodoDocument {
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
}

/**
 * Comment document stored in the 'comments' collection.
 */
export interface CommentDocument {
  todoId: string
  text: string
  createdAt: string
}

/**
 * SubItem document stored in the 'subitems' collection.
 */
export interface SubItemDocument {
  todoId: string
  text: string
  completedAt?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/**
 * Settings document stored in the 'settings' collection.
 * Uses a single document with id 'default' per user.
 */
export interface SettingsDocument {
  defaultReminderMinutes: number | null
  allDayReminderTime: string | null
  reminderLocale: string | null
}

/**
 * Group state document stored in the 'groupState' collection.
 */
export interface GroupStateDocument {
  groupId: string
  collapsed: boolean
  updatedAt: string
}
