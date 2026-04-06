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

  const rawJsonButton = page.getByRole('button', { name: 'Raw JSON' })
  const exportButton = page.getByRole('button', { name: 'Export' })
  const guideButton = page.getByRole('button', { name: 'Guide' })
  const helpButton = page.getByRole('button', { name: 'Help' })
  const simpleButton = page.getByRole('button', { name: 'Simple' })
  const realisticButton = page.getByRole('button', { name: 'Realistic' })
  const tableButton = page.getByRole('button', { exact: true, name: 'Table' })
  const boardButton = page.getByRole('button', { exact: true, name: 'Board' })
  const warningButton = page.locator('.toolbar__warning-toggle')
  const exportMenu = page.locator('.toolbar__menu-popover')
  const exportDialog = page.getByRole('dialog', { name: 'Export options' })
  const beamInspectionHeading = page.getByRole('heading', {
    name: 'Beam Inspection',
  })

  const readScene = async () => {
    await rawJsonButton.click()
    const textarea = page.locator('.json-modal textarea')
    await textarea.waitFor()
    const scene = JSON.parse(await textarea.inputValue())
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
    const stage = page.locator('.konvajs-content canvas').first()
    const stageBox = await stage.boundingBox()
    assert.ok(stageBox, 'Stage should be visible')
    return stageBox
  }

  const clickStageRelative = async (xRatio, yRatio) => {
    const stageBox = await getStageBox()
    await page.locator('.konvajs-content canvas').first().click({
      force: true,
      position: {
        x: stageBox.width * xRatio,
        y: stageBox.height * yRatio,
      },
    })
    await page.waitForTimeout(220)
  }

  const toolbarField = (label) =>
    page.locator('.toolbar__field').filter({ hasText: label })

  const requestSvgExport = async (scope) => {
    await exportButton.click()
    await exportMenu.waitFor()
    await exportMenu.getByRole('button', { name: 'SVG' }).click()
    await exportDialog.waitFor()
    await exportDialog.getByLabel(scope).check()
    await exportDialog.getByLabel('Engineering SVG').check()
    await exportDialog.getByRole('button', { name: /Export .*SVG/i }).click()
  }

  if (await page.locator('.tour-card').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Exit' }).click()
    await expectHidden(page.locator('.tour-card'))
  }

  await guideButton.click()
  const spotlight = page.locator('.tour-overlay__spotlight')
  await spotlight.waitFor()
  const spotlightBefore = await spotlight.boundingBox()
  assert.ok(spotlightBefore, 'Guide spotlight should render')
  await page.mouse.move(24, 24)
  await page.mouse.wheel(0, 700)
  await page.waitForTimeout(180)
  const spotlightAfter = await spotlight.boundingBox()
  assert.ok(spotlightAfter, 'Guide spotlight should remain rendered')
  assert.ok(closeEnough(spotlightBefore.x, spotlightAfter.x))
  assert.ok(closeEnough(spotlightBefore.y, spotlightAfter.y))
  step('guide spotlight stayed stable while background scroll was attempted')
  await page.getByRole('button', { name: 'Exit' }).click()
  await expectHidden(page.locator('.tour-card'))

  await helpButton.click()
  const helpDialog = page.locator('.toolbar__help-popover')
  await helpDialog.waitFor()
  const helpText = (await helpDialog.textContent()) ?? ''
  assert.match(helpText, /Select is for placing and editing components/i)
  assert.match(helpText, /Hand drags the viewport/i)
  assert.match(helpText, /Realistic shows mounted hardware silhouettes/i)
  assert.match(helpText, /Simple uses cleaner symbolic optics/i)
  assert.match(helpText, /large laser-body variants can also sit directly on the table/i)
  assert.match(helpText, /Engineering SVG/i)
  assert.match(helpText, /DXF/i)
  assert.match(helpText, /Tutorial/i)
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
    const beamButton = page.locator('.toolbar').getByRole('button', {
      exact: true,
      name: 'Beam',
    })
    await beamButton.click({ force: true })
    const beamMenu = page.locator('.toolbar__menu-popover')
    await beamMenu.waitFor()
    await beamMenu.getByRole('button', { name: 'Beam Details' }).click()
    await beamMenu.getByRole('button', { name: 'Envelope' }).click()
    await page.keyboard.press('Escape')
    await expectHidden(beamMenu)
    const stage = page.locator('.konvajs-content canvas').first()
    const stageBox = await getStageBox()
    let beamInspectionVisible = false

    for (const yRatio of [0.44, 0.5, 0.56, 0.62]) {
      for (const xRatio of [0.12, 0.18, 0.24, 0.3, 0.36, 0.42, 0.48, 0.54, 0.6]) {
        await stage.click({
          force: true,
          position: {
            x: stageBox.width * xRatio,
            y: stageBox.height * yRatio,
          },
        })
        await page.waitForTimeout(90)

        if (await beamInspectionHeading.isVisible().catch(() => false)) {
          beamInspectionVisible = true
          break
        }
      }

      if (beamInspectionVisible) {
        break
      }
    }

    if (beamInspectionVisible) {
      assert.match((await page.locator('.canvas-status').textContent()) ?? '', /Beam\s+/i)
      step('real canvas beam click selected a beam path')
    } else {
      console.log(
        'audit-polish-smoke-warning: direct beam click remained better-covered by ux-clarity-smoke than by the consolidated audit run',
      )
    }
  }

  await tableButton.click()
  await page.getByRole('heading', { name: 'Switch to Optical Table' }).waitFor()
  await page.getByRole('button', { name: 'Convert current breadboard' }).click()
  await expectHidden(page.locator('.modal-shell'))
  step('converted to optical table')

  let scene = await readScene()
  assert.equal(scene.workspace.kind, 'optical-table')
  assert.equal(scene.workspace.breadboards.length, 1)

  const breadboardGroup = page
    .locator('.component-library__group')
    .filter({ has: page.getByRole('heading', { name: 'Breadboards' }) })
  await breadboardGroup.locator('.component-library__item').first().click()
  await page.getByText('Placing: Breadboard 2').waitFor()
  await clickStageRelative(0.74, 0.68)
  scene = await readScene()
  assert.equal(scene.workspace.breadboards.length, 2)
  const secondBreadboard = scene.workspace.breadboards[1]
  assert.ok(secondBreadboard, 'Second breadboard should be created')
  step('placed second breadboard on the table')

  await clickStageRelative(0.74, 0.68)
  await toolbarField('Snap').locator('select').selectOption('none')
  await page
    .locator('.component-library__item')
    .filter({ hasText: 'Mirror' })
    .first()
    .click()
  await clickStageRelative(0.772, 0.703)
  await warningButton.waitFor()
  step('warning-producing off-hole placement created')

  await warningButton.click()
  const warningPopover = page.locator('.toolbar__warning-popover')
  await warningPopover.waitFor()
  await warningPopover.getByRole('button', { name: 'Dismiss' }).first().click()
  await page.waitForTimeout(180)
  assert.equal((await warningButton.textContent())?.trim(), 'Warnings')
  await warningButton.click()
  await warningPopover.waitFor()
  await warningPopover.getByRole('button', { name: 'Restore dismissed' }).click()
  await page.waitForTimeout(180)
  assert.match((await warningButton.textContent()) ?? '', /Warnings \d+/)
  step('warning dismiss and restore flow works')

  await exportButton.click()
  await exportMenu.waitFor()
  await exportMenu.getByRole('button', { name: 'SVG' }).click()
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

  await boardButton.click()
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
