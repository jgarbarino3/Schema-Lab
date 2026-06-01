import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:4173/'

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
      width: 1600,
      height: 980,
    },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(9000)

  const step = (label) => {
    console.log(`STEP: ${label}`)
  }

  const closeTourIfPresent = async () => {
    const tourCard = page.locator('.tour-card')
    if (await tourCard.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Exit' }).click()
      await expectHidden(tourCard)
    }
  }

  const waitForStore = async () => {
    await page.waitForFunction(() => Boolean(window.__SCHEMA_LAB_STORE__))
  }

  const stage = page.locator('.schema-stage .konvajs-content').first()

  const getStageBox = async () => {
    const stageBox = await stage.boundingBox()
    assert.ok(stageBox, 'Stage should be visible')
    return stageBox
  }

  const readViewport = async () =>
    page.evaluate(() => {
      return window.__SCHEMA_LAB_STORE__.getState().viewport
    })

  const clickStageRelative = async (xRatio, yRatio) => {
    const stageBox = await getStageBox()
    await stage.click({
      force: true,
      position: {
        x: stageBox.width * xRatio,
        y: stageBox.height * yRatio,
      },
    })
    await page.waitForTimeout(220)
  }

  const dragStageRelative = async (startXRatio, startYRatio, endXRatio, endYRatio) => {
    const stageBox = await getStageBox()
    await page.mouse.move(
      stageBox.x + stageBox.width * startXRatio,
      stageBox.y + stageBox.height * startYRatio,
    )
    await page.mouse.down()
    await page.mouse.move(
      stageBox.x + stageBox.width * endXRatio,
      stageBox.y + stageBox.height * endYRatio,
      { steps: 10 },
    )
    await page.mouse.up()
    await page.waitForTimeout(220)
  }

  const clickStageWorld = async (pointMm) => {
    const viewport = await readViewport()
    const stageBox = await getStageBox()
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
    await page.waitForTimeout(220)
  }

  const dragStageWorld = async (startMm, endMm) => {
    const viewport = await readViewport()
    const stageBox = await getStageBox()
    const toStagePosition = (pointMm) => {
      const screenPoint = {
        x:
          viewport.canvasSizePx.width / 2 +
          (pointMm.x - viewport.cameraCenterMm.x) * viewport.zoomPxPerMm,
        y:
          viewport.canvasSizePx.height / 2 +
          (pointMm.y - viewport.cameraCenterMm.y) * viewport.zoomPxPerMm,
      }

      return {
        x: (screenPoint.x / viewport.canvasSizePx.width) * stageBox.width,
        y: (screenPoint.y / viewport.canvasSizePx.height) * stageBox.height,
      }
    }

    const startPosition = toStagePosition(startMm)
    const endPosition = toStagePosition(endMm)

    await page.mouse.move(stageBox.x + startPosition.x, stageBox.y + startPosition.y)
    await page.mouse.down()
    await page.mouse.move(stageBox.x + endPosition.x, stageBox.y + endPosition.y, {
      steps: 10,
    })
    await page.mouse.up()
    await page.waitForTimeout(220)
  }

  const ensureLibraryGroupExpanded = async (testId) => {
    const group = page.getByTestId(testId)
    const body = group.locator('.component-library__group-body')
    if ((await body.count()) === 0) {
      await group.getByRole('button').first().click()
    }
    await group.locator('.component-library__group-body').waitFor()
  }

  await page.goto(targetUrl, { waitUntil: 'networkidle' })
  await waitForStore()
  await closeTourIfPresent()

  await page.getByTestId('canvas-empty-state').waitFor()

  await page.getByTestId('library-open-full').click()
  const fullLibraryModal = page.getByTestId('full-library-modal')
  await fullLibraryModal.waitFor()
  assert.match((await fullLibraryModal.textContent()) ?? '', /Classic optics/i)
  assert.match((await fullLibraryModal.textContent()) ?? '', /Enhanced/i)
  assert.match((await fullLibraryModal.textContent()) ?? '', /Realistic/i)
  await page.getByTestId('full-library-search').fill('flip mirror')
  const flipMirrorRow = page.getByTestId('catalog-item-mirror-flip-mirror')
  await flipMirrorRow.waitFor()
  await page.getByTestId('catalog-item-mirror-flip-mirror-preview-classic').waitFor()
  await page.getByTestId('catalog-item-mirror-flip-mirror-preview-enhanced').waitFor()
  await page.getByTestId('catalog-item-mirror-flip-mirror-preview-realistic').waitFor()
  await page.getByTestId('catalog-item-mirror-flip-mirror-arm').click()
  await expectHidden(fullLibraryModal)
  await page.waitForFunction(() => {
    const pendingPlacement = window.__SCHEMA_LAB_STORE__.getState().interaction.pendingPlacement
    return pendingPlacement?.draft.type === 'mirror' && pendingPlacement?.draft.variantId === 'flip-mirror'
  })
  step('full library search, previews, and arm flow work')

  await page.reload({ waitUntil: 'networkidle' })
  await waitForStore()
  await closeTourIfPresent()
  await page.getByTestId('canvas-empty-state').waitFor()

  await ensureLibraryGroupExpanded('library-group-beam-steering')
  await page.getByTestId('library-item-mirror').click()
  await page.evaluate(() => {
    window.__SCHEMA_LAB_STORE__.getState().commitPendingPlacement({ x: 112.5, y: 112.5 })
  })
  await page.waitForFunction(() => window.__SCHEMA_LAB_STORE__.getState().scene.components.length === 1)
  await page.getByTestId('library-item-mirror').click()
  await page.evaluate(() => {
    window.__SCHEMA_LAB_STORE__.getState().commitPendingPlacement({ x: 162.5, y: 112.5 })
  })
  await page.waitForFunction(() => window.__SCHEMA_LAB_STORE__.getState().scene.components.length === 2)

  const mirrorIds = await page.evaluate(() => {
    return window.__SCHEMA_LAB_STORE__.getState().scene.components.map((component) => component.id)
  })
  assert.equal(mirrorIds.length, 2)

  await page.evaluate((componentId) => {
    window.__SCHEMA_LAB_STORE__.getState().selectComponent(componentId)
  }, mirrorIds[0])
  await page.getByRole('button', { name: 'Classic optics' }).click()
  await page.waitForTimeout(160)

  let mirrorOverrides = await page.evaluate(() => {
    return window.__SCHEMA_LAB_STORE__.getState().scene.components.map((component) => ({
      id: component.id,
      override: component.simpleIconStyleOverride,
    }))
  })
  assert.deepEqual(mirrorOverrides, [
    { id: mirrorIds[0], override: 'classic' },
    { id: mirrorIds[1], override: undefined },
  ])

  await page.getByRole('button', { name: 'Use global' }).click()
  await page.waitForTimeout(160)
  mirrorOverrides = await page.evaluate(() => {
    return window.__SCHEMA_LAB_STORE__.getState().scene.components.map((component) => ({
      id: component.id,
      override: component.simpleIconStyleOverride,
    }))
  })
  assert.deepEqual(mirrorOverrides, [
    { id: mirrorIds[0], override: undefined },
    { id: mirrorIds[1], override: undefined },
  ])
  step('per-component simple icon overrides stay scoped and reset back to global')

  await page.getByRole('button', { name: 'Highlight' }).click()
  await dragStageWorld({ x: 90, y: 90 }, { x: 190, y: 135 })
  let interaction = await page.evaluate(() => {
    const state = window.__SCHEMA_LAB_STORE__.getState()
    return {
      activeTool: state.interaction.activeTool,
      highlightSelection: state.interaction.highlightSelection,
    }
  })
  assert.equal(interaction.activeTool, 'highlight')
  assert.ok(interaction.highlightSelection)
  step('dragging in highlight mode keeps highlight active and captures a selection')

  await clickStageRelative(0.08, 0.08)
  interaction = await page.evaluate(() => {
    const state = window.__SCHEMA_LAB_STORE__.getState()
    return {
      activeTool: state.interaction.activeTool,
      highlightSelection: state.interaction.highlightSelection,
      selection: state.selection,
    }
  })
  assert.equal(interaction.activeTool, 'select')
  assert.equal(interaction.highlightSelection, undefined)
  assert.deepEqual(interaction.selection, {
    type: 'breadboard',
    surfaceId: 'single-breadboard',
  })

  await page.getByRole('button', { name: 'Highlight' }).click()
  await clickStageWorld({ x: 175, y: 175 })
  interaction = await page.evaluate(() => {
    const state = window.__SCHEMA_LAB_STORE__.getState()
    return {
      activeTool: state.interaction.activeTool,
      highlightSelection: state.interaction.highlightSelection,
      selection: state.selection,
    }
  })
  assert.equal(interaction.activeTool, 'select')
  assert.equal(interaction.highlightSelection, undefined)
  assert.deepEqual(interaction.selection, {
    type: 'breadboard',
    surfaceId: 'single-breadboard',
  })
  step('empty stage and empty breadboard clicks exit highlight mode back to select')
} finally {
  await browser.close()
}
