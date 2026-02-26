/**
 * Constants for the storage system.
 */

/** Collection names */
export const COLLECTIONS = {
  PROJECTS: 'projects',
  TODOS: 'todos',
  COMMENTS: 'comments',
  SUBITEMS: 'subitems',
  SETTINGS: 'settings',
  GROUP_STATE: 'groupState',
  RECURRING_TEMPLATES: 'recurringTemplates',
} as const

/** Special group ID for todos without a project */
export const NO_PROJECT_GROUP = 'no-project'

/** Default settings ID */
export const SETTINGS_ID = 'default'
