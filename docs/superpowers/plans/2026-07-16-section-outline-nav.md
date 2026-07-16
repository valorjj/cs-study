# Section Outline Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Note view shows one node's own section (no cross-node tab bar), with an outline of that section's H2/H3 sub-headings for in-page jumps; domain (L0) nodes host their Quiz.

**Architecture:** Add a pure `extractOutline(body)` to `notes.ts`. Rewrite `NoteView` to render only the node's anchored section and an outline nav derived from `extractOutline`. Swap `.np-tabs` CSS for `.np-outline`. Add `#핵심-질문-quiz` noteRefs to the 11 L0 domain nodes in `graph.json`.

**Tech Stack:** React, react-markdown, rehype-slug, github-slugger, Vitest.

## Global Constraints

- Korean explanations + English code (CLAUDE.md).
- github-slugger produces DOM ids via rehype-slug; outline slugs MUST match — use a `GithubSlugger` instance over headings in document order.
- Public repo; commit email `30681841+valorjj@users.noreply.github.com`, include Co-Authored-By.

---

### Task 1: `extractOutline` pure function

**Files:**
- Modify: `interview-map/src/lib/notes.ts`
- Test: `interview-map/src/lib/notes.test.ts`

**Interfaces:**
- Produces: `interface OutlineItem { depth: 2 | 3; text: string; slug: string }` and `function extractOutline(body: string): OutlineItem[]`

- [ ] **Step 1: Write failing tests** — append to `notes.test.ts`:

