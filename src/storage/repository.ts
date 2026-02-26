/**
 * Main Work Repository using Storage API.
 * This is the primary interface for data access in the Work Manager extension.
 */

import type { StorageAPI } from '@stina/extension-api/runtime'
import type {
  ListProjectsOptions,
  ListRecurringTemplatesOptions,
  ListTodosOptions,
  RecurringTemplate,
  RecurringTemplateInput,
  WorkComment,
  WorkCommentInput,
  WorkPanelGroup,
  WorkProject,
  WorkProjectInput,
  WorkSettings,
  WorkSettingsUpdate,
  WorkSubItem,
  WorkSubItemInput,
  WorkTodo,
  WorkTodoInput,
} from '../types.js'
import { CommentsRepository } from './commentsRepository.js'
import { PanelRepository } from './panelRepository.js'
import { ProjectsRepository } from './projectsRepository.js'
import { SettingsRepository } from './settingsRepository.js'
import { SubItemsRepository } from './subItemsRepository.js'
import { RecurringTemplatesRepository } from './recurringTemplatesRepository.js'
import { TodosRepository } from './todosRepository.js'

/**
 * Main repository for the Work Manager extension.
 * Provides a unified interface for all data operations using the Storage API.
 */
export class WorkRepository {
  private readonly storage: StorageAPI
  private readonly projects: ProjectsRepository
  private readonly comments: CommentsRepository
  private readonly subItems: SubItemsRepository
  private readonly todos: TodosRepository
  private readonly settings: SettingsRepository
  private readonly panel: PanelRepository
  private readonly recurringTemplates: RecurringTemplatesRepository

  /**
   * Creates a WorkRepository instance.
   * @param storage - The Storage API instance (should be user-scoped for user data)
   */
  constructor(storage: StorageAPI) {
    this.storage = storage
    this.projects = new ProjectsRepository(storage)
    this.comments = new CommentsRepository(storage)
    this.subItems = new SubItemsRepository(storage)
    this.todos = new TodosRepository(storage, this.comments, this.subItems, this.projects)
    this.settings = new SettingsRepository(storage)
    this.panel = new PanelRepository(storage)
    this.recurringTemplates = new RecurringTemplatesRepository(storage)
  }

  // Project operations

  /**
   * Lists projects with optional filtering.
   * @param options - Filter and pagination options
   * @returns Array of projects
   */
  async listProjects(options: ListProjectsOptions = {}): Promise<WorkProject[]> {
    return this.projects.list(options)
  }

  /**
   * Gets a project by ID.
   * @param id - The project ID
   * @returns The project or null if not found
   */
  async getProject(id: string): Promise<WorkProject | null> {
    return this.projects.get(id)
  }

  /**
   * Creates or updates a project.
   * @param id - Optional project ID
   * @param input - Project data
   * @returns The created/updated project
   */
  async upsertProject(id: string | undefined, input: WorkProjectInput): Promise<WorkProject> {
    return this.projects.upsert(id, input)
  }

  /**
   * Deletes a project and removes references from todos.
   * @param id - The project ID
   * @returns true if deleted
   */
  async deleteProject(id: string): Promise<boolean> {
    const deleted = await this.projects.delete(id)
    if (deleted) {
      await this.todos.removeProjectReference(id)
    }
    return deleted
  }

  // Todo operations

  /**
   * Lists todos with optional filtering.
   * @param options - Filter and pagination options
   * @returns Array of todos
   */
  async listTodos(options: ListTodosOptions = {}): Promise<WorkTodo[]> {
    return this.todos.list(options)
  }

  /**
   * Gets a todo by ID with comments and sub-items.
   * @param id - The todo ID
   * @returns The todo or null if not found
   */
  async getTodo(id: string): Promise<WorkTodo | null> {
    return this.todos.get(id)
  }

  /**
   * Creates or updates a todo.
   * @param id - Optional todo ID
   * @param input - Todo data
   * @returns The created/updated todo
   */
  async upsertTodo(id: string | undefined, input: WorkTodoInput): Promise<WorkTodo> {
    return this.todos.upsert(id, input)
  }

  /**
   * Deletes a todo and its related data.
   * @param id - The todo ID
   * @returns true if deleted
   */
  async deleteTodo(id: string): Promise<boolean> {
    return this.todos.delete(id)
  }

  /**
   * Checks if a todo exists.
   * @param id - The todo ID
   * @returns true if exists
   */
  async hasTodo(id: string): Promise<boolean> {
    return this.todos.has(id)
  }

  // SubItem operations

  /**
   * Adds a sub-item to a todo.
   * @param input - SubItem data
   * @returns The created sub-item
   */
  async addSubItem(input: WorkSubItemInput): Promise<WorkSubItem> {
    return this.subItems.add(input)
  }

