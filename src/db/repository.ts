import type {
  ListProjectsOptions,
  ListTodosOptions,
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
import { TodosRepository } from './todosRepository.js'
import { WorkDb, type DatabaseAPI } from './workDb.js'

export class WorkRepository {
  private readonly db: WorkDb
  private readonly projects: ProjectsRepository
  private readonly comments: CommentsRepository
  private readonly subItems: SubItemsRepository
  private readonly todos: TodosRepository
  private readonly settings: SettingsRepository
  private readonly panel: PanelRepository

  constructor(db: DatabaseAPI) {
    this.db = new WorkDb(db)
    this.projects = new ProjectsRepository(this.db)
    this.comments = new CommentsRepository(this.db)
    this.subItems = new SubItemsRepository(this.db)
    this.todos = new TodosRepository(this.db, this.comments, this.subItems)
    this.settings = new SettingsRepository(this.db)
    this.panel = new PanelRepository(this.db)
  }

  async initialize(): Promise<void> {
    await this.db.initialize()
  }

  async listProjects(options: ListProjectsOptions = {}): Promise<WorkProject[]> {
    return this.projects.list(options)
  }

  async getProject(id: string): Promise<WorkProject | null> {
    return this.projects.get(id)
  }

  async upsertProject(id: string | undefined, input: WorkProjectInput): Promise<WorkProject> {
    return this.projects.upsert(id, input)
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id)
  }

  async listTodos(options: ListTodosOptions = {}): Promise<WorkTodo[]> {
    return this.todos.list(options)
  }

  async getTodo(id: string): Promise<WorkTodo | null> {
    return this.todos.get(id)
  }

  async upsertTodo(id: string | undefined, input: WorkTodoInput): Promise<WorkTodo> {
    return this.todos.upsert(id, input)
  }

  async deleteTodo(id: string): Promise<boolean> {
    return this.todos.delete(id)
  }

  async hasTodo(id: string): Promise<boolean> {
    return this.todos.has(id)
  }

  async addSubItem(input: WorkSubItemInput): Promise<WorkSubItem> {
    return this.subItems.add(input)
  }

  async deleteSubItem(todoId: string, subItemId: string): Promise<boolean> {
    return this.subItems.delete(todoId, subItemId)
  }

  async listSubItems(todoId: string): Promise<WorkSubItem[]> {
    return this.subItems.list(todoId)
  }

  async toggleSubItem(todoId: string, subItemId: string): Promise<boolean> {
    return this.subItems.toggle(todoId, subItemId)
  }

  async addComment(input: WorkCommentInput): Promise<WorkComment> {
    return this.comments.add(input)
  }

  async deleteComment(todoId: string, commentId: string): Promise<boolean> {
    return this.comments.delete(todoId, commentId)
  }

  async listComments(todoId: string): Promise<WorkComment[]> {
    return this.comments.list(todoId)
  }

  async getSettings(): Promise<WorkSettings> {
    return this.settings.get()
  }

  async updateSettings(update: WorkSettingsUpdate): Promise<WorkSettings> {
    return this.settings.update(update)
  }

  async listPanelGroups(): Promise<WorkPanelGroup[]> {
    return this.panel.listGroups()
  }

  async setGroupCollapsed(groupId: string, collapsed: boolean): Promise<boolean> {
    return this.panel.setGroupCollapsed(groupId, collapsed)
  }
}
