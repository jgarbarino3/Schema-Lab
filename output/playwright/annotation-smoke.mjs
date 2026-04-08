import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/'

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
  }

  const rawJsonButton = page.getByRole('button', { name: 'Raw JSON' })
  const stage = page.locator('.konvajs-content')

  const readViewport = async () =>
    page.evaluate(async () => {
      const { useEditorStore } = await import('/src/state/editorStore.ts')
      return useEditorStore.getState().viewport
    })

  const readScene = async () => {
    await rawJsonButton.click()
    const textarea = page.locator('.json-modal textarea')
    await textarea.waitFor()
    const scene = JSON.parse(await textarea.inputValue())
    await page.getByRole('button', { name: 'Close' }).click()
    return scene
  }

  const clickStageWorld = async (pointMm) => {
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
      force: true,
      position: {
        x: (screenPoint.x / viewport.canvasSizePx.width) * stageBox.width,
        y: (screenPoint.y / viewport.canvasSizePx.height) * stageBox.height,
      },
    })
    await page.waitForTimeout(200)
  }

  const dockField = (label) =>
    page.locator('.annotation-dock__field').filter({ hasText: label })

  await page.getByRole('button', { exact: true, name: 'Text' }).click()
  await clickStageWorld({ x: 48, y: 52 })
  const editor = page.locator('.annotation-text-editor')
  await editor.waitFor()
  await page.locator('.annotation-toolbar').waitFor()
  await editor.fill('Pump arm note')
  assert.equal(await page.locator('.annotation-toolbar').isVisible(), true)
  await page.getByRole('button', { exact: true, name: 'Select' }).click()
  step('created text annotation')

  await clickStageWorld({ x: 50, y: 54 })
  await page.locator('.annotation-toolbar').waitFor()
  await page
    .locator('.annotation-toolbar__toggle')
    .filter({ hasText: 'B' })
    .click()
  await page.locator('.annotation-toolbar input[type="number"]').first().fill('6.4')
  step('styled text annotation')

  await page.getByRole('button', { exact: true, name: 'Shape' }).click()
  await dockField('Shape kind').locator('select').selectOption('arrow')
  await clickStageWorld({ x: 138, y: 116 })
  await page.getByRole('button', { exact: true, name: 'Select' }).click()
  step('created arrow annotation')

  await clickStageWorld({ x: 138, y: 116 })
  await page.locator('.annotation-toolbar').waitFor()
  await page.locator('.annotation-toolbar input[type="number"]').first().fill('1.4')
  step('styled arrow annotation')

  const scene = await readScene()
  const textAnnotation = scene.annotations.find((annotation) => annotation.kind === 'text')
  const arrowAnnotation = scene.annotations.find(
    (annotation) => annotation.kind === 'shape' && annotation.shapeKind === 'arrow',
  )

  assert.ok(textAnnotation, 'Text annotation should be saved to the scene')
  assert.equal(textAnnotation.text, 'Pump arm note')
  assert.equal(textAnnotation.style.bold, true)
  assert.equal(Number(textAnnotation.style.fontSizeMm), 6.4)

  assert.ok(arrowAnnotation, 'Arrow annotation should be saved to the scene')
  assert.equal(Number(arrowAnnotation.strokeWidthMm), 1.4)

  console.log('Annotation smoke passed')
} finally {
  await browser.close()
}
