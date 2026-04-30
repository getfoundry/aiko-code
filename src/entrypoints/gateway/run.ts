#!/usr/bin/env bun
/**
 * Telegram gateway entry point.
 *
 * Run: bun run src/entrypoints/gateway/run.ts
 * Or:  AIKO_TELEGRAM_TOKEN=x bun run src/entrypoints/gateway/run.ts
 *
 * Reads:
 *   AIKO_TELEGRAM_TOKEN  — bot token from @BotFather (required)
 *   AIKO_GATEWAY_PORT    — WS server port (default 18789)
 *   AIKO_GATEWAY_BIND    — bind address (default 0.0.0.0)
 */

import { startTelegramGateway } from './telegram-gateway.js'

console.log('[run] starting telegram gateway daemon...')
const { shutdown } = await startTelegramGateway()

// Keep alive — the process stays running until SIGTERM/SIGINT/SIGHUP
// (handled in telegram-gateway.ts). This promise never resolves
// under normal operation, keeping the event loop alive.
await new Promise<void>(() => { /* keep alive forever */ })
