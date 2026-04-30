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

  // Subprocess-based engine: shells out to `aiko-code -p` per message, the
  // same code path the interactive REPL exercises (and proven to work). The
  // in-process QueryEngine route is unsuitable here — it requires hundreds
  // of dependencies (auth, MCP, hooks, settings, output styles, file cache,
  // app state) wired up the way print.ts does. Replicating that inline is a
  // multi-day refactor; subprocess gives us the right behavior immediately.
  //
  // sessionKey -> stable UUIDv4-shaped id so --resume reuses the conversation
  const { spawn } = await import('node:child_process')
  const { createHash } = await import('node:crypto')
  const sessionUuids = new Map<string, string>()

  function uuidForSession(sessionKey: string): string {
    const cached = sessionUuids.get(sessionKey)
    if (cached) return cached
    const h = createHash('sha256').update(sessionKey).digest('hex')
    // Format as RFC4122-ish UUID (version/variant bits not strictly enforced
    // by the CLI's --session-id parser, but kept canonical-shaped):
    const uuid =
      `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-` +
      `8${h.slice(17, 20)}-${h.slice(20, 32)}`
    sessionUuids.set(sessionKey, uuid)
    return uuid
  }

  const aikoBin = process.env.AIKO_CODE_BIN ?? 'aiko-code'

  // Tracks which session UUIDs already have a saved transcript so we only
  // pass --resume on follow-up messages. Seeded from disk so gateway
  // restarts don't try to recreate an existing session (errors with
  // "Session ID already in use").
  const sessionEstablished = new Set<string>()
  try {
    const { readdirSync } = await import('node:fs')
    const projectsDir = `${process.env.HOME}/.aiko/projects`
    for (const proj of readdirSync(projectsDir)) {
      try {
        for (const f of readdirSync(`${projectsDir}/${proj}`)) {
          const m = f.match(/^([0-9a-f-]{36})\.jsonl$/)
          if (m) sessionEstablished.add(m[1])
        }
      } catch { /* ignore unreadable subdirs */ }
    }
    logger.info(`telegram: seeded sessionEstablished with ${sessionEstablished.size} known sessions`)
  } catch (err) {
    logger.warn?.(`telegram: could not seed sessionEstablished: ${err}`)
  }

  // Detect a codebase root for self-aware system prompt. Defaults to the
  // gateway's cwd if it looks like a git repo, else AIKO_CODE_REPO env, else
  // the bin's repo (resolved from process.execPath/argv[1] when running from
  // a checkout — symlinks via realpath).
  function detectCodebase(): string | null {
    const env = process.env.AIKO_CODE_REPO
    if (env) return env
    try {
      const { existsSync, realpathSync } = require('node:fs')
      const path = require('node:path')
      const candidates: string[] = [process.cwd()]
      // Resolve argv[1] through symlinks so a global symlink at /opt/.../bin/aiko-code
      // pointing at /Users/.../fcode/bin/aiko-code lands inside the repo.
      try {
        const resolved = realpathSync(process.argv[1] ?? '')
        candidates.push(path.dirname(resolved))
      } catch { /* ignore */ }
      candidates.push(path.dirname(process.argv[1] ?? ''))
      // Walk up several levels from each candidate looking for repo markers.
      const seen = new Set<string>()
      const walk = (start: string) => {
        let cur = start
        for (let i = 0; i < 6; i++) {
          if (seen.has(cur)) break
          seen.add(cur)
          if (existsSync(`${cur}/package.json`) && existsSync(`${cur}/.git`)) return cur
          cur = path.dirname(cur)
        }
        return null
      }
      for (const c of candidates) {
        const hit = walk(c)
        if (hit) return hit
      }
    } catch { /* best effort */ }
    return null
  }
  const codebaseRoot = detectCodebase()

  // Load self-knowledge content once at startup so the system prompt is
  // pre-populated with what aiko-code IS, rather than just pointing at a
  // directory and hoping the model greps. README is the canonical source
  // of "what this project does"; AIKO.md (if present) holds session-state
  // and live engineering notes.
  let selfKnowledge = ''
  if (codebaseRoot) {
    try {
      const fs = await import('node:fs')
      const readSafe = (p: string, max = 12_000): string => {
        try {
          const text = fs.readFileSync(p, 'utf-8')
          return text.length > max ? text.slice(0, max) + `\n... [truncated, full file at ${p}]` : text
        } catch { return '' }
      }
      const readme = readSafe(`${codebaseRoot}/README.md`, 16_000)
      const aikoMd = readSafe(`${codebaseRoot}/AIKO.md`, 8_000)
      const pkgRaw = readSafe(`${codebaseRoot}/package.json`, 4_000)
      let pkgSummary = ''
      try {
        const pkg = JSON.parse(pkgRaw) as { name?: string; version?: string; description?: string }
        pkgSummary = `Name: ${pkg.name}\nVersion: ${pkg.version}\nDescription: ${pkg.description}`
      } catch { /* ignore */ }

      const parts: string[] = []
      if (pkgSummary) parts.push(`## package.json\n${pkgSummary}`)
      if (readme) parts.push(`## README.md\n${readme}`)
      if (aikoMd) parts.push(`## AIKO.md (live engineering notes)\n${aikoMd}`)
      selfKnowledge = parts.join('\n\n')
    } catch (err) {
      logger.warn?.(`telegram: could not load self-knowledge: ${err}`)
    }
  }

  if (codebaseRoot) {
    logger.info(`telegram: codebase-aware mode — root=${codebaseRoot} self-knowledge=${selfKnowledge.length}b`)
  } else {
    logger.info(`telegram: no codebase detected — set AIKO_CODE_REPO to enable self-aware mode`)
  }

  async function* engineRoute(
    sessionKey: string,
    message: string,
  ): AsyncGenerator<string> {
    const sessionId = uuidForSession(sessionKey)
    const isFirst = !sessionEstablished.has(sessionId)
    const codebasePrompt = codebaseRoot
      ? `You are aiko-code, an AI coding assistant, currently running as a Telegram bot.\n`
        + `Your own codebase lives at: ${codebaseRoot}\n\n`
        + `# Self-knowledge — the following is your own README/AIKO.md/package.json, baked in at gateway startup so you know what you are without needing to read files first:\n\n`
        + `${selfKnowledge}\n\n`
        + `# Working in your own codebase\n`
        + `When asked about your features, code, or behavior, you can answer directly from the self-knowledge above. `
        + `For specifics, use Read/Grep on files inside ${codebaseRoot}. Key entry points:\n`
        + `  - src/entrypoints/gateway/telegram-gateway.ts  (this gateway — sessions, system prompt, subprocess engine)\n`
        + `  - src/channels/telegram/telegramChannel.ts     (Telegram polling + pairing + allowlist)\n`
        + `  - src/commands/telegram/telegram.ts             (CLI subcommands: start, install, approve, pending)\n`
        + `  - src/QueryEngine.ts                            (core query loop)\n\n`
        + `# Reply style\n`
        + `Replies appear in Telegram. Keep them short by default — expand only when the user asks for detail. Do not use Markdown headings or code fences for short replies.`
      : `You are aiko-code, an AI coding assistant, running as a Telegram bot. `
        + `Replies appear in Telegram, so keep them concise by default.`
    const args = [
      '--print',
      '--dangerously-skip-permissions',
      '--append-system-prompt', codebasePrompt,
      ...(codebaseRoot ? ['--add-dir', codebaseRoot] : []),
      ...(isFirst ? ['--session-id', sessionId] : ['--resume', sessionId]),
      message,
    ]
    logger.info(`telegram: spawning ${aikoBin} (session=${sessionId.slice(0,8)} first=${isFirst} codebase=${codebaseRoot ? 'yes' : 'no'})`)
    const child = spawn(aikoBin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      cwd: codebaseRoot ?? process.cwd(),
    })
    sessionEstablished.add(sessionId)

    const stderrChunks: string[] = []
    child.stderr.on('data', (d: Buffer) => stderrChunks.push(d.toString()))

    // Stream stdout chunks as they arrive.
    let resolveChunk: ((v: { value: string; done: boolean }) => void) | null = null
    const pendingChunks: string[] = []
    let finished = false
    let exitErr: Error | null = null

    child.stdout.on('data', (d: Buffer) => {
      const chunk = d.toString()
      if (resolveChunk) {
        const r = resolveChunk
        resolveChunk = null
        r({ value: chunk, done: false })
      } else {
        pendingChunks.push(chunk)
      }
    })

    child.on('close', (code) => {
      finished = true
      if (code !== 0) {
        exitErr = new Error(
          `aiko-code exited ${code}: ${stderrChunks.join('').slice(-500)}`,
        )
      }
      if (resolveChunk) {
        const r = resolveChunk
        resolveChunk = null
        r({ value: '', done: true })
      }
    })

    child.on('error', (err) => {
      finished = true
      exitErr = err
      if (resolveChunk) {
        const r = resolveChunk
        resolveChunk = null
        r({ value: '', done: true })
      }
    })

    while (true) {
      if (pendingChunks.length > 0) {
        yield pendingChunks.shift()!
        continue
      }
      if (finished) {
        if (exitErr) throw exitErr
        return
      }
      const next = await new Promise<{ value: string; done: boolean }>(
        (resolve) => { resolveChunk = resolve },
      )
      if (next.done) {
        if (exitErr) throw exitErr
        return
      }
      if (next.value) yield next.value
    }
  }

  // Create gateway server. The factory returns a stub QueryEngine — gateway's
  // routeMessage path is overridden below by passing engineRoute directly to
  // the telegram channel.
  const gateway = await createGatewayServer(
    { port, bind, mode: 'remote' },
    (_cfg: any) => ({ submitMessage: () => (async function*(){})() } as any),
  )

  // Create telegram channel, wiring the subprocess engine as the handler.
  const telegram = await createTelegramChannel(
    { token, logger: sharedLogger, polling: true, debounceMs: 2000, dmPolicy },
    engineRoute,
  )

  // Register telegram as a known channel on the gateway
  gateway.registerChannel('telegram', {
    onMessage(_sessionKey: string, _content: string) {
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
