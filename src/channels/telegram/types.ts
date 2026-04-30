/**
 * Types for the Telegram channel plugin.
 *
 * Modeled on openclaw's createChatChannelPlugin factory:
 *   extensions/telegram/src/channel.ts
 */

import type { Bot, GrammyError, HttpError, Context } from 'grammy'

export interface TelegramChannelConfig {
  /** Telegram bot token from @BotFather. */
  token: string
  /** Open telemetry or logging handler. */
  logger?: { info: (msg: string) => void; error: (err: unknown) => void }
  /** Use polling instead of webhooks (default true for local dev). */
  polling?: boolean
  /** Webhook URL when using webhook mode. */
  webhookUrl?: string
  /** Maximum polling reconnect attempts before giving up. */
  maxReconnectAttempts?: number
  /** Inbound message debounce window in ms (default 2000). */
  debounceMs?: number
}

export interface TelegramChannel {
  /** Start receiving messages. */
  start(): Promise<void>
  /** Stop and clean up. */
  stop(): Promise<void>
  /** The underlying grammY bot instance. */
  bot: Bot<Context>
}

export type TelegramMessageContext = Context & {
  /** Telegram chat ID. */
  chatId: number
  /** Telegram thread/topic ID (groups only). */
  threadId?: number
  /** Sender user ID. */
  senderId: number
}

export interface TelegramDeliveryConfig {
  /** Markdown parsing mode (default 'MarkdownV2'). */
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'
  /** Max message length before truncation. */
  maxMessageLength?: number
  /** Draft update interval in ms. */
  draftIntervalMs?: number
}
