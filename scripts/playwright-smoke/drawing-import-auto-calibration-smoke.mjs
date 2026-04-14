import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/'
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const svgGridPath = path.join(repoRoot, 'src/test/fixtures/zscan_800_week1_power_only.svg')
const rasterFixturePath = path.join(repoRoot, 'src/test/fixtures/zscan_800_week1_power_only.png')
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

  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window)
    window.__SCHEMA_SUGGESTION_SUBMISSIONS__ = []
    window.fetch = async (input, init) => {
      if (
        input === '/' &&
        init?.method === 'POST' &&
        init.body instanceof FormData &&
        init.body.get('form-name') === 'schema-lab-suggestions'
      ) {
        const screenshot = init.body.get('screenshot')
        window.__SCHEMA_SUGGESTION_SUBMISSIONS__.push({
          category: init.body.get('category'),
          formName: init.body.get('form-name'),
          message: init.body.get('message'),
          screenshotName: screenshot instanceof File ? screenshot.name : null,
        })

        return new Response('', { status: 200 })
      }

      return originalFetch(input, init)
    }
  })

  await page.goto(targetUrl, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(window.__SCHEMA_LAB_STORE__))
  await closeTourIfPresent()

  await page.getByTestId('toolbar-export').waitFor()
  await page.getByTestId('toolbar-more').hover()
  const moreTooltip = page.locator('.toolbar__floating-tooltip')
  await moreTooltip.waitFor()
  assert.equal(await moreTooltip.textContent(), 'More')
  const tooltipBox = await moreTooltip.boundingBox()
  assert.ok(tooltipBox)
  assert.ok(tooltipBox.y >= 0)

  await page.getByTestId('toolbar-suggestions').click()
  await page.getByRole('heading', { name: 'Suggestions' }).waitFor()
  await page.getByLabel('Suggestion category').selectOption('Bug report')
  await page.getByLabel('Suggestion message').fill('Toolbar smoke regression submission')
  await page.getByLabel('Screenshot').setInputFiles(rasterFixturePath)
  await page.getByRole('button', { name: 'Send anonymously' }).click()
  await page.getByText('Suggestion sent').waitFor()
  const suggestionPayloads = await page.evaluate(
    () => window.__SCHEMA_SUGGESTION_SUBMISSIONS__,
  )
  assert.equal(suggestionPayloads.length, 1)
  assert.equal(suggestionPayloads[0].formName, 'schema-lab-suggestions')
  assert.equal(suggestionPayloads[0].category, 'Bug report')
  assert.equal(
    suggestionPayloads[0].message,
    'Toolbar smoke regression submission',
  )
  assert.equal(
    suggestionPayloads[0].screenshotName,
    path.basename(rasterFixturePath),
  )
  await page.getByRole('button', { name: 'Close' }).click()
  await expectHidden(page.getByRole('heading', { name: 'Suggestions' }))

  const drawingInput = page.getByTestId('drawing-import-file-input')
  const importDialog = page.getByTestId('drawing-import-modal')

  await drawingInput.setInputFiles(svgGridPath)
  await importDialog.waitFor()
  assert.match((await importDialog.textContent()) ?? '', /Import Drawing/i)
  const singleBreadboardOption = importDialog.getByLabel('Single breadboard')
  if (await singleBreadboardOption.isVisible().catch(() => false)) {
    await singleBreadboardOption.check()
  }

  const finishButton = importDialog.getByRole('button', { name: /Finish /i })
  const boardHeightInput = importDialog.getByLabel('Breadboard height (mm)')
  const boardWidthInput = importDialog.getByLabel('Breadboard width (mm)')
  assert.equal(await importDialog.getByText('Guided mode').count(), 0)
  assert.equal(await importDialog.getByText('Strict mode').count(), 0)

  await boardHeightInput.click()
  await boardHeightInput.press(selectAllShortcut)
  await boardHeightInput.press('Backspace')
  assert.equal(await boardHeightInput.inputValue(), '')
  await page.waitForTimeout(120)
  assert.equal(await finishButton.isDisabled(), true)

  await boardHeightInput.type('300')
  assert.equal(await boardHeightInput.inputValue(), '300')
  await page.waitForTimeout(120)
  assert.equal(await finishButton.isDisabled(), false)

  const autoCard = importDialog.getByTestId('drawing-import-auto-calibration-card')
  await autoCard.waitFor()
  assert.match((await autoCard.textContent()) ?? '', /25 mm pitch/i)
  assert.match((await autoCard.textContent()) ?? '', /24 × 12 inferred/i)
  await importDialog.getByTestId('drawing-import-apply-auto-calibration').click()
  await page.waitForTimeout(180)
  assert.equal(await boardWidthInput.inputValue(), '600')
  assert.equal(await boardHeightInput.inputValue(), '300')

  await importDialog.getByRole('button', { name: 'Cancel' }).click()
  await expectHidden(importDialog)

  await drawingInput.setInputFiles(rasterFixturePath)
  await importDialog.waitFor()
  assert.match((await importDialog.textContent()) ?? '', /Import Raster Drawing/i)
  if (await singleBreadboardOption.isVisible().catch(() => false)) {
    await singleBreadboardOption.check()
  }
  const rasterAutoCard = importDialog.getByTestId('drawing-import-auto-calibration-card')
  await rasterAutoCard.waitFor()
  assert.match((await rasterAutoCard.textContent()) ?? '', /24 × 12 inferred/i)
  await importDialog.getByTestId('drawing-import-apply-auto-calibration').click()
  await page.waitForTimeout(180)
  assert.equal(await boardWidthInput.inputValue(), '600')
  assert.equal(await boardHeightInput.inputValue(), '300')
  await importDialog.getByTestId('import-preview-item-raster-candidate-1').click()
  await importDialog.locator('.svg-import-suggestion-list button').first().click()
  await importDialog.getByRole('button', { name: 'Finish Import' }).click()
  await expectHidden(importDialog)
  await page.waitForFunction(() => window.__SCHEMA_LAB_STORE__.getState().scene.components.length > 0)

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
