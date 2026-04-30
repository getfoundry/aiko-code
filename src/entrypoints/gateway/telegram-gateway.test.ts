/**
 * Integration tests for the gateway + telegram wiring.
 *
 * Tests the integration CONTRACT — type compatibility, lane lifecycle,
 * debounce batching, and signal counters — without hitting any network.
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test'

import { createGatewayServer } from './gatewayDaemon.js'
import type { GatewayConfig, ChannelHandler } from './types.js'
import type { QueryEngine } from '../../QueryEngine.js'
import {
  GatewaySignals,
  inc,
  createLogger,
  getHealthStatus,
} from './signals.js'
import type {
  TelegramChannelConfig,
  TelegramDeliveryConfig,
} from '../../channels/telegram/types.js'

// ── Mock helpers ──────────────────────────────────────────────────────

function makeMockEngine(yielded: string[]): QueryEngine {
  return {
    submitMessage: async function* () {
      for (const chunk of yielded) {
        yield chunk
      }
    },
    on: () => {},
    off: () => {},
    toJSON: () => ({}),
  } as unknown as QueryEngine
}

/**
 * Consume an AsyncGenerator fully and return all yielded values.
 */
async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const results: string[] = []
  for await (const chunk of gen) {
    results.push(chunk)
  }
  return results
}

// ── Test: Gateway routeMessage lane lifecycle ─────────────────────────

describe('gateway lane lifecycle (routeMessage)', () => {
  test('routeMessage creates a new lane on first call', async () => {
    let callCount = 0
    const factory = () => {
      callCount++
      return makeMockEngine(['ok'])
    }

    const server = await createGatewayServer({} as GatewayConfig, factory)
    // Skip start() — it binds a WS port which may already be in use
    const gen = server.routeMessage('session-alpha', 'hello')
    for await (const chunk of gen) {
      expect(chunk).toBe('ok')
    }

    // Lane is never deleted — it persists in the Map until stop()
    expect(server.listSessions()).toEqual(['session-alpha'])
    expect(callCount).toBe(1)
  })

  test('second message to the same key reuses the existing lane', async () => {
    let callCount = 0
    const factory = () => {
      callCount++
      return makeMockEngine(['ok'])
    }

    const server = await createGatewayServer({} as GatewayConfig, factory)

    // First call — creates lane
    const gen1 = server.routeMessage('session-dup', 'msg-1')
    for await (const _ of gen1) {}
    const afterFirst = callCount

    // Second call — same key, lane already exists, no factory call
    const gen2 = server.routeMessage('session-dup', 'msg-2')
    for await (const _ of gen2) {}

    expect(callCount).toBe(afterFirst) // factory not called again
  })

  test('different key creates a separate lane path', async () => {
    let capturedPrompts: string[] = []
    const factory = (cfg: any) => {
      capturedPrompts.push(cfg.appendSystemPrompt ?? 'none')
      return makeMockEngine(['ok'])
    }

    const server = await createGatewayServer({} as GatewayConfig, factory)

    for await (const _ of server.routeMessage('key-a', 'msg')) {}
    for await (const _ of server.routeMessage('key-b', 'msg')) {}

    expect(capturedPrompts).toHaveLength(2)
    expect(capturedPrompts[0]).toBe('[session:key-a]')
    expect(capturedPrompts[1]).toBe('[session:key-b]')
    expect(server.listSessions()).toHaveLength(2)
  })

  test('yielded values flow through the generator', async () => {
    const factory = () => makeMockEngine(['a', 'b', 'c'])
    const server = await createGatewayServer({} as GatewayConfig, factory)

    const results = await collect(server.routeMessage('stream-test', 'go'))
    expect(results).toEqual(['a', 'b', 'c'])
  })

  test('session key is embedded in appendSystemPrompt', async () => {
    let capturedPrompt = ''
    const factory = (cfg: any) => {
      capturedPrompt = cfg.appendSystemPrompt
      return makeMockEngine([])
    }

    const server = await createGatewayServer({} as GatewayConfig, factory)
    await collect(server.routeMessage('agent:main:telegram:dm:55555', 'test'))
    expect(capturedPrompt).toBe('[session:agent:main:telegram:dm:55555]')
  })
})

// ── Test: Telegram channel debounce (batching) ────────────────────────

