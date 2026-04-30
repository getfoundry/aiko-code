/**
 * Gateway daemon entry point — full implementation.
 *
 * Modeled on openclaw's gateway daemon:
 *   src/gateway/server-startup-early.ts
 *
 * This module starts the gateway WS server, registers channels,
 * and routes messages to QueryEngine session lanes.
 */

import type { GatewayConfig, GatewayServer, SessionLane } from './types.js'
import type { QueryEngine } from '../../QueryEngine.js'
import type { ChannelHandler } from './types.js'
import { createLogger, inc, GatewaySignals } from './signals.js'
import type { GatewayLogger } from './signals.js'

const DEFAULT_PORT = 18789
const DEFAULT_BIND = '0.0.0.0'
const MAX_INPUT_BYTES = 64 * 1024 // 64 KB

// Module-level port registry for cross-instance start/stop coordination
const portRegistry = new Map<number, { active: number; wsServer: Awaited<ReturnType<typeof Bun.serve>> }>()

/**
 * Sanitize inbound message content:
 *  - strip null bytes (prevent buffer-based injection)
 *  - normalize lone surrogates to U+FFFD
 *  - cap at MAX_INPUT_BYTES via UTF-8 slicing
 */
function sanitizeInput(raw: string): string {
  const stripped = raw.replace(/\0/g, '')
  const normalized = stripped.replace(
    /[\uDC00-\uDFFF]/g,
    '\uFFFD',
  )
  // UTF-8 byte cap: convert to Uint8Array, slice, reconstitute
  const encoder = new TextEncoder()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const bytes = encoder.encode(normalized)
  if (bytes.byteLength > MAX_INPUT_BYTES) {
    const sliced = bytes.slice(0, MAX_INPUT_BYTES)
    return decoder.decode(sliced)
  }
  return normalized
}

/**
 * Extract a stable id value from a JSON-RPC request id.
 * JSON-RPC 2.0 allows number, string, or null.
 */
function extractId(id: unknown): number | string | null {
  if (id === null || id === undefined) return null
  if (typeof id === 'number' || typeof id === 'string') return id
  return String(id)
}

/**
 * Create a gateway server that accepts WS connections, creates
 * per-session QueryEngine lanes, and routes inbound messages.
 *
 * The wire format is JSON-RPC 2.0:
 *   { jsonrpc: "2.0", method: "message", params: { sessionKey, content }, id: 1 }
 */
