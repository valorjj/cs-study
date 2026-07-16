# Random Daily Quiz — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A flashcard quiz view (3rd tab): pick scope (domain or all-random), read a question, reveal a short answer, jump to the concept page, next.

**Architecture:** Pure `quiz.ts` (`extractQuizItems`, `seededShuffle`, `hashSeed`). New `QuizView` builds the item pool at runtime (fetch notes → parseSections → tag each Q with its concept node), holds card/scope state. `ViewMode` gains `'quiz'`; ViewToggle + App wire the 3rd view.

**Tech Stack:** React, zustand, react-markdown, react-icons/lu, Vitest.

## Global Constraints

- Korean explanations + English code.
- Answers rendered through react-markdown (remark-gfm + rehype-raw), same as notes.
- `Date` is used in the browser component (allowed); pure libs take a numeric seed (no Date inside).
- Public repo; commit email `30681841+valorjj@users.noreply.github.com`, include Co-Authored-By.

---

### Task 1: `quiz.ts` pure functions

**Files:**
- Create: `interview-map/src/lib/quiz.ts`
- Test: `interview-map/src/lib/quiz.test.ts`

**Interfaces:**
- Produces:
  - `interface RawQuizItem { question: string; answer: string }`
  - `function extractQuizItems(body: string): RawQuizItem[]`
  - `function seededShuffle<T>(items: T[], seed: number): T[]`
  - `function hashSeed(s: string): number`

- [ ] **Step 1: Write failing tests** — `quiz.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractQuizItems, seededShuffle, hashSeed } from './quiz'

describe('extractQuizItems', () => {
  it('pairs a **Q...** line with its following blockquote answer', () => {
    const body = [
      '## 5. 예상 면접 질문',
      '**Q. "OSI에서 TCP와 IP는 몇 계층?"**',
      '> IP는 3계층, TCP는 4계층.',
      '',
      '> 🔎 꼬리 질문: 왜 나누나 → 계층 독립성.',
    ].join('\n')
    expect(extractQuizItems(body)).toEqual([
      { question: 'OSI에서 TCP와 IP는 몇 계층?', answer: 'IP는 3계층, TCP는 4계층.' },
    ])
  })

  it('strips the Q number/marker and surrounding quotes', () => {
    const body = '**Q3. TCP와 UDP 차이는?**\n> 신뢰성 여부.'
    expect(extractQuizItems(body)[0].question).toBe('TCP와 UDP 차이는?')
  })

  it('captures multi-line blockquote answers', () => {
    const body = '**Q. 무엇?**\n> 첫 줄\n> 둘째 줄'
    expect(extractQuizItems(body)[0].answer).toBe('첫 줄\n둘째 줄')
  })

  it('ignores **Q lines inside code fences and returns [] when none', () => {
    expect(extractQuizItems('```\n**Q. fake?**\n> no\n```')).toEqual([])
    expect(extractQuizItems('그냥 본문 문단.')).toEqual([])
  })
})

describe('seededShuffle', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8]
  it('is deterministic for the same seed', () => {
    expect(seededShuffle(arr, 42)).toEqual(seededShuffle(arr, 42))
  })
  it('differs for different seeds', () => {
    expect(seededShuffle(arr, 1)).not.toEqual(seededShuffle(arr, 2))
  })
  it('is a permutation and does not mutate input', () => {
    const copy = arr.slice()
    const out = seededShuffle(arr, 7)
    expect(out.slice().sort((a, b) => a - b)).toEqual(arr)
    expect(arr).toEqual(copy)
  })
})

describe('hashSeed', () => {
  it('is deterministic and distinguishes strings', () => {
    expect(hashSeed('2026-07-16:all')).toBe(hashSeed('2026-07-16:all'))
    expect(hashSeed('2026-07-16:all')).not.toBe(hashSeed('2026-07-16:network'))
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `cd interview-map && npx vitest run src/lib/quiz.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `quiz.ts`:**