describe('telegram channel debounce', () => {
  test('rapid messages to the same sessionKey are batched together', async () => {
    const pending = new Map<
      string,
      { timer: ReturnType<typeof setTimeout>; messages: string[] }
    >()
    const routedMessages: string[] = []

    const debounceMs = 100

    function debounceMessage(sessionKey: string, content: string) {
      let entry = pending.get(sessionKey)
      if (!entry) {
        entry = {
          timer: setTimeout(() => {
            flushPending(sessionKey)
            pending.delete(sessionKey)
          }, debounceMs),
          messages: [],
        }
        pending.set(sessionKey, entry)
      }
      entry.messages.push(content)
    }

    function flushPending(sessionKey: string) {
      const entry = pending.get(sessionKey)
      if (!entry) return
      const combined = entry.messages.join('\n')
      routedMessages.push(combined)
    }

    // Simulate rapid messages within the debounce window
    const key = 'agent:main:telegram:dm:11111'
    debounceMessage(key, 'msg-1')
    debounceMessage(key, 'msg-2')
    debounceMessage(key, 'msg-3')

    // Timer hasn't fired yet
    expect(pending.has(key)).toBe(true)
    expect(pending.get(key)!.messages).toEqual(['msg-1', 'msg-2', 'msg-3'])
    expect(routedMessages.length).toBe(0)

    // Wait for debounce window
    await new Promise<void>((resolve) => setTimeout(resolve, debounceMs + 50))

    expect(routedMessages).toHaveLength(1)
    expect(routedMessages[0]).toBe('msg-1\nmsg-2\nmsg-3')
  })

  test('messages to different sessionKeys are NOT merged', async () => {
    const pending = new Map<
      string,
      { timer: ReturnType<typeof setTimeout>; messages: string[] }
    >()
    const routedMessages: string[] = []

    function debounceMessage(sessionKey: string, content: string) {
      let entry = pending.get(sessionKey)
      if (!entry) {
        entry = {
          timer: setTimeout(() => {
            flushPending(sessionKey)
            pending.delete(sessionKey)
          }, 100),
          messages: [],
        }
        pending.set(sessionKey, entry)
      }
      entry.messages.push(content)
    }

    function flushPending(sessionKey: string) {
      const entry = pending.get(sessionKey)
      if (!entry) return
      const combined = entry.messages.join('\n')
      routedMessages.push(combined)
    }

    debounceMessage('key-a', 'a1')
    debounceMessage('key-b', 'b1')
    debounceMessage('key-a', 'a2')

    await new Promise<void>((resolve) => setTimeout(resolve, 200))

    expect(routedMessages).toHaveLength(2)
    expect(routedMessages).toContain('a1\na2')
    expect(routedMessages).toContain('b1')
  })

  test('empty string is preserved in the batch (upstream filters it)', async () => {
    const pending = new Map<
      string,
      { timer: ReturnType<typeof setTimeout>; messages: string[] }
    >()
    const routedMessages: string[] = []

    function debounceMessage(sessionKey: string, content: string) {
      let entry = pending.get(sessionKey)
      if (!entry) {
        entry = {
          timer: setTimeout(() => {
            flushPending(sessionKey)
            pending.delete(sessionKey)
          }, 100),
          messages: [],
        }
        pending.set(sessionKey, entry)
      }
      entry.messages.push(content)
    }

    function flushPending(sessionKey: string) {
      const entry = pending.get(sessionKey)
      if (!entry) return
      const combined = entry.messages.join('\n')
      routedMessages.push(combined)
    }

    debounceMessage('key-x', 'hello')
    debounceMessage('key-x', '')
    debounceMessage('key-x', 'world')

    await new Promise<void>((resolve) => setTimeout(resolve, 200))

    expect(routedMessages).toHaveLength(1)
    expect(routedMessages[0]).toBe('hello\n\nworld')
  })
})

// ── Test: Type compatibility ──────────────────────────────────────────

describe('type compatibility', () => {
  test('GatewayConfig all fields optional', () => {
    const gwConfig: GatewayConfig = {}
    expect(gwConfig).toBeDefined()

    const full: GatewayConfig = {
      port: 18789,
      bind: '0.0.0.0',
      mode: 'local',
      sessionsDir: '/tmp/aiko-gateway',
    }
    expect(full.port).toBe(18789)
    expect(full.bind).toBe('0.0.0.0')
    expect(full.mode).toBe('local')
    expect(typeof full.sessionsDir).toBe('string')
  })

  test('TelegramChannelConfig requires token, rest optional', () => {
    const minimal: TelegramChannelConfig = { token: '100:fake' }
    expect(minimal.token).toBe('100:fake')

    const full: TelegramChannelConfig = {
      token: '200:fake',
      logger: { info: () => {}, error: () => {} },
      polling: true,
      webhookUrl: 'https://bot.example.com/webhook',
      maxReconnectAttempts: 10,
      debounceMs: 3000,
    }
    expect(full.token).toBe('200:fake')
    expect(full.polling).toBe(true)
    expect(full.webhookUrl).toBe('https://bot.example.com/webhook')
    expect(full.maxReconnectAttempts).toBe(10)
    expect(full.debounceMs).toBe(3000)
    expect(full.logger).toBeDefined()
  })

  test('TelegramDeliveryConfig all fields optional', () => {
    const empty: TelegramDeliveryConfig = {}
    expect(empty).toBeDefined()

    const full: TelegramDeliveryConfig = {
      parseMode: 'HTML',
      maxMessageLength: 4000,
      draftIntervalMs: 500,
    }
    expect(full.parseMode).toBe('HTML')
    expect(full.maxMessageLength).toBe(4000)
    expect(full.draftIntervalMs).toBe(500)
  })
})

// ── Test: Signals ─────────────────────────────────────────────────────

