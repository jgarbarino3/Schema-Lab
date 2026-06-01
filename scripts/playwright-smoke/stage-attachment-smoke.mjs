import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:4173/'
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')

const browser = await chromium.launch({ headless: true })

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

  const stageInfo = await page.evaluate(() => {
    const store = window.__SCHEMA_LAB_STORE__
    store.getState().addComponent('sample-holder')
    store.getState().commitPendingPlacement({ x: 162.5, y: 112.5 })

    const scene = store.getState().scene
    const stage = scene.components.find((component) => component.type === 'sample-holder')

    return {
      stageId: stage?.id,
      stageAnchorMm: stage?.anchorMm,
      variantId: stage?.variantId,
    }
  })

  assert.ok(stageInfo.stageId, 'Sample holder should be placed')
  assert.equal(stageInfo.variantId, 'thorlabs-km100b-m')

  const samplePending = await page.evaluate((stageId) => {
    const store = window.__SCHEMA_LAB_STORE__
    store.getState().selectComponent(stageId)
    store.getState().addComponent('sample')
    const pending = store.getState().interaction.pendingPlacement?.draft

    return pending
      ? {
          attachment: pending.attachment,
          type: pending.type,
          variantId: pending.variantId,
        }
      : null
  }, stageInfo.stageId)

  assert.equal(samplePending?.type, 'sample')
  assert.equal(samplePending?.attachment?.parentComponentId, stageInfo.stageId)
  assert.equal(samplePending?.attachment?.parentMountSiteId, 'sample-seat')

  await page.evaluate(() => {
    window.__SCHEMA_LAB_STORE__.getState().commitPendingPlacement()
  })

  const irisPending = await page.evaluate((stageId) => {
    const store = window.__SCHEMA_LAB_STORE__
    store.getState().selectComponent(stageId)
    store.getState().addComponent('iris', 'ida12-m')
    const pending = store.getState().interaction.pendingPlacement?.draft

    return pending
      ? {
          attachment: pending.attachment,
          type: pending.type,
          variantId: pending.variantId,
        }
      : null
  }, stageInfo.stageId)

  assert.equal(irisPending?.type, 'iris')
  assert.equal(irisPending?.variantId, 'ida12-m')
  assert.equal(irisPending?.attachment?.parentComponentId, stageInfo.stageId)
  assert.equal(irisPending?.attachment?.parentMountSiteId, 'optic-seat')

  const finalState = await page.evaluate((stageId) => {
    const store = window.__SCHEMA_LAB_STORE__
    store.getState().commitPendingPlacement()
    const scene = store.getState().scene
    const stage = scene.components.find((component) => component.id === stageId)
    const sample = scene.components.find((component) => component.type === 'sample')
    const iris = scene.components.find((component) => component.type === 'iris')

    if (!stage || !sample || !iris) {
      return null
    }

    store.getState().selectComponent(stage.id)
    store.getState().updateSelectedComponent({ finishId: 'graphite' })
    store.getState().selectComponent(sample.id)
    store.getState().updateSelectedComponent({ materialId: 'tin' })
    store.getState().selectComponent(stage.id)
    store.getState().beginComponentDrag(stage.id)
    store.getState().commitComponentDrag(stage.id, {
      x: stage.anchorMm.x + 25,
      y: stage.anchorMm.y + 25,
    })

    const nextScene = store.getState().scene
    const nextStage = nextScene.components.find((component) => component.id === stage.id)
    const nextSample = nextScene.components.find((component) => component.id === sample.id)
    const nextIris = nextScene.components.find((component) => component.id === iris.id)

    return {
      stage: nextStage
        ? {
            anchorMm: nextStage.anchorMm,
            finishId: nextStage.finishId,
          }
        : null,
      sample: nextSample
        ? {
            anchorMm: nextSample.anchorMm,
            attachment: nextSample.attachment,
            materialId: nextSample.materialId,
          }
        : null,
      iris: nextIris
        ? {
            anchorMm: nextIris.anchorMm,
            attachment: nextIris.attachment,
          }
        : null,
    }
  }, stageInfo.stageId)

  assert.ok(finalState?.stage, 'Stage should remain in the scene')
  assert.ok(finalState?.sample, 'Sample should remain in the scene')
  assert.ok(finalState?.iris, 'Iris should remain in the scene')
  assert.equal(finalState?.stage?.finishId, 'graphite')
  assert.equal(finalState?.sample?.materialId, 'tin')
  assert.equal(finalState?.sample?.attachment?.parentMountSiteId, 'sample-seat')
  assert.equal(finalState?.iris?.attachment?.parentMountSiteId, 'optic-seat')
  assert.ok(finalState?.sample?.attachment)
  assert.ok(finalState?.iris?.attachment)
  assert.equal(
    Number(finalState.sample.anchorMm.x.toFixed(6)),
    Number(
      (
        finalState.stage.anchorMm.x + finalState.sample.attachment.localAnchorMm.x
      ).toFixed(6),
    ),
  )
  assert.equal(
    Number(finalState.sample.anchorMm.y.toFixed(6)),
    Number(
      (
        finalState.stage.anchorMm.y + finalState.sample.attachment.localAnchorMm.y
      ).toFixed(6),
    ),
  )
  assert.equal(
    Number(finalState.iris.anchorMm.x.toFixed(6)),
    Number(
      (
        finalState.stage.anchorMm.x + finalState.iris.attachment.localAnchorMm.x
      ).toFixed(6),
    ),
  )
  assert.equal(
    Number(finalState.iris.anchorMm.y.toFixed(6)),
    Number(
      (
        finalState.stage.anchorMm.y + finalState.iris.attachment.localAnchorMm.y
      ).toFixed(6),
    ),
  )

  await page.screenshot({
    path: path.join(repoRoot, 'output/playwright/stage-attachment-smoke.png'),
    fullPage: true,
  })

  console.log('stage-attachment-smoke-ok')
} finally {
  await browser.close()
}
