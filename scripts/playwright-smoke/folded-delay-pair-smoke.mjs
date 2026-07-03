import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:4173/'
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')

async function pathExists(candidatePath) {
  try {
    await fs.access(candidatePath)
    return true
  } catch {
    return false
  }
}

async function getChromiumLaunchOptions() {
  const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

  if (explicitPath && (await pathExists(explicitPath))) {
    return { executablePath: explicitPath, headless: true }
  }

  const cacheRoot = path.join(os.homedir(), 'Library/Caches/ms-playwright')
  try {
    const cacheEntries = await fs.readdir(cacheRoot)
    const cachedShells = cacheEntries
      .filter((entry) => entry.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse()
      .map((entry) =>
        path.join(
          cacheRoot,
          entry,
          'chrome-headless-shell-mac-arm64',
          'chrome-headless-shell',
        ),
      )

    for (const cachedShell of cachedShells) {
      if (await pathExists(cachedShell)) {
        return { executablePath: cachedShell, headless: true }
      }
    }
  } catch {
    // Fall through to the package-managed browser or system Chrome.
  }

  const systemChromePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ]

  for (const chromePath of systemChromePaths) {
    if (await pathExists(chromePath)) {
      return { executablePath: chromePath, headless: true }
    }
  }

  return { headless: true }
}

const browser = await chromium.launch(await getChromiumLaunchOptions())

try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 980 },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)

  const closeTourIfPresent = async () => {
    const tourCard = page.locator('.tour-card')
    if (await tourCard.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Exit' }).click()
      await tourCard.waitFor({ state: 'hidden' }).catch(async () => {
        assert.equal(await tourCard.count(), 0)
      })
    }
  }

  await page.goto(targetUrl, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(window.__SCHEMA_LAB_STORE__))
  await closeTourIfPresent()
  await page.getByTestId('canvas-empty-state').waitFor()

  const roundTripState = await page.evaluate(() => {
    const store = window.__SCHEMA_LAB_STORE__

    store.getState().addComponent('delay-stage', 'pi-m-112-1dg1')
    store.getState().commitPendingPlacement({ x: 162.5, y: 112.5 })

    const stage = store
      .getState()
      .scene.components.find((component) => component.type === 'delay-stage')

    if (!stage) {
      return null
    }

    store.getState().selectComponent(stage.id)
    store.getState().updateSelectedDelayLine({
      positionMm: 12.5,
      topology: 'double-pass',
    })
    store.getState().addComponent('folded-mirror-pair', 'frog-delay-retroreflector')

    const pendingPair = store.getState().interaction.pendingPlacement?.draft

    if (!pendingPair) {
      return null
    }

    store.getState().commitPendingPlacement()

    const sceneJson = JSON.stringify(store.getState().scene)
    store.getState().loadScene(JSON.parse(sceneJson), { history: 'reset' })

    const scene = store.getState().scene
    const restoredStage = scene.components.find((component) => component.id === stage.id)
    const restoredPair = scene.components.find(
      (component) => component.type === 'folded-mirror-pair',
    )

    return restoredStage && restoredPair
      ? {
          pair: {
            anchorMm: restoredPair.anchorMm,
            attachment: restoredPair.attachment,
            label: restoredPair.label,
            type: restoredPair.type,
            variantId: restoredPair.variantId,
          },
          pendingAttachment: pendingPair.attachment,
          stage: {
            anchorMm: restoredStage.anchorMm,
            delayLine: restoredStage.config.delayLine,
            id: restoredStage.id,
            type: restoredStage.type,
            variantId: restoredStage.variantId,
          },
        }
      : null
  })

  assert.equal(roundTripState?.stage?.type, 'delay-stage')
  assert.equal(roundTripState?.stage?.variantId, 'pi-m-112-1dg1')
  assert.equal(roundTripState?.stage?.delayLine?.positionMm, 12.5)
  assert.equal(roundTripState?.stage?.delayLine?.topology, 'double-pass')
  assert.equal(roundTripState?.pair?.type, 'folded-mirror-pair')
  assert.equal(roundTripState?.pair?.variantId, 'frog-delay-retroreflector')
  assert.equal(roundTripState?.pair?.label, 'FMP1')
  assert.equal(roundTripState?.pendingAttachment?.parentComponentId, roundTripState.stage.id)
  assert.equal(roundTripState?.pair?.attachment?.parentComponentId, roundTripState.stage.id)
  assert.equal(roundTripState?.pair?.attachment?.parentMountSiteId, 'optic-seat')
  assert.equal(
    Number(roundTripState.pair.anchorMm.x.toFixed(6)),
    Number(
      (
        roundTripState.stage.anchorMm.x +
        roundTripState.pair.attachment.localAnchorMm.x
      ).toFixed(6),
    ),
  )
  assert.equal(
    Number(roundTripState.pair.anchorMm.y.toFixed(6)),
    Number(
      (
        roundTripState.stage.anchorMm.y +
        roundTripState.pair.attachment.localAnchorMm.y
      ).toFixed(6),
    ),
  )

  const outputDir = path.join(repoRoot, 'output/playwright')
  await fs.mkdir(outputDir, { recursive: true })
  await page.screenshot({
    path: path.join(outputDir, 'folded-delay-pair-smoke.png'),
    fullPage: true,
  })

  console.log('folded-delay-pair-smoke-ok')
} finally {
  await browser.close()
}