```ts
import { extractOutline } from './notes'

describe('extractOutline', () => {
  it('extracts H2 and H3 headings in order with matching slugs', () => {
    const body = '## 1. 비유\n텍스트\n\n### 세부\n더\n\n## 2. 개념 정의\n끝'
    expect(extractOutline(body)).toEqual([
      { depth: 2, text: '1. 비유', slug: '1-비유' },
      { depth: 3, text: '세부', slug: '세부' },
      { depth: 2, text: '2. 개념 정의', slug: '2-개념-정의' },
    ])
  })

  it('ignores ## lines inside code fences', () => {
    const body = '## real\n```py\n## not a heading\n```\n## also real'
    expect(extractOutline(body).map((o) => o.text)).toEqual(['real', 'also real'])
  })

  it('returns [] when there are no sub-headings (quiz case)', () => {
    expect(extractOutline('<details><summary>Q</summary>A</details>')).toEqual([])
  })

  it('dedupes duplicate heading text like rehype-slug does', () => {
    const body = '## 정리\n\n## 정리'
    expect(extractOutline(body).map((o) => o.slug)).toEqual(['정리', '정리-1'])
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `cd interview-map && npx vitest run src/lib/notes.test.ts`
Expected: FAIL (`extractOutline` not exported).

- [ ] **Step 3: Implement** — in `notes.ts`, change the import and add the function:

Change line 1 `import { slug } from 'github-slugger'` to also get the class:
```ts
import GithubSlugger, { slug } from 'github-slugger'
```

Append:
```ts
export interface OutlineItem {
  depth: 2 | 3
  text: string
  slug: string
}

// Extract H2/H3 sub-headings from a section body for an in-page outline (TOC).
// Fence-aware (same guard as parseSections). Slugs come from a GithubSlugger
// instance walked in document order, so they match the ids rehype-slug assigns
// when the same body is rendered (including -1/-2 dedup suffixes).
export function extractOutline(body: string): OutlineItem[] {
  const lines = body.split('\n')
  const fence = /^\s*(```|~~~)/
  const heading = /^(#{2,3}) (?!#)(.*)$/
  let inFence = false
  const slugger = new GithubSlugger()
  const out: OutlineItem[] = []
  for (const line of lines) {
    if (fence.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const m = heading.exec(line)
    if (!m) continue
    const text = m[2].trim()
    out.push({ depth: m[1].length as 2 | 3, text, slug: slugger.slug(text) })
  }
  return out
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd interview-map && npx vitest run src/lib/notes.test.ts`
Expected: PASS (all parseNoteRef/parseSections/extractOutline tests green).

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/lib/notes.ts interview-map/src/lib/notes.test.ts
git commit -m "feat: extractOutline — H2/H3 section outline with rehype-slug-matching slugs"
```

---

### Task 2: NoteView renders single section + outline

**Files:**
- Modify: `interview-map/src/components/NoteView.tsx`

**Interfaces:**
- Consumes: `parseSections`, `parseNoteRef`, `extractOutline` from `../lib/notes`.

- [ ] **Step 1: Rewrite NoteView** — replace the file body with the single-section version. Key changes vs current:
  - Drop `override`/`setOverride` state and the `.np-tabs` `<nav>` entirely.
  - Add `const noteRef = useRef<HTMLDivElement>(null)` for the scroll container.
  - Compute `active` = section matching the noteRef anchor, else first section.
  - Compute `outline = useMemo(() => (active ? extractOutline(active.body) : []), [active])`.
  - Render an `.np-outline` `<nav>` only when `outline.length >= 2`; each button scrolls to its heading.

Full file:
```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeRaw from 'rehype-raw'
import { useGraphStore } from '../store/graphStore'
import { parseNoteRef, parseSections, extractOutline } from '../lib/notes'
import { rehypeFoldQA } from '../lib/rehypeFoldQA'
import { domainColor } from '../styles/theme'
import type { GraphNode } from '../graph/types'
import { NodeIcon } from './NodeIcon'
import './NotePanel.css'

// Note renderer shared by the graph-mode overlay (NotePanel) and the list-mode
// docs pane (DocsView): fetches the note markdown, renders the ONE section this
// node anchors to (the tree/graph handles sibling navigation), plus an outline
// of that section's sub-headings and related-concept crosslink chips.
export function NoteView({ node, nodesById, neighbors }: {
  node: GraphNode
  nodesById: Map<string, GraphNode>
  neighbors: Map<string, string[]>
}) {
  const select = useGraphStore((s) => s.select)
  const [md, setMd] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const noteRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMd(null)
    if (!node.noteRef) { setLoading(false); return }
    let cancelled = false
    const { path } = parseNoteRef(node.noteRef)
    setLoading(true)
    fetch(path)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => { if (!cancelled) setMd(text) })
      .catch(() => { if (!cancelled) setMd(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [node.noteRef])

  const parsed = useMemo(() => (md ? parseSections(md) : null), [md])

  const color = domainColor(node.domain)
  const related = (neighbors.get(node.id) ?? []).map((id) => nodesById.get(id)).filter(Boolean) as GraphNode[]
  const sections = parsed?.sections ?? []

  // The one section this node points at (its noteRef anchor), else the first.
  const anchor = node.noteRef ? parseNoteRef(node.noteRef).anchor : null
  const active = (anchor && sections.find((s) => s.slug === anchor)) || sections[0]
  const outline = useMemo(() => (active ? extractOutline(active.body) : []), [active])

  const jumpTo = (slug: string) => {
    const el = noteRef.current?.querySelector(`[id="${slug}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <div className="np-top">
        <header className="np-head" style={{ borderColor: color }}>
          <span className="np-icon"><NodeIcon id={node.id} domain={node.domain} size={22} /></span>
          <h2>{node.label}</h2>
        </header>
        <p className="np-summary">{node.summary}</p>
        {node.keywords.length > 0 && (
          <div className="np-keywords">{node.keywords.map((k) => <span key={k}>{k}</span>)}</div>
        )}
        {related.length > 0 && (
          <div className="np-related">
            <h3>연결된 개념</h3>
            <div className="np-chips">
              {related.map((r) => (
                <button key={r.id} className="np-chip" style={{ borderColor: domainColor(r.domain) }}
                  onClick={() => select(r.id)}><NodeIcon id={r.id} domain={r.domain} size={15} /> {r.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      {outline.length >= 2 && (
        <nav className="np-outline" aria-label="섹션 목차" style={{ ['--c' as string]: color }}>
          {outline.map((o) => (
            <button key={o.slug} className="np-outline-item" data-sub={o.depth === 3}
              onClick={() => jumpTo(o.slug)}>{o.text}</button>
          ))}
        </nav>
      )}
      <div className="np-note" ref={noteRef} key={`${node.id}:${active?.slug ?? 'none'}`}>
        {loading && <p className="np-dim">노트 불러오는 중…</p>}
        {!loading && active && (
          <>
            <h2 className="np-section-title">{active.heading}</h2>
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeFoldQA, rehypeSlug]}>{active.body}</Markdown>
          </>
        )}
        {!loading && md && sections.length === 0 && (
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeFoldQA, rehypeSlug]}>{md}</Markdown>
        )}
        {!loading && !md && node.noteRef && <p className="np-dim">노트를 불러오지 못했습니다.</p>}
        {!loading && !node.noteRef && <p className="np-dim">아직 노트가 없는 개념입니다.</p>}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd interview-map && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add interview-map/src/components/NoteView.tsx
git commit -m "feat: NoteView renders single anchored section + outline (drop tab bar)"
```

---

### Task 3: Outline styling (replace tab CSS)

**Files:**
- Modify: `interview-map/src/components/NotePanel.css`

- [ ] **Step 1: Replace the `.np-tabs` block** (lines ~23-33) with `.np-outline`:

```css
/* Section outline (TOC) — horizontal strip of the current section's sub-headings.
   Sibling of the note body so it can stay sticky over the scroll on mobile. */
.np-outline { flex: none; display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 26px;
  background: var(--bg-panel); border-bottom: 1px solid var(--border); }
.np-outline-item { background: var(--bg); border: 1px solid var(--border); border-radius: 999px;
  color: var(--text-dim); padding: 4px 11px; cursor: pointer; font-size: 12px; white-space: nowrap;
  transition: color 0.12s ease, border-color 0.12s ease, background 0.12s ease; }
.np-outline-item:hover { color: var(--text-strong); border-color: var(--c);
  background: color-mix(in srgb, var(--c) 12%, var(--bg)); }
.np-outline-item[data-sub="true"] { font-size: 11px; opacity: 0.75; padding-left: 16px; }
```

- [ ] **Step 2: Update the mobile block** — replace the `.np-tabs` mobile rules (lines ~81-83) with:

```css
  .np-outline { position: sticky; top: 0; z-index: 5; padding: 8px 16px; flex-wrap: nowrap; overflow-x: auto; }
  .np-panel .np-outline { padding-right: 54px; } /* clear the floating close button */
```

- [ ] **Step 3: Commit**

```bash
git add interview-map/src/components/NotePanel.css
git commit -m "style: outline (np-outline) chip strip replacing note tab bar"
```

---

### Task 4: Domain (L0) nodes host Quiz

**Files:**
- Modify: `interview-map/src/graph/graph.json`

- [ ] **Step 1: Add `noteRef` to each L0 node** with a script (deterministic, avoids hand-edit errors):

```bash
cd interview-map && python3 - <<'PY'
import json
p='src/graph/graph.json'
d=json.load(open(p))
m={
 'java':'notes/01-java-jvm/jvm-memory-gc.md',
 'os':'notes/02-os/os-core.md',
 'network':'notes/03-network/network-core.md',
 'database':'notes/04-database/database-core.md',
 'spring':'notes/05-spring/spring-core.md',
 'systemdesign':'notes/06-system-design/system-design-core.md',
 'devops':'notes/07-devops/devops-core.md',
 'hw':'notes/08-hardware/hardware-core.md',
 'dsa':'notes/09-dsa/dsa-core.md',
 'react':'notes/10-react/react-core.md',
 'javascript':'notes/11-javascript/javascript-core.md',
}
for n in d['nodes']:
    if n['level']==0 and n['id'] in m:
        n['noteRef']=m[n['id']]+'#핵심-질문-quiz'
json.dump(d,open(p,'w'),ensure_ascii=False,indent=2)
print('done')
PY
```

- [ ] **Step 2: Verify** — every L0 node now has the quiz noteRef:

```bash
cd interview-map && python3 -c "import json;d=json.load(open('src/graph/graph.json'));print([(n['id'],n.get('noteRef')) for n in d['nodes'] if n['level']==0])"
```
Expected: all 11 domains show `...#핵심-질문-quiz`.

- [ ] **Step 3: Confirm graph tests still pass** (json shape unchanged otherwise)

Run: `cd interview-map && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add interview-map/src/graph/graph.json
git commit -m "feat: L0 domain nodes point to their Quiz section (quiz hub)"
```

---

## Final verification (verify skill — real browser)

- `npm run dev`, drive with Playwright:
  1. Open a leaf note (HTTP 버전 발전) → one section only, no old tab bar, `.np-outline` chips present; click a chip → heading scrolls into view.
  2. Click a domain node (Network) in graph → Quiz section renders (`핵심 질문`).
  3. Select `generics-stream` (no anchor) → renders first section, no crash.
- Screenshot each. Then run `superpowers:finishing-a-development-branch`.
```
