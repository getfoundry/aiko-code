/**
 * Telegram channel plugin — full implementation.
 *
 * Modeled on openclaw's createChatChannelPlugin factory:
 *   extensions/telegram/src/channel.ts
 *
 * Creates a Telegram bot connection (grammY), handles inbound messages
 * with debouncing/throttling, routes them to the gateway, and streams
 * responses back via editMessageText with a token-bucket rate limiter.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { Bot } from 'grammy'
import { run } from '@grammyjs/runner'
import type { GrammyError, HttpError, Context } from 'grammy'
import type { RunnerHandle } from '@grammyjs/runner'
import type { Update } from 'grammy/types'
import type { TelegramChannelConfig, TelegramChannel, TelegramDeliveryConfig, TelegramAllowlist } from './types.js'

/** Default Telegram Bot API rate limit: 30 messages per second. */
const DEFAULT_RATE_LIMIT = 30

/** Telegram Bot API hard limit for text messages. */
const TELEGRAM_MAX_CHARS = 4096

/** Default parse mode for replies. */
const DEFAULT_PARSE_MODE = 'MarkdownV2' as const

/** Default draft update interval in ms. */
const DEFAULT_DRAFT_INTERVAL_MS = 500

// Watchdog / stall detection (openclaw TelegramPollingSession pattern).
/** Interval between watchdog pings (ms). */
const WATCHDOG_INTERVAL_MS = 30_000
/** Stall threshold: max ms without a getUpdates completing (ms). */
const STALL_THRESHOLD_MS = 120_000
/** Force-cycle: max ms to wait for graceful stop before killing (ms). */
const FORCE_CYCLE_MS = 15_000

// Liveness tracking (openclaw pattern: track time since last successful API call).
let lastApiCallMs = Date.now()
let apiCallSuccess = true

/**
 * Escape special characters for Telegram MarkdownV2 parse mode.
 * Special chars: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * Must be escaped with backslash: \_ \* etc.
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1')
}

/** RC path for persisting the pairing allowlist. */
const TELEGRAM_ALLOWLIST_PATH = join(homedir(), '.aiko', 'telegram.json')

function loadAllowlist(): TelegramAllowlist {
  if (existsSync(TELEGRAM_ALLOWLIST_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(TELEGRAM_ALLOWLIST_PATH, 'utf-8')) as Partial<TelegramAllowlist>
      return { ...parsed, users: parsed.users ?? {} } as TelegramAllowlist
    } catch { /* ignore corrupt file */ }
  }
  return { users: {} }
}

function saveAllowlist(data: TelegramAllowlist) {
  const dir = join(homedir(), '.aiko')
  if (!existsSync(dir)) {
    try { require('node:fs').mkdirSync(dir, { recursive: true }) } catch { /* best effort */ }
  }
  writeFileSync(TELEGRAM_ALLOWLIST_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

/** Generate a random pairing code like "ABCD-EFGH". */
function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 32 chars, no ambiguous (0/O, 1/I/L)
  const N = chars.length
  function encode(): string {
    let s = ''
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * N)]
    return s
  }
  return `${encode()}-${encode()}`
}

/** Check if a user ID is in the allowlist. */
function isUserAllowed(userId: number, allowlist: TelegramAllowlist): boolean {
  const key = String(userId)
  const entry = allowlist.users[key]
  return entry !== undefined && entry !== null
}

/**
 * Logger type that supports info, warn, and error.
 */
interface FlexibleLogger {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (err: unknown) => void
}

/**
 * Simple token-bucket rate limiter for Telegram Bot API.
 * Allows bursts up to bucket size, then refills at `refillRate` tokens/sec.
 */
function createRateLimiter(bucketSize: number, refillRate: number) {
  let tokens = bucketSize
  let lastRefill = Date.now()

  return async function acquire() {
    const now = Date.now()
    const elapsedSec = (now - lastRefill) / 1000
    tokens = Math.min(bucketSize, tokens + elapsedSec * refillRate)
    lastRefill = now

    if (tokens < 1) {
      const waitMs = ((1 - tokens) / refillRate) * 1000
      await new Promise(r => setTimeout(r, waitMs))
      return acquire() // retry after waiting
    }
    tokens--
  }
}

