/**
 * SubItems repository using Storage API.
 */

import type { StorageAPI } from '@stina/extension-api/runtime'
import type { WorkSubItem, WorkSubItemInput } from '../types.js'
import type { SubItemDocument } from './types.js'
import { COLLECTIONS } from './constants.js'
import { generateId } from './utils.js'

/**
 * Repository for managing todo sub-items using the Storage API.
 */
export class SubItemsRepository {
  private readonly storage: StorageAPI

  /**
   * Creates a new SubItemsRepository instance.
   * @param storage - The Storage API instance (should be user-scoped)
   */
  constructor(storage: StorageAPI) {
    this.storage = storage
  }

  /**
   * Adds a new sub-item to a todo.
   * @param input - SubItem data including todoId and text
   * @returns The created sub-item
   */
  async add(input: WorkSubItemInput): Promise<WorkSubItem> {
    if (!input.todoId || !input.text) {
      throw new Error('Todo id and text are required')
    }

    const now = new Date().toISOString()
    const subItemId = generateId('sub')
    const sortOrder = input.sortOrder ?? 0

    const doc: SubItemDocument = {
      todoId: input.todoId,
      text: input.text,
      completedAt: null,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    }

    await this.storage.put(COLLECTIONS.SUBITEMS, subItemId, doc)

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

  /**
   * Deletes a sub-item from a todo.
   * @param todoId - The parent todo ID
   * @param subItemId - The sub-item ID to delete
   * @returns true if deleted, false if not found
   */
  async delete(todoId: string, subItemId: string): Promise<boolean> {
    const doc = await this.storage.get<SubItemDocument>(COLLECTIONS.SUBITEMS, subItemId)
    if (!doc || doc.todoId !== todoId) return false

    return this.storage.delete(COLLECTIONS.SUBITEMS, subItemId)
  }

  /**
   * Lists all sub-items for a todo.
   * @param todoId - The todo ID
   * @returns Array of sub-items sorted by sortOrder and createdAt
   */
  async list(todoId: string): Promise<WorkSubItem[]> {
    const docs = await this.storage.find<SubItemDocument & { _id: string }>(
      COLLECTIONS.SUBITEMS,
      { todoId },
      { sort: { sortOrder: 'asc' } }
    )

    // Secondary sort by createdAt (Storage API only supports single-field sort)
    docs.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder
      }
      return a.createdAt.localeCompare(b.createdAt)
    })

    return docs.map((doc) => ({
      id: doc._id,
      todoId: doc.todoId,
      text: doc.text,
      completedAt: doc.completedAt,
      sortOrder: doc.sortOrder,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }))
  }

  /**
   * Toggles the completion status of a sub-item.
   * @param todoId - The parent todo ID
   * @param subItemId - The sub-item ID to toggle
   * @returns true if toggled, false if not found
   */
  async toggle(todoId: string, subItemId: string): Promise<boolean> {
    const doc = await this.storage.get<SubItemDocument>(COLLECTIONS.SUBITEMS, subItemId)
    if (!doc || doc.todoId !== todoId) return false

    const now = new Date().toISOString()
    const updatedDoc: SubItemDocument = {
      ...doc,
      completedAt: doc.completedAt ? null : now,
      updatedAt: now,
    }

    await this.storage.put(COLLECTIONS.SUBITEMS, subItemId, updatedDoc)
    return true
  }

  /**
   * Deletes all sub-items for a todo.
   * @param todoId - The todo ID
   */
  async deleteByTodoId(todoId: string): Promise<void> {
    await this.storage.deleteMany(COLLECTIONS.SUBITEMS, { todoId })
  }
}
