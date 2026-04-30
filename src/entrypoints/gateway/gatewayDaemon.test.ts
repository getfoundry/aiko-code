import { expect, test, describe, mock } from 'bun:test'
import { createGatewayServer } from './gatewayDaemon.js'
import type { QueryEngine } from '../../QueryEngine.js'

// Minimal mock QueryEngine with all methods stubbed to return immediately.
function mockQueryEngine(): QueryEngine {
  return {
    submitMessage: async function* () {
      yield 'done'
    },
    on: () => {},
    off: () => {},
    toJSON: () => ({}),
  } as unknown as QueryEngine
}

describe('createGatewayServer', () => {
  const config = { port: 18789, logger: { info: () => {}, error: () => {} } }

  test('returns a GatewayServer with all required methods', async () => {
    const server = await createGatewayServer(config, mockQueryEngine)

    expect(typeof server.start).toBe('function')
    expect(typeof server.stop).toBe('function')
    expect(typeof server.routeMessage).toBe('function')
    expect(typeof server.registerChannel).toBe('function')
    expect(typeof server.listSessions).toBe('function')
  })

  test('start() logs the port on start', async () => {
    const logs: string[] = []
    const server = await createGatewayServer(
      { port: 19999, logger: { info: (m: string) => logs.push(m), error: () => {} } },
      mockQueryEngine,
    )

    await server.start()
    expect(logs).toContain('gateway: start on port 19999')
  })

  test('start() uses default port 18789 when not provided', async () => {
    const logs: string[] = []
    const server = await createGatewayServer(
      { logger: { info: (m: string) => logs.push(m), error: () => {} } },
      mockQueryEngine,
    )

    await server.start()
    expect(logs).toContain('gateway: start on port 18789')
  })

  test('stop() aborts all session lanes and logs', async () => {
    const logs: string[] = []
    const server = await createGatewayServer(
      { port: 18789, logger: { info: (m: string) => logs.push(m), error: () => {} } },
      mockQueryEngine,
    )

    await server.start()

    // Create a lane by routing a message
    const gen = server.routeMessage('test-key-1', 'hello')
    // Consume the generator to drive lane creation
    for await (const _chunk of gen) { /* drain */ }

    // Verify lane exists
    expect(server.listSessions()).toContain('test-key-1')

    await server.stop()
    expect(logs).toContain('gateway: stopped')
    // After stop, lanes should be cleared
    expect(server.listSessions()).toEqual([])
  })

  test('routeMessage creates a new lane for unknown session keys', async () => {
    const server = await createGatewayServer(config, mockQueryEngine)
    await server.start()

    const sessionKey = 'agent:main:test:new-session'
    const gen = server.routeMessage(sessionKey, 'new session message')

    // Consume the generator
    const results = []
    for await (const chunk of gen) {
      results.push(chunk)
    }

    expect(results).toContain('done')
    expect(server.listSessions()).toContain(sessionKey)
  })

  test('routeMessage reuses existing lanes for the same session key', async () => {
    const factoryCalls: string[] = []
    const server = await createGatewayServer(
      config,
      (cfg: any) => {
        factoryCalls.push(cfg.appendSystemPrompt)
        return mockQueryEngine()
      },
    )

    await server.start()

    const sessionKey = 'agent:main:test:reuse'
    const msg1 = 'first message'
    const msg2 = 'second message'

    // First message — should call factory
    for await (const _ of server.routeMessage(sessionKey, msg1)) { /* drain */ }
    expect(factoryCalls).toHaveLength(1)

    // Second message — should reuse existing lane, factory NOT called again
    for await (const _ of server.routeMessage(sessionKey, msg2)) { /* drain */ }
    expect(factoryCalls).toHaveLength(1) // still 1
  })

  test('routeMessage includes session key in appendSystemPrompt', async () => {
    let capturedPrompt = ''
    const server = await createGatewayServer(
      config,
      (cfg: any) => {
        capturedPrompt = cfg.appendSystemPrompt
        return mockQueryEngine()
      },
    )

    await server.start()

    const sessionKey = 'agent:main:telegram:dm:99999'
    for await (const _ of server.routeMessage(sessionKey, 'test')) { /* drain */ }

    expect(capturedPrompt).toBe('[session:agent:main:telegram:dm:99999]')
  })

  test('listSessions returns active session keys', async () => {
    const server = await createGatewayServer(config, mockQueryEngine)
    await server.start()

    // Initially empty
    expect(server.listSessions()).toEqual([])

    // Create lanes for different sessions
    for await (const _ of server.routeMessage('session-a', 'msg')) { /* drain */ }
    for await (const _ of server.routeMessage('session-b', 'msg')) { /* drain */ }
    for await (const _ of server.routeMessage('session-c', 'msg')) { /* drain */ }

    const sessions = server.listSessions()
    expect(sessions).toContain('session-a')
    expect(sessions).toContain('session-b')
    expect(sessions).toContain('session-c')
    expect(sessions.length).toBe(3)
  })

  test('registerChannel stores channel handlers', async () => {
    const server = await createGatewayServer(config, mockQueryEngine)
    await server.start()

    const handler = {
      onMessage: (sessionKey: string, content: string) => {
        /* no-op for test */
      },
    }

    server.registerChannel('telegram', handler)

    // The channels map is internal, but we verify no error was thrown
    // and that we can call registerChannel again for a different name
    server.registerChannel('webhook', {
      onMessage: () => {},
    })
  })

  test('gateway uses default port constant when config.port is undefined', async () => {
    // Verify the default port constant is 18789
    const logs: string[] = []
    const server = await createGatewayServer(
      { logger: { info: (m: string) => logs.push(m), error: () => {} } },
      mockQueryEngine,
    )

    await server.start()
    expect(logs[0]).toMatch(/18789/)
  })
})
