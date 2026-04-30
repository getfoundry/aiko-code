/**
 * Types for the gateway daemon layer.
 *
 * The gateway runs as a background process, accepting WebSocket connections
 * and routing them to QueryEngine instances — one per session key.
 */

import type { QueryEngine } from '../../QueryEngine.js'

export interface GatewayConfig {
  /** Port to bind the WS server (default 18789). */
  port?: number
  /** Bind address (default '0.0.0.0' for daemon, '127.0.0.1' for local). */
  bind?: string
  /** Daemon mode: 'local' refuses to start without explicit config. */
  mode?: 'local' | 'remote'
  /** Session storage directory for JSONL transcripts. */
  sessionsDir?: string
  /** Optional logger with info/error. */
  logger?: { info: (msg: string) => void; error: (err: unknown) => void }
}

export interface SessionLane {
  /** Unique session key (e.g. agent:main:telegram:dm:12345). */
  key: string
  /** QueryEngine for this session. */
  engine: QueryEngine
  /** Abort signal for cleanup. */
  abort: AbortController
}

export interface GatewayServer {
  /** Start the WS server. */
  start(): Promise<void>
  /** Stop the server and clean up all session lanes. */
  stop(): Promise<void>
  /** Route an inbound message to the correct session lane. */
  routeMessage(sessionKey: string, message: string): AsyncGenerator<string>
  /** Register a new channel handler. */
  registerChannel(name: string, handler: ChannelHandler): void
  /** List active session keys. */
  listSessions(): string[]
}

export interface ChannelHandler {
  /** Called when the channel sends a message. */
  onMessage(sessionKey: string, content: string): void
  /** Called when the channel stops. */
  onStop?(): void
}
