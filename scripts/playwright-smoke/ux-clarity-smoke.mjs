import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:4173/'

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

async function readStageShellMetrics(page) {
  return page.evaluate(() => {
    const stageShell = document.querySelector('.canvas-panel__stage-shell')
    const rect = stageShell?.getBoundingClientRect()
    const titleEditor = document.querySelector('.panel__title-editor-input')

    return {
      bodyScrollHeight: document.body.scrollHeight,
      scrollY: window.scrollY,
      titleValue: titleEditor instanceof HTMLTextAreaElement ? titleEditor.value : '',
      viewportHeight: window.innerHeight,
      y: rect?.y ?? 0,
      height: rect?.height ?? 0,
    }
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
  page.setDefaultTimeout(9000)

  const step = (label) => {
    console.log(`STEP: ${label}`)
  }

  const openToolbarMenu = async (buttonTestId, menuTestId) => {
    await page.getByTestId(buttonTestId).click()
    const menu = page.getByTestId(menuTestId)
    await menu.waitFor()
    return menu
  }

  const openHelpDialog = async () => {
    await page.getByTestId('toolbar-shortcuts').click()
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await dialog.waitFor()
    return dialog
  }

  const openRawJsonModal = async () => {
    const moreMenu = await openToolbarMenu('toolbar-more', 'toolbar-menu-more')
    await moreMenu.getByRole('button', { name: 'Raw JSON' }).click()
    const modal = page.locator('.json-modal')
    await modal.waitFor()
    return modal
  }

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
  step('page loaded')

  const tourCard = page.locator('.tour-card')
  if (await tourCard.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Exit' }).click()
    await expectHidden(tourCard)
  }

  await page.getByTestId('canvas-empty-state').waitFor()
  assert.ok(parseZoom(await page.getByTestId('status-zoom').textContent()) > 0)
  assert.match(
    (await page.getByTestId('status-board').textContent()) ?? '',
    /Board:/i,
  )
  step('empty state and status bar visible')

  await page.getByTestId('library-search').fill('laser')
  await page.getByTestId('library-item-laser-source').waitFor()
  await page.getByTestId('library-search').fill('')
  step('library search works')

  await page.locator('[data-testid="library-group-beam-steering"] .component-library__group-header').click()
  await page.getByTestId('library-item-mirror').click()
  const stageShell = page.locator('.canvas-panel__stage-shell')
  const stageShellBox = await stageShell.boundingBox()
  assert.ok(stageShellBox, 'Expected a visible stage shell for placement')
  await page.mouse.click(
    stageShellBox.x + stageShellBox.width / 2,
    stageShellBox.y + stageShellBox.height / 2,
  )
  await page.locator('.panel__title-editor-input').waitFor()
  await page.waitForFunction(() => {
    const titleEditor = document.querySelector('.panel__title-editor-input')
    return titleEditor instanceof HTMLTextAreaElement && /^M\d+/i.test(titleEditor.value)
  })
  const selectedComponentId = await page.evaluate(() => {
    const store = (window).__SCHEMA_LAB_STORE__
    const selection = store?.getState().selection
    return selection?.type === 'component' ? selection.componentId : undefined
  })
  assert.ok(selectedComponentId, 'Expected the placed mirror to be selected')
  const selectedComponentMetrics = await readStageShellMetrics(page)
  assert.ok(
    selectedComponentMetrics.bodyScrollHeight <= selectedComponentMetrics.viewportHeight,
    'Selecting a component should not make the page taller than the viewport',
  )

  await page.keyboard.press('Escape')
  await page.waitForFunction(() => {
    const titleEditor = document.querySelector('.panel__title-editor-input')
    return titleEditor instanceof HTMLTextAreaElement && /breadboard/i.test(titleEditor.value)
  })
  const breadboardMetrics = await readStageShellMetrics(page)

  await page.evaluate((componentId) => {
    window.__SCHEMA_LAB_STORE__?.getState().selectComponent(componentId)
  }, selectedComponentId)
  await page.waitForFunction(() => {
    const titleEditor = document.querySelector('.panel__title-editor-input')
    return titleEditor instanceof HTMLTextAreaElement && /^M\d+/i.test(titleEditor.value)
  })
  const reselectedComponentMetrics = await readStageShellMetrics(page)

  assert.ok(
    Math.abs(breadboardMetrics.y - reselectedComponentMetrics.y) <= 2,
    `Expected stage shell Y to stay stable when selection changes, got ${breadboardMetrics.y} vs ${reselectedComponentMetrics.y}`,
  )
  assert.ok(
    Math.abs(breadboardMetrics.height - reselectedComponentMetrics.height) <= 2,
    `Expected stage shell height to stay stable when selection changes, got ${breadboardMetrics.height} vs ${reselectedComponentMetrics.height}`,
  )
  assert.equal(breadboardMetrics.scrollY, 0)
  assert.equal(reselectedComponentMetrics.scrollY, 0)
  step('selection changes do not resize or scroll the canvas column')

  assert.equal(await page.getByTestId('toolbar-snap-mode').count(), 0)
  assert.doesNotMatch(await page.locator('.toolbar').textContent(), /\bSnap\b/)
  step('snap control is removed from the visible toolbar')

  const labelToggle = page.getByRole('button', { name: 'Hide labels' })
  await labelToggle.waitFor()
  await labelToggle.click()
  await page.getByRole('button', { name: 'Show labels' }).waitFor()
  await page.getByRole('button', { name: 'Show labels' }).click()
  await page.getByRole('button', { name: 'Hide labels' }).waitFor()
  step('hide labels stays directly visible in row two')

  const shapeTool = page.getByRole('button', { exact: true, name: 'Shape' })
  await shapeTool.click()
  await page.getByTestId('annotation-tool-popover-shape').waitFor()
  await page.mouse.click(6, 6)
  await expectHidden(page.getByTestId('annotation-tool-popover-shape'))

  const lineTool = page.getByRole('button', { exact: true, name: 'Line' })
  await lineTool.click()
  await page.getByTestId('annotation-tool-popover-line').waitFor()
  await page.getByTestId('annotation-line-color-orange').click()
  await expectHidden(page.getByTestId('annotation-tool-popover-line'))
  step('annotation dock uses anchored popovers and non-sticky labels')

  const shortcutsDialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await page.getByTestId('toolbar-shortcuts').click()
  await shortcutsDialog.waitFor()
  assert.match((await shortcutsDialog.textContent()) ?? '', /Canvas/i)
  assert.match((await shortcutsDialog.textContent()) ?? '', /Open shortcuts/i)
  await page.keyboard.press('Escape')
  await expectHidden(shortcutsDialog)

  await page.keyboard.press('Control+Shift+Slash')
  await shortcutsDialog.waitFor()
  await page.getByRole('button', { name: 'Close' }).click()
  await expectHidden(shortcutsDialog)
  step('shortcuts modal opens by button and hotkey')

  let helpDialog = await openHelpDialog()
  await helpDialog.getByRole('button', { name: 'Appendix' }).click()
  const appendixDialog = page.getByRole('dialog', { name: 'Schema-Lab appendix' })
  await appendixDialog.waitFor()
  assert.match((await appendixDialog.textContent()) ?? '', /Navigate/i)
  assert.match((await appendixDialog.textContent()) ?? '', /Classic optics/i)
  assert.match(
    (await appendixDialog.textContent()) ?? '',
    /Beam settings now live in the inspector/i,
  )
  await appendixDialog.getByRole('button', { name: 'Close' }).click()
  await expectHidden(appendixDialog)

  helpDialog = await openHelpDialog()
  const helpText = (await helpDialog.textContent()) ?? ''
  assert.match(helpText, /Help & shortcuts/i)
  assert.match(helpText, /Guide/i)
  assert.match(helpText, /Appendix/i)
  assert.match(helpText, /Example setup/i)
  assert.match(helpText, /What’s New/i)
  await helpDialog.getByRole('button', { name: 'Guide' }).click()
  await tourCard.waitFor()
  await page.getByRole('button', { name: 'Exit' }).click()
  await expectHidden(tourCard)

  helpDialog = await openHelpDialog()
  await helpDialog.getByRole('button', { name: 'Example setup' }).click()
  const exampleDialog = page.getByRole('dialog', { name: /Load Example Setup/i })
  await exampleDialog.waitFor()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expectHidden(exampleDialog)

  helpDialog = await openHelpDialog()
  await helpDialog.getByRole('button', { name: 'What’s New' }).click()
  const versionDialog = page.getByRole('dialog', {
    name: /Schema-Lab Release History/i,
  })
  await versionDialog.waitFor()
  await page.getByRole('button', { exact: true, name: 'Close' }).click()
  await expectHidden(versionDialog)
  step('help dialog routes work')

  const exportMenu = await openToolbarMenu('toolbar-export', 'toolbar-menu-export')
  assert.match((await exportMenu.textContent()) ?? '', /Import Scene JSON/i)
  assert.match((await exportMenu.textContent()) ?? '', /Import PNG/i)
  assert.match((await exportMenu.textContent()) ?? '', /Import SVG/i)
  assert.match((await exportMenu.textContent()) ?? '', /PNG/i)
  assert.match((await exportMenu.textContent()) ?? '', /PDF/i)
  assert.match((await exportMenu.textContent()) ?? '', /SVG/i)
  assert.match((await exportMenu.textContent()) ?? '', /DXF/i)
  await exportMenu.getByRole('button', { exact: true, name: 'SVG' }).click()
  const exportDialog = page.getByRole('dialog', { name: 'Export options' })
  await exportDialog.waitFor()
  await exportDialog.getByRole('button', { name: 'Cancel' }).click()
  await expectHidden(exportDialog)
  step('import and export menus work')

  const warningButton = page.getByTestId('toolbar-warnings')
  await warningButton.click()
  const warningPopover = page.getByTestId('warnings-popover')
  await warningPopover.waitFor()
  assert.match((await warningPopover.textContent()) ?? '', /Warning filters/i)
  await page.keyboard.press('Escape')
  await expectHidden(warningPopover)
  step('warnings popover opens')

  const jsonModal = await openRawJsonModal()
  await jsonModal.locator('textarea').waitFor()
  await page.getByRole('button', { name: 'Close' }).click()
  await expectHidden(jsonModal)
  step('raw json is accessible from more menu')

  const simpleButton = page.getByRole('button', { name: 'Simple' })
  const realisticButton = page.getByRole('button', { name: 'Realistic' })
  await simpleButton.click()
  assert.equal(await simpleButton.getAttribute('aria-pressed'), 'true')
  let moreMenu = await openToolbarMenu('toolbar-more', 'toolbar-menu-more')
  assert.match((await moreMenu.textContent()) ?? '', /Simple icon default/i)
  await moreMenu.getByRole('button', { name: 'Classic optics' }).click()
  moreMenu = await openToolbarMenu('toolbar-more', 'toolbar-menu-more')
  await moreMenu.getByRole('button', { name: 'Enhanced' }).click()
  await realisticButton.click()
  assert.equal(await realisticButton.getAttribute('aria-pressed'), 'true')
  step('render mode and hidden simple icon default controls work')

  console.log('ux-clarity-smoke-ok')
} finally {
  await browser.close()
}
