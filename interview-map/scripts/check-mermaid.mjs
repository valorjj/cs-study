// Parse-checks every ```mermaid block in notes/ and fails on any that mermaid
// cannot render.
//
// Worth a script because a broken diagram is invisible in review: the app falls
// back to showing the source, so a typo ships as a code block that looks
// deliberate. Mermaid needs a DOM, hence the headless browser; the real mermaid
// build from node_modules is used so the check matches what the app renders.
//
//   node scripts/check-mermaid.mjs           # all notes
//   node scripts/check-mermaid.mjs os-core   # only files matching a substring
//   node scripts/check-mermaid.mjs --sheet out.png   # also write a contact sheet

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const notesDir = resolve(repoRoot, 'notes')
const mermaidDist = resolve(here, '../node_modules/mermaid/dist')

// --- page scaffolding -------------------------------------------------------

const PAGE = `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; background: #0b1220; color: #e6edf6;
    font: 14px system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; }
  .card { padding: 16px 18px; border-bottom: 1px solid #2b3a4f; }
  .name { font-size: 12px; font-weight: 700; color: #3b82f6; margin-bottom: 10px; }
  .err { color: #f59e0b; font: 12px ui-monospace, monospace; white-space: pre-wrap; }
  svg { max-width: 100%; height: auto; }
  /* mirrors Mermaid.css so the sheet wraps Korean the way the app does */
  .nodeLabel, .edgeLabel, .cluster-label, .stateLabel, foreignObject div { word-break: keep-all; }
</style><div id="out"></div>`

const BOOT = `
import mermaid from '/mermaid.esm.mjs'
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  // Mirrors src/lib/mermaidTheme.ts for the default (midnight) theme so the
  // sheet looks like the app.
  themeVariables: {
    background: '#0b1220', primaryColor: '#1e293b', primaryTextColor: '#e6edf6',
    primaryBorderColor: '#475569', secondaryColor: '#0f172a', tertiaryColor: '#0f172a',
    lineColor: '#7c8aa5', textColor: '#e6edf6', mainBkg: '#1e293b', nodeBorder: '#475569',
    clusterBkg: '#0f172a', clusterBorder: '#2b3a4f', edgeLabelBackground: '#0b1220',
    fontFamily: "system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif", fontSize: '15px',
  },
  flowchart: { curve: 'basis', htmlLabels: true, padding: 12, useMaxWidth: true,
    wrappingWidth: 340, nodeSpacing: 45, rankSpacing: 55 },
  sequence: { useMaxWidth: true, actorMargin: 40, boxMargin: 8 },
  state: { useMaxWidth: true },
})
window.__draw = async (id, src, label, wantSheet) => {
  let card = null
  if (wantSheet) {
    card = document.createElement('div')
    card.className = 'card'
    const h = document.createElement('div')
    h.className = 'name'
    h.textContent = label
    card.appendChild(h)
    document.getElementById('out').appendChild(card)
  }
  try {
    const { svg } = await mermaid.render(id, src)
    if (card) { const d = document.createElement('div'); d.innerHTML = svg; card.appendChild(d) }
    return { ok: true }
  } catch (e) {
    const msg = String((e && e.message) || e)
    if (card) { const d = document.createElement('div'); d.className = 'err'; d.textContent = msg; card.appendChild(d) }
    return { ok: false, err: msg.replace(/\\s+/g, ' ').slice(0, 300) }
  }
}
`

const args = process.argv.slice(2)
const sheetAt = args.indexOf('--sheet')
const sheetPath = sheetAt === -1 ? null : args[sheetAt + 1]
const filter = args.filter((a, i) => !a.startsWith('--') && i !== sheetAt + 1)[0] ?? ''

/** Every ```mermaid fence in the notes, with enough context to find it again. */
function collect() {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.md')) scan(p)
    }
  }
  const scan = (file) => {
    const rel = relative(repoRoot, file)
    if (filter && !rel.includes(filter)) return
    const lines = readFileSync(file, 'utf8').split('\n')
    let heading = ''
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,3} /.test(lines[i])) heading = lines[i].replace(/^#+ /, '').trim()
      if (lines[i].trimEnd() !== '```mermaid') continue
      const start = i
      let j = i + 1
      const body = []
      while (j < lines.length && lines[j].trimEnd() !== '```') body.push(lines[j++])
      out.push({ file: rel, line: start + 1, heading, src: body.join('\n') })
      i = j
    }
  }
  walk(notesDir)
  return out
}

const blocks = collect()
if (blocks.length === 0) {
  console.log(`[check-mermaid] no mermaid blocks found${filter ? ` matching "${filter}"` : ''}`)
  process.exit(0)
}

let chromium
try {
  ({ chromium } = await import('playwright'))
} catch {
  console.error('[check-mermaid] playwright is required: npm i -D playwright && npx playwright install chromium')
  process.exit(2)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 })

// Serve mermaid's ESM bundle (and the chunks it imports at runtime) from a
// single fake origin so its relative imports resolve.
await page.route('**/*', (route) => {
  const { pathname } = new URL(route.request().url())
  if (pathname === '/') {
    return route.fulfill({ contentType: 'text/html', body: PAGE })
  }
  try {
    return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(mermaidDist, pathname)) })
  } catch {
    return route.fulfill({ status: 404, body: '' })
  }
})
await page.goto('http://mermaid.local/')
await page.addScriptTag({ type: 'module', content: BOOT })
await page.waitForFunction('!!window.__draw', null, { timeout: 60_000 })

const failures = []
for (const [i, b] of blocks.entries()) {
  const res = await page.evaluate(
    ([id, src, label, wantSheet]) => window.__draw(id, src, label, wantSheet),
    [`chk${i}`, b.src, `${b.file}:${b.line} — ${b.heading}`, !!sheetPath])
  if (!res.ok) failures.push({ ...b, err: res.err })
}

if (sheetPath) {
  writeFileSync(sheetPath, await page.screenshot({ fullPage: true }))
  console.log(`[check-mermaid] contact sheet → ${sheetPath}`)
}
await browser.close()

console.log(`[check-mermaid] ${blocks.length - failures.length}/${blocks.length} diagrams render`)
for (const f of failures) {
  console.error(`\n✗ ${f.file}:${f.line} — ${f.heading}\n  ${f.err}`)
}
process.exit(failures.length ? 1 : 0)

