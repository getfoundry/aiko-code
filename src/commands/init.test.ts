import { afterEach, expect, mock, test } from 'bun:test'

const originalaikoCodeNewInit = process.env.aiko_CODE_NEW_INIT

async function importInitCommand() {
  return (await import(`./init.ts?ts=${Date.now()}-${Math.random()}`)).default
}

afterEach(() => {
  mock.restore()

  if (originalaikoCodeNewInit === undefined) {
    delete process.env.aiko_CODE_NEW_INIT
  } else {
    process.env.aiko_CODE_NEW_INIT = originalaikoCodeNewInit
  }
})

test('NEW_INIT prompt preserves existing root aiko.md by default', async () => {
  process.env.aiko_CODE_NEW_INIT = '1'

  mock.module('../projectOnboardingState.js', () => ({
    maybeMarkProjectOnboardingComplete: () => {},
  }))
  mock.module('./initMode.js', () => ({
    isNewInitEnabled: () => true,
  }))

  const command = await importInitCommand()
  const blocks = await command.getPromptForCommand()

  expect(blocks).toHaveLength(1)
  expect(blocks[0]?.type).toBe('text')
  expect(String(blocks[0]?.text)).toContain(
    'checked-in root `aiko.md` and does NOT already have a root `AGENTS.md`',
  )
  expect(String(blocks[0]?.text)).toContain(
    'do NOT silently create a second root instruction file',
  )
  expect(String(blocks[0]?.text)).toContain(
    'update the existing root `aiko.md` in place by default',
  )
})
