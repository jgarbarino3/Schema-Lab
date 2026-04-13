import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/'
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const svgGridPath = path.join(repoRoot, 'src/test/fixtures/svg-import-hole-grid.svg')
const selectAllShortcut = process.platform === 'darwin' ? 'Meta+A' : 'Control+A'

async function expectHidden(locator) {
  await locator.waitFor({ state: 'hidden' }).catch(async () => {
    const count = await locator.count()
    assert.equal(count, 0)
  })
}

const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 980 },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)

  const closeTourIfPresent = async () => {
    const tourCard = page.locator('.tour-card')
    if (await tourCard.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Exit' }).click()
      await expectHidden(tourCard)
    }
  }

  const createRasterBreadboardPayload = async () => {
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 700
      canvas.height = 700
      const context2d = canvas.getContext('2d')
      if (!context2d) {
        throw new Error('2d canvas context unavailable')
      }

      context2d.fillStyle = '#f6f7f8'
      context2d.fillRect(0, 0, canvas.width, canvas.height)
      context2d.fillStyle = '#c8ccd1'
      context2d.fillRect(70, 70, 560, 560)
      context2d.strokeStyle = '#8e98a2'
      context2d.lineWidth = 3
      context2d.strokeRect(70, 70, 560, 560)
      context2d.fillStyle = '#101214'

      for (let row = 0; row < 14; row += 1) {
        for (let column = 0; column < 14; column += 1) {
          context2d.beginPath()
          context2d.arc(90 + column * 40, 90 + row * 40, 6, 0, Math.PI * 2)
          context2d.fill()
        }
      }

      return canvas.toDataURL('image/png')
    })

    return {
      name: 'breadboard-hole-grid.png',
      mimeType: 'image/png',
      buffer: Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'),
    }
  }

  const readWorkspaceState = () =>
    page.evaluate(() => {
      const scene = window.__SCHEMA_LAB_STORE__.getState().scene
      if (scene.workspace.kind === 'optical-table') {
        return {
          breadboardCount: scene.workspace.breadboards.length,
          kind: scene.workspace.kind,
        }
      }

      return {
        breadboardCount: 1,
        kind: scene.workspace.kind,
      }
    })

  await page.goto(targetUrl, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(window.__SCHEMA_LAB_STORE__))
  await closeTourIfPresent()

  await page.getByTestId('toolbar-export').waitFor()

  const drawingInput = page.getByTestId('drawing-import-file-input')
  const importDialog = page.getByTestId('drawing-import-modal')

  await drawingInput.setInputFiles(svgGridPath)
  await importDialog.waitFor()
  assert.match((await importDialog.textContent()) ?? '', /Import Drawing/i)

  const continueButton = importDialog.getByRole('button', { name: 'Continue' })
  const boardHeightInput = importDialog.getByLabel('Breadboard height (mm)')
  const boardWidthInput = importDialog.getByLabel('Breadboard width (mm)')

  await boardHeightInput.click()
  await boardHeightInput.press(selectAllShortcut)
  await boardHeightInput.press('Backspace')
  assert.equal(await boardHeightInput.inputValue(), '')
  await page.waitForTimeout(120)
  assert.equal(await continueButton.isDisabled(), true)

  await boardHeightInput.type('300')
  assert.equal(await boardHeightInput.inputValue(), '300')
  await page.waitForTimeout(120)
  assert.equal(await continueButton.isDisabled(), false)

  const autoCard = importDialog.getByTestId('drawing-import-auto-calibration-card')
  await autoCard.waitFor()
  assert.match((await autoCard.textContent()) ?? '', /Pitch assumption:\s*25 mm/i)
  await importDialog.getByTestId('drawing-import-apply-auto-calibration').click()
  await page.waitForTimeout(180)
  assert.equal(await boardWidthInput.inputValue(), '200')
  assert.equal(await boardHeightInput.inputValue(), '200')

  await importDialog.getByRole('button', { name: 'Cancel' }).click()
  await expectHidden(importDialog)

  const rasterPayload = await createRasterBreadboardPayload()
  await drawingInput.setInputFiles(rasterPayload)
  await importDialog.waitFor()
  assert.match((await importDialog.textContent()) ?? '', /Import Raster Drawing/i)
  const rasterAutoCard = importDialog.getByTestId('drawing-import-auto-calibration-card')
  await rasterAutoCard.waitFor()
  assert.match((await rasterAutoCard.textContent()) ?? '', /mm per pixel/i)
  await importDialog.getByTestId('drawing-import-apply-auto-calibration').click()
  await page.waitForTimeout(180)
  assert.equal(await boardWidthInput.inputValue(), '350')
  assert.equal(await boardHeightInput.inputValue(), '350')
  await importDialog.getByRole('button', { name: 'Cancel' }).click()
  await expectHidden(importDialog)

  await page.evaluate(() => {
    const store = window.__SCHEMA_LAB_STORE__.getState()
    store.convertWorkspaceToOpticalTable()
    store.setWorkspaceViewMode('table-view')
  })
  await page.waitForFunction(() => {
    const scene = window.__SCHEMA_LAB_STORE__.getState().scene
    return scene.workspace.kind === 'optical-table' && scene.workspace.breadboards.length === 1
  })

  await page.getByTestId('toolbar-board-focus').hover()
  const soloBoardButton = page.getByRole('button', { name: 'Solo Board' })
  await soloBoardButton.waitFor()
  await soloBoardButton.click()

  await page.waitForFunction(() => {
    return window.__SCHEMA_LAB_STORE__.getState().scene.workspace.kind === 'single-breadboard'
  })
  const workspaceState = await readWorkspaceState()
  assert.equal(workspaceState.kind, 'single-breadboard')
  assert.equal(workspaceState.breadboardCount, 1)
  assert.equal(
    await page.getByRole('heading', { name: 'Switch to Single Breadboard' }).count(),
    0,
  )

  await page.screenshot({
    path: path.join(repoRoot, 'output/playwright/drawing-import-auto-calibration-smoke.png'),
    fullPage: true,
  })

  console.log('drawing-import-auto-calibration-smoke-ok')
} finally {
  await browser.close()
}
