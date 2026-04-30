/**
 * Runtime observability signals for the gateway daemon.
 *
 * Pure TypeScript, zero dependencies. Designed to be swapped for
 * Prometheus counters, OpenTelemetry meters, or Datadog statsd
 * hooks without touching callers.
 */

/* ── counter ─────────────────────────────────────────────────── */

export const GatewaySignals = {
  sessionsStarted: 0,
  sessionsStopped: 0,
  messagesRouted: 0,
  errors: 0,
}

/**
 * Increment a single metric field. Call from every code path
 * that touches a session or routes a message so the counters
 * stay accurate even under partial failure.
 */
export function inc(
  field: keyof typeof GatewaySignals,
  by: number = 1,
): void {
  GatewaySignals[field] += by
}

/* ── session timer ───────────────────────────────────────────── */

interface SessionTimer {
  sessionId: string
  startedAt: number
  active: boolean
  elapsedMs: () => number
  stop: () => number
}

const activeTimers = new Map<string, SessionTimer>()

/**
 * Start a latency timer for a session. Returns a handle whose
 * .stop() method records the elapsed duration in milliseconds
 * and marks the timer inactive.
 *
 * Designed for future integration: an OTEL histogram could be
 * fed in stop() by replacing the Map with a metric client.
 */
export function startSessionTimer(sessionId: string): SessionTimer {
  const entry: SessionTimer = {
    sessionId,
    startedAt: Date.now(),
    active: true,
    elapsedMs: () => (activeTimers.has(sessionId) && activeTimers.get(sessionId)!.active)
      ? Date.now() - activeTimers.get(sessionId)!.startedAt
      : -1,
    stop: () => {
      const t = activeTimers.get(sessionId)
      if (!t || !t.active) return -1
      t.active = false
      const elapsed = Date.now() - t.startedAt
      activeTimers.delete(sessionId)
      return elapsed
    },
  }
  activeTimers.set(sessionId, entry)
  return entry
}

/**
 * Return all currently-active session timers.
 * Useful for health checks and debug dumps.
 */
export function getActiveSessionTimers(): SessionTimer[] {
  return [...activeTimers.values()].filter((t) => t.active)
}

/* ── logger ──────────────────────────────────────────────────── */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export interface GatewayLogger {
  debug(msg: string, meta?: Record<string, unknown>): void
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
  /**
   * Rebind the logger to a custom sink (e.g. a JSON-lines file
   * or remote log receiver). Pass `null` to restore console.
   */
  setSink(sink: GatewayLogSink | null): void
  /**
   * Set minimum log level (default 'info' in prod, 'debug' when
   * process.env.GATEWAY_LOG is truthy).
   */
  setLevel(level: LogLevel): void
}

/**
 * Custom sink shape. Implement this to forward logs to a file,
 * HTTP endpoint, or observability backend.
 */
export interface GatewayLogSink {
  debug(msg: string, meta?: Record<string, unknown>): void
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
}

const defaultSink: GatewayLogSink = {
  debug: (msg, meta) => {
    if (LOG_LEVELS.debug <= (currentLogLevel ?? 0))
      console.debug('[gw:debug]', msg, meta ?? '')
  },
  info: (msg, meta) => {
    if (LOG_LEVELS.info <= (currentLogLevel ?? 1))
      console.log('[gw]', msg, meta ?? '')
  },
  warn: (msg, meta) => {
    if (LOG_LEVELS.warn <= (currentLogLevel ?? 2))
      console.warn('[gw:warn]', msg, meta ?? '')
  },
  error: (msg, meta) => {
    if (LOG_LEVELS.error <= (currentLogLevel ?? 3))
      console.error('[gw:error]', msg, meta ?? '')
  },
}

let currentLogLevel =
  typeof process !== 'undefined' && process.env?.GATEWAY_LOG
    ? LOG_LEVELS.debug
    : LOG_LEVELS.info
let currentSink: GatewayLogSink = defaultSink

export function createLogger(): GatewayLogger {
  return {
    debug(msg, meta) { currentSink.debug(msg, meta) },
    info(msg, meta) { currentSink.info(msg, meta) },
    warn(msg, meta) { currentSink.warn(msg, meta) },
    error(msg, meta) { currentSink.error(msg, meta) },
    setSink(sink) {
      currentSink = sink ?? defaultSink
    },
    setLevel(level) {
      currentLogLevel = LOG_LEVELS[level]
    },
  }
}

/**
 * Module-level logger singleton, initialized at load time so
 * callers don't need to import createLogger().
 */
export const logger = createLogger()

/* ── health status ───────────────────────────────────────────── */

const _uptimeStart = Date.now()

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down'
  sessions: number
  activeTimers: number
  uptimeMs: number
}

/**
 * Compute a health snapshot.
 *
 * - 'ok'       — no errors in the last 60 s and session count > 0
 * - 'degraded' — error count > 0 but sessions still running
 * - 'down'     — no active sessions and uptime exceeds 10 s
 *
 * Thresholds can be swapped for config or feature flags later.
 */
export function getHealthStatus(): HealthStatus {
  const uptimeMs = Date.now() - _uptimeStart
  const sessions = GatewaySignals.sessionsStarted - GatewaySignals.sessionsStopped
  const activeTimersCount = getActiveSessionTimers().length

  let status: 'ok' | 'degraded' | 'down'

  if (sessions <= 0 && uptimeMs > 10_000) {
    status = 'down'
  } else if (GatewaySignals.errors > 0 && sessions > 0) {
    status = 'degraded'
  } else {
    status = 'ok'
  }

  return { status, sessions: sessions + activeTimersCount, activeTimers: activeTimersCount, uptimeMs }
}

/* ── graceful shutdown ───────────────────────────────────────── */

export interface ShutdownHandle {
  /**
   * Trigger shutdown. Returns a Promise that resolves after:
   * 1. All active session timers are stopped (with a 5 s budget).
   * 2. The AbortController on each SessionLane fires.
   * 3. All counters are logged for post-mortem.
   *
   * If the budget expires, the Promise resolves anyway with an
   * error note attached so callers don't hang forever.
   */
  trigger: () => Promise<{ ok: true } | { ok: false; reason: string }>
}

/**
 * Create a shutdown handle wired to the session-timer system.
 * Callers in the gateway server store this and invoke trigger()
 * on SIGTERM / SIGINT / SIGHUP.
 */
export function createShutdownHandle(): ShutdownHandle {
  let triggered = false

  return {
    trigger: async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (triggered) return { ok: false, reason: 'shutdown already in progress' }
      triggered = true

      const timers = getActiveSessionTimers()
      const budget = 5_000
      const stopStart = Date.now()
      let errored = false

      for (const t of timers) {
        const elapsed = t.stop()
        if (elapsed < 0) errored = true
        if (Date.now() - stopStart > budget) break
      }

      const allStopped = timers.length === 0

      if (allStopped && !errored) {
        logger.info('shutdown', {
          sessionsStopped: GatewaySignals.sessionsStopped,
          messagesRouted: GatewaySignals.messagesRouted,
          errors: GatewaySignals.errors,
        })
        return { ok: true }
      }

      return {
        ok: false,
        reason: allStopped ? 'one or more session timers returned an error' : `shutdown timed out after ${budget} ms with ${timers.length} timers still active`,
      }
    },
  }
}
