/**
 * Internal control protocol types for bridge communication.
 * These types define the JSON-serializable wire format between the
 * runner process and the bridge orchestrator.
 */

// ---------------------------------------------------------------------------
// SDKControlRequest — requests sent from runner → bridge
// ---------------------------------------------------------------------------

export type SDKControlRequest = {
  type: 'control_request'
  request_id: string
  request: SDKControlRequestData
}

export type SDKControlRequestData =
  | SDKControlRequestSessionStatus
  | SDKControlRequestModelUsage
  | SDKControlRequestPermissionDenial
  | SDKControlRequestCheckpointRequest
  | SDKControlRequestCheckpointsRequest
  | SDKControlRequestCheckpointSave
  | SDKControlRequestCheckpointLoad
  | SDKControlRequestCheckpointDelete
  | SDKControlRequestCheckpointList
  | SDKControlRequestSystemQuery

export type SDKControlRequestSystemQuery = {
  readonly kind: 'system_query'
  readonly query: string
  readonly model?: string
  readonly mode?: string
  readonly max_thinking_tokens?: number
  readonly response?: unknown
  readonly [key: string]: unknown
}

// ---------------------------------------------------------------------------
// SDKControlResponse — responses from bridge → runner
// ---------------------------------------------------------------------------

export type SDKControlResponse =
  | SDKControlResponsePermissive
  | SDKControlResponseCheckpointAck
  | SDKControlResponseCheckpointError
  | SDKControlResponseCheckpointList
  | SDKControlResponseLoadAck
  | SDKControlResponseSystemResult

export type SDKControlResponseSystemResult = {
  readonly kind: 'system_result'
  readonly response?: unknown
}

// ---------------------------------------------------------------------------
// Request variants
// ---------------------------------------------------------------------------

export type SDKControlRequestSessionStatus = {
  readonly kind: 'session_status'
  readonly sessionId: string
  readonly title: string
  readonly tags: string[]
}

export type SDKControlRequestModelUsage = {
  readonly kind: 'model_usage'
  readonly modelUsage: Record<string, {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens: number
    cacheCreationInputTokens: number
    ttl1DayCacheTokens: number
    ttl5MinuteCacheTokens: number
  }>
  readonly permissionDenials: SDKPermissionDenial[]
  readonly structuredOutput?: unknown
}

export type SDKControlRequestPermissionDenial = {
  readonly kind: 'permission_denial'
  readonly permission: string
}

export type SDKControlRequestCheckpointRequest = {
  readonly kind: 'checkpoint_request'
  readonly checkpointFile: string
  readonly metadata: Record<string, unknown>
}

export type SDKControlRequestCheckpointsRequest = {
  readonly kind: 'checkpoints_request'
  readonly sessionId: string
}

export type SDKControlRequestCheckpointSave = {
  readonly kind: 'checkpoint_save'
  readonly checkpointFile: string
  readonly metadata: Record<string, unknown>
}

export type SDKControlRequestCheckpointLoad = {
  readonly kind: 'checkpoint_load'
  readonly checkpointFile: string
}

export type SDKControlRequestCheckpointDelete = {
  readonly kind: 'checkpoint_delete'
  readonly checkpointFile: string
}

export type SDKControlRequestCheckpointList = {
  readonly kind: 'checkpoint_list'
}

// ---------------------------------------------------------------------------
// Response variants
// ---------------------------------------------------------------------------

export type SDKControlResponsePermissive = {
  readonly kind: 'permissive'
}

export type SDKControlResponseCheckpointAck = {
  readonly kind: 'checkpoint_ack'
  readonly checkpointFile: string
}

export type SDKControlResponseCheckpointError = {
  readonly kind: 'checkpoint_error'
  readonly error: string
}

export type SDKControlResponseCheckpointList = {
  readonly kind: 'checkpoint_list'
  readonly checkpoints: readonly {
    file: string
    sessionId: string
    metadata: Record<string, unknown>
  }[]
}

export type SDKControlResponseLoadAck = {
  readonly kind: 'load_ack'
  readonly title: string
  readonly tags: string[]
}

// ---------------------------------------------------------------------------
// SDKPermissionDenial
// ---------------------------------------------------------------------------

export type SDKPermissionDenial = {
  readonly permission: string
  readonly message: string
  readonly metadata: Record<string, unknown>
}
