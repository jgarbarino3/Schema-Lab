import assert from 'node:assert/strict'
import { chromium, devices } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:4173/'
const scenarios = [
  {
    contextOptions: devices['iPad Pro 11 landscape'],
    label: 'iPad landscape',
  },
  {
    contextOptions: {
      deviceScaleFactor: 3,
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    },
    label: 'phone portrait',
  },
  {
    contextOptions: {
      deviceScaleFactor: 3,
      hasTouch: true,
      isMobile: true,
      viewport: { width: 844, height: 390 },
    },
    label: 'phone landscape',
  },
]

function parseZoom(text) {
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*px\/mm/i)
  assert.ok(match, `Unable to parse zoom from "${text}"`)
  return Number(match[1])
}

async function dispatchSyntheticTouchEvent(page, selector, type, points) {
  await page.evaluate(
    ({ selector: targetSelector, touchType, touchPoints }) => {
      const target = document.querySelector(targetSelector)

      if (!(target instanceof HTMLElement)) {
        throw new Error(`Touch target not found for selector ${targetSelector}`)
      }

      const touches = touchPoints.map((point, index) =>
        new Touch({
          clientX: point.x,
          clientY: point.y,
          force: 1,
          identifier: point.id ?? index + 1,
          pageX: point.x,
          pageY: point.y,
          radiusX: 1,
          radiusY: 1,
          screenX: point.x,
          screenY: point.y,
          target,
        }),
      )

      target.dispatchEvent(
        new TouchEvent(touchType, {
          bubbles: true,
          cancelable: true,
          changedTouches: touches,
          targetTouches:
            touchType === 'touchend' || touchType === 'touchcancel' ? [] : touches,
          touches:
            touchType === 'touchend' || touchType === 'touchcancel' ? [] : touches,
        }),
      )
    },
    {
      selector,
      touchPoints: points,
      touchType: type,
    },
  )
}

async function runSyntheticPinchGesture(
  page,
  selector,
  firstStart,
  secondStart,
  firstEnd,
  secondEnd,
  steps = 10,
) {
  let lastPoints = [
    { ...firstStart, id: 1 },
    { ...secondStart, id: 2 },
  ]

  await dispatchSyntheticTouchEvent(page, selector, 'touchstart', lastPoints)

  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps
    lastPoints = [
      {
        id: 1,
        x: firstStart.x + (firstEnd.x - firstStart.x) * progress,
        y: firstStart.y + (firstEnd.y - firstStart.y) * progress,
      },
      {
        id: 2,
        x: secondStart.x + (secondEnd.x - secondStart.x) * progress,
        y: secondStart.y + (secondEnd.y - secondStart.y) * progress,
      },
    ]

    await dispatchSyntheticTouchEvent(page, selector, 'touchmove', lastPoints)
    await page.waitForTimeout(16)
  }

  await dispatchSyntheticTouchEvent(page, selector, 'touchend', lastPoints)
}

async function runSyntheticOneFingerDrag(page, selector, start, end, steps = 10) {
  let lastPoint = { ...start, id: 1 }

  await dispatchSyntheticTouchEvent(page, selector, 'touchstart', [lastPoint])

  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps
    lastPoint = {
      id: 1,
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    }

    await dispatchSyntheticTouchEvent(page, selector, 'touchmove', [lastPoint])
    await page.waitForTimeout(16)
  }

  await dispatchSyntheticTouchEvent(page, selector, 'touchend', [lastPoint])
}

async function runTouchScenario(browser, scenario) {
  const context = await browser.newContext(scenario.contextOptions)
  const page = await context.newPage()
  page.setDefaultTimeout(10000)

  const step = (label) => {
    console.log(`STEP: ${label}`)
  }

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle' })

    const tourCard = page.locator('.tour-card')
    if (await tourCard.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Exit' }).click()
      await tourCard.waitFor({ state: 'hidden' })
    }

    await page.evaluate(() => {
      const store = window.__SCHEMA_LAB_STORE__.getState()
      store.createFreshOpticalTable()
      store.setWorkspaceViewMode('table-view')
    })
    await page.waitForTimeout(250)

    const stage = page.locator('.konvajs-content').first()
    const stageBox = await stage.boundingBox()
    assert.ok(stageBox, 'Stage viewport should be visible')

    const initialZoom = parseZoom(await page.getByTestId('status-zoom').textContent())
    step(`${scenario.label} viewport loaded in table mode`)

    await runSyntheticPinchGesture(
      page,
      '.konvajs-content',
      {
        x: stageBox.x + stageBox.width * 0.36,
        y: stageBox.y + stageBox.height * 0.5,
      },
      {
        x: stageBox.x + stageBox.width * 0.64,
        y: stageBox.y + stageBox.height * 0.5,
      },
      {
        x: stageBox.x + stageBox.width * 0.28,
        y: stageBox.y + stageBox.height * 0.5,
      },
      {
        x: stageBox.x + stageBox.width * 0.72,
        y: stageBox.y + stageBox.height * 0.5,
      },
    )

    const zoomAfterPinch = parseZoom(await page.getByTestId('status-zoom').textContent())
    assert.notEqual(zoomAfterPinch, initialZoom, 'Pinch should change the visible zoom')
    step(`pinch gesture changes zoom on ${scenario.label} viewport`)

    const viewportBeforeDrag = await page.evaluate(
      () => window.__SCHEMA_LAB_STORE__.getState().viewport,
    )

    await runSyntheticOneFingerDrag(
      page,
      '.konvajs-content',
      {
        x: stageBox.x + stageBox.width * 0.55,
        y: stageBox.y + stageBox.height * 0.55,
      },
      {
        x: stageBox.x + stageBox.width * 0.38,
        y: stageBox.y + stageBox.height * 0.42,
      },
    )

    const viewportAfterDrag = await page.evaluate(
      () => window.__SCHEMA_LAB_STORE__.getState().viewport,
    )
    assert.notDeepEqual(
      viewportAfterDrag.cameraCenterMm,
      viewportBeforeDrag.cameraCenterMm,
      'One-finger drag should pan the camera in table mode',
    )
    step(`one-finger drag pans the camera on ${scenario.label} viewport`)

    const statusBoard = await page.getByTestId('status-board').textContent()
    assert.match(statusBoard ?? '', /Board:/i)
    step(`status bar remains readable after ${scenario.label} touch interactions`)
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch({ headless: true })

try {
  for (const scenario of scenarios) {
    await runTouchScenario(browser, scenario)
  }
  console.log('touch-pinch-smoke-ok')
} finally {
  await browser.close()
}