```ts
export interface RawQuizItem {
  question: string
  answer: string
}

const Q_START = /^\*\*Q\d*\s*[.:]/

// Text between the ** ** of a question line → clean display text: drop the
// "Q3." / "Q." marker and any wrapping quotes.
function cleanQuestion(inner: string): string {
  let t = inner.replace(/^Q\d*\s*[.:]\s*/, '').trim()
  t = t.replace(/^["“”'](.*)["“”']$/s, '$1').trim()
  return t
}

// Parse inline interview Q&A from a section body: a **Q...** (bold) line
// followed by a `>` blockquote answer (mirrors rehypeFoldQA's pairing at the
// markdown level). Fence-aware. Only the first blockquote after the Q is the
// answer — a trailing "🔎 꼬리 질문" blockquote is left out to keep it short.
export function extractQuizItems(body: string): RawQuizItem[] {
  const lines = body.split('\n')
  const fence = /^\s*(```|~~~)/
  let inFence = false
  const out: RawQuizItem[] = []
  for (let i = 0; i < lines.length; i++) {
    if (fence.test(lines[i])) { inFence = !inFence; continue }
    if (inFence) continue
    const t = lines[i].trim()
    if (!(Q_START.test(t) && t.endsWith('**') && t.length > 4)) continue
    const question = cleanQuestion(t.slice(2, -2))
    let j = i + 1
    while (j < lines.length && lines[j].trim() === '') j++
    if (j >= lines.length || !lines[j].trimStart().startsWith('>')) continue
    const ans: string[] = []
    while (j < lines.length && lines[j].trimStart().startsWith('>')) {
      ans.push(lines[j].trimStart().replace(/^>\s?/, ''))
      j++
    }
    out.push({ question, answer: ans.join('\n').trim() })
    i = j - 1
  }
  return out
}

// FNV-1a hash → 32-bit seed for seededShuffle (e.g. hashSeed("2026-07-16:all")).
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Deterministic Fisher-Yates shuffle. Same seed → same order; input untouched.
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice()
  const rand = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd interview-map && npx vitest run src/lib/quiz.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/lib/quiz.ts interview-map/src/lib/quiz.test.ts
git commit -m "feat: quiz lib — extractQuizItems + deterministic seededShuffle/hashSeed"
```

---

### Task 2: ViewMode 'quiz' wiring (store + hook + toggle)

**Files:**
- Modify: `interview-map/src/store/graphStore.ts`
- Modify: `interview-map/src/hooks/useTheme.ts`
- Modify: `interview-map/src/components/ViewToggle.tsx`

**Interfaces:**
- Produces: `ViewMode` now includes `'quiz'`.

- [ ] **Step 1: Extend `ViewMode`** in `graphStore.ts` line 4:

```ts
export type ViewMode = 'graph' | 'list' | 'quiz'
```

- [ ] **Step 2: Accept 'quiz' in the persistence hydrate guard** in `useTheme.ts` (in `useViewModeEffect`):

```ts
    if (saved === 'graph' || saved === 'list' || saved === 'quiz') setViewMode(saved)
```

- [ ] **Step 3: Add the 3rd tab** in `ViewToggle.tsx` — update the import and append a button:

Change line 1:
```ts
import { LuMap, LuList, LuBrain } from 'react-icons/lu'
```
Append after the 목록 button (before `</div>`):
```tsx
      <button
        role="tab"
        aria-selected={viewMode === 'quiz'}
        data-active={viewMode === 'quiz'}
        onClick={() => setViewMode('quiz')}
      >
        <LuBrain size={15} /> 퀴즈
      </button>
```

- [ ] **Step 4: Typecheck**

Run: `cd interview-map && npx tsc --noEmit`
Expected: no errors (App still handles only graph/list; quiz falls through to the `else` = DocsView until Task 3 — acceptable mid-plan, fixed next task).

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/store/graphStore.ts interview-map/src/hooks/useTheme.ts interview-map/src/components/ViewToggle.tsx
git commit -m "feat: add 'quiz' view mode + 3rd ViewToggle tab"
```

---

### Task 3: QuizView component + App wiring + CSS

**Files:**
- Create: `interview-map/src/components/QuizView.tsx`
- Create: `interview-map/src/components/QuizView.css`
- Modify: `interview-map/src/App.tsx`

**Interfaces:**
- Consumes: `extractQuizItems`, `seededShuffle`, `hashSeed` (quiz.ts); `parseNoteRef`, `parseSections` (notes.ts); `useGraphStore`; `domainColor`.

- [ ] **Step 1: Create `QuizView.tsx`:**

