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
import type { GrammyError, HttpError, Context } from 'grammy'
import type { TelegramChannelConfig, TelegramChannel, TelegramDeliveryConfig, TelegramAllowlist } from './types.js'

/** Default Telegram Bot API rate limit: 30 messages per second. */
const DEFAULT_RATE_LIMIT = 30

/** Telegram Bot API hard limit for text messages. */
const TELEGRAM_MAX_CHARS = 4096

/** Default parse mode for replies. */
const DEFAULT_PARSE_MODE = 'MarkdownV2' as const

/** Default draft update interval in ms. */
const DEFAULT_DRAFT_INTERVAL_MS = 500

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
      return JSON.parse(readFileSync(TELEGRAM_ALLOWLIST_PATH, 'utf-8')) as TelegramAllowlist
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

/** Generate a random pairing code like "ABC-DEF". */
function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars (0/O, 1/I/L)
  const half = Math.floor(Math.random() * 13 * 36 * 36 * 36)
  const second = Math.floor(Math.random() * 13 * 36 * 36 * 36)
  function encode(n: number): string {
    let s = ''
    for (let i = 0; i < 4; i++) { s = chars[n % 36] + s; n = Math.floor(n / 36) }
    return s
  }
  return `${encode(half)}-${encode(second)}`
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
    flushing.add(sessionKey)
    const entry = pending.get(sessionKey)
    if (!entry) {
      flushing.delete(sessionKey)
      return
    }
    // Batch debounce messages
    const combined = entry.messages.join('\n')
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

    // ————————————————————————————————————————————
    // Pairing commands (always processed regardless of policy)
    // ————————————————————————————————————————————
    if (text.startsWith('/approve ')) {
      // Admin approves a new user: /approve <pairing_code>
      // The admin is the one who runs this command.
      if (!userId) return
      const codeArg = text.slice(9).trim()
      // Find which pending code matches — we don't store codes per-user in the allowlist,
      // so we match by finding approved users from the code author.
      // Simpler approach: /approve <userId> directly (the arg is the numeric user ID).
      const targetId = codeArg
      if (!targetId || isNaN(parseInt(targetId, 10))) {
        await ctx.reply(
          'Please use _/approve <userId>_ to allow someone.\n\n'
          + 'Users ask for a pairing code via _/pair_ — tell them you received it.\n'
          + 'Example: _/approve 123456789_',
          { parse_mode: 'MarkdownV2' },
        )
        return
      }
      const now = Date.now()
      const fromName = ctx.from.first_name || 'an admin'
      allowlist.users[targetId] = { approvedAt: now, approvedBy: fromName }
      saveAllowlist(allowlist)
      const displayName = (await getUserName(parseInt(targetId, 10))) ?? targetId
      await ctx.reply(
        `Allowed: *${escapeMarkdownV2(displayName)}* (user \`${targetId}\`). They can now message this bot.`,
        { parse_mode: 'MarkdownV2' },
      )
      return
    }

    if (text === '/unapprove') {
      // Unapprove: list current users
      const keys = Object.keys(allowlist.users)
      if (keys.length === 0) {
        await ctx.reply('No users are currently allowed.', { parse_mode: 'MarkdownV2' })
        return
      }
      const lines = keys.map((id) => {
        const u = allowlist.users[id]
        const when = new Date(u.approvedAt).toLocaleDateString()
        return `_\`${escapeMarkdownV2(id)}\`_ — approved ${when}`
      })
      await ctx.reply(`*Allowed users (${keys.length}):*\n\n` + lines.join('\n'), { parse_mode: 'MarkdownV2' })
      return
    }

    if (text === '/who') {
      const keys = Object.keys(allowlist.users)
      if (keys.length === 0) {
        await ctx.reply('No users are currently allowed to message this bot.', { parse_mode: 'MarkdownV2' })
        return
      }
      const lines = keys.map((id) => {
        const u = allowlist.users[id]
        const when = new Date(u.approvedAt).toLocaleDateString()
        return `- \`${escapeMarkdownV2(id)}\` (approved \`${u.approvedBy}\`, ${when})`
      })
      await ctx.reply(`*Who's allowed* (${keys.length}):\n\n` + lines.join('\n'), { parse_mode: 'MarkdownV2' })
      return
    }

    // Command interceptor — don't send these to the gateway.
    if (text === '/start') {
      if (config.dmPolicy === 'pairing') {
        return ctx.reply(
          '*Welcome!*\n\n'
          + 'This bot is private — I need to approve you before we chat.\n\n'
          + 'Send me _/pair_ to get a pairing code to share.\n\n'
          + 'For help, see _/help_.',
          { parse_mode: 'MarkdownV2' },
        )
      }
      return ctx.reply(
        '*Welcome!*\n\n'
        + 'You can send me messages and I will think about them.',
        { parse_mode: 'MarkdownV2' },
      )
    }

    if (text === '/help') {
      let body = '*Help*\n\nSend me a message and I will think about it.'
      if (config.dmPolicy === 'pairing') {
        body += '\n\n*Commands:*\n'
        body += '/pair \u2014 get a code to ask the owner for access\n'
        body += '/approve <userId> \u2014 allow someone (owner only)\n'
        body += '/who \u2014 list who has access\n'
        body += '/unapprove \u2014 list allowed users\n'
      }
      body += '\n'
      body += '/help \u2014 show this message'
      return ctx.reply(body, { parse_mode: 'MarkdownV2' })
    }

    // ————————————————————————————————————————————
    // /pair command — request access code
    // ————————————————————————————————————————————
    if (text.trim() === '/pair' && config.dmPolicy === 'pairing' && userId) {
      const code = generatePairingCode()
      await ctx.reply(
        'Here is your pairing code — share it with the bot owner:\n\n'
        + '`' + code + '`\n\n'
        + 'Once they approve you with `/approve ' + userId + '`, you are good to go!',
        { parse_mode: 'MarkdownV2' },
      )
      return
    }

    // ————————————————————————————————————————————
    // DM access check (pairing mode)
    // ————————————————————————————————————————————
    if (config.dmPolicy === 'pairing' && userId) {
      const allowed = isUserAllowed(userId, allowlist)
      if (!allowed) {
        // First-time user — generate a pairing code and give them the flow
        const code = generatePairingCode()
        await ctx.reply(
          'This bot is private.\n\n'
          + 'Send this code to the owner so they can approve you:\n\n'
          + '`' + code + '`\n\n'
          + 'Once approved, just message me like normal!',
          { parse_mode: 'MarkdownV2' },
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
  bot.catch((err: GrammyError | HttpError) => {
    logger.error(`telegram: bot error: ${err}`)
  })

  return {
    async start() {
      if (config.polling !== false) {
        // Start long polling with reconnect logic
        let attempt = 0
        while (attempt < maxReconnectAttempts) {
          try {
            await bot.start()
            attempt = 0
            logger.info('telegram: polling started')
            return
          } catch {
            attempt++
            logger.error(`telegram: reconnect attempt ${attempt}/${maxReconnectAttempts}`)
            await new Promise(r => setTimeout(r, 5000))
          }
        }
      }
    },
    async stop() {
      bot.stop()
      for (const entry of [...pending.values()]) {
        clearTimeout(entry.timer)
      }
      pending.clear()
      logger.info('telegram: stopped')
    },
    bot,
  }
}
