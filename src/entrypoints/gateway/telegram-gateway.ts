/**
 * Telegram gateway bootstrap — wires gateway daemon + telegram channel together.
 *
 * Reads env, creates both services, starts them in order, sets up graceful
 * shutdown on SIGTERM/SIGINT/SIGHUP, returns a shutdown handle.
 *
 * Also provides macOS LaunchAgent plist and Linux systemd unit generation
 * (modeled on openclaw's writeLaunchAgentPlist / writeSystemdUnit).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createGatewayServer } from './gatewayDaemon.js'
import { createTelegramChannel } from '../../channels/telegram/telegramChannel.js'
import { createShutdownHandle, createLogger, GatewaySignals, inc } from './signals.js'
import type { GatewayLogger } from './signals.js'

function maskToken(token: string): string {
  if (token.length <= 10) return '***'
  return token.slice(0, 6) + '...' + token.slice(-4)
}

// ─── Daemon lifecycle helpers (openclaw pattern) ───

/** Detect if running on macOS */
function isMacOS(): boolean {
  return process.platform === 'darwin'
}

/** Detect if systemd user dir exists */
function hasSystemd(): boolean {
  return existsSync(join(homedir(), '.config', 'systemd', 'user'))
}

/**
 * Write macOS LaunchAgent plist for auto-start on boot/login.
 * Location: ~/Library/LaunchAgents/ai.fcode.telegram-gateway.plist
 */
function writeLaunchAgentPlist(): string {
  const dir = join(homedir(), 'Library', 'LaunchAgents')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const nodePath = process.execPath
  const scriptPath = join(process.cwd(), 'dist', 'entrypoints', 'gateway', 'telegram-gateway.js')
  const logDir = join(homedir(), '.aiko', 'logs')
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.fcode.telegram-gateway</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${scriptPath}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${process.cwd()}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logDir}/telegram-gateway.out.log</string>
    <key>StandardErrorPath</key>
    <string>${logDir}/telegram-gateway.err.log</string>
    <key>UMask</key>
    <integer>0177</integer>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>`

  const plistPath = join(dir, 'ai.fcode.telegram-gateway.plist')
  writeFileSync(plistPath, plist, { mode: 0o600 })
  console.log(`[daemon] LaunchAgent plist written to ${plistPath}`)
  console.log(`[daemon] Load with: launchctl load "${plistPath}"`)
  return plistPath
}

/**
 * Write Linux systemd user unit for auto-start on boot/login.
 * Location: ~/.config/systemd/user/openclaw-gateway.service
 */
function writeSystemdUnit(): string {
  const dir = join(homedir(), '.config', 'systemd', 'user')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const nodePath = process.execPath
  const scriptPath = join(process.cwd(), 'dist', 'entrypoints', 'gateway', 'telegram-gateway.js')
  const logDir = join(homedir(), '.aiko', 'logs')
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })

  const unit = `[Unit]
Description=fcode Telegram Gateway
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
ExecStart=${nodePath} ${scriptPath}
WorkingDirectory=${process.cwd()}
Restart=on-failure
RestartSec=5
Environment=PATH=/usr/local/bin:/usr/bin:/bin
StandardOutput=append:${logDir}/telegram-gateway.out.log
StandardError=append:${logDir}/telegram-gateway.err.log
UMask=0177

[Install]
WantedBy=default.target
`

  const unitPath = join(dir, 'fcode-telegram-gateway.service')
  writeFileSync(unitPath, unit, { mode: 0o600 })
  console.log(`[daemon] systemd unit written to ${unitPath}`)
  console.log(`[daemon] Enable with: systemctl --user enable --now fcode-telegram-gateway.service`)
  return unitPath
}

/** Write daemon config files (LaunchAgent or systemd) based on platform. */
function writeDaemonConfig(): { path: string; label: string } {
  if (isMacOS()) {
    return { path: writeLaunchAgentPlist(), label: 'LaunchAgent' }
  } else if (hasSystemd()) {
    return { path: writeSystemdUnit(), label: 'systemd' }
  }
  console.warn('[daemon] No daemon manager detected (no launchctl/systemd). Gateway will not auto-start.')
  return { path: '', label: 'none' }
}

export async function startTelegramGateway(): Promise<{ shutdown: () => Promise<void> }> {
  const token = process.env.AIKO_TELEGRAM_TOKEN
  if (!token) {
    console.error('[gw:error] AIKO_TELEGRAM_TOKEN is required')
    process.exit(1)
  }

  // DM access policy: 'pairing' (default) or 'open'
  const dmPolicy = (process.env.TELEGRAM_DM_POLICY ?? 'pairing') as 'pairing' | 'open'

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
    { token, logger: sharedLogger, polling: true, debounceMs: 2000, dmPolicy },
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

/**
 * Install the telegram gateway as a system daemon (LaunchAgent / systemd).
 * Called by CLI: `aiko-code telegram install`.
 */
export async function installTelegramGateway(): Promise<void> {
  const result = writeDaemonConfig()
  if (result.label === 'none') {
    console.log('No daemon manager detected. To auto-start manually:')
    console.log('  macOS: launchctl load ~/Library/LaunchAgents/ai.fcode.telegram-gateway.plist')
    console.log('  Linux: systemctl --user enable --now fcode-telegram-gateway.service')
    return
  }
  console.log(`[install] ${result.label} config installed at: ${result.path}`)
  console.log(`[install] Start it now with the instructions printed above.`)
}