  /**
   * Deletes a sub-item.
   * @param todoId - The parent todo ID
   * @param subItemId - The sub-item ID
   * @returns true if deleted
   */
  async deleteSubItem(todoId: string, subItemId: string): Promise<boolean> {
    return this.subItems.delete(todoId, subItemId)
  }

  /**
   * Lists sub-items for a todo.
   * @param todoId - The todo ID
   * @returns Array of sub-items
   */
  async listSubItems(todoId: string): Promise<WorkSubItem[]> {
    return this.subItems.list(todoId)
  }

  /**
   * Toggles completion status of a sub-item.
   * @param todoId - The parent todo ID
   * @param subItemId - The sub-item ID
   * @returns true if toggled
   */
  async toggleSubItem(todoId: string, subItemId: string): Promise<boolean> {
    return this.subItems.toggle(todoId, subItemId)
  }

  // Comment operations

  /**
   * Adds a comment to a todo.
   * @param input - Comment data
   * @returns The created comment
   */
  async addComment(input: WorkCommentInput): Promise<WorkComment> {
    return this.comments.add(input)
  }

  /**
   * Deletes a comment.
   * @param todoId - The parent todo ID
   * @param commentId - The comment ID
   * @returns true if deleted
   */
  async deleteComment(todoId: string, commentId: string): Promise<boolean> {
    return this.comments.delete(todoId, commentId)
  }

  /**
   * Lists comments for a todo.
   * @param todoId - The todo ID
   * @returns Array of comments
   */
  async listComments(todoId: string): Promise<WorkComment[]> {
    return this.comments.list(todoId)
  }

  // Settings operations

  /**
   * Gets user settings.
   * @returns The user's settings
   */
  async getSettings(): Promise<WorkSettings> {
    return this.settings.get()
  }

  /**
   * Updates user settings.
   * @param update - Settings to update
   * @returns The updated settings
   */
  async updateSettings(update: WorkSettingsUpdate): Promise<WorkSettings> {
    return this.settings.update(update)
  }

  // Panel operations

  /**
   * Lists groups for panel display.
   * @returns Array of panel groups
   */
  async listPanelGroups(): Promise<WorkPanelGroup[]> {
    return this.panel.listGroups()
  }

  /**
   * Sets group collapsed state.
   * @param groupId - The group ID
   * @param collapsed - Whether collapsed
   * @returns true if successful
   */
  async setGroupCollapsed(groupId: string, collapsed: boolean): Promise<boolean> {
    return this.panel.setGroupCollapsed(groupId, collapsed)
  }

  // Recurring template operations

  /**
   * @summary Lists recurring templates with optional filtering by enabled status.
   * @param options - Filtering options
   * @returns Array of recurring templates
   */
  async listRecurringTemplates(options?: ListRecurringTemplatesOptions): Promise<RecurringTemplate[]> {
    return this.recurringTemplates.list(options)
  }

  /**
   * @summary Gets a recurring template by its ID.
   * @param id - The template ID
   * @returns The recurring template or null if not found
   */
  async getRecurringTemplate(id: string): Promise<RecurringTemplate | null> {
    return this.recurringTemplates.get(id)
  }

  /**
   * @summary Creates or updates a recurring template.
   * When creating, title, icon, and frequency are required.
   * @param id - Optional template ID
   * @param input - Template data
   * @returns The created/updated recurring template
   */
  async upsertRecurringTemplate(id: string | undefined, input: RecurringTemplateInput): Promise<RecurringTemplate> {
    return this.recurringTemplates.upsert(id, input)
  }

  /**
   * @summary Deletes a recurring template by its ID.
   * @param id - The template ID
   * @returns true if deleted
   */
  async deleteRecurringTemplate(id: string): Promise<boolean> {
    return this.recurringTemplates.delete(id)
  }

  /**
   * @summary Updates the lastGeneratedDueAt timestamp for a recurring template.
   * Used after generating a todo from the template.
   * @param id - The template ID
   * @param lastGeneratedDueAt - ISO timestamp of the last generated occurrence
   */
  async updateRecurringTemplateLastGenerated(id: string, lastGeneratedDueAt: string): Promise<void> {
    return this.recurringTemplates.updateLastGenerated(id, lastGeneratedDueAt)
  }

  /**
   * @summary Lists active (not_started or in_progress) todos linked to a recurring template.
   * Used for evaluating overlap policies before generating new recurring todos.
   * @param templateId - The recurring template ID
   * @returns Array of active todos linked to the template
   */
  async listActiveTodosByTemplateId(templateId: string): Promise<WorkTodo[]> {
    return this.todos.listByRecurringTemplateId(templateId)
  }
}
