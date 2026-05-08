import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/'
const outputDir = 'output/playwright'

async function expectHidden(locator) {
  await locator.waitFor({ state: 'hidden' }).catch(async () => {
    const count = await locator.count()
    assert.equal(count, 0)
  })
}

async function getVisibleBox(locator, label) {
  const element = locator.first()
  const isVisible = await element.isVisible().catch(() => false)

  if (!isVisible) {
    return undefined
  }

  const box = await element.boundingBox()
  assert.ok(box, `${label} should have a bounding box`)

  return box
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
}

async function assertNudgePlacement(page, name) {
  const nudgeBox = await getVisibleBox(page.getByTestId('tutorial-table-view-nudge'), 'Table view nudge')
  const stageShellBox = await getVisibleBox(page.locator('.canvas-panel__stage-shell'), 'Stage shell')
  assert.ok(nudgeBox, 'Table view nudge should be visible')
  assert.ok(stageShellBox, 'Stage shell should be visible')

  assert.ok(
    nudgeBox.x >= stageShellBox.x &&
      nudgeBox.y >= stageShellBox.y &&
      nudgeBox.x + nudgeBox.width <= stageShellBox.x + stageShellBox.width + 1 &&
      nudgeBox.y + nudgeBox.height <= stageShellBox.y + stageShellBox.height + 1,
    `${name} nudge should stay inside the canvas stage shell`,
  )
  assert.ok(
    nudgeBox.y >= stageShellBox.y + 36,
    `${name} nudge should sit below the top ruler band`,
  )

  const nonOverlappingTargets = [
    ['inspector', page.locator('.inspector')],
    ['toolbar', page.locator('.toolbar')],
    ['selection toolbar', page.locator('.canvas-selection-toolbar')],
  ]

  for (const [label, locator] of nonOverlappingTargets) {
    const targetBox = await getVisibleBox(locator, label)
    if (!targetBox) {
      continue
    }

    assert.equal(
      boxesOverlap(nudgeBox, targetBox),
      false,
      `${name} nudge should not overlap the ${label}`,
    )
  }

  await page.screenshot({
    fullPage: false,
    path: `${outputDir}/tutorial-table-nudge-${name}.png`,
  })
}

const browser = await chromium.launch({ headless: true })

try {
  await mkdir(outputDir, { recursive: true })

  const context = await browser.newContext({
    viewport: {
      width: 1600,
      height: 980,
    },
  })
  await context.addInitScript(() => {
    window.localStorage.removeItem('schema-lab.onboarding.seen')
    window.localStorage.removeItem('schema-lab.onboarding.never-show')
    window.localStorage.setItem('schema-lab.render-mode', 'realistic')
  })

  const page = await context.newPage()
  page.setDefaultTimeout(10000)

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(window.__SCHEMA_LAB_STORE__))
  await page.waitForFunction(() => Boolean(window.__SCHEMA_LAB_VIEW_TOOLS__))

  const tourCard = page.locator('.tour-card')
  await tourCard.waitFor()

  const loadTutorialButton = page.getByRole('button', { name: 'Load tutorial setup' })
  for (let step = 0; step < 12; step += 1) {
    if (await loadTutorialButton.isVisible().catch(() => false)) {
      break
    }

    await page.getByRole('button', { name: 'Next' }).click()
  }

  await loadTutorialButton.click()
  const tutorialDialog = page.getByRole('dialog', { name: 'Load tutorial scene' })
  await tutorialDialog.waitFor()
  assert.match((await tutorialDialog.textContent()) ?? '', /folded/i)
  assert.match((await tutorialDialog.textContent()) ?? '', /sample/i)

  await page.getByRole('button', { name: 'Replace with tutorial' }).click()
  const tableViewNudge = page.getByTestId('tutorial-table-view-nudge')
  await tableViewNudge.waitFor()
  assert.match((await tableViewNudge.textContent()) ?? '', /2\.5D/i)
  await page.waitForFunction(() => {
    const store = window.__SCHEMA_LAB_STORE__?.getState()

    return store?.renderMode === 'simple' &&
      store.scene.workspace.kind === 'single-breadboard'
  })

  await tourCard.waitFor()
  assert.match((await tourCard.textContent()) ?? '', /folded/i)
  await assertNudgePlacement(page, 'desktop')
  await page.setViewportSize({ width: 1280, height: 860 })
  await page.waitForTimeout(220)
  await assertNudgePlacement(page, 'narrow')
  await page.getByTestId('tutorial-table-view-nudge-action').click()
  await tableViewNudge.waitFor({ state: 'hidden' }).catch(async () => {
    assert.equal(await tableViewNudge.count(), 0)
  })
  await page.getByRole('button', { name: 'Exit' }).click()
  await expectHidden(tourCard)

  const state = await page.evaluate(() => {
    const store = window.__SCHEMA_LAB_STORE__?.getState()

    return {
      components: store?.scene.components.map((component) => ({
        id: component.id,
        type: component.type,
        hostSurfaceId: component.hostSurfaceId,
        source: component.config.source,
      })),
      renderMode: store?.renderMode,
      selection: store?.selection,
      usesProjectedTableView: window.__SCHEMA_LAB_VIEW_TOOLS__?.usesProjectedTableView(),
      workspaceKind: store?.scene.workspace.kind,
      workspaceViewMode: store?.interaction.workspaceViewMode,
    }
  })

  assert.equal(state.renderMode, 'realistic')
  assert.equal(state.workspaceKind, 'optical-table')
  assert.equal(state.workspaceViewMode, 'table-view')
  assert.equal(state.usesProjectedTableView, true)
  assert.deepEqual(
    state.components?.map((component) => component.type),
    [
      'attenuator',
      'waveplate',
      'polarizer',
      'beamsplitter',
      'detector',
      'mirror',
      'mirror',
      'lens',
      'iris',
      'sample-holder',
      'sample',
      'detector',
      'laser-source',
    ],
  )
  assert.equal(
    state.components?.filter((component) => component.source?.isEnabled).length,
    1,
  )
  assert.equal(state.selection?.type, 'optical-table')
  assert.ok(
    state.components?.every((component) =>
      component.hostSurfaceId === 'breadboard-1',
    ),
    'Tutorial components should be hosted by the converted breadboard.',
  )

  console.log('tutorial-smoke-ok')
} finally {
  await browser.close()
}
