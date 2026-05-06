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
  await tourCard.waitFor()
  assert.match((await tourCard.textContent()) ?? '', /folded/i)
  await page.getByRole('button', { name: 'Exit' }).click()
  await expectHidden(tourCard)

  const state = await page.evaluate(() => {
    const store = window.__SCHEMA_LAB_STORE__?.getState()

    return {
      components: store?.scene.components.map((component) => ({
        id: component.id,
        type: component.type,
        source: component.config.source,
      })),
      renderMode: store?.renderMode,
      selection: store?.selection,
    }
  })

  assert.equal(state.renderMode, 'simple')
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
  assert.equal(state.selection?.type, 'component')
  assert.equal(state.selection?.componentId, 'tutorial-sample-holder')

  console.log('tutorial-smoke-ok')
} finally {
  await browser.close()
}