```tsx
import { useEffect, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { LuArrowRight, LuShuffle } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { parseNoteRef, parseSections } from '../lib/notes'
import { extractQuizItems, seededShuffle, hashSeed } from '../lib/quiz'
import { domainColor } from '../styles/theme'
import type { GraphNode } from '../graph/types'
import './QuizView.css'

interface QuizItem {
  id: string
  question: string
  answer: string
  domain: string
  nodeId: string
  nodeLabel: string
}

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Flashcard quiz: build the item pool from concept-note interview questions,
// draw them in a date-seeded order within the chosen scope.
export function QuizView({ nodes }: { nodes: GraphNode[] }) {
  const select = useGraphStore((s) => s.select)
  const setViewMode = useGraphStore((s) => s.setViewMode)
  const [pool, setPool] = useState<QuizItem[] | null>(null)
  const [scope, setScope] = useState<string>('all')
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const concept = nodes.filter((n) => n.level !== 0 && n.noteRef)
    const domainNode = new Map(nodes.filter((n) => n.level === 0).map((n) => [n.domain, n]))
    const anchorMap = new Map<string, Map<string, GraphNode>>()
    const fileDomain = new Map<string, string>()
    for (const n of concept) {
      const { path, anchor } = parseNoteRef(n.noteRef!)
      fileDomain.set(path, n.domain)
      if (!anchor) continue
      if (!anchorMap.has(path)) anchorMap.set(path, new Map())
      anchorMap.get(path)!.set(anchor, n)
    }
    const files = [...new Set(concept.map((n) => parseNoteRef(n.noteRef!).path))]
    Promise.all(
      files.map((f) =>
        fetch(f).then((r) => (r.ok ? r.text() : '')).catch(() => '').then((md) => [f, md] as const),
      ),
    ).then((results) => {
      if (cancelled) return
      const items: QuizItem[] = []
      for (const [path, md] of results) {
        if (!md) continue
        const { sections } = parseSections(md)
        for (const s of sections) {
          const raws = extractQuizItems(s.body)
          if (!raws.length) continue
          const owner = anchorMap.get(path)?.get(s.slug)
          const domain = owner?.domain ?? fileDomain.get(path) ?? ''
          const dn = domainNode.get(domain)
          const nodeId = owner?.id ?? dn?.id ?? ''
          const nodeLabel = owner?.label ?? dn?.label ?? domain
          raws.forEach((r, i) =>
            items.push({ id: `${path}#${s.slug}#${i}`, ...r, domain, nodeId, nodeLabel }),
          )
        }
      }
      setPool(items)
    })
    return () => { cancelled = true }
  }, [nodes])

  const domains = useMemo(() => {
    if (!pool) return []
    const present = new Set(pool.map((i) => i.domain))
    return nodes.filter((n) => n.level === 0 && present.has(n.domain))
  }, [pool, nodes])

  const deck = useMemo(() => {
    if (!pool) return []
    const scoped = scope === 'all' ? pool : pool.filter((i) => i.domain === scope)
    return seededShuffle(scoped, hashSeed(`${todayStr()}:${scope}`))
  }, [pool, scope])

  useEffect(() => { setIndex(0); setRevealed(false) }, [scope])

  if (!pool) return <div className="quiz"><p className="quiz-dim">퀴즈 불러오는 중…</p></div>
  const card = deck[index]

  return (
    <div className="quiz">
      <div className="quiz-scopes">
        <button className="quiz-scope" data-active={scope === 'all'} onClick={() => setScope('all')}>
          <LuShuffle size={13} /> 전체 랜덤
        </button>
        {domains.map((d) => (
          <button
            key={d.domain}
            className="quiz-scope"
            data-active={scope === d.domain}
            style={{ ['--c' as string]: domainColor(d.domain) }}
            onClick={() => setScope(d.domain)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {card ? (
        <div className="quiz-card" style={{ ['--c' as string]: domainColor(card.domain) }}>
          <div className="quiz-meta">
            <span className="quiz-count">{index + 1} / {deck.length}</span>
            <span className="quiz-badge">{card.nodeLabel}</span>
          </div>
          <p className="quiz-q">{card.question}</p>

          {revealed ? (
            <div className="quiz-a">
              <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{card.answer}</Markdown>
            </div>
          ) : (
            <button className="quiz-reveal" onClick={() => setRevealed(true)}>답 보기</button>
          )}

          <div className="quiz-actions">
            <button className="quiz-link" onClick={() => { select(card.nodeId); setViewMode('list') }}>
              이 개념 보기 <LuArrowRight size={14} />
            </button>
            <button className="quiz-next" onClick={() => { setIndex((i) => (i + 1) % deck.length); setRevealed(false) }}>
              다음 <LuArrowRight size={14} />
            </button>
          </div>
        </div>
      ) : (
        <p className="quiz-dim">이 범위에 문제가 없습니다.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `QuizView.css`:**

```css
.quiz { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center;
  gap: 18px; padding: 72px 20px 110px; overflow-y: auto; background: var(--bg);
  font-family: system-ui, sans-serif; color: var(--text); }
.quiz-dim { color: var(--text-dim); margin-top: 40px; }

.quiz-scopes { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 760px; }
.quiz-scope { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--border);
  background: var(--bg-panel); color: var(--text-dim); border-radius: 999px; padding: 6px 13px;
  cursor: pointer; font-size: 13px; transition: color 0.12s, border-color 0.12s, background 0.12s; }
.quiz-scope:hover { color: var(--text-strong); border-color: var(--c, var(--border-strong)); }
.quiz-scope[data-active="true"] { color: var(--node-studied-text);
  background: var(--c, var(--accent)); border-color: var(--c, var(--accent)); font-weight: 600; }

.quiz-card { width: min(680px, 94vw); background: var(--bg-panel); border: 1px solid var(--border);
  border-top: 4px solid var(--c); border-radius: 16px; padding: 22px 24px 20px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.28); display: flex; flex-direction: column; gap: 16px; }
.quiz-meta { display: flex; align-items: center; justify-content: space-between; }
.quiz-count { color: var(--text-dim); font-size: 13px; font-variant-numeric: tabular-nums; }
.quiz-badge { font-size: 12px; color: var(--c); border: 1px solid var(--c); border-radius: 999px; padding: 2px 10px; }
.quiz-q { font-size: 18px; line-height: 1.55; color: var(--text-strong); margin: 0; font-weight: 600; }

.quiz-reveal { align-self: flex-start; background: var(--bg-elev); border: 1px solid var(--border-strong);
  color: var(--text); border-radius: 10px; padding: 9px 18px; cursor: pointer; font-size: 14px; font-weight: 600; }
.quiz-reveal:hover { color: var(--text-strong); border-color: var(--c); }
.quiz-a { border-top: 1px solid var(--border); padding-top: 14px; line-height: 1.7; font-size: 14px; }
.quiz-a :first-child { margin-top: 0; }
.quiz-a table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px; display: block; overflow-x: auto; }
.quiz-a th, .quiz-a td { border: 1px solid var(--border); padding: 5px 9px; }
.quiz-a code { background: var(--bg-elev); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }

.quiz-actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 2px; }
.quiz-link, .quiz-next { display: inline-flex; align-items: center; gap: 6px; border-radius: 10px;
  padding: 9px 16px; cursor: pointer; font-size: 13px; font-weight: 600; border: 1px solid transparent; }
.quiz-link { background: none; border-color: var(--border); color: var(--text-dim); }
.quiz-link:hover { color: var(--text-strong); border-color: var(--c); }
.quiz-next { background: var(--accent); color: var(--node-studied-text); border: none; }
.quiz-next:hover { filter: brightness(1.08); }

@media (max-width: 768px) {
  .quiz { padding: 64px 12px 100px; }
  .quiz-card { padding: 18px 16px 16px; }
  .quiz-q { font-size: 16px; }
}
```

- [ ] **Step 3: Wire into `App.tsx`** — import QuizView, branch on viewMode, hide SearchBar in quiz:

Add import after the DocsView import:
```tsx
import { QuizView } from './components/QuizView'
```
Replace the render block's ternary with a three-way branch:
```tsx
      {viewMode === 'graph' && (
        <>
          <GraphCanvas nodes={nodes} edges={edges} />
          <NotePanel nodesById={nodesById} neighbors={neighbors} />
        </>
      )}
      {viewMode === 'list' && (
        <DocsView tree={tree} edges={data.edges} nodesById={nodesById} neighbors={neighbors} />
      )}
      {viewMode === 'quiz' && <QuizView nodes={data.nodes} />}
      {viewMode !== 'quiz' && <SearchBar nodes={data.nodes} />}
```
(Remove the old standalone `<SearchBar nodes={data.nodes} />` line so it isn't rendered twice.)

- [ ] **Step 4: Typecheck + full tests**

Run: `cd interview-map && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/components/QuizView.tsx interview-map/src/components/QuizView.css interview-map/src/App.tsx
git commit -m "feat: QuizView flashcard view (scope + reveal + concept link)"
```

---

## Final verification (verify skill — real browser)

- `npm run dev`, Playwright:
  1. Click 퀴즈 tab → a card renders with a question + count; "답 보기" reveals the answer.
  2. Pick a domain scope (e.g. Network) → count updates; badge/questions are that domain.
  3. "이 개념 보기 →" → switches to 목록 view with the source concept note open.
  4. "다음 →" advances the card; reload same day → identical first card (deterministic).
- Screenshot each. Then run `superpowers:finishing-a-development-branch`.
```
