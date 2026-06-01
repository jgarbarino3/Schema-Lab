import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const assetsDir = join(process.cwd(), 'dist', 'assets')
const maxEntryBytes = 760 * 1024
const maxEntryGzipBytes = 180 * 1024

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

const entries = readdirSync(assetsDir)
  .filter((name) => /^index-[\w-]+\.js$/.test(name))
  .map((name) => {
    const path = join(assetsDir, name)
    const bytes = statSync(path).size
    const gzipBytes = gzipSync(readFileSync(path)).length
    return { bytes, gzipBytes, name }
  })

if (entries.length === 0) {
  throw new Error('No Vite entry chunk found in dist/assets. Run npm run build first.')
}

let failed = false
for (const entry of entries) {
  const rawLabel = formatKiB(entry.bytes)
  const gzipLabel = formatKiB(entry.gzipBytes)
  console.log(
    `${entry.name}: ${rawLabel} raw / ${gzipLabel} gzip (budget ${formatKiB(maxEntryBytes)} raw / ${formatKiB(maxEntryGzipBytes)} gzip)`,
  )

  if (entry.bytes > maxEntryBytes || entry.gzipBytes > maxEntryGzipBytes) {
    failed = true
  }
}

if (failed) {
  throw new Error('Entry bundle size budget exceeded.')
}
