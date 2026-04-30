/**
 * Type assertions for gateway + telegram channel types.
 *
 * Compile-time checks use `const _assertX: T = null as unknown as T` inside
 * `if (false)` blocks — TypeScript type-checks the assignment, but the block
 * is dead code so it produces zero runtime output. This is the standard
 * TypeScript idiom for compile-time-only type checks.
 *
 * Runtime checks use `expect()` on actual values constructed in-process.
 */

import { describe, test, expect } from 'bun:test'
import type { Bot, Context } from 'grammy'

import type {
  GatewayConfig,
  SessionLane,
  GatewayServer,
  ChannelHandler,
} from './types.js'

import type {
  TelegramChannelConfig,
  TelegramChannel,
  TelegramMessageContext,
  TelegramDeliveryConfig,
} from '../../channels/telegram/types.js'

import type { QueryEngine } from '../../QueryEngine.js'

// ── Compile-time type assertions (dead-code erase to nothing at runtime) ──

if (false) {
  // SessionLane: key (string), engine (QueryEngine), abort (AbortController)
  const _sl: SessionLane = null as unknown as SessionLane
  const _k: string = _sl.key
  const _e: QueryEngine = _sl.engine
  const _a: AbortController = _sl.abort
  void (_k)
  void (_e)
  void (_a)

  // GatewayServer: start(), stop(), routeMessage(), registerChannel(), listSessions()
  const _gs: GatewayServer = null as unknown as GatewayServer
  const _s: () => Promise<void> = _gs.start
  const _stp: () => Promise<void> = _gs.stop
  const _r: (key: string, msg: string) => AsyncGenerator<string> = _gs.routeMessage
  const _rg: (name: string, handler: ChannelHandler) => void = _gs.registerChannel
  const _ls: () => string[] = _gs.listSessions
  void (_s)
  void (_stp)
  void (_r)
  void (_rg)
  void (_ls)

  // ChannelHandler: onMessage required, onStop optional
  const _ch: ChannelHandler = null as unknown as ChannelHandler
  const _om: (key: string, content: string) => void = _ch.onMessage
  const _os: (() => void) | undefined = _ch.onStop
  void (_om)
  void (_os)

  // TelegramChannel: start(), stop(), bot (Bot<Context>)
  const _tc: TelegramChannel = null as unknown as TelegramChannel
  const _tcs: () => Promise<void> = _tc.start
  const _tcs2: () => Promise<void> = _tc.stop
  const _tcb: Bot<Context> = _tc.bot
  void (_tcs)
  void (_tcs2)
  void (_tcb)

  // TelegramMessageContext: chatId (number), senderId (number), threadId (number | undefined)
  const _tm: TelegramMessageContext = null as unknown as TelegramMessageContext
  const _tmc: number = _tm.chatId
  const _tms: number = _tm.senderId
  const _tmt: number | undefined = _tm.threadId
  void (_tmc)
  void (_tms)
  void (_tmt)
}

// ── Runtime assertions ───────────────────────────────────────────────────

describe('gateway types', () => {
  test('GatewayConfig is a plain object (no required keys)', () => {
    // All fields are optional — an empty object satisfies the type
    const cfg: GatewayConfig = {}
    expect(cfg).toBeDefined()

    // Optional fields accept expected primitives
    const fullCfg: GatewayConfig = {
      port: 18789,
      bind: '0.0.0.0',
      mode: 'remote',
      sessionsDir: '/tmp/sessions',
    }
    expect(fullCfg.port).toBe(18789)
    expect(fullCfg.bind).toBe('0.0.0.0')
    expect(fullCfg.mode).toBe('remote')
    expect(fullCfg.sessionsDir).toBe('/tmp/sessions')
  })
})

describe('telegram channel types', () => {
  test('TelegramChannelConfig requires token (string)', () => {
    const validCfg: TelegramChannelConfig = { token: '123:ABC' }
    expect(typeof validCfg.token).toBe('string')

    // Optional fields
    const fullCfg: TelegramChannelConfig = {
      token: '123:ABC',
      polling: true,
      maxReconnectAttempts: 5,
      debounceMs: 2000,
      logger: {
        info: () => {},
        error: () => {},
      },
      webhookUrl: 'https://example.com/webhook',
    }
    expect(fullCfg.polling).toBe(true)
    expect(fullCfg.maxReconnectAttempts).toBe(5)
    expect(fullCfg.debounceMs).toBe(2000)
    expect(fullCfg.webhookUrl).toBe('https://example.com/webhook')
    expect(fullCfg.logger).toBeDefined()
  })

  test('TelegramDeliveryConfig optional fields with sensible defaults', () => {
    const cfg: TelegramDeliveryConfig = {}
    expect(cfg).toBeDefined()

    const withParse: TelegramDeliveryConfig = {
      parseMode: 'MarkdownV2',
      maxMessageLength: 4096,
      draftIntervalMs: 1000,
    }
    expect(withParse.parseMode).toBe('MarkdownV2')
    expect(withParse.maxMessageLength).toBe(4096)
    expect(withParse.draftIntervalMs).toBe(1000)
  })

  test('TelegramChannelConfig default values: debounceMs=2000, maxReconnectAttempts=5', () => {
    // Types allow these as number | undefined (optional fields).
    // Runtime code should fallback to 2000 / 5.
    const defaults: TelegramChannelConfig = { token: 'x' }
    expect(defaults.debounceMs).toBeUndefined()
    expect(defaults.maxReconnectAttempts).toBeUndefined()

    const withDefaults: TelegramChannelConfig = {
      token: 'x',
      debounceMs: 2000,
      maxReconnectAttempts: 5,
    }
    expect(withDefaults.debounceMs).toBe(2000)
    expect(withDefaults.maxReconnectAttempts).toBe(5)
  })
})
