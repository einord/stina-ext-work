export {
  createListProjectsTool,
  createGetProjectTool,
  createUpsertProjectTool,
  createDeleteProjectTool,
} from './projects.js'
export {
  createListTodosTool,
  createGetTodoTool,
  createUpsertTodoTool,
  createDeleteTodoTool,
} from './todos.js'
export { createAddCommentTool, createDeleteCommentTool } from './comments.js'
export { createAddSubItemTool, createDeleteSubItemTool } from './subitems.js'
// Settings tools are deprecated - settings are now managed via actions (getReminderSettings, updateReminderSetting)
// for the component-based tool settings view
