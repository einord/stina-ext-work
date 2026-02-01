/**
 * Projects repository using Storage API.
 */

import type { StorageAPI } from '@stina/extension-api/runtime'
import type { ListProjectsOptions, WorkProject, WorkProjectInput } from '../types.js'
import type { ProjectDocument } from './types.js'
import { COLLECTIONS } from './constants.js'
import { containsIgnoreCase, generateId } from './utils.js'

/**
 * Repository for managing work projects using the Storage API.
 */
export class ProjectsRepository {
  private readonly storage: StorageAPI

  /**
   * Creates a new ProjectsRepository instance.
   * @param storage - The Storage API instance (should be user-scoped)
   */
  constructor(storage: StorageAPI) {
    this.storage = storage
  }

  /**
   * Lists projects with optional filtering and pagination.
   * @param options - Filtering and pagination options
   * @returns Array of matching projects
   */
  async list(options: ListProjectsOptions = {}): Promise<WorkProject[]> {
    const { query, limit = 50, offset = 0 } = options

    const docs = await this.storage.find<ProjectDocument & { _id: string }>(
      COLLECTIONS.PROJECTS,
      {},
      { sort: { name: 'asc' } }
    )

    let results = docs.map((doc) => this.toWorkProject(doc._id, doc))

    // Apply text search filter if query provided
    if (query) {
      const normalizedQuery = query.trim().toLowerCase()
      results = results.filter(
        (project) =>
          containsIgnoreCase(project.name, normalizedQuery) ||
          containsIgnoreCase(project.description, normalizedQuery)
      )
    }

    // Apply pagination
    return results.slice(offset, offset + limit)
  }

  /**
   * Gets a project by its ID.
   * @param id - The project ID
   * @returns The project if found, null otherwise
   */
  async get(id: string): Promise<WorkProject | null> {
    const doc = await this.storage.get<ProjectDocument>(COLLECTIONS.PROJECTS, id)
    if (!doc) return null
    return this.toWorkProject(id, doc)
  }

  /**
   * Creates or updates a project.
   * @param id - Optional project ID (generated if not provided)
   * @param input - Project data to create/update
   * @returns The created or updated project
   */
  async upsert(id: string | undefined, input: WorkProjectInput): Promise<WorkProject> {
    const now = new Date().toISOString()
    const projectId = id ?? generateId('proj')
    const existing = await this.get(projectId)

    if (existing) {
      const doc: ProjectDocument = {
        name: input.name ?? existing.name,
        description: input.description ?? existing.description ?? undefined,
        createdAt: existing.createdAt,
        updatedAt: now,
      }

      await this.storage.put(COLLECTIONS.PROJECTS, projectId, doc)
      return this.toWorkProject(projectId, doc)
    }

    if (!input.name) {
      throw new Error('Project name is required')
    }

    const doc: ProjectDocument = {
      name: input.name,
      description: input.description ?? undefined,
      createdAt: now,
      updatedAt: now,
    }

    await this.storage.put(COLLECTIONS.PROJECTS, projectId, doc)
    return this.toWorkProject(projectId, doc)
  }

  /**
   * Deletes a project and removes its reference from todos.
   * @param id - The project ID to delete
   * @returns true if project was deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const exists = await this.storage.get(COLLECTIONS.PROJECTS, id)
    if (!exists) return false

    await this.storage.delete(COLLECTIONS.PROJECTS, id)
    return true
  }

  /**
   * Converts a stored document to a WorkProject.
   */
  private toWorkProject(id: string, doc: ProjectDocument): WorkProject {
    return {
      id,
      name: doc.name,
      description: doc.description,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }
  }
}
