import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const originalEnv = {
  aiko_CONFIG_DIR: process.env.aiko_CONFIG_DIR,
  aiko_CODE_CUSTOM_OAUTH_URL: process.env.aiko_CODE_CUSTOM_OAUTH_URL,
  USER_TYPE: process.env.USER_TYPE,
}

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'aiko-code-env-test-'))
  process.env.aiko_CONFIG_DIR = tempDir
  delete process.env.aiko_CODE_CUSTOM_OAUTH_URL
  delete process.env.USER_TYPE
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
  if (originalEnv.aiko_CONFIG_DIR === undefined) {
    delete process.env.aiko_CONFIG_DIR
  } else {
    process.env.aiko_CONFIG_DIR = originalEnv.aiko_CONFIG_DIR
  }
  if (originalEnv.aiko_CODE_CUSTOM_OAUTH_URL === undefined) {
    delete process.env.aiko_CODE_CUSTOM_OAUTH_URL
  } else {
    process.env.aiko_CODE_CUSTOM_OAUTH_URL = originalEnv.aiko_CODE_CUSTOM_OAUTH_URL
  }
  if (originalEnv.USER_TYPE === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = originalEnv.USER_TYPE
  }
})

async function importFreshEnvModule() {
  return import(`./env.js?ts=${Date.now()}-${Math.random()}`)
}

// getGlobalaikoFile — three migration branches

test('getGlobalaikoFile: new install returns .aiko.json when neither file exists', async () => {
  const { getGlobalaikoFile } = await importFreshEnvModule()
  expect(getGlobalaikoFile()).toBe(join(tempDir, '.aiko.json'))
})

test('getGlobalaikoFile: existing user keeps .aiko.json when only legacy file exists', async () => {
  writeFileSync(join(tempDir, '.aiko.json'), '{}')
  const { getGlobalaikoFile } = await importFreshEnvModule()
  expect(getGlobalaikoFile()).toBe(join(tempDir, '.aiko.json'))
})

test('getGlobalaikoFile: migrated user uses .aiko.json when both files exist', async () => {
  writeFileSync(join(tempDir, '.aiko.json'), '{}')
  writeFileSync(join(tempDir, '.aiko.json'), '{}')
  const { getGlobalaikoFile } = await importFreshEnvModule()
  expect(getGlobalaikoFile()).toBe(join(tempDir, '.aiko.json'))
})
