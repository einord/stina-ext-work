import type { Tool, ToolResult } from '@stina/extension-api/runtime'
import type { WorkRepository } from '../db/repository.js'
import type { WorkTodo, WorkTodoInput, WorkTodoStatus } from '../types.js'

interface ListTodosParams {
  query?: string
  projectId?: string
  status?: WorkTodoStatus
  limit?: number
  offset?: number
}

interface GetTodoParams {
  id: string
}

interface UpsertTodoParams extends WorkTodoInput {
  id?: string
}

interface DeleteTodoParams {
  id: string
}

export function createListTodosTool(repository: WorkRepository): Tool {
  return {
    id: 'work_todos_list',
    name: 'List Todos',
    description: 'List todos with optional filters.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        projectId: { type: 'string' },
        status: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      try {
        const { query, projectId, status, limit, offset } = params as ListTodosParams
        const todos = await repository.listTodos({ query, projectId, status, limit, offset })
        return { success: true, data: { count: todos.length, todos } }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

export function createGetTodoTool(repository: WorkRepository): Tool {
  return {
    id: 'work_todos_get',
    name: 'Get Todo',
    description: 'Get todo details by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      try {
        const { id } = params as unknown as GetTodoParams
        if (!id) return { success: false, error: 'Todo id is required' }
        const todo = await repository.getTodo(id)
        if (!todo) return { success: false, error: 'Todo not found' }
        return { success: true, data: todo }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

export function createUpsertTodoTool(
  repository: WorkRepository,
  onChange?: (todo: WorkTodo) => void
): Tool {
  return {
    id: 'work_todos_upsert',
    name: 'Add/Update Todo',
    description: 'Create or update a todo item.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        projectId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        icon: { type: 'string' },
        status: { type: 'string' },
        dueAt: { type: 'string' },
        date: { type: 'string' },
        time: { type: 'string' },
        allDay: { type: 'boolean' },
        reminderMinutes: { type: 'number' },
      },
    },
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      try {
        const input = params as UpsertTodoParams
        const todo = await repository.upsertTodo(input.id, input)
        onChange?.(todo)
        return { success: true, data: todo }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

export function createDeleteTodoTool(
  repository: WorkRepository,
  onDelete?: (todoId: string) => void
): Tool {
  return {
    id: 'work_todos_delete',
    name: 'Delete Todo',
    description: 'Delete a todo by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      try {
        const { id } = params as unknown as DeleteTodoParams
        if (!id) return { success: false, error: 'Todo id is required' }
        const deleted = await repository.deleteTodo(id)
        if (!deleted) return { success: false, error: 'Todo not found' }
        onDelete?.(id)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
