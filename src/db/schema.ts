import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const workProjects = sqliteTable('ext_work_manager_projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const workGroupState = sqliteTable('ext_work_manager_group_state', {
  groupId: text('group_id').primaryKey(),
  collapsed: integer('collapsed', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').notNull(),
})

export const workTodos = sqliteTable('ext_work_manager_todos', {
  id: text('id').primaryKey(),
  projectId: text('project_id'),
  title: text('title').notNull(),
  description: text('description'),
  icon: text('icon').notNull(),
  status: text('status').notNull(),
  dueAt: text('due_at').notNull(),
  date: text('date').notNull(),
  time: text('time').notNull(),
  allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
  reminderMinutes: integer('reminder_minutes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const workSubItems = sqliteTable('ext_work_manager_subitems', {
  id: text('id').primaryKey(),
  todoId: text('todo_id').notNull(),
  text: text('text').notNull(),
  completedAt: text('completed_at'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const workComments = sqliteTable('ext_work_manager_comments', {
  id: text('id').primaryKey(),
  todoId: text('todo_id').notNull(),
  text: text('text').notNull(),
  createdAt: text('created_at').notNull(),
})

export const workSettings = sqliteTable('ext_work_manager_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export type WorkProjectRecord = typeof workProjects.$inferSelect
export type WorkTodoRecord = typeof workTodos.$inferSelect
export type WorkSubItemRecord = typeof workSubItems.$inferSelect
export type WorkCommentRecord = typeof workComments.$inferSelect
