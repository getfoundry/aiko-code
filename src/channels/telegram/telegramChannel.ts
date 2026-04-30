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

import { Bot } from 'grammy'
import type { GrammyError, HttpError, Context } from 'grammy'
import type { TelegramChannelConfig, TelegramChannel, TelegramDeliveryConfig } from './types.js'

/** Default Telegram Bot API rate limit: 30 messages per second. */
const DEFAULT_RATE_LIMIT = 30

/** Telegram Bot API hard limit for text messages. */
const TELEGRAM_MAX_CHARS = 4096

/** Default parse mode for replies. */
const DEFAULT_PARSE_MODE = 'MarkdownV2' as const

/** Default draft update interval in ms. */
const DEFAULT_DRAFT_INTERVAL_MS = 500

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

  // Token-bucket rate limiter
  const rateLimiter = createRateLimiter(DEFAULT_RATE_LIMIT, DEFAULT_RATE_LIMIT)

  function debounceMessage(sessionKey: string, content: string) {
    let entry = pending.get(sessionKey)
    if (!entry) {
      entry = { timer: setTimeout(() => { flushPending(sessionKey); pending.delete(sessionKey) }, debounceMs), messages: [] }
      pending.set(sessionKey, entry)
    }
    entry.messages.push(content)
  }

  /**
   * Send a text reply to a chat, returning the message ID.
   */
  async function sendReply(chatId: number, text: string): Promise<number> {
    const result = await bot.api.sendMessage(chatId, text, { parse_mode: parseMode })
    return result.message_id
  }

  /**
   * Edit an existing reply message, rate-limited.
   * Truncates text at maxMessageLength (Telegram hard limit).
   * Returns the message ID from the EditedMessage response.
   */
  async function editReply(chatId: number, msgId: number, text: string): Promise<number> {
    const truncated = text.length > maxMessageLength ? text.slice(0, maxMessageLength - 1) + '\u2026' : text
    await rateLimiter()
    const result = await bot.api.editMessageText(chatId, msgId, truncated, { parse_mode: parseMode })
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
    const entry = pending.get(sessionKey)
    if (!entry) return
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
    }
  }

  // Command intercept + main message handler.
  // Commands are caught first and short-circuited before the debouncer.
  bot.on('message', (ctx) => {
    const chatId = ctx.chat.id
    const text = ctx.message.text || ctx.message.caption || ''

    // Command interceptor — don't send these to the gateway.
    if (text === '/start') {
      return ctx.reply('Configure me with @BotFather first, then use /start to activate.', { parse_mode: 'MarkdownV2' })
    }
    if (text === '/help') {
      return ctx.reply(
        '*Help*\n\n'
        + 'Send me a message and I will think about it.\n\n'
        + 'Commands:\n'
        + '/start \u2014 activate the bot\n'
        + '/help \u2014 show this message',
        { parse_mode: 'MarkdownV2' },
      )
    }

    // Normal message: debounce and route to gateway.
    const trimmed = text.trim()
    if (!trimmed) return
    const sessionKey = `agent:main:telegram:dm:${chatId}`
    debounceMessage(sessionKey, trimmed)
  })

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
      for (const entry of pending.values()) {
        clearTimeout(entry.timer)
      }
      pending.clear()
      logger.info('telegram: stopped')
    },
    bot,
  }
}
