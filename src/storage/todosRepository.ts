/**
 * Todos repository using Storage API.
 */

import type { StorageAPI } from '@stina/extension-api/runtime'
import type { ListTodosOptions, WorkTodo, WorkTodoInput } from '../types.js'
import type { TodoDocument } from './types.js'
import type { CommentsRepository } from './commentsRepository.js'
import type { SubItemsRepository } from './subItemsRepository.js'
import type { ProjectsRepository } from './projectsRepository.js'
import { COLLECTIONS } from './constants.js'
import { containsIgnoreCase, deriveDateTime, generateId, normalizeOptionalString } from './utils.js'

/**
 * Repository for managing todos using the Storage API.
 */
export class TodosRepository {
  private readonly storage: StorageAPI
  private readonly comments: CommentsRepository
  private readonly subItems: SubItemsRepository
  private readonly projects: ProjectsRepository

  /**
   * Creates a new TodosRepository instance.
   * @param storage - The Storage API instance (should be user-scoped)
   * @param comments - Comments repository
   * @param subItems - SubItems repository
   * @param projects - Projects repository (for cascade delete handling)
   */
  constructor(
    storage: StorageAPI,
    comments: CommentsRepository,
    subItems: SubItemsRepository,
    projects: ProjectsRepository
  ) {
    this.storage = storage
    this.comments = comments
    this.subItems = subItems
    this.projects = projects
  }

  /**
   * Lists todos with optional filtering and pagination.
   * @param options - Filtering and pagination options
   * @returns Array of matching todos
   */
  async list(options: ListTodosOptions = {}): Promise<WorkTodo[]> {
    const { query, includeCompleted = false, limit = 50, offset = 0 } = options

    const docs = await this.storage.find<TodoDocument & { _id: string }>(
      COLLECTIONS.TODOS,
      {},
      { sort: { dueAt: 'asc' } }
    )

    let results = docs.map((doc) => this.toWorkTodo(doc._id, doc))

    // Exclude completed/cancelled unless explicitly requested
    if (!includeCompleted) {
      results = results.filter(
        (todo) => todo.status !== 'completed' && todo.status !== 'cancelled'
      )
    }

    // Apply text search filter if query provided
    if (query) {
      const normalizedQuery = query.trim().toLowerCase()
      results = results.filter(
        (todo) =>
          containsIgnoreCase(todo.title, normalizedQuery) ||
          containsIgnoreCase(todo.description, normalizedQuery)
      )
    }

    // Apply pagination
    return results.slice(offset, offset + limit)
  }

  /**
   * Gets a todo by its ID, including comments and sub-items.
   * @param id - The todo ID
   * @returns The todo with related data if found, null otherwise
   */
  async get(id: string): Promise<WorkTodo | null> {
    const doc = await this.storage.get<TodoDocument>(COLLECTIONS.TODOS, id)
    if (!doc) return null

    const [comments, subItems] = await Promise.all([
      this.comments.list(id),
      this.subItems.list(id),
    ])

    return {
      ...this.toWorkTodo(id, doc),
      comments,
      subItems,
    }
  }

  /**
   * Creates or updates a todo.
   * @param id - Optional todo ID (generated if not provided)
   * @param input - Todo data to create/update
   * @returns The created or updated todo
   */
  async upsert(id: string | undefined, input: WorkTodoInput): Promise<WorkTodo> {
    const now = new Date().toISOString()
    const normalizedId = normalizeOptionalString(id)
    const todoId = normalizedId ?? generateId('todo')
    const existing = await this.get(todoId)
    const normalizedProjectId = normalizeOptionalString(input.projectId)

    if (existing) {
      const projectId =
        normalizedProjectId === undefined ? existing.projectId ?? null : normalizedProjectId
      const merged: WorkTodo = {
        ...existing,
        projectId,
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

      const doc: TodoDocument = {
        projectId: merged.projectId,
        title: merged.title,
        description: merged.description,
        icon: merged.icon,
        status: merged.status,
        dueAt: merged.dueAt,
        date: derived.date,
        time: derived.time,
        allDay: merged.allDay,
        reminderMinutes: merged.reminderMinutes,
        createdAt: merged.createdAt,
        updatedAt: now,
      }

      await this.storage.put(COLLECTIONS.TODOS, todoId, doc)

      return {
        ...merged,
        date: derived.date,
        time: derived.time,
        updatedAt: now,
      }
    }

    // Create new todo
    if (!input.title || !input.icon || !input.status) {
      throw new Error('Todo title, icon, and status are required')
    }

    const dueAt = input.dueAt ?? ''
    const derived = deriveDateTime(dueAt, input.date, input.time, input.allDay)

    if (!dueAt) {
      throw new Error('Todo dueAt is required')
    }

    const projectId = normalizedProjectId ?? null

    const doc: TodoDocument = {
      projectId,
      title: input.title,
      description: input.description,
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

    await this.storage.put(COLLECTIONS.TODOS, todoId, doc)

    return {
      id: todoId,
      projectId,
      title: input.title,
      description: input.description,
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

  /**
   * Deletes a todo and its related comments and sub-items.
   * @param id - The todo ID to delete
   * @returns true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const exists = await this.storage.get(COLLECTIONS.TODOS, id)
    if (!exists) return false

    // Delete related data
    await Promise.all([
      this.comments.deleteByTodoId(id),
      this.subItems.deleteByTodoId(id),
    ])

    return this.storage.delete(COLLECTIONS.TODOS, id)
  }

  /**
   * Checks if a todo exists.
   * @param id - The todo ID
   * @returns true if exists
   */
  async has(id: string): Promise<boolean> {
    const doc = await this.storage.get(COLLECTIONS.TODOS, id)
    return doc !== undefined
  }

  /**
   * Removes project reference from all todos with the given project ID.
   * Called when a project is deleted.
   * @param projectId - The project ID
   */
  async removeProjectReference(projectId: string): Promise<void> {
    const docs = await this.storage.find<TodoDocument & { _id: string }>(
      COLLECTIONS.TODOS,
      { projectId }
    )

    for (const doc of docs) {
      const updatedDoc: TodoDocument = {
        ...doc,
        projectId: null,
        updatedAt: new Date().toISOString(),
      }
      await this.storage.put(COLLECTIONS.TODOS, doc._id, updatedDoc)
    }
  }

  /**
   * Converts a stored document to a WorkTodo.
   */
  private toWorkTodo(id: string, doc: TodoDocument): WorkTodo {
    return {
      id,
      projectId: doc.projectId,
      title: doc.title,
      description: doc.description,
      icon: doc.icon,
      status: doc.status,
      dueAt: doc.dueAt,
      date: doc.date,
      time: doc.time,
      allDay: doc.allDay,
      reminderMinutes: doc.reminderMinutes,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }
  }
}
