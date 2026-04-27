// In its own file to avoid circular dependencies
export const FILE_EDIT_TOOL_NAME = 'Edit'

// Permission pattern for granting session-level access to the project's .aiko/ folder
export const aiko_FOLDER_PERMISSION_PATTERN = '/.aiko/**'

// Permission pattern for granting session-level access to the global ~/.aiko/ folder
export const GLOBAL_aiko_FOLDER_PERMISSION_PATTERN = '~/.aiko/**'

export const FILE_UNEXPECTEDLY_MODIFIED_ERROR =
  'File has been unexpectedly modified. Read it again before attempting to write it.'