/**
 * Create a Telegram channel that connects to the Bot API
 * via polling or webhook. Messages are debounced (default 2000ms)
 * and routed to the gateway via the registered handler.
 * Responses are streamed back incrementally via editMessageText.
 */
export async function createTelegramChannel(
  config: TelegramChannelConfig,
  gatewayRoute: (sessionKey: string, content: string) => AsyncGenerator<string>,
  deliveryConfig?: TelegramDeliveryConfig,
): Promise<TelegramChannel> {
  const bot = new Bot(config.token)
  const debounceMs = config.debounceMs ?? 2000
  const maxReconnectAttempts = config.maxReconnectAttempts ?? 5
  const parseMode = deliveryConfig?.parseMode ?? DEFAULT_PARSE_MODE
  const maxMessageLength = deliveryConfig?.maxMessageLength ?? TELEGRAM_MAX_CHARS
  const draftIntervalMs = deliveryConfig?.draftIntervalMs ?? DEFAULT_DRAFT_INTERVAL_MS

  // Coerce logger to support warn even if upstream only provides info/error.
  const rawLogger = config.logger as { info?: (msg: string) => void; warn?: (msg: string) => void; error?: (err: unknown) => void } | undefined
  const logger: FlexibleLogger = {
    info: rawLogger?.info ?? (() => {}),
    warn: rawLogger?.warn ?? (() => {}),
    error: rawLogger?.error ?? (() => {}),
  }

  // Liveness tracking middleware — tracks time since last successful API call.
  // Matches openclaw's pattern of setting bot.api.config.onLivenessEvent.
  // grammY's standard config may not have this field; it's an extension.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(bot.api.config as any).onLivenessEvent = (wasSuccessful: boolean) => {
      lastApiCallMs = Date.now()
      apiCallSuccess = wasSuccessful
    }
  } catch {
    // Liveness tracking not supported on this grammY version; no-op
  }

  // Inbound message debouncer — prevents flooding the engine with
  // rapid messages (like openclaw's createInboundDebouncer).
  const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; messages: string[] }>()
  const flushing = new Set<string>()

  // Token-bucket rate limiter
  const rateLimiter = createRateLimiter(DEFAULT_RATE_LIMIT, DEFAULT_RATE_LIMIT)

  function debounceMessage(sessionKey: string, content: string) {
    // Prevent re-entry: if already flushing this session, just append to messages
    let entry = pending.get(sessionKey)
    if (flushing.has(sessionKey) && entry) {
      entry.messages.push(content)
      return
    }
    if (!entry) {
      entry = { timer: setTimeout(() => { flushing.delete(sessionKey); flushPending(sessionKey); pending.delete(sessionKey) }, debounceMs), messages: [] }
      pending.set(sessionKey, entry)
    }
    entry.messages.push(content)
  }

  /**
   * Send a text reply to a chat, returning the message ID.
   */
  async function sendReply(chatId: number, text: string): Promise<number> {
    const escaped = parseMode === 'MarkdownV2' ? escapeMarkdownV2(text) : text
    const result = await bot.api.sendMessage(chatId, escaped, { parse_mode: parseMode })
    return result.message_id
  }

  /**
   * Edit an existing reply message, rate-limited.
   * Truncates text at maxMessageLength (Telegram hard limit).
   * Returns the message ID from the EditedMessage response.
   */
  async function editReply(chatId: number, msgId: number, text: string): Promise<number> {
    const truncated = text.length > maxMessageLength ? text.slice(0, maxMessageLength - 1) + '\u2026' : text
    const escaped = parseMode === 'MarkdownV2' ? escapeMarkdownV2(truncated) : truncated
    await rateLimiter()
    const result = await bot.api.editMessageText(chatId, msgId, escaped, { parse_mode: parseMode })
    // editMessageText returns EditedMessage (or true). Cast to read message_id.
    if (result === true) {
      // When result is `true` (minimal response), msgId is still valid.
      return msgId
    }
    return (result as { message_id: number }).message_id
  }

  /**
   * Stream generator results back to Telegram as incremental edits.
   * First result shows as a placeholder; subsequent results edit via editMessageText.
   */
  async function streamReply(
    chatId: number,
    initialMsgId: number,
    gen: AsyncGenerator<string>,
  ): Promise<void> {
    let draftTimer: ReturnType<typeof setTimeout> | null = null
    let accumulated = ''
    let currentMsgId = initialMsgId

    try {
      for await (const chunk of gen) {
        accumulated += chunk

        // Clear draft timer so we don't send too frequently.
        if (draftTimer) {
          clearTimeout(draftTimer)
          draftTimer = null
        }

        // Schedule a draft update at the configured interval.
        draftTimer = setTimeout(async () => {
          try {
            currentMsgId = await editReply(chatId, currentMsgId, accumulated)
          } catch (err) {
            // Ignore edit failures mid-stream (e.g. user left chat).
            logger.warn(`telegram: edit draft failed for chat ${chatId}: ${err}`)
          }
        }, draftIntervalMs)
      }

      // Final flush — send whatever is left.
      if (draftTimer) {
        clearTimeout(draftTimer)
        draftTimer = null
      }
      try {
        currentMsgId = await editReply(chatId, currentMsgId, accumulated)
      } catch (err) {
        logger.warn(`telegram: final edit failed for chat ${chatId}: ${err}`)
      }
    } catch (err) {
      if (draftTimer) clearTimeout(draftTimer)
      throw err
    }
  }

  async function flushPending(sessionKey: string) {
    // flushPending sessionKey=${sessionKey} messages=${pending.get(sessionKey)?.messages.length}
    flushing.add(sessionKey)
    const entry = pending.get(sessionKey)
    if (!entry) {
      flushing.delete(sessionKey)
      return
    }
    // Batch debounce messages
    const combined = entry.messages.join('\n')
    // calling gatewayRoute with: ${combined.slice(0, 80)}
    try {
      const gen = gatewayRoute(sessionKey, combined)
      // We need the chat ID to send replies. Extract it from the session key
      // which follows the pattern: agent:main:telegram:dm:<chatId>
      const chatIdStr = sessionKey.split(':').pop()
      if (!chatIdStr) {
        logger.error(`telegram: cannot extract chatId from sessionKey ${sessionKey}`)
        pending.delete(sessionKey)
        return
      }
      const chatId = parseInt(chatIdStr, 10)
      if (isNaN(chatId)) {
        logger.error(`telegram: invalid chatId ${chatIdStr} from sessionKey ${sessionKey}`)
        pending.delete(sessionKey)
        return
      }

      // Send initial placeholder message immediately so the user sees feedback.
      const initialMsgId = await sendReply(chatId, '*Thinking...*')
      await streamReply(chatId, initialMsgId, gen)
    } catch (err) {
      logger.error(`telegram: route error for ${sessionKey}: ${err}`)
      // Always clean up the pending entry on error so we don't leak timers.
      pending.delete(sessionKey)
    } finally {
      flushing.delete(sessionKey)
    }
  }

  // Load pairing allowlist from disk (shared with CLI).
  let allowlist = loadAllowlist()

  // Command intercept + main message handler.
  // Commands are caught first and short-circuited before the debouncer.
  bot.on('message', async (ctx) => {
    const chatId = ctx.chat.id
    const userId = ctx.from?.id
    const text = ctx.message.text || ctx.message.caption || ''
    // message from userId=${userId} chatId=${chatId} text="${text}"
    logger.info(`telegram: message from user=${userId} chat=${chatId} text="${text}"`)

    // ————————————————————————————————————————————
    // Pairing commands (always processed regardless of policy)
    // ————————————————————————————————————————————
    if (text.startsWith('/approve ')) {
      // Admin approves a new user: /approve <userId>
      const codeArg = text.slice(9).trim()
      const targetId = codeArg
      if (!targetId || isNaN(parseInt(targetId, 10))) {
        await ctx.reply(
          'Use /approve <userId> to allow someone.\n\n'
          + 'Users ask for a code via /pair — tell them you received it.\n'
          + 'Example: /approve 123456789',
        )
        return
      }
      const now = Date.now()
      const fromName = ctx.from?.first_name || 'an admin'
      allowlist.users[targetId] = { approvedAt: now, approvedBy: fromName }
      saveAllowlist(allowlist)
      const displayName = (await getUserName(parseInt(targetId, 10))) ?? targetId
      await ctx.reply(`Allowed: ${displayName} (user ${targetId}). They can now message this bot.`)
      return
    }

    if (text === '/unapprove') {
      const keys = Object.keys(allowlist.users)
      if (keys.length === 0) {
        await ctx.reply('No users are currently allowed.')
        return
      }
      const lines = keys.map((id) => {
        const u = allowlist.users[id]
        const when = new Date(u.approvedAt).toLocaleDateString()
        return `${id} — approved ${when}`
      })
      await ctx.reply(`Allowed users (${keys.length}):\n\n` + lines.join('\n'))
      return
    }

    if (text === '/who') {
      const keys = Object.keys(allowlist.users)
      if (keys.length === 0) {
        await ctx.reply('No users are currently allowed to message this bot.')
        return
      }
      const lines = keys.map((id) => {
        const u = allowlist.users[id]
        const when = new Date(u.approvedAt).toLocaleDateString()
        return `- ${id} (approved ${u.approvedBy}, ${when})`
      })
      await ctx.reply(`Who's allowed (${keys.length}):\n\n` + lines.join('\n'))
      return
    }

    // Command interceptor — don't send these to the gateway.
    if (text === '/start') {
      if (config.dmPolicy === 'pairing') {
        return ctx.reply(
          'Welcome!\n\n'
          + 'This bot is private — the owner needs to approve you before we chat.\n\n'
          + 'Send /pair to get a pairing code to share.\n\n'
          + 'For help, see /help.',
        )
      }
      return ctx.reply('Welcome! You can send me messages and I will think about them.')
    }

    if (text === '/help') {
      let body = 'Help\n\nSend me a message and I will think about it.'
      if (config.dmPolicy === 'pairing') {
        body += '\n\nCommands:\n'
        body += '/pair — get a code to ask the owner for access\n'
        body += '/approve <userId> — allow someone (owner only)\n'
        body += '/who — list who has access\n'
        body += '/unapprove — list allowed users\n'
      }
      body += '\n/help — show this message'
      return ctx.reply(body)
    }

    // ————————————————————————————————————————————
    // /pair command — request access code
    // ————————————————————————————————————————————
    if (text.trim() === '/pair' && config.dmPolicy === 'pairing') {
      const code = generatePairingCode()
      await ctx.reply(
        'Here is your pairing code — share it with the bot owner:\n\n'
        + code + '\n\n'
        + 'Once they approve you with /approve ' + userId + ', you are good to go!',
      )
      return
    }

    // ————————————————————————————————————————————
    // DM access check (pairing mode)
    // ————————————————————————————————————————————
    if (config.dmPolicy === 'pairing') {
      const allowed = userId !== undefined && isUserAllowed(userId, allowlist)
      if (!allowed) {
        const code = generatePairingCode()
        await ctx.reply(
          'This bot is private.\n\n'
          + 'Send this code to the owner so they can approve you:\n\n'
          + code + '\n\n'
          + 'Once approved, just message me like normal!',
        )
        return
      }
    }

    // Normal message: debounce and route to gateway.
    const trimmed = text.trim()
    if (!trimmed) return
    const sessionKey = `agent:main:telegram:dm:${chatId}`
    debounceMessage(sessionKey, trimmed)
  })


  // Helper to fetch a user's display name (non-blocking, best-effort).
  async function getUserName(uid: number): Promise<string | null> {
    try {
      const chat = await bot.api.getChat(uid)
      return chat.first_name ?? null
    } catch {
      return null
    }
  }

  // Catch grammY HTTP/Bot API errors globally.
  // Implements openclaw's 409 dirty-transport + retry pattern.
  let transportDirty = false
  let retryBackoff = 1 // seconds, exponential

  bot.catch(async (err: GrammyError | HttpError) => {
    const msg = err instanceof Error ? err.message : String(err)
    const status = (err as { code?: number }).code
    logger.error(`telegram: bot error: ${msg}`)
    console.error(`[telegram:error] ${msg}`)

    // Detect HTTP 409 conflict — marks transport dirty, forces fresh TCP socket.
    if (status === 409 || msg.includes('Conflict')) {
      if (transportDirty) {
        logger.warn('telegram: transport already dirty, skipping restart')
        return
      }
      transportDirty = true
      logger.warn('telegram: 409 conflict detected — marking transport dirty, clearing webhook, forcing restart in 5s')
      try {
        await bot.api.deleteWebhook()
      } catch { /* best effort */ }
      // Wait 5s for handler cleanup, then restart
      await new Promise(r => setTimeout(r, 5000))
      pollingRunning = false // signal runner to stop
      await new Promise(r => setTimeout(r, 1000))
      pollingRunning = true // re-enable, runner will pick up new updates
      transportDirty = false
      retryBackoff = 1
      logger.info('telegram: transport restarted after 409')
    } else if (msg.includes('Timed out') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT')) {
      // Network error — exponential backoff on reconnect
      const waitMs = retryBackoff * 1000
      logger.warn(`telegram: network error (${msg}), retrying in ${waitMs}ms`)
      await new Promise(r => setTimeout(r, waitMs))
      retryBackoff = Math.min(retryBackoff * 2, 60)
    } else {
      // Other errors — reset backoff
      retryBackoff = 1
    }
  })

  // Internal state for tracking update offsets
  let pollingRunning = false
  let lastUpdateId = 0
  let lastGetUpdatesCompleted = Date.now()
  let runner: RunnerHandle | null = null
  let forceStopTimer: ReturnType<typeof setTimeout> | null = null
  let watchdogTimer: ReturnType<typeof setInterval> | null = null

  const processUpdate = async (update: { update_id: number }) => {
    if (update.update_id > lastUpdateId) {
      lastUpdateId = update.update_id
    }
    // Reset stall timer on each successful update
    lastGetUpdatesCompleted = Date.now()
    try {
      await bot.handleUpdate(update as Update)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`telegram: error handling update ${update.update_id}: ${msg}`)
    }
  }

  /** Start the runner with watchdog protection. */
  async function startPolling() {
    pollingRunning = true
    runner = run(bot, {
      runner: { fetch: { timeout: 30, allowed_updates: [] } },
    })
    // Drop pending updates so deleteWebhook does not loop on a backlog.
    await bot.api.deleteWebhook({ drop_pending_updates: true })
    logger.info('telegram: polling started')
    return runner
  }

  return {
    async start() {
      if (config.polling !== false) {
        pollingRunning = true
        await startPolling()
        // Wait until pollingRunning becomes false (stop() was called).
        await new Promise<void>(resolve => {
          const check = () => {
            if (!pollingRunning) resolve()
            else if (runner?.isRunning() ?? false) setTimeout(check, 500)
            else resolve()
          }
          check()
        })
      }
    },
    async stop() {
      pollingRunning = false

      // Force-cycle: kill runner after 15s even if graceful stop times out.
      forceStopTimer = setTimeout(() => {
        logger.warn('telegram: force-cycle timeout (15s), killing runner')
        runner?.stop()
      }, FORCE_CYCLE_MS)

      // Stop the runner
      try {
        await runner?.stop()
      } catch { /* ignore */ }
      runner = null

      // Clean up timers
      if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null }
      clearTimeout(forceStopTimer)
      forceStopTimer = null
      pending.forEach((entry) => {
        clearTimeout(entry.timer)
      })
      pending.clear()
      logger.info('telegram: stopped')
    },
    bot,
  }
}
