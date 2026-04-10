import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/'

async function expectHidden(locator) {
  await locator.waitFor({ state: 'hidden' }).catch(async () => {
    const count = await locator.count()
    assert.equal(count, 0)
  })
}

const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext({
    viewport: {
      width: 1540,
      height: 980,
    },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(9000)

  const step = (label) => {
    console.log(`STEP: ${label}`)
  }

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })

  if (await page.locator('.tour-card').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Exit' }).click()
    await expectHidden(page.locator('.tour-card'))
  }

  const stage = page.locator('.konvajs-content')

  const readViewport = async () =>
    page.evaluate(() => {
      return window.__SCHEMA_LAB_STORE__.getState().viewport
    })

  const openExportMenu = async () => {
    await page.getByTestId('toolbar-export').click()
    const menu = page.getByTestId('toolbar-menu-export')
    await menu.waitFor()
    return menu
  }

  const readScene = async () => {
    await page.waitForTimeout(220)
    const exportMenu = await openExportMenu()
    await exportMenu.getByRole('button', { name: 'Raw JSON' }).click()
    const textarea = page.locator('.json-modal textarea')
    await textarea.waitFor()
    await page.waitForFunction(() => {
      const element = document.querySelector('.json-modal textarea')
      return !!element && element.value.trim().length > 0
    })
    const scene = JSON.parse(await textarea.inputValue())
    await page.getByRole('button', { name: 'Close' }).click()
    await expectHidden(page.locator('.json-modal'))
    return scene
  }

  const clickStageWorld = async (pointMm, button = 'left') => {
    const viewport = await readViewport()
    const stageBox = await stage.boundingBox()
    assert.ok(stageBox, 'Stage should be visible')
    const screenPoint = {
      x:
        viewport.canvasSizePx.width / 2 +
        (pointMm.x - viewport.cameraCenterMm.x) * viewport.zoomPxPerMm,
      y:
        viewport.canvasSizePx.height / 2 +
        (pointMm.y - viewport.cameraCenterMm.y) * viewport.zoomPxPerMm,
    }

    await stage.click({
      button,
      force: true,
      position: {
        x: (screenPoint.x / viewport.canvasSizePx.width) * stageBox.width,
        y: (screenPoint.y / viewport.canvasSizePx.height) * stageBox.height,
      },
    })
    await page.waitForTimeout(220)
  }

  await page.getByRole('button', { exact: true, name: 'Text' }).click()
  await page.getByTestId('annotation-tool-popover-text').waitFor()
  await page.getByTestId('annotation-text-variant-plain').click()
  await clickStageWorld({ x: 48, y: 52 })
  const editor = page.locator('.annotation-text-editor')
  await editor.waitFor()
  await page.locator('.annotation-toolbar').waitFor()
  await editor.fill('Pump arm note')
  await page.getByRole('button', { exact: true, name: 'Select' }).click()
  let scene = await readScene()
  const textAnnotation = scene.annotations.find((annotation) => annotation.kind === 'text')
  assert.ok(textAnnotation, 'Text annotation should be saved to the scene')
  step('created text annotation')

  await page.evaluate(
    ({ annotationId, fontSizeMm }) => {
      const store = window.__SCHEMA_LAB_STORE__.getState()
      store.selectAnnotation(annotationId)
      store.updateSelectedTextStyle({ bold: true, fontSizeMm })
    },
    { annotationId: textAnnotation.id, fontSizeMm: 6.4 },
  )
  step('styled text annotation')

  await page.getByRole('button', { exact: true, name: 'Shape' }).click()
  await page.getByTestId('annotation-tool-popover-shape').waitFor()
  await page.getByTestId('annotation-shape-kind-arrow').click()
  await clickStageWorld({ x: 138, y: 116 })
  await page.getByRole('button', { exact: true, name: 'Select' }).click()
  scene = await readScene()
  const arrowAnnotation = scene.annotations.find(
    (annotation) => annotation.kind === 'shape' && annotation.shapeKind === 'arrow',
  )
  assert.ok(arrowAnnotation, 'Arrow annotation should be saved to the scene')
  step('created arrow annotation')

  await page.evaluate(
    ({ annotationId, strokeWidthMm }) => {
      const store = window.__SCHEMA_LAB_STORE__.getState()
      store.selectAnnotation(annotationId)
      store.updateSelectedShapeStyle({ strokeWidthMm })
    },
    { annotationId: arrowAnnotation.id, strokeWidthMm: 1.4 },
  )
  step('styled arrow annotation')

  await page.getByRole('button', { exact: true, name: 'Line' }).click()
  await page.getByTestId('annotation-tool-popover-line').waitFor()
  await page.getByTestId('annotation-line-color-cyan').click()
  const lineStart = { x: 180, y: 180 }
  const lineEnd = { x: 360, y: 240 }
  await clickStageWorld(lineStart)
  await clickStageWorld(lineEnd)
  await page.getByRole('button', { exact: true, name: 'Select' }).click()
  step('created line annotation')

  scene = await readScene()
  const savedTextAnnotation = scene.annotations.find(
    (annotation) => annotation.kind === 'text',
  )
  const savedArrowAnnotation = scene.annotations.find(
    (annotation) => annotation.kind === 'shape' && annotation.shapeKind === 'arrow',
  )
  let lineAnnotations = scene.annotations.filter((annotation) => annotation.kind === 'line')
  assert.equal(savedTextAnnotation?.text, 'Pump arm note')
  assert.equal(savedTextAnnotation?.style.bold, true)
  assert.equal(Number(savedTextAnnotation?.style.fontSizeMm), 6.4)

  assert.equal(Number(savedArrowAnnotation?.strokeWidthMm), 1.4)

  assert.equal(lineAnnotations.length, 1)
  const line = lineAnnotations[0]
  const midpoint = {
    x: (line.startMm.x + line.endMm.x) / 2,
    y: (line.startMm.y + line.endMm.y) / 2,
  }

  await clickStageWorld(midpoint, 'right')
  const contextMenu = page.getByRole('menu', { name: 'Canvas context menu' })
  await contextMenu.waitFor()
  await contextMenu.getByRole('menuitem', { name: 'Duplicate' }).click()
  scene = await readScene()
  lineAnnotations = scene.annotations.filter((annotation) => annotation.kind === 'line')
  assert.equal(lineAnnotations.length, 2)
  step('line annotation context menu duplicates line selections')

  await clickStageWorld(midpoint)
  await page.getByTestId('selection-toolbar').waitFor()
  await page.getByRole('button', { name: 'Delete' }).click()
  scene = await readScene()
  lineAnnotations = scene.annotations.filter((annotation) => annotation.kind === 'line')
  assert.equal(lineAnnotations.length, 1)
  step('selection toolbar deletes selected annotations')

  console.log('annotation-smoke-ok')
} finally {
  await browser.close()
}