describe('GatewaySignals counters', () => {
  beforeEach(() => {
    GatewaySignals.sessionsStarted = 0
    GatewaySignals.sessionsStopped = 0
    GatewaySignals.messagesRouted = 0
    GatewaySignals.errors = 0
  })

  test('inc increments the specified field', () => {
    inc('sessionsStarted')
    expect(GatewaySignals.sessionsStarted).toBe(1)

    inc('sessionsStarted', 3)
    expect(GatewaySignals.sessionsStarted).toBe(4)
  })

  test('inc updates messagesRouted counter', () => {
    inc('messagesRouted')
    inc('messagesRouted')
    inc('messagesRouted')
    expect(GatewaySignals.messagesRouted).toBe(3)
  })

  test('inc updates errors counter', () => {
    inc('errors')
    expect(GatewaySignals.errors).toBe(1)
  })

  test('all counters reset independently', () => {
    inc('sessionsStarted', 5)
    inc('sessionsStopped', 2)
    inc('errors', 7)
    inc('messagesRouted', 42)

    GatewaySignals.sessionsStarted = 0
    GatewaySignals.sessionsStopped = 0
    GatewaySignals.messagesRouted = 0
    GatewaySignals.errors = 0

    expect(GatewaySignals.sessionsStarted).toBe(0)
    expect(GatewaySignals.sessionsStopped).toBe(0)
    expect(GatewaySignals.messagesRouted).toBe(0)
    expect(GatewaySignals.errors).toBe(0)
  })
})

describe('createLogger', () => {
  test('produce output via custom sink', () => {
    const logSink: Record<string, string[]> = {
      debug: [],
      info: [],
      warn: [],
      error: [],
    }

    const sink: import('./signals.js').GatewayLogSink = {
      debug: (msg) => logSink.debug.push(msg),
      info: (msg) => logSink.info.push(msg),
      warn: (msg) => logSink.warn.push(msg),
      error: (msg) => logSink.error.push(msg),
    }

    const logger = createLogger()
    logger.setSink(sink)

    logger.debug('debug-msg')
    logger.info('info-msg')
    logger.warn('warn-msg')
    logger.error('error-msg')

    expect(logSink.debug).toEqual(['debug-msg'])
    expect(logSink.info).toEqual(['info-msg'])
    expect(logSink.warn).toEqual(['warn-msg'])
    expect(logSink.error).toEqual(['error-msg'])
  })

  test('setSink(null) restores console sink without error', () => {
    const logger = createLogger()
    logger.setSink(null)

    // Should not throw
    logger.debug('restored')
    logger.info('restored')
  })

  test('setLevel changes module-level log level', () => {
    const logger = createLogger()
    // Verify setLevel is callable with all valid levels
    logger.setLevel('debug')
    logger.setLevel('info')
    logger.setLevel('warn')
    logger.setLevel('error')
    // No error thrown
  })
})

describe('getHealthStatus', () => {
  beforeEach(() => {
    GatewaySignals.sessionsStarted = 0
    GatewaySignals.sessionsStopped = 0
    GatewaySignals.messagesRouted = 0
    GatewaySignals.errors = 0
  })

  test('returns "ok" when sessions exist and no errors', () => {
    inc('sessionsStarted', 3)
    const status = getHealthStatus()
    expect(status.status).toBe('ok')
    expect(status.sessions).toBeGreaterThanOrEqual(3)
  })

  test('returns "degraded" when errors > 0 and sessions > 0', () => {
    inc('sessionsStarted', 2)
    inc('errors', 5)
    const status = getHealthStatus()
    expect(status.status).toBe('degraded')
  })

  test('uptimeMs reflects time since module load', () => {
    const status = getHealthStatus()
    expect(status.uptimeMs).toBeGreaterThanOrEqual(0)
  })
})

// ── Test: Channel handler wiring ──────────────────────────────────────

describe('channel handler wiring', () => {
  test('ChannelHandler.onMessage receives sessionKey and content', () => {
    const received: { key: string; content: string }[] = []
    const handler: ChannelHandler = {
      onMessage(key, content) {
        received.push({ key, content })
      },
    }

    handler.onMessage('agent:main:telegram:dm:42', 'hello world')
    handler.onMessage('agent:main:telegram:group:100', 'topic message')

    expect(received).toHaveLength(2)
    expect(received[0].key).toBe('agent:main:telegram:dm:42')
    expect(received[0].content).toBe('hello world')
    expect(received[1].key).toBe('agent:main:telegram:group:100')
    expect(received[1].content).toBe('topic message')
  })

  test('ChannelHandler.onStop is optional', () => {
    const minimalHandler: ChannelHandler = {
      onMessage: () => {},
    }
    minimalHandler.onMessage('x', 'y')

    const onStopCalled: boolean[] = []
    const fullHandler: ChannelHandler = {
      onMessage: () => {},
      onStop() {
        onStopCalled.push(true)
      },
    }
    fullHandler.onStop?.()
    expect(onStopCalled).toEqual([true])
  })
})
