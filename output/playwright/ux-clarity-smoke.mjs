import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/'
const canUseDevModuleFallback =
  targetUrl.includes('127.0.0.1') || targetUrl.includes('localhost')

function parseZoom(text) {
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*px\/mm/i)
  assert.ok(match, `Unable to parse zoom from "${text}"`)
  return Number(match[1])
}

async function expectHidden(locator) {
  await locator.waitFor({ state: 'hidden' }).catch(async () => {
    const count = await locator.count()
    assert.equal(count, 0)
  })
}

const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  page.on('pageerror', (error) => {
    console.log(`PAGEERROR: ${error.message}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.log(`CONSOLE:${message.text()}`)
    }
  })

  const step = (label) => {
    console.log(`STEP: ${label}`)
  }

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
  step('page loaded')

  const guideButton = page.getByRole('button', { name: 'Guide' })
  const rawJsonButton = page.getByRole('button', { name: 'Raw JSON' })
  const exportButton = page.getByRole('button', { name: 'Export' })
  const importButton = page.getByRole('button', { name: 'Import' })
  const helpButton = page.getByRole('button', { name: 'Help' })
  const realisticButton = page.getByRole('button', { name: 'Realistic' })
  const simpleButton = page.getByRole('button', { name: 'Simple' })
  const beamButton = page.locator('.toolbar').getByRole('button', {
    exact: true,
    name: 'Beam',
  })
  const componentFamilyButton = (name) =>
    page.locator('.component-library__item').filter({ hasText: name }).first()
  const ensureLibraryGroupExpanded = async (headingName) => {
    const groupButton = page.getByRole('button', { name: new RegExp(headingName, 'i') }).first()
    const text = await groupButton.textContent()
    if (text?.includes('▸')) {
      await groupButton.click()
    }
  }
  const tourCard = page.locator('.tour-card')
  const exportMenu = page.locator('.toolbar__menu-popover')
  const exportDialog = page.getByRole('dialog', { name: 'Export options' })
  const tutorialButton = page.getByRole('button', { name: 'Tutorial' })

  const readScene = async () => {
    await rawJsonButton.click()
    const textarea = page.locator('.json-modal textarea')
    await textarea.waitFor()
    const scene = JSON.parse((await textarea.inputValue()) || '{}')
    await page.getByRole('button', { name: 'Close' }).click()
    await expectHidden(page.locator('.json-modal'))
    return scene
  }

  const loadScene = async (scene) => {
    await rawJsonButton.click()
    const textarea = page.locator('.json-modal textarea')
    await textarea.waitFor()
    await textarea.fill(JSON.stringify(scene, null, 2))
    await page.getByRole('button', { name: 'Load Scene' }).click()
    await expectHidden(page.locator('.json-modal'))
  }

  const getStageBox = async () => {
    const stage = page.locator('.konvajs-content')
    const stageBox = await stage.boundingBox()
    assert.ok(stageBox, 'Stage should be visible')
    return stageBox
  }

  const getBeamSegmentMidpointsPx = async () =>
    page.evaluate(async () => {
      const { traceSceneBeams } = await import('/src/domain/beamTracing.ts')
      const { worldToScreen } = await import('/src/domain/geometry.ts')
      const { useEditorStore } = await import('/src/state/editorStore.ts')

      const state = useEditorStore.getState()
      const trace = traceSceneBeams(state.scene)

      return {
        canvasSizePx: state.viewport.canvasSizePx,
        candidates: trace.segments
        .map((segment) => {
          const midpointMm = {
            x: (segment.startMm.x + segment.endMm.x) / 2,
            y: (segment.startMm.y + segment.endMm.y) / 2,
          }

          return {
            id: segment.id,
            lengthMm: Math.hypot(
              segment.endMm.x - segment.startMm.x,
              segment.endMm.y - segment.startMm.y,
            ),
            pointPx: worldToScreen(midpointMm, state.viewport),
          }
        })
        .sort((left, right) => right.lengthMm - left.lengthMm),
      }
    })

  const clickStageRelative = async (xRatio, yRatio) => {
    const stageBox = await getStageBox()
    await page.locator('.konvajs-content').click({
      force: true,
      position: {
        x: stageBox.width * xRatio,
        y: stageBox.height * yRatio,
      },
    })
    await page.waitForTimeout(180)
  }

  const getDownloadName = async (action) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      action(),
    ])
    return download.suggestedFilename()
  }

  const openExportOptions = async (formatName) => {
    await exportButton.click()
    await exportMenu.waitFor()
    await exportMenu.getByRole('button', { name: formatName }).click()
    await exportDialog.waitFor()
  }

  const finishExportAfterOptions = async (confirmButtonName) => {
    const downloadPromise = page.waitForEvent('download')
    await exportDialog.getByRole('button', { name: confirmButtonName }).click()

    const warningReview = page.getByRole('dialog', {
      name: /Review Warnings Before/i,
    })
    await page.waitForTimeout(250)
    if (await warningReview.isVisible().catch(() => false)) {
      await warningReview.getByRole('button', { name: 'Export anyway' }).click()
    }

    return downloadPromise
  }

  const openToolbarMenu = async (button, label) => {
    try {
      await button.click({ force: true })
    } catch {
      await button.evaluate((element) => {
        ;(element).click()
      })
    }
    await page.waitForTimeout(180)
    try {
      await exportMenu.waitFor()
    } catch (error) {
      if (canUseDevModuleFallback) {
        const debugState = await page.evaluate(async () => {
          const { useEditorStore } = await import('/src/state/editorStore.ts')
          return {
            buttonTexts: [...document.querySelectorAll('button')].map((buttonElement) =>
              buttonElement.textContent?.trim(),
            ),
            menuCount: document.querySelectorAll('.toolbar__menu-popover').length,
            openToolbarMenu: useEditorStore.getState().openToolbarMenu,
          }
        })

        console.log(`DEBUG ${label}: ${JSON.stringify(debugState)}`)
      }

      throw error
    }
    step(`${label} menu opened`)
  }

  if (await tourCard.isVisible().catch(() => false)) {
    step('first-run tour visible')
    await page.getByRole('button', { name: 'Exit' }).click()
    await expectHidden(tourCard)
  }

  await guideButton.click()
  await tourCard.waitFor()
  step('guide reopened')
  await page.getByRole('button', { name: 'Exit' }).click()
  await expectHidden(tourCard)

  await helpButton.click()
  const helpDialog = page.locator('.toolbar__help-popover')
  await helpDialog.waitFor()
  step('help opened')
  const helpText = (await helpDialog.textContent()) ?? ''
  assert.match(helpText, /Select is for placing and editing components/i)
  assert.match(helpText, /Envelope/i)
  assert.match(helpText, /Realistic shows mounted hardware silhouettes/i)
  assert.match(helpText, /Simple uses cleaner symbolic optics/i)
  assert.match(helpText, /DXF/i)
  assert.match(helpText, /Tutorial/i)
  await page.keyboard.press('Escape')
  await expectHidden(helpDialog)

  await openToolbarMenu(importButton, 'import')
  assert.match((await exportMenu.textContent()) ?? '', /Scene JSON/)
  await page.keyboard.press('Escape')
  await expectHidden(exportMenu)

  await openToolbarMenu(exportButton, 'export')
  const exportText = (await exportMenu.textContent()) ?? ''
  assert.match(exportText, /PNG/)
  assert.match(exportText, /PDF/)
  assert.match(exportText, /SVG/)
  assert.match(exportText, /DXF/)
  await page.keyboard.press('Escape')
  await expectHidden(exportMenu)

  await tutorialButton.click()
  const tutorialDialog = page.getByRole('dialog', { name: 'Load tutorial scene' })
  await tutorialDialog.waitFor()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expectHidden(tutorialDialog)

  await simpleButton.click()
  assert.match((await simpleButton.getAttribute('class')) ?? '', /is-active-tool/)
  await realisticButton.click()
  assert.match((await realisticButton.getAttribute('class')) ?? '', /is-active-tool/)
  step('render mode toggled')

  if (!canUseDevModuleFallback) {
    await beamButton.click({ force: true })
    const productionBeamMenu = page.locator('.toolbar__menu-popover')
    await productionBeamMenu.waitFor()
    assert.match((await productionBeamMenu.textContent()) ?? '', /Envelope/)
    await page.keyboard.press('Escape')
    await expectHidden(productionBeamMenu)
    step('production deploy confirmed')
    console.log('ux-clarity-smoke-ok')
    await browser.close()
    process.exit(0)
  }

  await ensureLibraryGroupExpanded('Beam Steering')
  await componentFamilyButton('Mirror').click()
  await page.getByRole('heading', { name: 'Pending Placement' }).waitFor()
  step('mirror placement armed')
  let scene = await readScene()
  assert.equal(scene.components.length, 0)

  await clickStageRelative(0.5, 0.5)
  scene = await readScene()
  assert.deepEqual(scene.components.map((component) => component.label), ['Mirror 1'])

  await componentFamilyButton('Mirror').click()
  await clickStageRelative(0.585, 0.5)
  scene = await readScene()
  step('two mirrors placed')
  assert.deepEqual(scene.components.map((component) => component.label), [
    'Mirror 1',
    'Mirror 2',
  ])

  await page
    .locator('.toolbar__field')
    .filter({ hasText: 'Snap' })
    .locator('select')
    .selectOption('none')
  await ensureLibraryGroupExpanded('Beam Steering')
  await componentFamilyButton('Mirror').click()
  await clickStageRelative(0.53, 0.47)
  step('warning-producing placement committed')

  const warningButton = page.locator('.toolbar__warning-toggle')
  await warningButton.waitFor()
  await warningButton.click()
  const warningPopover = page.locator('.toolbar__warning-popover')
  await warningPopover.waitFor()
  const warningText = (await warningPopover.textContent()) ?? ''
  assert.match(warningText, /Warning settings/i)
  assert.match(warningText, /Simple/i)
  assert.match(warningText, /Advanced/i)
  await warningPopover.getByRole('button', { name: 'Advanced' }).click()
  step('warning filter toggled')

  await exportButton.click()
  await exportMenu.waitFor()
  await exportMenu.getByRole('button', { name: 'PNG' }).click()
  await exportDialog.waitFor()
  await exportDialog.getByLabel('Breadboard Only').check()
  await exportDialog.getByRole('button', { name: 'Export PNG' }).click()
  await page
    .getByRole('heading', { name: /Review Warnings Before Breadboard PNG/i })
    .waitFor()
  assert.match((await warningButton.getAttribute('class')) ?? '', /is-pulsing/)
  await page.getByRole('button', { name: 'Review warnings' }).click()
  await warningPopover.waitFor()
  step('warning review opened from export')
  await page.keyboard.press('Escape')
  await expectHidden(warningPopover)

  scene = {
    ...scene,
    components: [
      {
        id: 'laser-1',
        type: 'laser-source',
        label: 'Laser Source 1',
        variantId: 'fs-source-head',
        anchorMm: { x: -60, y: 137.5 },
        rotationQuarterTurns: 0,
        config: {
          source: {
            bandwidthNm: 10,
            beamDiameterMm: 1.2,
            divergenceMrad: 0.8,
            firstTargetComponentId: 'mirror-1',
            gaussianInputMode: 'explicit-waist',
            isEnabled: true,
            lane: 'left',
            normalizedPowerPercent: 100,
            polarization: {
              basis: 'ray-local',
              inPlaneAmplitude: 1,
              outOfPlaneAmplitude: 0,
              presetId: 'linear-in-plane',
              relativePhaseDeg: 0,
            },
            powerMw: 100,
            presetId: 'ti-sapphire',
            waistOffsetMm: 18,
            waistRadiusMm: 0.45,
            wavelengthNm: 800,
          },
        },
      },
      {
        id: 'mirror-1',
        type: 'mirror',
        label: 'Mirror 1',
        variantId: 'bb1-e02',
        anchorMm: { x: 112.5, y: 137.5 },
        rotationQuarterTurns: 0,
        config: {
          support: {
            includeMount: true,
          },
        },
      },
    ],
  }

  await loadScene(scene)
  try {
    await beamButton.click({ force: true })
  } catch {
    await beamButton.evaluate((element) => {
      ;(element).click()
    })
  }
  const beamMenu = page.locator('.toolbar__menu-popover')
  await beamMenu.waitFor()
  await beamMenu.getByRole('button', { name: 'Beam Details' }).click()
  await beamMenu.getByRole('button', { name: 'Envelope' }).click()
  step('beam menu toggled')
  await page.keyboard.press('Escape')
  await expectHidden(beamMenu)

  const zoomBeforeBeamClick = parseZoom(
    (await page.locator('.toolbar__zoom').textContent()) ?? '',
  )

  const stage = page.locator('.konvajs-content')
  const stageBox = await getStageBox()
  let beamInspectionVisible = false

  const beamCandidates = await getBeamSegmentMidpointsPx()

  for (const candidate of beamCandidates.candidates) {
    const position = {
      x: (candidate.pointPx.x / beamCandidates.canvasSizePx.width) * stageBox.width,
      y: (candidate.pointPx.y / beamCandidates.canvasSizePx.height) * stageBox.height,
    }

    if (
      position.x < 0 ||
      position.y < 0 ||
      position.x > stageBox.width ||
      position.y > stageBox.height
    ) {
      continue
    }

    await stage.click({
      force: true,
      position,
    })
    await page.waitForTimeout(90)

    if (await page.getByRole('heading', { name: 'Beam Inspection' }).isVisible().catch(() => false)) {
      beamInspectionVisible = true
      break
    }
  }

  assert.equal(
    parseZoom((await page.locator('.toolbar__zoom').textContent()) ?? ''),
    zoomBeforeBeamClick,
    'Beam selection smoke should not change zoom',
  )
  assert.ok(beamInspectionVisible, 'Beam segment selection should be reachable on canvas')
  step('beam inspection selected from canvas')

  await tutorialButton.click()
  await page.getByRole('dialog', { name: 'Load tutorial scene' }).waitFor()
  await page.getByRole('button', { name: 'Replace with tutorial' }).click()
  await tourCard.waitFor()
  let tutorialText = (await tourCard.textContent()) ?? ''
  assert.match(tutorialText, /curved mirror/i)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  tutorialText = (await tourCard.textContent()) ?? ''
  assert.match(tutorialText, /Stage 2/i)
  assert.match(tutorialText, /Stage 3/i)
  await page.getByRole('button', { name: 'Next' }).click()
  tutorialText = (await tourCard.textContent()) ?? ''
  assert.match(tutorialText, /2D model/i)
  await page.getByRole('button', { name: 'Exit' }).click()
  await expectHidden(tourCard)
  step('tutorial scene walkthrough opened and explained staged physics')

  if (canUseDevModuleFallback) {
    await page.screenshot({ path: 'output/playwright/ux-clarity-smoke.png', fullPage: true })
  }

  console.log('ux-clarity-smoke-ok')
} finally {
  await browser.close()
}
