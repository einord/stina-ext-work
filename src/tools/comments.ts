import type { Tool, ToolResult, ExecutionContext } from '@stina/extension-api/runtime'
import type { WorkRepository } from '../db/repository.js'
import type { WorkCommentInput } from '../types.js'

interface DeleteCommentParams {
  todoId: string
  commentId: string
}

export function createAddCommentTool(
  repository: WorkRepository,
  onChange?: (userId: string) => void
): Tool {
  return {
    id: 'work_comments_add',
    name: 'Add Comment',
    description: 'Add a comment to a todo item.',
    parameters: {
      type: 'object',
      properties: {
        todoId: { type: 'string' },
        text: { type: 'string' },
        createdAt: { type: 'string' },
      },
      required: ['todoId', 'text'],
    },
    async execute(params: Record<string, unknown>, execContext: ExecutionContext): Promise<ToolResult> {
      try {
        if (!execContext.userId) {
          return { success: false, error: 'User context required' }
        }
        const repo = repository.withUser(execContext.userId)
        const input = params as WorkCommentInput
        const comment = await repo.addComment(input)
        onChange?.(execContext.userId)
        return { success: true, data: comment }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

export function createDeleteCommentTool(
  repository: WorkRepository,
  onChange?: (userId: string) => void
): Tool {
  return {
    id: 'work_comments_delete',
    name: 'Delete Comment',
    description: 'Delete a comment from a todo item.',
    parameters: {
      type: 'object',
      properties: {
        todoId: { type: 'string' },
        commentId: { type: 'string' },
      },
      required: ['todoId', 'commentId'],
    },
    async execute(params: Record<string, unknown>, execContext: ExecutionContext): Promise<ToolResult> {
      try {
        if (!execContext.userId) {
          return { success: false, error: 'User context required' }
        }
        const repo = repository.withUser(execContext.userId)
        const { todoId, commentId } = params as unknown as DeleteCommentParams
        if (!todoId || !commentId) {
          return { success: false, error: 'todoId and commentId are required' }
        }
        const deleted = await repo.deleteComment(todoId, commentId)
        if (!deleted) return { success: false, error: 'Comment not found' }
        onChange?.(execContext.userId)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
