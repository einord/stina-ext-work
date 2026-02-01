/**
 * Comments repository using Storage API.
 */

import type { StorageAPI } from '@stina/extension-api/runtime'
import type { WorkComment, WorkCommentInput } from '../types.js'
import type { CommentDocument } from './types.js'
import { COLLECTIONS } from './constants.js'
import { generateId } from './utils.js'

/**
 * Repository for managing todo comments using the Storage API.
 */
export class CommentsRepository {
  private readonly storage: StorageAPI

  /**
   * Creates a new CommentsRepository instance.
   * @param storage - The Storage API instance (should be user-scoped)
   */
  constructor(storage: StorageAPI) {
    this.storage = storage
  }

  /**
   * Adds a new comment to a todo.
   * @param input - Comment data including todoId and text
   * @returns The created comment
   */
  async add(input: WorkCommentInput): Promise<WorkComment> {
    if (!input.todoId || !input.text) {
      throw new Error('Todo id and text are required')
    }

    const createdAt = input.createdAt ?? new Date().toISOString()
    const commentId = generateId('comment')

    const doc: CommentDocument = {
      todoId: input.todoId,
      text: input.text,
      createdAt,
    }

    await this.storage.put(COLLECTIONS.COMMENTS, commentId, doc)

    return {
      id: commentId,
      todoId: input.todoId,
      text: input.text,
      createdAt,
    }
  }

  /**
   * Deletes a comment from a todo.
   * @param todoId - The parent todo ID
   * @param commentId - The comment ID to delete
   * @returns true if deleted, false if not found
   */
  async delete(todoId: string, commentId: string): Promise<boolean> {
    const doc = await this.storage.get<CommentDocument>(COLLECTIONS.COMMENTS, commentId)
    if (!doc || doc.todoId !== todoId) return false

    return this.storage.delete(COLLECTIONS.COMMENTS, commentId)
  }

  /**
   * Lists all comments for a todo.
   * @param todoId - The todo ID
   * @returns Array of comments sorted by creation date
   */
  async list(todoId: string): Promise<WorkComment[]> {
    const docs = await this.storage.find<CommentDocument & { _id: string }>(
      COLLECTIONS.COMMENTS,
      { todoId },
      { sort: { createdAt: 'asc' } }
    )

    return docs.map((doc) => ({
      id: doc._id,
      todoId: doc.todoId,
      text: doc.text,
      createdAt: doc.createdAt,
    }))
  }

  /**
   * Deletes all comments for a todo.
   * @param todoId - The todo ID
   */
  async deleteByTodoId(todoId: string): Promise<void> {
    await this.storage.deleteMany(COLLECTIONS.COMMENTS, { todoId })
  }
}
