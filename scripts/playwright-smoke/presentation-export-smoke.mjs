import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import JSZip from 'jszip'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:4173/'
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outputDir = path.resolve(repoRoot, process.env.SCHEMA_PILOT_OUTPUT ?? 'output/playwright/presentation-export')
const fixturePath = path.join(repoRoot, 'src/test/fixtures/realistic-pilot.scene.json')
const browser = await chromium.launch({ headless: true })

try {
  await fs.mkdir(outputDir, { recursive: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  const downloads = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('download', download => downloads.push(download.suggestedFilename()))
  page.setDefaultTimeout(10000)
  await page.goto(targetUrl, { waitUntil: 'networkidle' })
  if (await page.locator('.tour-card').isVisible()) {
    await page.getByRole('button', { name: 'Exit', exact: true }).click()
  }
  await page.getByTestId('toolbar-export').click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import Scene JSON', exact: true }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(fixturePath)
  await page.waitForFunction(() => window.__SCHEMA_LAB_STORE__?.getState().scene.components.length === 6)
  await page.getByRole('button', { name: 'Realistic', exact: true }).click()
  const sceneBefore = await page.evaluate(() => JSON.stringify(window.__SCHEMA_LAB_STORE__.getState().scene))
  await fs.writeFile(path.join(outputDir, 'six-component-pilot.json'), sceneBefore)
  const types = JSON.parse(sceneBefore).components.map(component => component.type)
  const report = { browser: await browser.version(), targetUrl, exports: [], errors }

  async function exportFile(format, view, scope = 'full-scheme', preset = 'presentation', suffix = '') {
    const sceneAtExport = await page.evaluate(() => JSON.stringify(window.__SCHEMA_LAB_STORE__.getState().scene))
    await page.getByTestId('toolbar-export').click()
    await page.getByTestId('toolbar-menu-export').getByRole('button', { name: format.toUpperCase(), exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `${format.toUpperCase()} Export Options`, exact: true })
    await dialog.getByLabel(scope === 'full-scheme' ? 'Full Scheme' : 'Breadboard Only', { exact: true }).check()
    if (format === 'svg') await dialog.getByLabel(preset === 'presentation' ? 'Presentation SVG' : 'Engineering SVG', { exact: true }).check()
    const presentation = format !== 'dxf' && (format !== 'svg' || preset === 'presentation')
    if (presentation) {
      assert.equal(await dialog.getByLabel('Current view', { exact: true }).isChecked(), true)
      await dialog.locator(`input[name="export-view"][value="${view}"]`).check()
    } else {
      assert.equal(await dialog.locator('input[name="export-view"]').count(), 0)
    }
    const downloadPromise = page.waitForEvent('download')
    await dialog.getByRole('button', { name: /^Export / }).click()
    if (await page.getByRole('button', { name: 'Export anyway', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Export anyway', exact: true }).click()
    }
    const download = await downloadPromise.catch(async error => {
      console.error('Export failed state:', await page.locator('body').innerText())
      console.error('Browser errors:', errors)
      await page.screenshot({ path: path.join(outputDir, `failure-${view}-${format}.png`), fullPage: true })
      throw error
    })
    const filename = download.suggestedFilename().replace(`.${format}`, `${suffix}.${format}`)
    const destination = path.join(outputDir, filename)
    await download.saveAs(destination)
    await page.waitForFunction(() => !document.querySelector('div[aria-hidden="true"] .konvajs-content'))
    assert.equal(await page.evaluate(() => JSON.stringify(window.__SCHEMA_LAB_STORE__.getState().scene)), sceneAtExport, 'Export must not change the saved scene')
    const bytes = await fs.readFile(destination)
    assert.ok(bytes.length > 100)
    const result = { format, view, scope, preset, filename, bytes: bytes.length }
    if (format === 'svg') {
      const svg = bytes.toString()
      assert.doesNotMatch(svg, /<(image|foreignObject|canvas)\b|NaN|Infinity/)
      if (presentation) {
        assert.match(svg, /width="1800" height="1200"/)
        const expectedTypes = scope === 'full-scheme' ? types : types.filter(type => type !== 'laser-source')
        for (const type of expectedTypes) assert.ok(svg.includes(`id="component-pilot-${type}"`), `Missing ${type}`)
        if (scope === 'breadboard-only') assert.ok(!svg.includes('id="component-pilot-laser-source"'))
      } else {
        assert.match(svg, /width="[\d.]+mm"/)
      }
    }
    if (format === 'png') {
      result.width = bytes.readUInt32BE(16)
      result.height = bytes.readUInt32BE(20)
      assert.equal(result.width, 3600)
      assert.equal(result.height, 2400)
    }
    if (format === 'pdf') {
      assert.match(bytes.toString('latin1'), /^%PDF-/)
      assert.match(bytes.toString('latin1'), /\/Subtype \/Image/)
      assert.match(bytes.toString('latin1'), /\/Width 3600 \/Height 2400/)
    }
    if (format === 'pptx') {
      const zip = await JSZip.loadAsync(bytes)
      const media = Object.keys(zip.files).filter(name => /^ppt\/media\/.*\.png$/.test(name))
      assert.equal(media.length, 1)
      const imageBytes = await zip.file(media[0]).async('nodebuffer')
      assert.equal(imageBytes.readUInt32BE(16), 3600)
      assert.equal(imageBytes.readUInt32BE(20), 2400)
      const presentationXml = await zip.file('ppt/presentation.xml').async('string')
      const slideSize = presentationXml.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/)
      assert.ok(slideSize)
      assert.equal(Number(slideSize[1]) / Number(slideSize[2]), 1.5, 'PPTX must preserve the 3:2 export image aspect ratio')
      await fs.writeFile(path.join(outputDir, `pptx-embedded-${scope}-${view}.png`), imageBytes)
    }
    report.exports.push(result)
    console.log(`PASS: ${scope} ${view} ${format} ${preset}`)
    return bytes
  }

  for (const view of ['top-down', 'angled']) {
    for (const format of ['svg', 'png', 'pdf', 'pptx']) await exportFile(format, view)
    for (const format of ['svg', 'png', 'pdf', 'pptx']) await exportFile(format, view, 'breadboard-only')
  }
  const current = await exportFile('svg', 'current', 'full-scheme', 'presentation', '-current')
  const angled = await fs.readFile(path.join(outputDir, 'schema-lab-full-scheme-presentation-angled.svg'))
  assert.equal(current.toString(), angled.toString(), 'Current view must match the visible angled table')
  await exportFile('svg', 'current', 'full-scheme', 'engineering')
  await exportFile('dxf', 'current')
  await page.screenshot({ path: path.join(outputDir, 'pilot-in-app.png'), fullPage: true })
  await page.evaluate(() => {
    const store = window.__SCHEMA_LAB_STORE__
    store.getState().commitHighlightSelectionBounds({ x: 50, y: 65 }, { x: 650, y: 415 })
    store.getState().rotateHighlightSelection(1)
  })
  assert.equal(await page.evaluate(() => window.__SCHEMA_LAB_STORE__.getState().scene.workspace.breadboards[0].rotationQuarterTurns), 1)
  await exportFile('svg', 'angled', 'breadboard-only', 'presentation', '-rotated')
  await exportFile('png', 'angled', 'breadboard-only', 'presentation', '-rotated')
  assert.equal(downloads.length, report.exports.length, 'Each export must download exactly one file')
  await page.screenshot({ path: path.join(outputDir, 'pilot-in-app-rotated.png'), fullPage: true })
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(outputDir, 'verification.json'), JSON.stringify(report, null, 2))
  console.log('presentation-export-smoke-ok')
} finally {
  await browser.close()
}
