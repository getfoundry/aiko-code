/**
 * `aiko-code telegram` CLI subcommand.
 *
 * Starts the gateway daemon with the Telegram channel plugin,
 * or installs it as a background service (LaunchAgent/systemd).
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

import { startTelegramGateway } from '../../entrypoints/gateway/telegram-gateway.js'
import type { TelegramSubcommandOpts } from './types.js'

/* ── helpers ─────────────────────────────────────────────────── */

const TELEGRAM_RC = join(homedir(), '.aiko', 'telegram.json')

function loadConfig(): { token: string; port: number } {
  if (existsSync(TELEGRAM_RC)) {
    const raw = JSON.parse(readFileSync(TELEGRAM_RC, 'utf-8'))
    return { token: raw.token, port: Number(raw.port) || 18789 }
  }
  return { token: '', port: 18789 }
}

function writeConfig(token: string, port: number) {
  const dir = join(homedir(), '.aiko')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(TELEGRAM_RC, JSON.stringify({ token, port }, null, 2), 'utf-8')
}

function maskToken(token: string): string {
  if (token.length <= 10) return '***'
  return token.slice(0, 6) + '...' + token.slice(-4)
}

function detectOS(): 'macos' | 'linux' | 'other' {
  const platform = process.platform
  if (platform === 'darwin') return 'macos'
  if (platform === 'linux') return 'linux'
  return 'other'
}

