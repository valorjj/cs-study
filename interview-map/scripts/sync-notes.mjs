import { cp, rm, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../../notes')       // repo root notes/
const dest = resolve(here, '../public/notes')  // interview-map/public/notes

try {
  await access(src)
} catch {
  console.warn(`[sync-notes] source not found: ${src} — skipping (notes panel will 404)`)
  process.exit(0)
}
await rm(dest, { recursive: true, force: true })
await cp(src, dest, { recursive: true })
console.log(`[sync-notes] copied ${src} -> ${dest}`)
