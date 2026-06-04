import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/'

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

  const loadExampleButton = page.getByRole('button', { name: 'Load example setup' })
  for (let step = 0; step < 12; step += 1) {
    if (await loadExampleButton.isVisible().catch(() => false)) {
      break
    }

    await page.getByRole('button', { name: 'Next' }).click()
  }

  await loadExampleButton.click()
  await expectHidden(tourCard)
  await expectHidden(page.getByRole('dialog', { name: 'Load example setup' }))
  await expectHidden(page.getByTestId('tutorial-table-view-nudge'))
  await page.waitForFunction(() => {
    const store = window.__SCHEMA_LAB_STORE__?.getState()

    return store?.renderMode === 'simple' &&
      store.scene.workspace.kind === 'single-breadboard'
  })

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

  assert.equal(state.renderMode, 'simple')
  assert.equal(state.workspaceKind, 'single-breadboard')
  assert.equal(state.workspaceViewMode, 'board-focus')
  assert.equal(state.usesProjectedTableView, false)
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
  assert.deepEqual(state.selection, {
    componentId: 'tutorial-sample-holder',
    type: 'component',
  })
  assert.ok(
    state.components?.every((component) =>
      component.hostSurfaceId === undefined ||
      component.hostSurfaceId === 'single-breadboard',
    ),
    'Example setup components should be hosted by the breadboard.',
  )

  console.log('tutorial-smoke-ok')
} finally {
  await browser.close()
}