/* ── plist builder ───────────────────────────────────────────── */

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function escBash(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

function buildLaunchAgentPlist(opts: { label: string; execPath: string; args: string[]; env: Record<string, string> }): string {
  const { label, execPath, args, env } = opts
  const argsXml = args.map(a => `        <string>${escXml(a)}</string>`).join('\n')
  const envXml = Object.entries(env).map(([k, v]) => `        <key>${escXml(k)}</key>\n        <string>${escXml(v)}</string>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>${escXml(label)}</string>
    <key>ProgramArguments</key>
    <array>
${argsXml}
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>${escXml(homedir())}/.aiko/telegram-stdout.log</string>
    <key>StandardErrorPath</key><string>${escXml(homedir())}/.aiko/telegram-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
${envXml}
    </dict>
</dict>
</plist>
`
}

function buildSystemdUnit(opts: { description: string; execPath: string; args: string[]; workingDirectory: string; env: Record<string, string> }): string {
  const { description, execPath, args, workingDirectory, env } = opts
  const execLine = `${escBash(execPath)} ${args.map(a => escBash(a)).join(' ')}`
  const envLines = Object.entries(env).map(([k, v]) => `Environment=${escBash(`${k}=${v}`)}`).join('\n')

  return `[Unit]
Description=${escBash(description)}
After=network.target

[Service]
Type=simple
ExecStart=${escBash(execLine)}
WorkingDirectory=${escBash(workingDirectory)}
Restart=on-failure
RestartSec=5
${envLines}

[Install]
WantedBy=multi-user.target
`
}

/* ── the command ───────────────────────────────────────────────── */

interface TelegramCommand {
  name: string
  description: string
  subcommands: Record<string, TelegramSubcommand>
}

interface TelegramSubcommand {
  description: string
  run: (opts: TelegramSubcommandOpts) => Promise<void>
}

const telegram: TelegramCommand = {
  name: 'telegram',
  description: 'Start aiko-code as a Telegram bot',
  subcommands: {
    start: {
      description: 'Start the gateway + Telegram bot (foreground)',
      async run(_opts: TelegramSubcommandOpts) {
        let token = process.env.AIKO_TELEGRAM_TOKEN ?? ''
        if (!token) {
          const rc = loadConfig()
          token = rc.token
        }
        if (!token) {
          console.error('[error] AIKO_TELEGRAM_TOKEN is required')
          console.error('  Set it as an env var, or:')
          console.error('    aiko-code telegram install  (writes ~/.aiko/telegram.json)')
          process.exit(1)
        }

        const port = parseInt(process.env.AIKO_GATEWAY_PORT ?? String(loadConfig().port), 10)

        process.env.AIKO_TELEGRAM_TOKEN = token
        process.env.AIKO_GATEWAY_PORT = String(port)

        console.log(`telegram: starting gateway + telegram channel`)
        console.log(`  token=${maskToken(token)}`)
        console.log(`  port=${port}`)

        const { shutdown } = await startTelegramGateway()

        console.log('telegram: running — press Ctrl+C to stop')

        let isShuttingDown = false
        const graceful = async (sig: string) => {
          if (isShuttingDown) return
          isShuttingDown = true
          console.log(`telegram: ${sig} received, shutting down…`)
          try { await shutdown() } catch (err) { console.error('telegram: shutdown error:', err) }
          process.exit(0)
        }

        process.on('SIGTERM', () => graceful('SIGTERM'))
        process.on('SIGINT', () => graceful('SIGINT'))
      },
    },

    install: {
      description: 'Install as a background service (LaunchAgent/systemd)',
      async run(_opts: TelegramSubcommandOpts) {
        const token = process.env.AIKO_TELEGRAM_TOKEN || ''
        const port = parseInt(process.env.AIKO_GATEWAY_PORT ?? '18789', 10)

        if (!token) {
          console.error('[error] AIKO_TELEGRAM_TOKEN is required')
          console.error('  aiko-code telegram install --token=BOT_TOKEN')
          console.error('  or: AIKO_TELEGRAM_TOKEN=... aiko-code telegram install')
          process.exit(1)
        }

        writeConfig(token, port)
        console.log(`config written: ${TELEGRAM_RC}`)

        const os = detectOS()
        const nodeBin = process.execPath
        const aikoBin = join(process.cwd(), 'dist', 'cli', 'cli.js')

        if (os === 'macos') {
          const label = 'com.aiko-code.telegram'
          const plistDir = join(homedir(), 'Library', 'LaunchAgents')
          const plistPath = join(plistDir, `${label}.plist`)

          if (!existsSync(plistDir)) mkdirSync(plistDir, { recursive: true })

          const plist = buildLaunchAgentPlist({
            label, execPath: nodeBin,
            args: [aikoBin, 'telegram', 'start'],
            env: {
              AIKO_TELEGRAM_TOKEN: token, AIKO_GATEWAY_PORT: String(port),
              PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
              NODE_ENV: 'production',
            },
          })

          writeFileSync(plistPath, plist, 'utf-8')
          console.log(`plist written: ${plistPath}`)

          try {
            execSync(`launchctl load "${plistPath}"`, { stdio: 'inherit' })
            console.log('service loaded — use `aiko-code telegram start` to verify')
          } catch (err) {
            console.error('launchctl load failed:', err)
          }
        } else if (os === 'linux') {
          const unitName = 'aiko-code-telegram.service'
          const unitPath = `/etc/systemd/system/${unitName}`

          const unit = buildSystemdUnit({
            description: 'aiko-code Telegram gateway',
            execPath: nodeBin, args: [aikoBin, 'telegram', 'start'],
            workingDirectory: process.cwd(),
            env: {
              AIKO_TELEGRAM_TOKEN: token, AIKO_GATEWAY_PORT: String(port),
              PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
              NODE_ENV: 'production',
              HOME: homedir(),
              USER: process.env.USER ?? homedir().split('/').pop() ?? 'aiko',
            },
          })

          writeFileSync(unitPath, unit, 'utf-8')
          console.log(`systemd unit written: ${unitPath}`)
          console.log('Reload daemon, enable and start:')
          console.error('  sudo systemctl daemon-reload')
          console.error('  sudo systemctl enable --now aiko-code-telegram.service')
        } else {
          console.error('[warn] unsupported platform — write your own service file')
          process.exit(1)
        }
      },
    },

    uninstall: {
      description: 'Remove the background service',
      async run(_opts: TelegramSubcommandOpts) {
        const os = detectOS()

        if (os === 'macos') {
          const label = 'com.aiko-code.telegram'
          const plistDir = join(homedir(), 'Library', 'LaunchAgents')
          const plistPath = join(plistDir, `${label}.plist`)

          if (existsSync(plistPath)) {
            try {
              execSync(`launchctl unload "${plistPath}"`, { stdio: 'inherit' })
              unlinkSync(plistPath)
              console.log(`plist removed: ${plistPath}`)
            } catch (err) { console.error('launchctl unload failed:', err) }
          } else { console.log('no LaunchAgent plist found — nothing to remove') }

          if (existsSync(TELEGRAM_RC)) { unlinkSync(TELEGRAM_RC); console.log(`config removed: ${TELEGRAM_RC}`) }
        } else if (os === 'linux') {
          const unitName = 'aiko-code-telegram.service'
          const unitPath = `/etc/systemd/system/${unitName}`

          try { execSync(`sudo systemctl stop ${unitName}`, { stdio: 'inherit' }) } catch { console.error('(service was not running or not found)') }
          try { execSync(`sudo systemctl disable ${unitName}`, { stdio: 'inherit' }) } catch { /* ignore */ }

          if (existsSync(unitPath)) {
            try { execSync(`sudo rm "${unitPath}"`, { stdio: 'inherit' }) } catch { /* ignore */ }
            try { execSync('sudo systemctl daemon-reload', { stdio: 'inherit' }) } catch { /* ignore */ }
            console.log(`systemd unit removed: ${unitPath}`)
          } else { console.log('no systemd unit found — nothing to remove') }

          if (existsSync(TELEGRAM_RC)) { unlinkSync(TELEGRAM_RC); console.log(`config removed: ${TELEGRAM_RC}`) }
        } else {
          console.error('[warn] unsupported platform')
          process.exit(1)
        }
      },
    },
  },
}

export default telegram
