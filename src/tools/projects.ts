/**
 * Project tools for Work Manager extension.
 */

import type { Tool, ToolResult, ExecutionContext } from '@stina/extension-api/runtime'
import { WorkRepository } from '../storage/index.js'
import type { WorkProjectInput } from '../types.js'

interface ListProjectsParams {
  query?: string
  limit?: number
  offset?: number
}

interface GetProjectParams {
  id: string
}

interface UpsertProjectParams extends WorkProjectInput {
  id?: string
}

interface DeleteProjectParams {
  id: string
}

/**
 * Creates a tool for listing projects.
 * @param onChange - Optional callback when data changes
 * @returns The list projects tool
 */
export function createListProjectsTool(): Tool {
  return {
    id: 'work_projects_list',
    name: 'List Projects',
    description: 'List work projects with optional filtering.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
    async execute(params: Record<string, unknown>, execContext: ExecutionContext): Promise<ToolResult> {
      try {
        if (!execContext.userId) {
          return { success: false, error: 'User context required' }
        }
        const repo = new WorkRepository(execContext.userStorage)
        const { query, limit, offset } = params as ListProjectsParams
        const projects = await repo.listProjects({ query, limit, offset })
        return { success: true, data: { count: projects.length, projects } }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

/**
 * Creates a tool for getting a project by ID.
 * @returns The get project tool
 */
export function createGetProjectTool(): Tool {
  return {
    id: 'work_projects_get',
    name: 'Get Project',
    description: 'Get a project by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
    async execute(params: Record<string, unknown>, execContext: ExecutionContext): Promise<ToolResult> {
      try {
        if (!execContext.userId) {
          return { success: false, error: 'User context required' }
        }
        const repo = new WorkRepository(execContext.userStorage)
        const { id } = params as unknown as GetProjectParams
        if (!id) return { success: false, error: 'Project id is required' }
        const project = await repo.getProject(id)
        if (!project) return { success: false, error: 'Project not found' }
        return { success: true, data: project }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

/**
 * Creates a tool for creating/updating projects.
 * @param onChange - Optional callback when data changes
 * @returns The upsert project tool
 */
export function createUpsertProjectTool(
  onChange?: (userId: string) => void
): Tool {
  return {
    id: 'work_projects_upsert',
    name: 'Add/Update Project',
    description: 'Create or update a project.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
      },
    },
    async execute(params: Record<string, unknown>, execContext: ExecutionContext): Promise<ToolResult> {
      try {
        if (!execContext.userId) {
          return { success: false, error: 'User context required' }
        }
        const repo = new WorkRepository(execContext.userStorage)
        const { id, name, description } = params as UpsertProjectParams
        const project = await repo.upsertProject(id, { name, description })
        onChange?.(execContext.userId)
        return { success: true, data: project }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

/**
 * Creates a tool for deleting projects.
 * @param onChange - Optional callback when data changes
 * @returns The delete project tool
 */
export function createDeleteProjectTool(
  onChange?: (userId: string) => void
): Tool {
  return {
    id: 'work_projects_delete',
    name: 'Delete Project',
    description: 'Delete a project by ID (todos are kept but unassigned).',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
    async execute(params: Record<string, unknown>, execContext: ExecutionContext): Promise<ToolResult> {
      try {
        if (!execContext.userId) {
          return { success: false, error: 'User context required' }
        }
        const repo = new WorkRepository(execContext.userStorage)
        const { id } = params as unknown as DeleteProjectParams
        if (!id) return { success: false, error: 'Project id is required' }
        const deleted = await repo.deleteProject(id)
        if (!deleted) return { success: false, error: 'Project not found' }
        onChange?.(execContext.userId)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
