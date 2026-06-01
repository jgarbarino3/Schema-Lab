import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:4173/'
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')

async function expectHidden(locator) {
  await locator.waitFor({ state: 'hidden' }).catch(async () => {
    const count = await locator.count()
    assert.equal(count, 0)
  })
}

function assertPointClose(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual.x - expected.x) <= tolerance, `expected x ${actual.x} to be within ${tolerance} of ${expected.x}`)
  assert.ok(Math.abs(actual.y - expected.y) <= tolerance, `expected y ${actual.y} to be within ${tolerance} of ${expected.y}`)
}

const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: {
      width: 1600,
      height: 980,
    },
  })
  const page = await context.newPage()
  const consoleWarnings = []

  page.on('console', (message) => {
    if (message.type() === 'warning') {
      consoleWarnings.push(message.text())
    }
  })

  page.setDefaultTimeout(9000)

  const step = (label) => {
    console.log(`STEP: ${label}`)
  }

  await page.goto(targetUrl, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(window.__SCHEMA_LAB_STORE__))
  await page.waitForFunction(() => Boolean(window.__SCHEMA_LAB_VIEW_TOOLS__))

  if (await page.locator('.tour-card').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Exit' }).click()
    await expectHidden(page.locator('.tour-card'))
  }

  const stage = page.locator('.schema-stage .konvajs-content').first()
  const moreButton = page.getByTestId('toolbar-more')
  const tableButton = page.getByTestId('toolbar-table-view')
  const boardButton = page.getByTestId('toolbar-board-focus')

  const openMoreMenu = async () => {
    await moreButton.click()
    const menu = page.getByTestId('toolbar-menu-more')
    await menu.waitFor()
    return menu
  }

  const readScene = async () => {
    return page.evaluate(() =>
      JSON.parse(JSON.stringify(window.__SCHEMA_LAB_STORE__.getState().scene)),
    )
  }

  const readViewport = async () =>
    page.evaluate(() => {
      return window.__SCHEMA_LAB_STORE__.getState().viewport
    })

  const readInteraction = async () =>
    page.evaluate(() => {
      const { interaction } = window.__SCHEMA_LAB_STORE__.getState()

      return {
        focusedBreadboardId: interaction.focusedBreadboardId,
        lineDrawStartMm: interaction.lineDrawStartMm,
        workspaceViewMode: interaction.workspaceViewMode,
      }
    })

  const getStageBox = async () => {
    const stageBox = await stage.boundingBox()
    assert.ok(stageBox, 'Stage should be visible')
    return stageBox
  }

  const clickStageRelative = async (xRatio, yRatio, button = 'left') => {
    const stageBox = await getStageBox()
    await stage.click({
      button,
      force: true,
      position: {
        x: stageBox.width * xRatio,
        y: stageBox.height * yRatio,
      },
    })
    await page.waitForTimeout(220)
  }

  const clickStageWorld = async (pointMm, button = 'left', options = {}) => {
    const stageBox = await getStageBox()
    const viewport = await readViewport()
    const screenPoint = await page.evaluate(
      ({ options, pointMm }) =>
        window.__SCHEMA_LAB_VIEW_TOOLS__.worldToStage(pointMm, options),
      { options, pointMm },
    )

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

  const hoverStageWorld = async (pointMm, options = {}) => {
    const stageBox = await getStageBox()
    const viewport = await readViewport()
    const screenPoint = await page.evaluate(
      ({ options, pointMm }) =>
        window.__SCHEMA_LAB_VIEW_TOOLS__.worldToStage(pointMm, options),
      { options, pointMm },
    )

    await stage.hover({
      force: true,
      position: {
        x: (screenPoint.x / viewport.canvasSizePx.width) * stageBox.width,
        y: (screenPoint.y / viewport.canvasSizePx.height) * stageBox.height,
      },
    })
    await page.waitForTimeout(180)
  }

  const dragStageWorld = async (
    startMm,
    endMm,
    startOptions = {},
    endOptions = startOptions,
  ) => {
    const stageBox = await getStageBox()
    const viewport = await readViewport()
    const [startScreenPoint, endScreenPoint] = await Promise.all([
      page.evaluate(
        ({ options, pointMm }) =>
          window.__SCHEMA_LAB_VIEW_TOOLS__.worldToStage(pointMm, options),
        { options: startOptions, pointMm: startMm },
      ),
      page.evaluate(
        ({ options, pointMm }) =>
          window.__SCHEMA_LAB_VIEW_TOOLS__.worldToStage(pointMm, options),
        { options: endOptions, pointMm: endMm },
      ),
    ])
    const startPosition = {
      x: (startScreenPoint.x / viewport.canvasSizePx.width) * stageBox.width,
      y: (startScreenPoint.y / viewport.canvasSizePx.height) * stageBox.height,
    }
    const endPosition = {
      x: (endScreenPoint.x / viewport.canvasSizePx.width) * stageBox.width,
      y: (endScreenPoint.y / viewport.canvasSizePx.height) * stageBox.height,
    }

    await page.mouse.move(stageBox.x + startPosition.x, stageBox.y + startPosition.y)
    await page.mouse.down()
    await page.mouse.move(stageBox.x + endPosition.x, stageBox.y + endPosition.y, {
      steps: 8,
    })
    await page.mouse.up()
    await page.waitForTimeout(260)
  }

  const hoverStageRelative = async (xRatio, yRatio) => {
    const stageBox = await getStageBox()
    await stage.hover({
      force: true,
      position: {
        x: stageBox.width * xRatio,
        y: stageBox.height * yRatio,
      },
    })
    await page.waitForTimeout(180)
  }

  const ensureLibraryGroupExpanded = async (testId) => {
    const group = page.getByTestId(testId)
    const body = group.locator('.component-library__group-body')
    if ((await body.count()) === 0) {
      await group.getByRole('button').first().click()
    }
    await group.locator('.component-library__group-body').waitFor()
  }

  const initialMoreMenu = await openMoreMenu()
  await initialMoreMenu.getByRole('button', { name: 'Restore Saved Table' }).waitFor()
  await initialMoreMenu.getByRole('button', { name: 'Start Fresh Table' }).waitFor()
  await moreButton.click()
  await expectHidden(page.getByTestId('toolbar-menu-more'))
  step('single-board more menu exposes saved and fresh table actions')

  await tableButton.click()
  await expectHidden(page.locator('.modal-shell'))
  step('converted to optical table immediately from table view')

  let scene = await readScene()
  assert.equal(scene.workspace.kind, 'optical-table')
  assert.equal(scene.workspace.breadboards.length, 1)
  await page.getByRole('button', { name: 'Realistic' }).click()
  await page.waitForTimeout(220)
  assert.equal(
    await page.evaluate(() => window.__SCHEMA_LAB_VIEW_TOOLS__.usesProjectedTableView()),
    true,
  )
  step('realistic table view activates the projected runtime path')

  await ensureLibraryGroupExpanded('library-group-breadboards')
  await page.getByTestId('library-item-breadboard-metric-300-square').click()
  await page.getByTestId('placement-banner').waitFor()
  await page.waitForFunction(() => {
    return Boolean(window.__SCHEMA_LAB_STORE__.getState().interaction.pendingBreadboardPlacement)
  })
  await page.evaluate(() => {
    window.__SCHEMA_LAB_STORE__.getState().commitPendingBreadboardPlacement({
      x: 2125,
      y: 690,
    })
  })
  await page.waitForFunction(() => {
    const scene = window.__SCHEMA_LAB_STORE__.getState().scene
    return scene.workspace.kind === 'optical-table' && scene.workspace.breadboards.length === 2
  })
  scene = await readScene()
  assert.equal(scene.workspace.kind, 'optical-table')
  assert.equal(scene.workspace.breadboards.length, 2)
  let secondBreadboard = scene.workspace.breadboards[1]
  assert.ok(secondBreadboard, 'Second breadboard should be created')
  let secondBreadboardCenter = {
    x: secondBreadboard.anchorMm.x + secondBreadboard.model.widthMm / 2,
    y: secondBreadboard.anchorMm.y + secondBreadboard.model.heightMm / 2,
  }
  step('placed second breadboard')

  await boardButton.hover()
  const soloBoardButton = page.getByRole('button', { name: 'Solo Board' })
  await soloBoardButton.waitFor()
  await soloBoardButton.hover()
  await soloBoardButton.waitFor()
  step('board focus flyout stays open while moving into solo board action')

  await page.evaluate(
    (breadboardId) => {
      const store = window.__SCHEMA_LAB_STORE__.getState()
      store.selectBreadboard(breadboardId)
      store.setFocusedBreadboardId(breadboardId)
      store.setActiveHostSurfaceId(breadboardId)
    },
    secondBreadboard.id,
  )
  await boardButton.click()
  await expectHidden(page.locator('.modal-shell'))
  let interaction = await readInteraction()
  assert.equal(interaction.workspaceViewMode, 'board-focus')
  assert.equal(interaction.focusedBreadboardId, secondBreadboard.id)
  assert.equal(
    await page.evaluate(() => window.__SCHEMA_LAB_VIEW_TOOLS__.usesProjectedTableView()),
    false,
  )
  await page.evaluate(() => {
    window.__SCHEMA_LAB_STORE__.getState().setWorkspaceViewMode('table-view')
  })
  await page.waitForTimeout(250)
  interaction = await readInteraction()
  assert.equal(interaction.workspaceViewMode, 'table-view')
  assert.equal(interaction.focusedBreadboardId, secondBreadboard.id)
  assert.equal(
    await page.evaluate(() => window.__SCHEMA_LAB_VIEW_TOOLS__.usesProjectedTableView()),
    true,
  )
  step('board focus and table view toggle cleanly in optical-table workspaces')

  await clickStageWorld({ x: 420, y: 360 })
  await ensureLibraryGroupExpanded('library-group-sources')
  await page.getByTestId('library-item-laser-source').click()
  await clickStageRelative(0.14, 0.35)
  scene = await readScene()
  const tableLaser = scene.components.find(
    (component) => component.type === 'laser-source' && component.hostSurfaceId === 'optical-table',
  )
  assert.ok(tableLaser, 'Table-mounted laser should be placed on the optical table')
  assert.equal(tableLaser.variantId, 'compact-table-source')
  assert.equal(tableLaser.config.source?.firstTargetComponentId, undefined)
  step('placed compact table-mounted laser body')

  await page.evaluate((breadboardId) => {
    const store = window.__SCHEMA_LAB_STORE__.getState()
    store.selectBreadboard(breadboardId)
    store.setFocusedBreadboardId(breadboardId)
    store.setActiveHostSurfaceId(breadboardId)
  }, secondBreadboard.id)
  await page.waitForTimeout(220)
  await ensureLibraryGroupExpanded('library-group-beam-steering')
  await page.getByTestId('library-item-flip-mirror').waitFor()
  await page.getByTestId('library-item-mirror').click()
  await hoverStageWorld(secondBreadboardCenter, { surfaceId: secondBreadboard.id })
  await clickStageWorld(secondBreadboardCenter, 'left', {
    surfaceId: secondBreadboard.id,
  })
  scene = await readScene()
  let mirrors = scene.components.filter(
    (component) => component.type === 'mirror' && component.hostSurfaceId === secondBreadboard.id,
  )
  assert.equal(mirrors.length, 1)
  let mirrorOnBoard = mirrors[0]
  assert.ok(mirrorOnBoard, 'Mirror should be placed on the selected breadboard host')
  step('placed mirror on selected breadboard host')

  await ensureLibraryGroupExpanded('library-group-beam-control')
  await page.getByTestId('library-item-attenuator').click()
  const beamControlPoint = {
    x: secondBreadboardCenter.x + 55,
    y: secondBreadboardCenter.y + 18,
  }
  await hoverStageWorld(beamControlPoint, { surfaceId: secondBreadboard.id })
  await clickStageWorld(beamControlPoint, 'left', {
    surfaceId: secondBreadboard.id,
  })
  scene = await readScene()
  const attenuators = scene.components.filter(
    (component) =>
      component.type === 'attenuator' && component.hostSurfaceId === secondBreadboard.id,
  )
  assert.equal(attenuators.length, 1)
  step('placed beam-control optic on selected breadboard host')

  await fs.mkdir(path.join(repoRoot, 'output/playwright'), { recursive: true })
  await page.screenshot({
    path: path.join(repoRoot, 'output/playwright/projected-mounted-optics-row.png'),
    fullPage: true,
  })
  step('captured realistic mounted-optic regression screenshot')

  const breadboardDragStart = {
    x: secondBreadboard.anchorMm.x + 10,
    y: secondBreadboard.anchorMm.y + 10,
  }
  const breadboardDragEnd = {
    x: breadboardDragStart.x + 55,
    y: breadboardDragStart.y + 45,
  }
  const breadboardBeforeDrag = {
    anchorMm: { ...secondBreadboard.anchorMm },
    id: secondBreadboard.id,
  }
  const mirrorBeforeDrag = {
    anchorMm: { ...mirrorOnBoard.anchorMm },
    id: mirrorOnBoard.id,
  }

  await dragStageWorld(
    breadboardDragStart,
    breadboardDragEnd,
    { surfaceId: breadboardBeforeDrag.id },
    { surfaceId: breadboardBeforeDrag.id },
  )
  await page.waitForTimeout(220)
  scene = await readScene()
  secondBreadboard = scene.workspace.breadboards.find(
    (breadboard) => breadboard.id === breadboardBeforeDrag.id,
  )
  assert.ok(secondBreadboard, 'Dragged breadboard should still exist')
  mirrorOnBoard = scene.components.find((component) => component.id === mirrorBeforeDrag.id)
  assert.ok(mirrorOnBoard, 'Hosted mirror should still exist after breadboard drag')
  const breadboardDelta = {
    x: secondBreadboard.anchorMm.x - breadboardBeforeDrag.anchorMm.x,
    y: secondBreadboard.anchorMm.y - breadboardBeforeDrag.anchorMm.y,
  }
  assert.notDeepEqual(breadboardDelta, { x: 0, y: 0 })
  assertPointClose(
    {
      x: mirrorOnBoard.anchorMm.x - mirrorBeforeDrag.anchorMm.x,
      y: mirrorOnBoard.anchorMm.y - mirrorBeforeDrag.anchorMm.y,
    },
    breadboardDelta,
  )
  secondBreadboardCenter = {
    x: secondBreadboard.anchorMm.x + secondBreadboard.model.widthMm / 2,
    y: secondBreadboard.anchorMm.y + secondBreadboard.model.heightMm / 2,
  }
  step('breadboard drag contract keeps hosted optics attached')

  await page.getByRole('button', { name: 'Highlight' }).click()
  await dragStageWorld(
    {
      x: secondBreadboard.anchorMm.x - 24,
      y: secondBreadboard.anchorMm.y - 24,
    },
    {
      x: secondBreadboard.anchorMm.x + secondBreadboard.model.widthMm + 24,
      y: secondBreadboard.anchorMm.y + secondBreadboard.model.heightMm + 24,
    },
    { surfaceId: secondBreadboard.id },
    { surfaceId: secondBreadboard.id },
  )
  await page.waitForTimeout(220)
  const highlightSelection = await page.evaluate(() => {
    return window.__SCHEMA_LAB_STORE__.getState().interaction.highlightSelection
  })
  assert.ok(highlightSelection, 'Highlight selection should be created')
  assert.ok(highlightSelection.breadboardIds.includes(secondBreadboard.id))
  assert.ok(highlightSelection.componentIds.includes(mirrorOnBoard.id))
  await page.keyboard.press('R')
  await page.waitForTimeout(220)
  scene = await readScene()
  const rotatedBreadboard = scene.workspace.breadboards.find(
    (breadboard) => breadboard.id === secondBreadboard.id,
  )
  assert.equal(rotatedBreadboard?.rotationQuarterTurns, 1)
  step('highlight bundles rotate through the keyboard shortcut without showing the component pin')

  await page.getByRole('button', { exact: true, name: 'Select' }).click()
  scene = await readScene()
  mirrors = scene.components.filter(
    (component) => component.type === 'mirror' && component.hostSurfaceId === secondBreadboard.id,
  )
  const rotatedMirror = mirrors[0]
  assert.ok(rotatedMirror, 'Mirror should still exist after highlight rotation')

  await clickStageWorld(rotatedMirror.anchorMm, 'left', {
    surfaceId: secondBreadboard.id,
  })
  await page.getByTestId('selection-toolbar').waitFor()
  const rotationBefore = rotatedMirror.rotationQuarterTurns
  await page.getByRole('button', { name: 'Rotate +90°' }).click()
  scene = await readScene()
  mirrors = scene.components.filter(
    (component) => component.type === 'mirror' && component.hostSurfaceId === secondBreadboard.id,
  )
  assert.equal(mirrors[0]?.rotationQuarterTurns, (rotationBefore + 1) % 4)
  step('selection toolbar rotates components')

  const contextMirror =
    mirrors.find((component) => component.id === mirrorOnBoard.id) ?? mirrors[0]
  await clickStageWorld(contextMirror.anchorMm, 'right', {
    surfaceId: secondBreadboard.id,
  })
  const contextMenu = page.getByRole('menu', { name: 'Canvas context menu' })
  await contextMenu.waitFor()
  await contextMenu.getByRole('menuitem', { name: 'Duplicate' }).click()
  scene = await readScene()
  mirrors = scene.components.filter(
    (component) => component.type === 'mirror' && component.hostSurfaceId === secondBreadboard.id,
  )
  assert.equal(mirrors.length, 2)
  step('component context menu duplicates selection')

  await clickStageWorld({ x: 420, y: 360 })
  await ensureLibraryGroupExpanded('library-group-sources')
  await page.getByTestId('library-item-laser-source').click()
  const firstTargetField = page.locator('.placement-banner__field').filter({
    hasText: 'First target',
  })
  await firstTargetField.waitFor()
  await firstTargetField.locator('select').selectOption(mirrorOnBoard.id)
  await hoverStageRelative(0.24, 0.48)
  await clickStageRelative(0.24, 0.48)
  scene = await readScene()
  const guidedLaser = scene.components.find(
    (component) =>
      component.type === 'laser-source' &&
      component.config.source?.firstTargetComponentId === mirrorOnBoard.id,
  )
  assert.ok(guidedLaser, 'Guided source placement should keep the chosen first target')
  assert.equal(guidedLaser.hostSurfaceId, 'optical-table')
  step('guided source placement picks the requested first target')

  await page.getByRole('button', { exact: true, name: 'Line' }).click()
  const lineStartPoint = {
    x: secondBreadboardCenter.x - 220,
    y: secondBreadboardCenter.y - 180,
  }
  await clickStageWorld(lineStartPoint, 'left', { surfaceId: secondBreadboard.id })
  interaction = await readInteraction()
  if (!interaction.lineDrawStartMm) {
    await clickStageWorld(lineStartPoint, 'left', { surfaceId: secondBreadboard.id })
  }
  await clickStageWorld(secondBreadboardCenter, 'left', {
    surfaceId: secondBreadboard.id,
  })
  scene = await readScene()
  if (scene.annotations.length === 0) {
    await clickStageWorld(secondBreadboardCenter, 'left', {
      surfaceId: secondBreadboard.id,
    })
    scene = await readScene()
  }
  assert.equal(scene.annotations.length, 1)
  step('line tool works across breadboard and component hits in table mode')

  await dragStageWorld(
    mirrorOnBoard.anchorMm,
    { x: 420, y: 360 },
    { surfaceId: secondBreadboard.id },
    { surfaceId: 'optical-table' },
  )
  await page.waitForTimeout(220)
  await dragStageWorld(
    { x: 420, y: 360 },
    {
      x: secondBreadboardCenter.x + 35,
      y: secondBreadboardCenter.y + 25,
    },
    { surfaceId: 'optical-table' },
    { surfaceId: secondBreadboard.id },
  )
  scene = await readScene()
  const draggedMirror = scene.components.find(
    (component) => component.id === mirrorOnBoard.id,
  )
  assert.equal(draggedMirror?.hostSurfaceId, secondBreadboard.id)
  step('dragging across surfaces preserves the intended host on drop')

  const sceneBeforeModeToggle = JSON.stringify(scene)
  await page.getByRole('button', { name: 'Simple' }).click()
  await page.getByRole('button', { name: 'Realistic' }).click()
  assert.equal(
    await page.evaluate(() => window.__SCHEMA_LAB_VIEW_TOOLS__.usesProjectedTableView()),
    true,
  )
  const sceneAfterModeToggle = JSON.stringify(await readScene())
  assert.equal(sceneAfterModeToggle, sceneBeforeModeToggle)
  step('render mode toggle preserved scene geometry')

  const problematicNaNProjectionWarnings = consoleWarnings.filter((text) =>
    /nan|projection/i.test(text),
  )
  const konvaLayerCountWarnings = consoleWarnings.filter((text) =>
    /konva.*layer count|layer count.*konva/i.test(text),
  )
  assert.equal(
    problematicNaNProjectionWarnings.length,
    0,
    `Unexpected NaN/projection warnings:\n${problematicNaNProjectionWarnings.join('\n')}`,
  )
  assert.equal(
    konvaLayerCountWarnings.length,
    0,
    `Unexpected Konva layer-count warnings:\n${konvaLayerCountWarnings.join('\n')}`,
  )

  console.log('projected-table-smoke-ok')
} finally {
  await browser.close()
}
