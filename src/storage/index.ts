/**
 * Storage module exports.
 */

export { WorkRepository } from './repository.js'
export { COLLECTIONS, NO_PROJECT_GROUP, SETTINGS_ID } from './constants.js'
export { generateId, normalizeQuery, normalizeOptionalString, deriveDateTime, containsIgnoreCase } from './utils.js'
export type {
  ProjectDocument,
  TodoDocument,
  CommentDocument,
  SubItemDocument,
  SettingsDocument,
  GroupStateDocument,
} from './types.js'
