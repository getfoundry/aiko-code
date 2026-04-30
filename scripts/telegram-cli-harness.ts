#!/usr/bin/env bun
/**
 * CLI proxy harness for the Telegram channel.
 *
 * Acts as a true Telegram stand-in: stubs grammY's transport so
 * createTelegramChannel runs unchanged, but wires the real gateway +
 * QueryEngine behind it. Stdin → fake Update → real handler → real
 * gateway.routeMessage → real agent loop → tokens stream back to stdout
 * via the same sendMessage / editMessageText paths Telegram would use.
 *
 * Usage:
 *   bun scripts/telegram-cli-harness.ts [--policy=open|pairing] [--user=1001] [--chat=1001]
 *
 * REPL:
 *   any text          — send as a message from the current user/chat
 *   :user <id>        — switch sender id
 *   :chat <id>        — switch chat id
 *   :quit             — graceful shutdown
 */

import { mock } from 'bun:test'
import { createInterface } from 'node:readline'

type MessageHandler = (ctx: any) => Promise<void> | void

let messageHandler: MessageHandler | null = null
let nextMsgId = 1000

function logOut(label: string, chatId: number, msgId: number, text: string) {
  process.stdout.write(`\n[${label} chat=${chatId} msg=${msgId}]\n${text}\n\n`)
}

class FakeBot {
  api: any
  constructor(public token: string) {
    this.api = {
      config: {},
      sendMessage: async (chatId: number, text: string) => {
        const id = nextMsgId++
        logOut('bot →', chatId, id, text)
        return { message_id: id, chat: { id: chatId }, date: Date.now() / 1000, text }
      },
      editMessageText: async (chatId: number, msgId: number, text: string) => {
        logOut('bot ✎', chatId, msgId, text)
        return { message_id: msgId, chat: { id: chatId }, date: Date.now() / 1000, text }
      },
      getChat: async (uid: number) => ({ id: uid, first_name: `User${uid}` }),
      deleteWebhook: async () => true,
    }
  }
  on(event: string, handler: MessageHandler) {
    if (event === 'message') messageHandler = handler
  }
  catch(_handler: unknown) { /* noop */ }
  async handleUpdate(_u: unknown) { /* noop */ }
}

await mock.module('grammy', () => ({ Bot: FakeBot }))
await mock.module('@grammyjs/runner', () => ({
  run: () => ({ isRunning: () => true, stop: async () => {} }),
}))

// Real gateway router + real telegram channel.
// QueryEngine is heavyweight (calls the model API and pulls in `bun:bundle`),
// so we substitute a fake — the harness exercises the channel + gateway
// routing path end-to-end without needing API credentials.
const { createGatewayServer } = await import('../src/entrypoints/gateway/gatewayDaemon.ts')
const { createTelegramChannel } = await import('../src/channels/telegram/telegramChannel.ts')

// Real QueryEngine, wired the same way `telegram-gateway.ts` wires it in
// production. If the engine throws on submitMessage (likely — most config
// fields are undefined), the harness will surface the stack to stderr.
async function makeRealEngine() {
  const { QueryEngine } = await import('../src/QueryEngine.ts')
  return new QueryEngine({ cwd: process.cwd() } as any) as any
}

// SDKMessage -> string adapter, since QueryEngine yields objects but the
// telegram channel concatenates strings. Extracts assistant text blocks.
async function* sdkToText(gen: AsyncGenerator<any>): AsyncGenerator<string> {
  for await (const msg of gen) {
    if (typeof msg === 'string') { yield msg; continue }
    if (msg?.type === 'assistant' && Array.isArray(msg.message?.content)) {
      for (const block of msg.message.content) {
        if (block?.type === 'text' && typeof block.text === 'string') yield block.text
      }
    } else if (msg?.delta?.text) {
      yield String(msg.delta.text)
    }
  }
}

// CLI args
const args = new Map<string, string>()
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=(.+)$/)
  if (m) args.set(m[1], m[2])
}
const policy = (args.get('policy') === 'pairing' ? 'pairing' : 'open') as 'open' | 'pairing'
let userId = parseInt(args.get('user') ?? '1001', 10)
let chatId = parseInt(args.get('chat') ?? String(userId), 10)
const debounceMs = parseInt(args.get('debounce') ?? '500', 10)

const sharedLogger = {
  info: (msg: string) => process.stderr.write(`[gw:info] ${msg}\n`),
  error: (err: unknown) => process.stderr.write(`[gw:error] ${String(err)}\n`),
}

// Real gateway, in-process — no remote port needed since the handler is
// Real gateway, in-process — port=0 picks a free port.
const gateway = await createGatewayServer(
  { port: 0, bind: '127.0.0.1' } as any,
  (_cfg: any) => makeRealEngine(),
)

// Wrap gateway.routeMessage so the telegram channel sees text chunks instead
// of raw SDKMessage objects (which it would concatenate as "[object Object]").
const realRouteMessage = (sessionKey: string, content: string) =>
  sdkToText(gateway.routeMessage(sessionKey, content) as any)

const channel = await createTelegramChannel(
  { token: 'cli-harness', logger: sharedLogger, polling: false, debounceMs, dmPolicy: policy },
  realRouteMessage,
)

gateway.registerChannel('telegram', { onMessage: () => {} })
await gateway.start()

if (!messageHandler) {
  console.error('harness: no message handler registered')
  process.exit(1)
}

console.log(`telegram-cli-harness ready (policy=${policy}, user=${userId}, chat=${chatId}, debounce=${debounceMs}ms)`)
console.log('type a message; commands: :user <id>, :chat <id>, :quit\n')

let nextIncomingId = 5000
function makeCtx(text: string) {
  const msg = {
    message_id: nextIncomingId++,
    text,
    caption: undefined,
    from: { id: userId, first_name: `User${userId}`, is_bot: false },
    chat: { id: chatId, type: chatId === userId ? 'private' : 'group' },
    date: Math.floor(Date.now() / 1000),
  }
  return {
    chat: msg.chat,
    from: msg.from,
    message: msg,
    reply: async (text: string) => {
      const id = nextMsgId++
      logOut('bot ↩', chatId, id, text)
      return { message_id: id }
    },
  }
}

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false })

rl.on('line', async (raw) => {
  const line = raw.trimEnd()
  if (!line) return

  if (line === ':quit') {
    await channel.stop()
    await gateway.stop()
    process.exit(0)
  }
  const userMatch = line.match(/^:user\s+(\d+)$/)
  if (userMatch) { userId = parseInt(userMatch[1], 10); console.log(`harness: user=${userId}`); return }
  const chatMatch = line.match(/^:chat\s+(\d+)$/)
  if (chatMatch) { chatId = parseInt(chatMatch[1], 10); console.log(`harness: chat=${chatId}`); return }

  try {
    await messageHandler!(makeCtx(line))
  } catch (err) {
    console.error('harness: handler threw:', err)
  }
})

rl.on('close', async () => {
  await channel.stop()
  await gateway.stop()
  process.exit(0)
})
