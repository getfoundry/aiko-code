/**
 * Telegram gateway bootstrap — wires gateway daemon + telegram channel together.
 *
 * Reads env, creates both services, starts them in order, sets up graceful
 * shutdown on SIGTERM/SIGINT/SIGHUP, returns a shutdown handle.
 */

import { createGatewayServer } from './gatewayDaemon.js'
import { createTelegramChannel } from '../../channels/telegram/telegramChannel.js'
import { createShutdownHandle, createLogger, GatewaySignals, inc } from './signals.js'
import type { GatewayLogger } from './signals.js'

function maskToken(token: string): string {
  if (token.length <= 10) return '***'
  return token.slice(0, 6) + '...' + token.slice(-4)
}

export async function startTelegramGateway(): Promise<{ shutdown: () => Promise<void> }> {
  const token = process.env.AIKO_TELEGRAM_TOKEN
  if (!token) {
    console.error('[gw:error] AIKO_TELEGRAM_TOKEN is required')
    process.exit(1)
  }

  const port = parseInt(process.env.AIKO_GATEWAY_PORT ?? '18789', 10)
  const bind = process.env.AIKO_GATEWAY_BIND ?? '0.0.0.0'
  const logger: GatewayLogger = createLogger()

  // Wire the logger into a shared shape that both services expect
  const sharedLogger = {
    info: (msg: string) => logger.info(msg),
    error: (err: unknown) => logger.error(String(err)),
  }

  logger.info(`telegram-gateway: starting on ${bind}:${port}, token=${maskToken(token)}`)

  const shutdownHandle = createShutdownHandle()

  // Create gateway server
  const gateway = await createGatewayServer(
    { port, bind, mode: 'remote' },
    (_cfg: any) => {
      // Dynamically import QueryEngine to avoid circular require issues
      return (async () => {
        const { QueryEngine } = await import('../../QueryEngine.js')
        return new QueryEngine({ cwd: process.cwd() } as any) as any
      })() as any
    },
  )

  // Create telegram channel, wiring gateway.routeMessage as the handler
  const telegram = await createTelegramChannel(
    { token, logger: sharedLogger, polling: true, debounceMs: 2000 },
    gateway.routeMessage,
  )

  // Register telegram as a known channel on the gateway
  gateway.registerChannel('telegram', {
    onMessage(sessionKey: string, content: string) {
      inc('messagesRouted')
    },
  })

  // Start gateway first, then telegram
  await gateway.start()
  await telegram.start()

  inc('sessionsStarted')

  logger.info(`telegram-gateway: ready — port=${port}, token=${maskToken(token)}`)

  // --- Graceful shutdown ---
  const onSignal = async (sig: string) => {
    logger.info(`telegram-gateway: ${sig} received, shutting down`)
    inc('sessionsStopped')
    await telegram.stop()
    await gateway.stop()
    await shutdownHandle.trigger()
    process.exit(0)
  }

  process.on('SIGTERM', () => onSignal('SIGTERM'))
  process.on('SIGINT', () => onSignal('SIGINT'))
  process.on('SIGHUP', () => onSignal('SIGHUP'))

  return {
    shutdown: async () => {
      await onSignal('shutdown()')
    },
  }
}