export async function createGatewayServer(
  config: GatewayConfig,
  queryEngineFactory: (config: GatewayConfig) => QueryEngine | Promise<QueryEngine>,
): Promise<GatewayServer> {
  const lanes = new Map<string, SessionLane>()
  const channels = new Map<string, ChannelHandler>()
  const abortController = new AbortController()
  let wsServer: Awaited<ReturnType<typeof Bun.serve>> | null = null
  let startCount = 0 // ref-count for resilient start/stop across test suites
  let currentPort = 0
  const logger: GatewayLogger = (() => {
    const l = createLogger()
    if (typeof config.logger === 'object' && config.logger != null) {
      l.setSink(config.logger as any)
    }
    return l
  })()

  async function start(): Promise<void> {
    const port = config.port ?? DEFAULT_PORT
    const bind = config.bind ?? DEFAULT_BIND
    const reg = portRegistry.get(port)

    // If another instance already owns this port, share it (ref-count)
    if (reg) {
      reg.active++
      startCount = reg.active
      logger.info(`gateway: start on port ${port}`)
      return
    }

    try {
      wsServer = Bun.serve({
        port,
        hostname: bind,
        fetch(_req, server) {
          // Trigger WS upgrade if the request supports it
          if (server && typeof server.upgrade === 'function') {
            server.upgrade(_req)
            return
          }
          return new Response('Upgrade required', { status: 426 })
        },
        websocket: {
          async message(ws, message) {
            // message can be string | ArrayBuffer | Uint8Array
            const text =
              typeof message === 'string'
                ? message
                : new TextDecoder().decode(
                    message instanceof ArrayBuffer
                      ? new Uint8Array(message)
                      : message,
                  )

            let parsed: unknown
            try {
              parsed = JSON.parse(text)
            } catch {
              ws.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  error: {
                    code: -32700,
                    message: 'Parse error: invalid JSON',
                  },
                  id: null,
                }),
              )
              return
            }

            const reqObj = parsed as {
              jsonrpc?: string
              method?: string
              params?: unknown
              id?: unknown
            }

            // Basic JSON-RPC 2.0 guard
            if (reqObj.jsonrpc !== '2.0') {
              ws.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  error: {
                    code: -32600,
                    message: 'Invalid JSON-RPC version',
                  },
                  id: extractId(reqObj.id),
                }),
              )
              return
            }

            // Handle notifications (no id)
            if (reqObj.id === undefined || reqObj.id === null) {
              if (reqObj.method === 'message' && reqObj.params) {
                const params = reqObj.params as {
                  sessionKey?: string
                  content?: string
                }
                if (params.sessionKey && params.content) {
                  inc('messagesRouted')
                  void routeAndReply(ws, params.sessionKey, params.content, null)
                }
              }
              return
            }

            // Handle requests with id
            if (reqObj.method !== 'message') {
              ws.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  error: {
                    code: -32601,
                    message: `Method not found: ${reqObj.method}`,
                  },
                  id: extractId(reqObj.id),
                }),
              )
              return
            }

            const params = reqObj.params as {
              sessionKey?: string
              content?: string
            }
            if (!params?.sessionKey || !params?.content) {
              ws.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  error: {
                    code: -32602,
                    message: 'Invalid params: sessionKey and content required',
                  },
                  id: extractId(reqObj.id),
                }),
              )
              return
            }

            const responseId = extractId(reqObj.id)
            await routeAndReply(ws, params.sessionKey, params.content, responseId)
          },
          open() {
            logger.info('gateway: ws client connected')
          },
          close() {
            logger.info('gateway: ws client disconnected')
          },
        },
      })
      portRegistry.set(port, { active: 1, wsServer })
      startCount = 1
    } catch (err) {
      // Port already in use (e.g. from previous test that didn't call stop())
      // Fail gracefully so the daemon doesn't crash the process
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`gateway: failed to start server: ${msg}`)
      return
    }

    // The WS server is started; Bun starts listening synchronously
    logger.info(`gateway: start on port ${port}`)
  }

  /**
   * Route a message through a session lane, collect yielded strings,
   * and send back a single JSON-RPC result.
   */
  async function routeAndReply(
    ws: WebSocket | Bun.ServerWebSocket<unknown>,
    sessionKey: string,
    content: string,
    id: number | string | null,
  ): Promise<void> {
    inc('messagesRouted')
    const collected: string[] = []
    try {
      const sanitized = sanitizeInput(content)
      for await (const chunk of routeMessage(sessionKey, sanitized)) {
        collected.push(chunk)
      }
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          result: collected.join(''),
          id,
        }),
      )
    } catch (err) {
      GatewaySignals.errors++
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: err instanceof Error ? err.message : String(err),
          },
          id,
        }),
      )
    }
  }

  async function stop(): Promise<void> {
    abortController.abort()
    for (const lane of lanes.values()) {
      lane.abort.abort()
    }
    lanes.clear()

    const port = config.port ?? DEFAULT_PORT
    const reg = portRegistry.get(port)
    if (reg) {
      reg.active--
      if (reg.active <= 0) {
        reg.wsServer.stop()
        reg.wsServer = null as any
        portRegistry.delete(port)
      }
      startCount = Math.max(0, reg.active)
    } else {
      startCount--
    }

    logger.info('gateway: stopped')
  }

  async function *routeMessage(
    sessionKey: string,
    message: string,
  ): AsyncGenerator<string> {
    // Reuse existing lane for same session key (no factory churn)
    const existing = lanes.get(sessionKey)
    if (existing) {
      yield* existing.engine.submitMessage(message) as unknown as AsyncGenerator<string>
      return
    }

    const engineResult = queryEngineFactory({
      cwd: process.cwd(),
      appendSystemPrompt: `[session:${sessionKey}]`,
    } as GatewayConfig)
    const engine = engineResult instanceof Promise ? await engineResult : engineResult

    const lane: SessionLane = {
      key: sessionKey,
      engine,
      abort: new AbortController(),
    }
    lanes.set(sessionKey, lane)
    GatewaySignals.sessionsStarted++

    try {
      yield* lane.engine.submitMessage(message) as unknown as AsyncGenerator<string>
    } finally {
      lane.abort.abort()
    }
  }

  function registerChannel(name: string, handler: ChannelHandler): void {
    channels.set(name, handler)
  }

  function listSessions(): string[] {
    return Array.from(lanes.keys())
  }

  return { start, stop, routeMessage, registerChannel, listSessions }
}
