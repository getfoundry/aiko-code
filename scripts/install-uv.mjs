#!/usr/bin/env node
/**
 * Download the uv binary for the current platform into dist/bin/uv (or uv.exe).
 *
 * Called by scripts/build.ts after the bun bundle step. Platform-detected at
 * build time — when aiko-code is published or symlink-installed locally, the
 * uv binary in dist/bin matches the host that ran the build. Cross-platform
 * publishing requires per-platform npm packages or runtime download — out of
 * scope for the bundled-binary approach (Option C from the design discussion).
 *
 * uv release archives: https://github.com/astral-sh/uv/releases/latest
 *
 * On failure (network down, unsupported platform, archive layout changed),
 * the script logs a warning and exits 0 — the build continues. The CLI's
 * runtime path-prepend (uvBootstrap.ts) is a no-op when dist/bin/uv is
 * missing, falling back to the system PATH.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const DIST_BIN = join(REPO_ROOT, 'dist', 'bin')

function detectTriple() {
  const { platform, arch } = process
  if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin'
  if (platform === 'darwin' && arch === 'x64') return 'x86_64-apple-darwin'
  if (platform === 'linux' && arch === 'x64') return 'x86_64-unknown-linux-gnu'
  if (platform === 'linux' && arch === 'arm64') return 'aarch64-unknown-linux-gnu'
  if (platform === 'win32' && arch === 'x64') return 'x86_64-pc-windows-msvc'
  return null
}

function isOnPath(cmd) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

async function download(url, destPath) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`download ${url} → ${res.status} ${res.statusText}`)
  }
  const buf = new Uint8Array(await res.arrayBuffer())
  const fs = await import('node:fs')
  fs.writeFileSync(destPath, buf)
}

async function main() {
  const triple = detectTriple()
  if (!triple) {
    console.warn(
      `[install-uv] unsupported platform ${process.platform}/${process.arch} — skipping bundled uv install`,
    )
    return
  }

  const uvBinName = process.platform === 'win32' ? 'uv.exe' : 'uv'
  const uvxBinName = process.platform === 'win32' ? 'uvx.exe' : 'uvx'
  const finalUv = join(DIST_BIN, uvBinName)
  const finalUvx = join(DIST_BIN, uvxBinName)

  if (existsSync(finalUv) && existsSync(finalUvx)) {
    console.log(
      `[install-uv] dist/bin/${uvBinName} + dist/bin/${uvxBinName} already present — skipping download`,
    )
    return
  }

  if (!existsSync(DIST_BIN)) mkdirSync(DIST_BIN, { recursive: true })

  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz'
  const archiveName = `uv-${triple}.${ext}`
  const url = `https://github.com/astral-sh/uv/releases/latest/download/${archiveName}`

  const tmpArchive = join(tmpdir(), `aiko-${archiveName}`)
  const tmpExtract = join(tmpdir(), `aiko-uv-extract-${Date.now()}`)

  console.log(`[install-uv] fetching ${url}`)
  try {
    await download(url, tmpArchive)
  } catch (e) {
    console.warn(`[install-uv] download failed: ${e?.message || e}`)
    console.warn('[install-uv] CLI will fall back to system PATH at runtime')
    return
  }

  mkdirSync(tmpExtract, { recursive: true })
  try {
    if (ext === 'zip') {
      // Windows: rely on PowerShell Expand-Archive. tar exists on Win11+ but
      // skip for compatibility.
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Expand-Archive -LiteralPath '${tmpArchive}' -DestinationPath '${tmpExtract}' -Force`,
        ],
        { stdio: 'inherit' },
      )
    } else {
      execFileSync('tar', ['-xzf', tmpArchive, '-C', tmpExtract], {
        stdio: 'inherit',
      })
    }
  } catch (e) {
    console.warn(`[install-uv] extract failed: ${e?.message || e}`)
    return
  }

  // The archive layout is `uv-<triple>/uv` and `uv-<triple>/uvx` (plus license,
  // shell completions). Find the binaries and move them into dist/bin/.
  const innerDir = join(tmpExtract, `uv-${triple}`)
  const srcUv = join(innerDir, uvBinName)
  const srcUvx = join(innerDir, uvxBinName)

  if (!existsSync(srcUv)) {
    console.warn(
      `[install-uv] expected ${srcUv} not found — archive layout may have changed`,
    )
    return
  }

  renameSync(srcUv, finalUv)
  if (existsSync(srcUvx)) {
    renameSync(srcUvx, finalUvx)
  }

  if (process.platform !== 'win32') {
    execFileSync('chmod', ['+x', finalUv], { stdio: 'inherit' })
    if (existsSync(finalUvx))
      execFileSync('chmod', ['+x', finalUvx], { stdio: 'inherit' })
  }

  try {
    rmSync(tmpArchive, { force: true })
    rmSync(tmpExtract, { recursive: true, force: true })
  } catch {
    /* best effort */
  }

  console.log(`[install-uv] installed → ${finalUv}`)
  if (existsSync(finalUvx)) console.log(`[install-uv] installed → ${finalUvx}`)
  // Note: skipped check intentionally — even if uv is on PATH, we still ship
  // a bundled copy so the user doesn't have to install it themselves (the
  // whole point of Option C).
  void isOnPath
}

main().catch(e => {
  console.warn(`[install-uv] error: ${e?.message || e}`)
  process.exit(0)
})
