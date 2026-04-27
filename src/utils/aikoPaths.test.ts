import { afterEach, describe, expect, mock, test } from 'bun:test'
import * as fsPromises from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const originalEnv = { ...process.env }
const originalArgv = [...process.argv]

async function importFreshEnvUtils() {
  return import(`./envUtils.ts?ts=${Date.now()}-${Math.random()}`)
}

async function importFreshSettings() {
  return import(`./settings/settings.ts?ts=${Date.now()}-${Math.random()}`)
}

async function importFreshLocalInstaller() {
  return import(`./localInstaller.ts?ts=${Date.now()}-${Math.random()}`)
}

afterEach(() => {
  process.env = { ...originalEnv }
  process.argv = [...originalArgv]
  mock.restore()
})

describe('aiko-code paths', () => {
  test('defaults user config home to ~/.aiko-code', async () => {
    delete process.env.aiko_CONFIG_DIR
    const { resolveaikoConfigHomeDir } = await importFreshEnvUtils()

    expect(
      resolveaikoConfigHomeDir({
        homeDir: homedir(),
        aiko-codeExists: true,
        legacyaikoExists: false,
      }),
    ).toBe(join(homedir(), '.aiko-code'))
  })

  test('falls back to ~/.aiko when legacy config exists and ~/.aiko-code does not', async () => {
    delete process.env.aiko_CONFIG_DIR
    const { resolveaikoConfigHomeDir } = await importFreshEnvUtils()

    expect(
      resolveaikoConfigHomeDir({
        homeDir: homedir(),
        aiko-codeExists: false,
        legacyaikoExists: true,
      }),
    ).toBe(join(homedir(), '.aiko'))
  })

  test('uses aiko_CONFIG_DIR override when provided', async () => {
    process.env.aiko_CONFIG_DIR = '/tmp/custom-aiko-code'
    const { getaikoConfigHomeDir, resolveaikoConfigHomeDir } =
      await importFreshEnvUtils()

    expect(getaikoConfigHomeDir()).toBe('/tmp/custom-aiko-code')
    expect(
      resolveaikoConfigHomeDir({
        configDirEnv: '/tmp/custom-aiko-code',
      }),
    ).toBe('/tmp/custom-aiko-code')
  })

  test('project and local settings paths use .aiko-code', async () => {
    const { getRelativeSettingsFilePathForSource } = await importFreshSettings()

    expect(getRelativeSettingsFilePathForSource('projectSettings')).toBe(
      '.aiko/settings.json',
    )
    expect(getRelativeSettingsFilePathForSource('localSettings')).toBe(
      '.aiko/settings.local.json',
    )
  })

  test('local installer uses aiko-code wrapper path', async () => {
    // Force .aiko-code config home so the test doesn't fall back to
    // ~/.aiko when ~/.aiko-code doesn't exist on this machine.
    process.env.aiko_CONFIG_DIR = join(homedir(), '.aiko-code')
    const { getLocalaikoPath } = await importFreshLocalInstaller()

    expect(getLocalaikoPath()).toBe(
      join(homedir(), '.aiko-code', 'local', 'aiko-code'),
    )
  })

  test('local installation detection matches .aiko-code path', async () => {
    const { isManagedLocalInstallationPath } =
      await importFreshLocalInstaller()

    expect(
      isManagedLocalInstallationPath(
        `${join(homedir(), '.aiko-code', 'local')}/node_modules/.bin/aiko-code`,
      ),
    ).toBe(true)
  })

  test('local installation detection still matches legacy .aiko path', async () => {
    const { isManagedLocalInstallationPath } =
      await importFreshLocalInstaller()

    expect(
      isManagedLocalInstallationPath(
        `${join(homedir(), '.aiko', 'local')}/node_modules/.bin/aiko-code`,
      ),
    ).toBe(true)
  })

  test('candidate local install dirs include both aiko-code and legacy aiko paths', async () => {
    const { getCandidateLocalInstallDirs } = await importFreshLocalInstaller()

    expect(
      getCandidateLocalInstallDirs({
        configHomeDir: join(homedir(), '.aiko-code'),
        homeDir: homedir(),
      }),
    ).toEqual([
      join(homedir(), '.aiko-code', 'local'),
      join(homedir(), '.aiko', 'local'),
    ])
  })

  test('legacy local installs are detected when they still expose the aiko binary', async () => {
    mock.module('fs/promises', () => ({
      ...fsPromises,
      access: async (path: string) => {
        if (
          path === join(homedir(), '.aiko', 'local', 'node_modules', '.bin', 'aiko')
        ) {
          return
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      },
    }))

    const { getDetectedLocalInstallDir, localInstallationExists } =
      await importFreshLocalInstaller()

    expect(await localInstallationExists()).toBe(true)
    expect(await getDetectedLocalInstallDir()).toBe(
      join(homedir(), '.aiko', 'local'),
    )
  })
})
