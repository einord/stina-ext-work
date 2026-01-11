import type { Tool, ToolResult } from '@stina/extension-api/runtime'
import type { WorkRepository } from '../db/repository.js'
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

export function createListProjectsTool(repository: WorkRepository): Tool {
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
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      try {
        const { query, limit, offset } = params as ListProjectsParams
        const projects = await repository.listProjects({ query, limit, offset })
        return { success: true, data: { count: projects.length, projects } }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

export function createGetProjectTool(repository: WorkRepository): Tool {
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
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      try {
        const { id } = params as unknown as GetProjectParams
        if (!id) return { success: false, error: 'Project id is required' }
        const project = await repository.getProject(id)
        if (!project) return { success: false, error: 'Project not found' }
        return { success: true, data: project }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

export function createUpsertProjectTool(
  repository: WorkRepository,
  onChange?: () => void
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
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      try {
        const { id, name, description } = params as UpsertProjectParams
        const project = await repository.upsertProject(id, { name, description })
        onChange?.()
        return { success: true, data: project }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

export function createDeleteProjectTool(
  repository: WorkRepository,
  onChange?: () => void
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
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      try {
        const { id } = params as unknown as DeleteProjectParams
        if (!id) return { success: false, error: 'Project id is required' }
        const deleted = await repository.deleteProject(id)
        if (!deleted) return { success: false, error: 'Project not found' }
        onChange?.()
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
