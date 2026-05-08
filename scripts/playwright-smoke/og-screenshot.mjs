import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:4173/?og=1&og-scene=tutorial'
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const requestedOutputPath =
  process.argv[3] ?? path.join(repoRoot, 'public', 'schema-lab-og.png')
const outputPath = path.isAbsolute(requestedOutputPath)
  ? requestedOutputPath
  : path.join(repoRoot, requestedOutputPath)
const distOutputPath = path.join(repoRoot, 'dist', path.basename(outputPath))

function waitForServerReady(child, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for preview server to start.'))
    }, timeoutMs)

    const handleChunk = (chunk) => {
      const text = chunk.toString()
      if (
        text.includes('127.0.0.1:4173') ||
        text.includes('Local:') ||
        text.includes('ready in')
      ) {
        clearTimeout(timeout)
        resolve(undefined)
      }
    }

    const handleExit = (code) => {
      clearTimeout(timeout)
      reject(new Error(`Preview server exited early with code ${code ?? 'unknown'}.`))
    }

    child.stdout.on('data', handleChunk)
    child.stderr.on('data', handleChunk)
    child.once('exit', handleExit)
  })
}

async function main() {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })

  const previewServer = spawn(
    'npm',
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  const browser = await chromium.launch({ headless: true })

  try {
    await waitForServerReady(previewServer)

    const context = await browser.newContext({
      deviceScaleFactor: 2,
      viewport: {
        width: 1200,
        height: 630,
      },
    })
    const page = await context.newPage()
    const consoleErrors = []

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })
    page.on('pageerror', (error) => {
      consoleErrors.push(error.message)
    })

    page.setDefaultTimeout(12000)
    await page.goto(targetUrl, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => Boolean(window.__SCHEMA_LAB_STORE__))
    await page.waitForFunction(() => Boolean(window.__SCHEMA_LAB_VIEW_TOOLS__))

    await page.locator('[data-tour="component-library"]').waitFor()
    await page.locator('[data-tour="inspector"]').waitFor()

    await expectAbsent(page.locator('.tour-overlay'))
    await expectAbsent(page.locator('.modal-shell'))
    await expectAbsent(page.locator('.tutorial-table-nudge'))
    await expectAbsent(page.locator('.canvas-selection-toolbar'))
    assert.equal(await page.locator('.workspace__edge-tab').count(), 0)
    assert.equal(await page.getByTestId('toolbar-suggestions').count(), 0)
    assert.equal(await page.getByTestId('toolbar-warnings').count(), 0)
    assert.equal(await page.getByTestId('toolbar-shortcuts').count(), 0)
    assert.equal(await page.getByTestId('canvas-status').count(), 0)

    const workspaceClasses = await page.locator('.workspace').getAttribute('class')
    assert.ok(workspaceClasses, 'Workspace shell should be rendered')
    assert.ok(!workspaceClasses.includes('is-library-collapsed'))
    assert.ok(!workspaceClasses.includes('is-inspector-collapsed'))

    const state = await page.evaluate(() => {
      const store = window.__SCHEMA_LAB_STORE__?.getState()
      return {
        renderMode: store?.renderMode,
        selection: store?.selection,
        workspaceKind: store?.scene.workspace.kind,
        workspaceViewMode: store?.interaction.workspaceViewMode,
      }
    })

    assert.equal(state.renderMode, 'simple')
    assert.equal(state.workspaceKind, 'single-breadboard')
    assert.equal(state.workspaceViewMode, 'board-focus')
    assert.equal(state.selection?.type, 'component')

    await page.screenshot({
      fullPage: false,
      path: outputPath,
    })

    try {
      await fs.copyFile(outputPath, distOutputPath)
    } catch {
      // Dist may not exist if the script is reused against a non-build target.
    }

    const stat = await fs.stat(outputPath)
    assert.ok(stat.size > 0, 'Expected screenshot asset to be written.')
    const relevantConsoleErrors = consoleErrors.filter(
      (message) =>
        !message.includes(
          'Konva error: Can not cache the node. Width or height of the node equals 0. Caching is skipped.',
        ),
    )
    assert.deepEqual(relevantConsoleErrors, [])

    console.log(`og-screenshot-ok ${path.relative(repoRoot, outputPath)}`)
    await context.close()
  } finally {
    previewServer.kill('SIGTERM')
    await browser.close()
  }
}

async function expectAbsent(locator) {
  await locator.waitFor({ state: 'hidden' }).catch(async () => {
    assert.equal(await locator.count(), 0)
  })
}

await main()
