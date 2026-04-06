import assert from 'node:assert/strict'
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

  await page.goto(targetUrl, { waitUntil: 'networkidle' })

  const rawJsonButton = page.getByRole('button', { name: 'Raw JSON' })
  const helpButton = page.getByRole('button', { name: 'Help' })

  const inspectorField = (label) =>
    page.locator('.inspector__field').filter({ hasText: label })

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
    await page.waitForTimeout(220)
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

  const selectByCenteredCanvasSearch = async (headingName) => {
    for (const yRatio of [0.42, 0.46, 0.5, 0.54, 0.58]) {
      for (const xRatio of [0.42, 0.46, 0.5, 0.54, 0.58, 0.62]) {
        await clickStageRelative(xRatio, yRatio)

        if (await page.getByRole('heading', { name: headingName }).isVisible().catch(() => false)) {
          return
        }
      }
    }

    throw new Error(`Unable to select component for inspector section "${headingName}"`)
  }

  const readInspectorReadout = async (label) => {
    const container = page
      .locator('.inspector__readout > div')
      .filter({ hasText: label })
      .first()
    return ((await container.locator('strong').textContent()) ?? '').trim()
  }

  const centeredBreadboard = (breadboard) => ({
    ...breadboard,
    label: 'Metric Breadboard 350 × 350',
    presetId: 'metric-350-square',
    widthMm: 350,
    heightMm: 350,
  })

  const source = ({
    id,
    label,
    y,
    wavelengthNm,
    bandwidthNm,
    powerMw,
    polarization,
  }) => ({
    id,
    type: 'laser-source',
    label,
    variantId: 'fs-source-head',
    anchorMm: { x: -60, y },
    rotationQuarterTurns: 0,
    config: {
      source: {
        presetId: 'ti-sapphire',
        lane: 'left',
        isEnabled: true,
        wavelengthNm,
        bandwidthNm,
        powerMw,
        normalizedPowerPercent: 100,
        beamDiameterMm: 1.2,
        divergenceMrad: 0.8,
        gaussianInputMode: 'explicit-waist',
        waistRadiusMm: 0.45,
        waistOffsetMm: 18,
        polarization,
      },
    },
  })

  const linearInPlane = {
    basis: 'ray-local',
    presetId: 'linear-in-plane',
    inPlaneAmplitude: 1,
    outOfPlaneAmplitude: 0,
    relativePhaseDeg: 0,
  }

  if (await page.locator('.tour-card').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Exit' }).click()
    await expectHidden(page.locator('.tour-card'))
  }

  const baseScene = await readScene()

  await helpButton.click()
  const helpText = (await page.locator('.toolbar__help-popover').textContent()) ?? ''
  assert.match(helpText, /Delay lines add internal optical path and femtosecond delay/i)
  assert.match(helpText, /Real coincident beam hits take priority/i)
  assert.match(helpText, /Periscopes are still 2D relays/i)
  await page.keyboard.press('Escape')
  await expectHidden(page.locator('.toolbar__help-popover'))
  step('help reflects new optics physics copy')

  await loadScene({
    ...baseScene,
    workspace: {
      kind: 'single-breadboard',
      breadboard: centeredBreadboard(baseScene.workspace.breadboard),
    },
    components: [
      source({
        id: 'pump',
        label: 'Pump',
        y: 175,
        wavelengthNm: 800,
        bandwidthNm: 10,
        powerMw: 120,
        polarization: linearInPlane,
      }),
      {
        id: 'stage-1',
        type: 'sample-stage',
        label: 'Delay Stage',
        variantId: 'pi-m-112-1dg1',
        anchorMm: { x: 175, y: 175 },
        rotationQuarterTurns: 0,
        config: {
          delayLine: {
            positionMm: 10,
            travelMm: 25,
            topology: 'double-pass',
            zeroDelayOffsetFs: 0,
          },
          support: { includeMount: true },
        },
      },
    ],
  })
  await selectByCenteredCanvasSearch('Delay Line')
  await page.getByRole('heading', { name: 'Delay Line' }).waitFor()
  await inspectorField('Scan slider').locator('input[type="range"]').waitFor()
  const initialDelay = await readInspectorReadout('Derived delay')
  await inspectorField('Position (mm)').locator('input').fill('15')
  const updatedDelay = await readInspectorReadout('Derived delay')
  assert.notEqual(updatedDelay, initialDelay)
  assert.match(updatedDelay, /fs$/)
  step('delay-line controls update derived femtosecond delay')

  await loadScene({
    ...baseScene,
    workspace: {
      kind: 'single-breadboard',
      breadboard: centeredBreadboard(baseScene.workspace.breadboard),
    },
    components: [
      source({
        id: 'pump',
        label: 'Pump',
        y: 175,
        wavelengthNm: 800,
        bandwidthNm: 10,
        powerMw: 120,
        polarization: linearInPlane,
      }),
      {
        id: 'tel-1',
        type: 'telescope',
        label: 'Telescope 1',
        variantId: 'beam-expander-2x',
        anchorMm: { x: 175, y: 175 },
        rotationQuarterTurns: 0,
        config: {
          telescope: {
            mode: 'transmission',
            element1Mm: 50,
            element2Mm: 100,
            separationMm: 150,
            clearApertureMm: 25.4,
          },
          support: { includeMount: true },
        },
      },
    ],
  })
  await selectByCenteredCanvasSearch('Telescope')
  await page.getByRole('heading', { name: 'Telescope' }).waitFor()
  const initialMagnification = await readInspectorReadout('Nominal magnification')
  await inspectorField('Lens 2 f (mm)').locator('input').fill('125')
  const updatedMagnification = await readInspectorReadout('Nominal magnification')
  assert.notEqual(updatedMagnification, initialMagnification)
  assert.match(updatedMagnification, /x$/)
  step('telescope controls update magnification readout')

  await loadScene({
    ...baseScene,
    workspace: {
      kind: 'single-breadboard',
      breadboard: centeredBreadboard(baseScene.workspace.breadboard),
    },
    components: [
      source({
        id: 'pump',
        label: 'Pump',
        y: 175,
        wavelengthNm: 800,
        bandwidthNm: 10,
        powerMw: 120,
        polarization: linearInPlane,
      }),
      {
        id: 'att-1',
        type: 'attenuator',
        label: 'Attenuator 1',
        variantId: 'variable-nd-horizontal',
        anchorMm: { x: 175, y: 175 },
        rotationQuarterTurns: 0,
        config: {
          attenuator: {
            transmissionPercent: 50,
            orientation: 'horizontal',
          },
          support: { includeMount: true },
        },
      },
    ],
  })
  await selectByCenteredCanvasSearch('Attenuator')
  await page.getByRole('heading', { name: 'Attenuator' }).waitFor()
  const initialPower = await readInspectorReadout('Output power')
  await inspectorField('Transmission (%)').locator('input').fill('25')
  const updatedPower = await readInspectorReadout('Output power')
  assert.notEqual(updatedPower, initialPower)
  step('attenuator updates transmitted power readout')

  await loadScene({
    ...baseScene,
    workspace: {
      kind: 'single-breadboard',
      breadboard: centeredBreadboard(baseScene.workspace.breadboard),
    },
    components: [
      source({
        id: 'pump',
        label: 'Pump',
        y: 175,
        wavelengthNm: 800,
        bandwidthNm: 10,
        powerMw: 120,
        polarization: linearInPlane,
      }),
      {
        id: 'pol-1',
        type: 'polarizer',
        label: 'Polarizer 1',
        variantId: 'lpvis100',
        anchorMm: { x: 175, y: 175 },
        rotationQuarterTurns: 0,
        config: {
          polarizer: {
            axisLocalDeg: 0,
            extinctionRatio: 1000,
            insertionLossPercent: 14,
          },
          support: { includeMount: true },
        },
      },
    ],
  })
  await selectByCenteredCanvasSearch('Polarizer')
  await page.getByRole('heading', { name: 'Polarizer' }).waitFor()
  await inspectorField('Axis (deg)').locator('input').fill('45')
  const polarizerScene = await readScene()
  const polarizerConfig = polarizerScene.components.find(
    (component) => component.id === 'pol-1',
  )?.config?.polarizer
  assert.equal(polarizerConfig?.axisLocalDeg, 45)
  step('polarizer inspector control persists axis changes')

  await loadScene({
    ...baseScene,
    workspace: {
      kind: 'single-breadboard',
      breadboard: centeredBreadboard(baseScene.workspace.breadboard),
    },
    components: [
      source({
        id: 'pump',
        label: 'Pump',
        y: 175,
        wavelengthNm: 800,
        bandwidthNm: 10,
        powerMw: 120,
        polarization: linearInPlane,
      }),
      {
        id: 'wp-1',
        type: 'waveplate',
        label: 'Waveplate 1',
        variantId: 'half-wave',
        anchorMm: { x: 175, y: 175 },
        rotationQuarterTurns: 0,
        config: {
          waveplate: {
            kind: 'half',
            axisLocalDeg: 22.5,
            retardanceDeg: 180,
            insertionLossPercent: 2,
          },
          support: { includeMount: true },
        },
      },
    ],
  })
  await selectByCenteredCanvasSearch('Waveplate')
  await page.getByRole('heading', { name: 'Waveplate' }).waitFor()
  const initialWaveplateState = await readInspectorReadout('Outgoing polarization')
  await inspectorField('Kind').locator('select').selectOption('quarter')
  const updatedWaveplateState = await readInspectorReadout('Outgoing polarization')
  assert.notEqual(updatedWaveplateState, initialWaveplateState)
  step('waveplate updates outgoing polarization state')

  await loadScene({
    ...baseScene,
    workspace: {
      kind: 'single-breadboard',
      breadboard: centeredBreadboard(baseScene.workspace.breadboard),
    },
    components: [
      source({
        id: 'pump',
        label: 'Pump',
        y: 175,
        wavelengthNm: 800,
        bandwidthNm: 10,
        powerMw: 120,
        polarization: linearInPlane,
      }),
      {
        id: 'cm-1',
        type: 'mirror',
        label: 'Concave Mirror 1',
        variantId: 'concave-1in',
        anchorMm: { x: 175, y: 175 },
        rotationQuarterTurns: 0,
        config: {
          curvedMirror: {
            radiusOfCurvatureMm: 200,
            isConvex: false,
          },
          support: { includeMount: true },
        },
      },
    ],
  })
  await selectByCenteredCanvasSearch('Curved Mirror')
  await page.getByRole('heading', { name: 'Curved Mirror' }).waitFor()
  const initialCurvedMirrorOffset = await readInspectorReadout('Output waist offset')
  await inspectorField('ROC (mm)').locator('input').fill('250')
  const updatedCurvedMirrorOffset = await readInspectorReadout('Output waist offset')
  assert.notEqual(updatedCurvedMirrorOffset, initialCurvedMirrorOffset)
  step('curved mirror updates Gaussian output readout')

  await loadScene({
    ...baseScene,
    workspace: {
      kind: 'single-breadboard',
      breadboard: centeredBreadboard(baseScene.workspace.breadboard),
    },
    components: [
      source({
        id: 'pump',
        label: 'Pump',
        y: 175,
        wavelengthNm: 800,
        bandwidthNm: 10,
        powerMw: 120,
        polarization: linearInPlane,
      }),
      source({
        id: 'seed',
        label: 'Seed',
        y: 225,
        wavelengthNm: 1030,
        bandwidthNm: 16,
        powerMw: 60,
        polarization: linearInPlane,
      }),
      {
        id: 'opa-1',
        type: 'opa-module',
        label: 'OPA Gain 1',
        variantId: 'opa-gain-stage',
        anchorMm: { x: 175, y: 175 },
        rotationQuarterTurns: 0,
        config: {
          opa: {
            role: 'gain',
            outputMode: 'signal+idler',
            conversionEfficiencyPercent: 20,
            targetWavelengthNm: 650,
            signalWavelengthNm: 650,
            idlerWavelengthNm: 1350,
            outputBandwidthNm: 35,
          },
        },
      },
    ],
  })
  await selectByCenteredCanvasSearch('OPA Module')
  await page.getByRole('heading', { name: 'OPA Module' }).waitFor()
  await inspectorField('Pump link').locator('select').selectOption('pump')
  await inspectorField('Seed link').locator('select').selectOption('seed')
  await page.waitForTimeout(250)
  assert.equal(await readInspectorReadout('Readiness'), 'Ready / traced')
  const latestOpaOutput = await readInspectorReadout('Latest output')
  assert.match(latestOpaOutput, /nm$/)
  if (isLocalDev) {
    const latestScene = await readScene()
    const opaConfig = latestScene.components.find(
      (component) => component.id === 'opa-1',
    )?.config?.opa
    assert.equal(opaConfig?.pumpLink?.sourceComponentId, 'pump')
    assert.equal(opaConfig?.seedLink?.sourceComponentId, 'seed')
  }
  step('OPA links persist and yield traced output readouts')

  console.log('optics-physics-smoke-ok')
} finally {
  await browser.close()
}
