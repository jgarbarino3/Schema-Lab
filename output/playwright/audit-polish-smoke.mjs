import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/'
const isLocalDev =
  targetUrl.includes('127.0.0.1') || targetUrl.includes('localhost')

async function expectHidden(locator) {
  await locator.waitFor({ state: 'hidden' }).catch(async () => {
    const count = await locator.count()
    assert.equal(count, 0)
  })
}

function closeEnough(a, b, tolerance = 1.5) {
  return Math.abs(a - b) <= tolerance
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
  page.setDefaultTimeout(10000)

  const step = (label) => {
    console.log(`STEP: ${label}`)
  }

  await page.goto(targetUrl, { waitUntil: 'networkidle' })

  const exportButton = page.getByTestId('toolbar-export')
  const helpButton = page.getByTestId('toolbar-shortcuts')
  const simpleButton = page.getByRole('button', { name: 'Simple' })
  const realisticButton = page.getByRole('button', { name: 'Realistic' })
  const tableButton = page.getByRole('button', { exact: true, name: 'Table View' })
  const boardButton = page.getByRole('button', { exact: true, name: 'Board Focus' })
  const warningButton = page.getByTestId('toolbar-warnings')
  const exportMenu = page.getByTestId('toolbar-menu-export')
  const exportDialog = page.getByRole('dialog', { name: 'Export options' })

  const readScene = async () => {
    return page.evaluate(() =>
      JSON.parse(JSON.stringify(window.__SCHEMA_LAB_STORE__.getState().scene)),
    )
  }

  const loadScene = async (scene) => {
    await page.evaluate((nextScene) => {
      window.__SCHEMA_LAB_STORE__.getState().loadScene(nextScene, { history: 'reset' })
    }, scene)
    await page.waitForTimeout(220)
  }

  const getStageBox = async () => {
    const stage = page.locator('.schema-stage .konvajs-content').first()
    const stageBox = await stage.boundingBox()
    assert.ok(stageBox, 'Stage should be visible')
    return stageBox
  }

  const clickStageRelative = async (xRatio, yRatio) => {
    const stageBox = await getStageBox()
    await page.locator('.schema-stage .konvajs-content').first().click({
      force: true,
      position: {
        x: stageBox.width * xRatio,
        y: stageBox.height * yRatio,
      },
    })
    await page.waitForTimeout(220)
  }

  const ensureLibraryGroupExpanded = async (headingName) => {
    const group = page
      .locator('.component-library__group')
      .filter({ has: page.getByRole('heading', { name: headingName }) })
    const body = group.locator('.component-library__group-body')
    if ((await body.count()) === 0) {
      await group.getByRole('button').first().click()
    }
    await group.locator('.component-library__group-body').waitFor()
  }

  const requestSvgExport = async (scope) => {
    await exportButton.click()
    await exportMenu.waitFor()
    await exportMenu.getByRole('button', { exact: true, name: 'SVG' }).click()
    await exportDialog.waitFor()
    await exportDialog.getByLabel(scope).check()
    await exportDialog.getByLabel('Engineering SVG').check()
    await exportDialog.getByRole('button', { name: /Export .*SVG/i }).click()
  }

  if (await page.locator('.tour-card').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Exit' }).click()
    await expectHidden(page.locator('.tour-card'))
  }

  await helpButton.click()
  const helpDialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await helpDialog.waitFor()
  await helpDialog.getByRole('button', { name: 'Guide' }).click()
  const tourCard = page.locator('.tour-card')
  await tourCard.waitFor()
  step('guide opens from the consolidated help entry')
  await page.getByRole('button', { name: 'Exit' }).click()
  await expectHidden(tourCard)

  await helpButton.click()
  await helpDialog.waitFor()
  const helpText = (await helpDialog.textContent()) ?? ''
  assert.match(helpText, /Help & shortcuts/i)
  assert.match(helpText, /Work faster on the canvas/i)
  assert.match(helpText, /Guide/i)
  assert.match(helpText, /Appendix/i)
  assert.match(helpText, /Tutorial/i)
  assert.match(helpText, /What’s New/i)
  await page.keyboard.press('Escape')
  await expectHidden(helpDialog)
  step('help content reflects the shipped UX')

  await simpleButton.click()
  await realisticButton.click()
  step('render mode toggle still works')

  if (isLocalDev) {
    let scene = await readScene()
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
    await page.getByRole('button', { name: 'Beam Scene' }).click()
    await page.getByRole('button', { name: 'Beam details on' }).waitFor()
    await page.getByRole('button', { name: 'Gaussian envelope off' }).click()
    await page.getByRole('button', { name: 'Gaussian envelope on' }).waitFor()
    step('beam controls moved into the inspector')
  }

  await tableButton.click()
  await expectHidden(page.locator('.modal-shell'))
  step('converted to optical table')

  let scene = await readScene()
  assert.equal(scene.workspace.kind, 'optical-table')
  assert.equal(scene.workspace.breadboards.length, 1)

  await ensureLibraryGroupExpanded('Breadboards')
  await page.getByTestId('library-item-breadboard-metric-300-square').click()
  await page.waitForFunction(() => {
    return Boolean(window.__SCHEMA_LAB_STORE__.getState().interaction.pendingBreadboardPlacement)
  })
  await page.evaluate(() => {
    window.__SCHEMA_LAB_STORE__.getState().commitPendingBreadboardPlacement({
      x: 2125,
      y: 690,
    })
  })
  await page.waitForTimeout(220)
  scene = await readScene()
  assert.equal(scene.workspace.breadboards.length, 2)
  const secondBreadboard = scene.workspace.breadboards[1]
  assert.ok(secondBreadboard, 'Second breadboard should be created')
  step('placed second breadboard on the table')

  await page.evaluate(({ breadboardId, anchorMm }) => {
    const store = window.__SCHEMA_LAB_STORE__.getState()
    store.selectBreadboard(breadboardId)
    store.setFocusedBreadboardId(breadboardId)
    store.setActiveHostSurfaceId(breadboardId)
    store.addComponent('mirror')
    store.commitPendingPlacement(anchorMm)
  }, {
    breadboardId: secondBreadboard.id,
    anchorMm: {
      x: secondBreadboard.anchorMm.x + 67,
      y: secondBreadboard.anchorMm.y + 69,
    },
  })
  await page.waitForTimeout(220)
  await warningButton.waitFor()
  step('warning-producing off-hole placement created')

  await warningButton.click()
  const warningPopover = page.getByTestId('warnings-popover')
  await warningPopover.waitFor()
  await warningPopover.getByRole('button', { name: 'Dismiss' }).first().click()
  await page.waitForTimeout(180)
  assert.match((await warningButton.textContent()) ?? '', /Warnings\s+0/)
  await warningButton.click()
  await warningPopover.waitFor()
  await warningPopover.getByRole('button', { name: 'Restore dismissed' }).click()
  await page.waitForTimeout(180)
  assert.match((await warningButton.textContent()) ?? '', /Warnings\s+[1-9]/)
  step('warning dismiss and restore flow works')

  await exportButton.click()
  await exportMenu.waitFor()
  await exportMenu.getByRole('button', { exact: true, name: 'SVG' }).click()
  await exportDialog.waitFor()
  await exportDialog.getByLabel('Breadboard Only').check()
  await exportDialog.getByLabel('Engineering SVG').check()
  await exportDialog.getByRole('button', { name: /Export .*SVG/i }).click()
  await page
    .getByRole('heading', { name: /Review Warnings Before Breadboard Engineering SVG/i })
    .waitFor()
  await page.getByRole('button', { name: 'Review warnings' }).click()
  await warningPopover.waitFor()
  await warningPopover.getByRole('button', { name: 'Dismiss visible' }).click()
  await page.waitForTimeout(180)
  step('export gating only blocks on undismissed warnings')

  const [svgDownload] = await Promise.all([
    page.waitForEvent('download'),
    requestSvgExport('Breadboard Only'),
  ])
  const svgPath = await svgDownload.path()
  assert.ok(svgPath, 'Breadboard SVG should download')
  const svgMarkup = await readFile(svgPath, 'utf8')
  assert.doesNotMatch(svgMarkup, /Optical Table 3600 × 1500/)
  step('breadboard-only export scope stayed correct')

  await boardButton.hover()
  await page.getByRole('button', { name: 'Solo Board' }).waitFor()
  await page.getByRole('button', { name: 'Solo Board' }).click()
  await page.getByRole('heading', { name: 'Switch to Single Breadboard' }).waitFor()
  await page.locator('input[name="breadboard-choice"][type="radio"]').first().check()
  await page.getByRole('button', { name: 'Switch to single breadboard' }).click()
  await expectHidden(page.locator('.modal-shell'))
  scene = await readScene()
  assert.equal(scene.workspace.kind, 'single-breadboard')
  step('converted back to single breadboard')

  console.log('audit-polish-smoke-ok')
} finally {
  await browser.close()
}
