// Core message types for the agent framework
// Stubbed to match the original message.ts that was accidentally deleted

import type { ContentBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages.js'
import type { PermissionResult, PermissionContext, PermissionMode } from './permissions.js'

// Common metadata fields added to ALL message variants
type MessageCommon = {
  isVirtual?: boolean
  isMeta?: boolean
  toolUseResult?: boolean
  isCompactSummary?: boolean
}

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

export type TextContentBlock = ContentBlock & { type: 'text'; text: string }
export type ThinkingContentBlock = ContentBlock & { type: 'thinking'; thinking: string }
export type ImageContentBlock = ContentBlock & { type: 'image' }
export type ToolUseContentBlock = ContentBlock & { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
export type ToolResultContentBlock = ContentBlock & { type: 'tool_result'; tool_use_id: string; content: string }
export type ContentBlockParam = TextContentBlock | ThinkingContentBlock | ImageContentBlock | ToolUseContentBlock | ToolResultContentBlock

// ---------------------------------------------------------------------------
// Message origin
// ---------------------------------------------------------------------------

export type MessageOrigin = {
  type: string
  hookEvent?: string
  channel?: string
  kind?: string
  source?: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Attachment
// ---------------------------------------------------------------------------

export type HookAttachment = { type: string; data: string; filename?: string; mimeType?: string }
export type AttachmentMessage = { type: 'attachment'; attachment: HookAttachment; message?: string; timestamp: string } & MessageCommon

// ---------------------------------------------------------------------------
// Serialized message
// ---------------------------------------------------------------------------

export type SerializedMessage = Message & {
  type: string
  message: string | Record<string, unknown>
  timestamp: string
  session_id: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
  subtype?: string
  error_code?: string
  level?: string
  data?: Record<string, unknown>
  hook_result?: Record<string, unknown>
  attachment?: HookAttachment
}

// ---------------------------------------------------------------------------
// Core Message union
// ---------------------------------------------------------------------------

export type Message =
  | AssistantMessage
  | UserMessage
  | SystemMessage
  | ThinkingMessage
  | ErrorMessage
  | ProgressMessage
  | HookResultMessage

export type MessageMessageType = Message
export type MessageAsJSON = string | Message

// ---------------------------------------------------------------------------
// Assistant / User / System
// ---------------------------------------------------------------------------

export type AssistantMessage = {
  type: 'assistant'
  message: string | { content: string | ContentBlock[] | ContentBlockParam[] }
  error?: string
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
  subtype?: string
} & MessageCommon

export type UserMessage = {
  type: 'user'
  message: string | { content: string | ContentBlock[] | ContentBlockParam[] }
  data?: Record<string, unknown>
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
  subtype?: string
} & MessageCommon

export type SystemMessage = {
  type: 'system'
  message: string
  level?: string
  data?: Record<string, unknown>
  timestamp: string
  session_id: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
  subtype?: string
} & MessageCommon

export type ThinkingMessage = {
  type: 'thinking'
  message: string
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type ErrorMessage = {
  type: 'error'
  message: string
  error_code: string
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
  data?: Record<string, unknown>
} & MessageCommon

export type ProgressMessage = {
  type: 'progress'
  message: string
  progress?: number
  total?: number
  stage?: string
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type HookResultMessage = {
  type: 'hook'
  message: string
  data?: Record<string, unknown>
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
  subtype?: string
} & MessageCommon

// ---------------------------------------------------------------------------
// Normalized message types
// ---------------------------------------------------------------------------

export type NormalizedMessage = Message & {
  type: string
  message: string
  timestamp: string
  session_id?: string
  uuid?: string
  origin?: MessageOrigin
  subtype?: string
}

export type NormalizedUserMessage = UserMessage & {
  type: 'user'
  message: string
}

export type NormalizedAssistantMessage = AssistantMessage & {
  type: 'assistant'
  message: string
}

// ---------------------------------------------------------------------------
// Partial compact direction
// ---------------------------------------------------------------------------

export type PartialCompactDirection = 'forward' | 'backward' | 'both'

// ---------------------------------------------------------------------------
// Tool use / result messages
// ---------------------------------------------------------------------------

export type ToolUseRequestMessage = {
  type: 'tool_use'
  message: string
  data: { toolUseId: string; toolName: string; input: Record<string, unknown> }
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type ToolUseResultMessage = {
  type: 'tool_result'
  message: string
  data: { toolUseId: string; content: string; isError?: boolean }
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

// ---------------------------------------------------------------------------
// Renderable message
// ---------------------------------------------------------------------------

export type RenderableMessage = {
  type: string
  message: string
  metadata?: {
    timestamp?: string
    session_id?: string
    uuid?: string
    level?: string
    subtype?: string
    origin?: MessageOrigin
    data?: Record<string, unknown>
    progress?: number
    total?: number
    stage?: string
  }
}

// ---------------------------------------------------------------------------
// Permission / prompt / session control messages
// ---------------------------------------------------------------------------

export type PermissionRequestMessage = {
  type: 'permission_request'
  message: string
  data?: Record<string, unknown>
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type PermissionUpdateMessage = {
  type: 'permission_update'
  message: string
  data?: Record<string, unknown>
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type PromptRequestMessage = {
  type: 'prompt_request'
  message: string
  data?: Record<string, unknown>
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type PromptResponseMessage = {
  type: 'prompt_response'
  message: string
  data?: Record<string, unknown>
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type SessionStartMessage = {
  type: 'session_start'
  message: string
  data?: Record<string, unknown>
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type SessionEndMessage = {
  type: 'session_end'
  message: string
  data?: Record<string, unknown>
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type CompactStartMessage = {
  type: 'compact_start'
  message: string
  data?: Record<string, unknown>
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type CompactEndMessage = {
  type: 'compact_end'
  message: string
  data?: Record<string, unknown>
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type TelemetryMessage = {
  type: 'telemetry'
  message: string
  data?: Record<string, unknown>
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type StatusMessage = {
  type: 'status'
  message: string
  data?: Record<string, unknown>
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type HeartbeatMessage = {
  type: 'heartbeat'
  message: string
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type NotificationMessage = {
  type: 'notification'
  message: string
  data?: Record<string, unknown>
  timestamp: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type LocalCommandMessage = {
  type: 'system'
  message: string
  subtype: 'local_command'
  data?: Record<string, unknown>
  timestamp: string
  session_id: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type SystemRequestInterruptedMessage = {
  type: 'system'
  message: string
  subtype: 'request_interrupted'
  data?: Record<string, unknown>
  timestamp: string
  session_id: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

export type SystemRequestCancelledMessage = {
  type: 'system'
  message: string
  subtype: 'request_cancelled'
  data?: Record<string, unknown>
  timestamp: string
  session_id: string
  uuid?: string
  parent_tool_use_id?: string
  origin?: MessageOrigin
} & MessageCommon

// ---------------------------------------------------------------------------
// Additional types
// ---------------------------------------------------------------------------

export type AdditionalWorkingDirectory = { type: 'additional_working_directory'; path: string }
export type AdditionalContentBlock = { type: string; data: Record<string, unknown> }
export type ToolProgressData = { current: number; total: number; status: string; stage?: string }
export type ToolUse = { id: string; name: string; input: Record<string, unknown> }
export type ToolResult = { tool_use_id: string; content: string; is_error?: boolean }
