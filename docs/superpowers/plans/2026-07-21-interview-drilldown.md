# 면접 드릴다운 모드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 퀴즈 탭에 "드릴다운" 모드를 추가해 메인 Q → 꼬리질문 체인을 면접관처럼 단계별로 진행하고 "생존 깊이"로 약점을 드러낸다.

**Architecture:** 순수 파서 `extractDrillChains`가 노트 body에서 메인 Q + 꼬리 체인을 추출한다. 노트 fetch/노드매핑은 신규 공유 훅 `useNotePool`로 추출해 기존 `QuizView`(플래시카드)와 신규 `DrillView`가 함께 쓴다. 퀴즈 탭은 `QuizTab` 래퍼가 `플래시카드 | 드릴다운` 모드를 토글한다. 자기평가는 기존 `recordQuizResult`에 누적(신규 저장소 없음).

**Tech Stack:** Vite + React 18 + TypeScript, zustand, react-markdown/remark-gfm/rehype-raw, Vitest, Playwright. 앱은 `interview-map/` 서브디렉토리 (npm 명령은 반드시 `cd interview-map` 후 실행).

## Global Constraints

- 앱 루트: `interview-map/` (repo 루트에서 npm 실행 금지 — package.json 없음).
- 한국어 UI 카피 + 영어 코드 (사용자 선호).
- 신규 클라우드 컬럼/localStorage 키 없음 — 자기평가는 기존 `recordQuizResult(domain: string, correct: boolean)`로만 기록.
- 체인 진행 = 학습 우선: "몰랐음"이어도 답 노출 후 다음 단계까지 진행. 생존 깊이 = 처음 "몰랐음" 나온 단계.
- 꼬리질문 없는 메인 Q는 드릴 덱에서 제외.
- 커밋 이메일 `30681841+valorjj@users.noreply.github.com`, `Co-Authored-By` 포함. 각 태스크 끝에 커밋.
- 검증: 단위 테스트(Vitest) + 실브라우저(Playwright, `/Users/jeongjin/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js`, `const { chromium } = pkg`).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/lib/quiz.ts` (수정) | `extractDrillChains(body)` + 타입 `DrillFollowup`/`DrillChain`, 헬퍼 `cleanFollowup` 추가 |
| `src/lib/quiz.test.ts` (수정) | `extractDrillChains` 단위 테스트 |
| `src/hooks/useNotePool.ts` (신규) | 노트 fetch + 노드매핑 공유 훅, `buildItems(extract)` |
| `src/components/QuizView.tsx` (수정) | `useNotePool` 사용하도록 리팩터(동작 불변) |
| `src/components/DrillView.tsx` (신규) | 드릴다운 UI |
| `src/components/DrillView.css` (신규) | 드릴다운 스타일 |
| `src/components/QuizTab.tsx` (신규) | `플래시카드 \| 드릴다운` 토글 래퍼 |
| `src/components/QuizTab.css` (신규) | 모드 토글 스타일 |
| `src/App.tsx` (수정) | 퀴즈 뷰를 `<QuizTab>`으로 교체 |

---

## Task 1: `extractDrillChains` 파서 (순수함수, TDD)

**Files:**
- Modify: `interview-map/src/lib/quiz.ts`
- Test: `interview-map/src/lib/quiz.test.ts`

**Interfaces:**
- Consumes: 기존 `Q_START` 정규식, `cleanQuestion` (같은 파일 내 private — 재사용).
- Produces:
  ```ts
  export interface DrillFollowup { question: string; answer: string }
  export interface DrillChain { question: string; answer: string; followups: DrillFollowup[] }
  export function extractDrillChains(body: string): DrillChain[]
  ```

- [ ] **Step 1: Write the failing tests**

`interview-map/src/lib/quiz.test.ts` 상단 import에 `extractDrillChains` 추가하고, 파일 끝에 아래 describe 블록 추가:

```ts
import { extractQuizItems, hashSeed, seededShuffle, weakDomains, extractDrillChains } from './quiz'

describe('extractDrillChains', () => {
  it('captures a main Q with its ordered follow-up chain', () => {
    const body = [
      '**Q1. "프로세스와 스레드 차이?"**',
      '> 프로세스는 독립 메모리, 스레드는 공유.',
      '',
      '**꼬리 Q1-1. "멀티프로세스를 택하는 경우는?"**',
      '> 격리가 안정성으로 직결될 때.',
      '',
      '**꼬리 Q1-2. "JVM 스레드와 OS 스레드 관계는?"**',
      '> 1:1 매핑이 일반적.',
    ].join('\n')
    const chains = extractDrillChains(body)
    expect(chains).toHaveLength(1)
    expect(chains[0].question).toBe('프로세스와 스레드 차이?')
    expect(chains[0].answer).toBe('프로세스는 독립 메모리, 스레드는 공유.')
    expect(chains[0].followups).toEqual([
      { question: '멀티프로세스를 택하는 경우는?', answer: '격리가 안정성으로 직결될 때.' },
      { question: 'JVM 스레드와 OS 스레드 관계는?', answer: '1:1 매핑이 일반적.' },
    ])
  })

  it('excludes a main Q that has no follow-ups', () => {
    const body = [
      '**Q1. "꼬리 없는 질문?"**',
      '> 답만 있음.',
      '',
      '**Q2. "꼬리 있는 질문?"**',
      '> 메인 답.',
      '',
      '**꼬리 Q2-1. "따라오는 질문?"**',
      '> 따라오는 답.',
    ].join('\n')
    const chains = extractDrillChains(body)
    expect(chains).toHaveLength(1)
    expect(chains[0].question).toBe('꼬리 있는 질문?')
    expect(chains[0].followups).toHaveLength(1)
  })

  it('ignores Q/follow-up markers inside code fences', () => {
    const body = [
      '```',
      '**Q1. "코드 안 질문"**',
      '> 무시됨',
      '**꼬리 Q1-1. "코드 안 꼬리"**',
      '> 무시됨',
      '```',
      '**Q2. "진짜 질문?"**',
      '> 진짜 답.',
      '',
      '**꼬리 Q2-1. "진짜 꼬리?"**',
      '> 진짜 꼬리 답.',
    ].join('\n')
    const chains = extractDrillChains(body)
    expect(chains).toHaveLength(1)
    expect(chains[0].question).toBe('진짜 질문?')
    expect(chains[0].followups).toHaveLength(1)
  })

  it('parses multiple chains and stops each at the next main Q', () => {
    const body = [
      '**Q1. "첫 질문?"**',
      '> 첫 답.',
      '**꼬리 Q1-1. "첫 꼬리?"**',
      '> 첫 꼬리 답.',
      '**Q2. "둘째 질문?"**',
      '> 둘째 답.',
      '**꼬리 Q2-1. "둘째 꼬리?"**',
      '> 둘째 꼬리 답.',
    ].join('\n')
    const chains = extractDrillChains(body)
    expect(chains.map((c) => c.question)).toEqual(['첫 질문?', '둘째 질문?'])
    expect(chains[0].followups).toHaveLength(1)
    expect(chains[1].followups[0].question).toBe('둘째 꼬리?')
  })

  it('returns [] when there are no follow-ups anywhere', () => {
    const body = ['**Q1. "질문?"**', '> 답.'].join('\n')
    expect(extractDrillChains(body)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd interview-map && npx vitest run src/lib/quiz.test.ts`
Expected: FAIL — `extractDrillChains is not a function` / import error.

- [ ] **Step 3: Implement `cleanFollowup` + `extractDrillChains`**

`interview-map/src/lib/quiz.ts`에서 기존 `extractQuizItems` 함수 정의 바로 아래(약 45행 이후)에 추가:

```ts
// Follow-up marker: "**꼬리 Q1-1. ...**", "**꼬리 Q2-1: ...**".
const FOLLOWUP_START = /^\*\*꼬리/

// Clean a follow-up question line: drop the "꼬리 Q1-1." marker and wrapping quotes.
function cleanFollowup(inner: string): string {
  let t = inner.replace(/^꼬리\s*Q?[\d-]*(?:\([^)]*\))?\s*[.:]\s*/, '').trim()
  t = t.replace(/^["“”'](.*)["“”']$/s, '$1').trim()
  return t
}

export interface DrillFollowup {
  question: string
  answer: string
}

export interface DrillChain {
  question: string
  answer: string
  followups: DrillFollowup[]
}

// Parse main-Q + follow-up chains from a section body. A chain is a **Q...** line
// with its `>` answer, followed by consecutive **꼬리...** lines (each with its own
// `>` answer), up to the next main **Q...** or the section end. Main Qs with no
// follow-ups are excluded (the flashcard mode covers those). Fence-aware.
export function extractDrillChains(body: string): DrillChain[] {
  const lines = body.split('\n')
  const fence = /^\s*(```|~~~)/
  let inFence = false
  const out: DrillChain[] = []

  // Read a `>` blockquote starting at index `start`; returns [text, nextIndex].
  const readQuote = (start: number): [string, number] => {
    const acc: string[] = []
    let j = start
    while (j < lines.length && lines[j].trimStart().startsWith('>')) {
      acc.push(lines[j].trimStart().replace(/^>\s?/, ''))
      j++
    }
    return [acc.join('\n').trim(), j]
  }

  const isMain = (t: string) => Q_START.test(t) && t.endsWith('**') && t.length > 4
  const isFollow = (t: string) => FOLLOWUP_START.test(t) && t.endsWith('**') && t.length > 4

  let i = 0
  while (i < lines.length) {
    if (fence.test(lines[i])) { inFence = !inFence; i++; continue }
    if (inFence) { i++; continue }
    const t = lines[i].trim()
    if (!isMain(t)) { i++; continue }

    const question = cleanQuestion(t.slice(2, -2))
    let j = i + 1
    while (j < lines.length && lines[j].trim() === '') j++
    if (j >= lines.length || !lines[j].trimStart().startsWith('>')) { i += 1; continue }
    const [answer, afterAns] = readQuote(j)

    const followups: DrillFollowup[] = []
    let k = afterAns
    while (k < lines.length) {
      if (fence.test(lines[k])) { inFence = !inFence; k++; continue }
      if (inFence) { k++; continue }
      const tk = lines[k].trim()
      if (isMain(tk)) break // next main Q ends this chain
      if (!isFollow(tk)) { k++; continue }
      const fq = cleanFollowup(tk.slice(2, -2))
      let m = k + 1
      while (m < lines.length && lines[m].trim() === '') m++
      if (m >= lines.length || !lines[m].trimStart().startsWith('>')) { k += 1; continue }
      const [fans, afterF] = readQuote(m)
      followups.push({ question: fq, answer: fans })
      k = afterF
    }

    if (followups.length > 0) out.push({ question, answer, followups })
    i = k
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd interview-map && npx vitest run src/lib/quiz.test.ts`
Expected: PASS (all extractDrillChains tests + existing quiz tests).

- [ ] **Step 5: Verify against real note content**

Run: `cd interview-map && node -e "const fs=require('fs');const b=fs.readFileSync('public/notes/02-os/os-core.md','utf8');" ` — 그리고 임시 확인 대신, 아래 한 줄로 os-core에서 체인이 실제로 잡히는지 스모크 확인:

Run:
```bash
cd interview-map && npx vitest run src/lib/quiz.test.ts 2>&1 | tail -3
```
Expected: PASS. (실데이터 파싱은 Task 4 브라우저 검증에서 확인)

- [ ] **Step 6: Commit**

```bash
cd /Users/jeongjin/Documents/cs-study
git add interview-map/src/lib/quiz.ts interview-map/src/lib/quiz.test.ts
git commit -m "feat: parse main-Q + follow-up chains for drill-down mode

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `useNotePool` 공유 훅 + `QuizView` 리팩터

**Files:**
- Create: `interview-map/src/hooks/useNotePool.ts`
- Modify: `interview-map/src/components/QuizView.tsx`

**Interfaces:**
- Consumes: `parseNoteRef`, `parseSections` (from `../lib/notes`); `GraphNode` (from `../graph/types`); `extractQuizItems`, `RawQuizItem` (from `../lib/quiz`).
- Produces:
  ```ts
  export interface NoteContext { domain: string; nodeId: string; nodeLabel: string; key: string }
  export function useNotePool(nodes: GraphNode[]): {
    loading: boolean
    buildItems: <T extends object>(extract: (body: string) => T[]) => Array<T & NoteContext>
  }
  ```

- [ ] **Step 1: Create `useNotePool.ts`**

`interview-map/src/hooks/useNotePool.ts`:

```ts
import { useEffect, useMemo, useState } from 'react'
import { parseNoteRef, parseSections } from '../lib/notes'
import type { GraphNode } from '../graph/types'

export interface NoteContext {
  domain: string
  nodeId: string
  nodeLabel: string
  key: string
}

// Shared note loader for the quiz tab. Fetches every concept note once, then
// `buildItems(extract)` runs any per-section extractor (flashcard items, drill
// chains, …) and tags each result with the owning node's domain/id/label so the
// views don't duplicate the fetch + node-mapping logic.
export function useNotePool(nodes: GraphNode[]): {
  loading: boolean
  buildItems: <T extends object>(extract: (body: string) => T[]) => Array<T & NoteContext>
} {
  const maps = useMemo(() => {
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
    return { domainNode, anchorMap, fileDomain, files }
  }, [nodes])

  const [results, setResults] = useState<ReadonlyArray<readonly [string, string]> | null>(null)

  useEffect(() => {
    let cancelled = false
    setResults(null)
    Promise.all(
      maps.files.map((f) =>
        fetch(f).then((r) => (r.ok ? r.text() : '')).catch(() => '').then((md) => [f, md] as const),
      ),
    ).then((res) => { if (!cancelled) setResults(res) })
    return () => { cancelled = true }
  }, [maps])

  const buildItems = useMemo(() => {
    return function <T extends object>(extract: (body: string) => T[]): Array<T & NoteContext> {
      if (!results) return []
      const out: Array<T & NoteContext> = []
      for (const [path, md] of results) {
        if (!md) continue
        const { sections } = parseSections(md)
        for (const s of sections) {
          const raws = extract(s.body)
          if (!raws.length) continue
          const owner = maps.anchorMap.get(path)?.get(s.slug)
          const domain = owner?.domain ?? maps.fileDomain.get(path) ?? ''
          const dn = maps.domainNode.get(domain)
          const nodeId = owner?.id ?? dn?.id ?? ''
          const nodeLabel = owner?.label ?? dn?.label ?? domain
          raws.forEach((r, i) =>
            out.push({ ...r, domain, nodeId, nodeLabel, key: `${path}#${s.slug}#${i}` }),
          )
        }
      }
      return out
    }
  }, [results, maps])

  return { loading: results === null, buildItems }
}
```

- [ ] **Step 2: Refactor `QuizView.tsx` to use the hook**

`interview-map/src/components/QuizView.tsx` — 전체를 아래로 교체 (동작 동일, fetch 로직만 훅으로 이전):

```tsx
import { useMemo, useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { LuArrowRight, LuShuffle } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { extractQuizItems, seededShuffle, hashSeed, weakDomains } from '../lib/quiz'
import { useNotePool } from '../hooks/useNotePool'
import { domainColor } from '../styles/theme'
import type { GraphNode } from '../graph/types'
import './QuizView.css'

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Flashcard quiz: interview Q&A drawn in a date-seeded order within the chosen scope.
export function QuizView({ nodes }: { nodes: GraphNode[] }) {
  const select = useGraphStore((s) => s.select)
  const setViewMode = useGraphStore((s) => s.setViewMode)
  const recordQuizResult = useGraphStore((s) => s.recordQuizResult)
  const quizStats = useGraphStore((s) => s.quizStats)
  const requestTrack = useGraphStore((s) => s.requestTrack)
  const [scope, setScope] = useState<string>('all')
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)

  const { loading, buildItems } = useNotePool(nodes)
  const pool = useMemo(() => buildItems(extractQuizItems), [buildItems])

  const domains = useMemo(() => {
    const present = new Set(pool.map((i) => i.domain))
    return nodes.filter((n) => n.level === 0 && present.has(n.domain))
  }, [pool, nodes])

  const deck = useMemo(() => {
    const scoped = scope === 'all' ? pool : pool.filter((i) => i.domain === scope)
    return seededShuffle(scoped, hashSeed(`${todayStr()}:${scope}`))
  }, [pool, scope])

  useEffect(() => { setIndex(0); setRevealed(false) }, [scope])

  if (loading) return <div className="quiz"><p className="quiz-dim">퀴즈 불러오는 중…</p></div>
  const card = deck[index]

  const domainLabel = new Map(nodes.filter((n) => n.level === 0).map((n) => [n.domain, n.label]))
  const weak = weakDomains(quizStats)
  const advance = () => { setIndex((i) => (i + 1) % deck.length); setRevealed(false) }
  const assess = (correct: boolean) => { if (card) recordQuizResult(card.domain, correct); advance() }

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

      {weak.length > 0 && (
        <div className="quiz-weak">
          <span className="quiz-weak-label">🎯 약점 보강</span>
          {weak.map((w) => (
            <button key={w.domain} className="quiz-weak-chip" onClick={() => requestTrack(`domain:${w.domain}`)}>
              {domainLabel.get(w.domain) ?? w.domain} <b>{w.correct}/{w.seen}</b>
            </button>
          ))}
        </div>
      )}

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
            {revealed ? (
              <div className="quiz-assess">
                <button className="quiz-miss" onClick={() => assess(false)}>몰랐음</button>
                <button className="quiz-got" onClick={() => assess(true)}>알았음</button>
              </div>
            ) : (
              <button className="quiz-next" onClick={advance}>다음 <LuArrowRight size={14} /></button>
            )}
          </div>
        </div>
      ) : (
        <p className="quiz-dim">이 범위에 문제가 없습니다.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + run full test suite**

Run: `cd interview-map && npx tsc --noEmit && npx vitest run`
Expected: 타입 에러 없음, 모든 테스트 통과.

- [ ] **Step 4: Real-browser verify flashcard mode still works**

Run this Playwright smoke (dev 서버가 떠 있어야 함 — 없으면 `cd interview-map && npm run dev` 백그라운드 실행 후 포트 확인):

```js
// scratchpad/verify-flash.mjs
import pkg from '/Users/jeongjin/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js'
const { chromium } = pkg
const b = await chromium.launch(); const p = await b.newPage()
const errors = []; p.on('pageerror', e => errors.push(e.message))
await p.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1500)
await p.locator('.vt button', { hasText: '퀴즈' }).click()
await p.waitForTimeout(1200)
console.log('scopes:', await p.locator('.quiz-scope').count())
await p.locator('.quiz-reveal').first().click()
await p.waitForTimeout(200)
console.log('answer shown:', await p.locator('.quiz-a').count())
await p.locator('.quiz-got').first().click()
await p.waitForTimeout(200)
console.log('errors:', errors.length ? errors : 'none')
await b.close()
```
Run: `node <scratchpad>/verify-flash.mjs`
Expected: `scopes: >0`, `answer shown: 1`, `errors: none`.

- [ ] **Step 5: Commit**

```bash
cd /Users/jeongjin/Documents/cs-study
git add interview-map/src/hooks/useNotePool.ts interview-map/src/components/QuizView.tsx
git commit -m "refactor: extract shared note loader hook (useNotePool)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `DrillView` 컴포넌트 + 스타일

**Files:**
- Create: `interview-map/src/components/DrillView.tsx`
- Create: `interview-map/src/components/DrillView.css`

**Interfaces:**
- Consumes: `useNotePool` (Task 2); `extractDrillChains`, `DrillChain`, `seededShuffle`, `hashSeed` (Task 1 + existing); `useGraphStore` actions `select`, `setViewMode`, `recordQuizResult`; `domainColor`; `GraphNode`.
- Produces: `export function DrillView({ nodes }: { nodes: GraphNode[] })`.

- [ ] **Step 1: Create `DrillView.tsx`**

`interview-map/src/components/DrillView.tsx`:

```tsx
import { useMemo, useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { LuArrowRight, LuShuffle, LuShield } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { extractDrillChains, seededShuffle, hashSeed } from '../lib/quiz'
import { useNotePool } from '../hooks/useNotePool'
import { domainColor } from '../styles/theme'
import type { GraphNode } from '../graph/types'
import './DrillView.css'

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Interview drill-down: step through a main Q and its follow-up chain like an
// interviewer probing deeper. "Learning-first" — a 몰랐음 still reveals the answer
// and continues; survival depth = the first step the user missed. Each step feeds
// the existing domain weakness stats via recordQuizResult.
export function DrillView({ nodes }: { nodes: GraphNode[] }) {
  const select = useGraphStore((s) => s.select)
  const setViewMode = useGraphStore((s) => s.setViewMode)
  const recordQuizResult = useGraphStore((s) => s.recordQuizResult)
  const [scope, setScope] = useState<string>('all')
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState(0)          // 0 = main Q, 1..n = followups
  const [revealed, setRevealed] = useState(false)
  const [firstMiss, setFirstMiss] = useState<number | null>(null)
  const [finished, setFinished] = useState(false)

  const { loading, buildItems } = useNotePool(nodes)
  const pool = useMemo(() => buildItems(extractDrillChains), [buildItems])

  const domains = useMemo(() => {
    const present = new Set(pool.map((c) => c.domain))
    return nodes.filter((n) => n.level === 0 && present.has(n.domain))
  }, [pool, nodes])

  const deck = useMemo(() => {
    const scoped = scope === 'all' ? pool : pool.filter((c) => c.domain === scope)
    return seededShuffle(scoped, hashSeed(`${todayStr()}:${scope}:drill`))
  }, [pool, scope])

  const resetCard = () => { setStep(0); setRevealed(false); setFirstMiss(null); setFinished(false) }
  useEffect(() => { setIndex(0); resetCard() }, [scope])

  if (loading) return <div className="drill"><p className="drill-dim">불러오는 중…</p></div>

  const chain = deck[index] as (DrillChain & { domain: string; nodeId: string; nodeLabel: string }) | undefined

  const scopes = (
    <div className="drill-scopes">
      <button className="drill-scope" data-active={scope === 'all'} onClick={() => setScope('all')}>
        <LuShuffle size={13} /> 전체 랜덤
      </button>
      {domains.map((d) => (
        <button key={d.domain} className="drill-scope" data-active={scope === d.domain}
          style={{ ['--c' as string]: domainColor(d.domain) }} onClick={() => setScope(d.domain)}>
          {d.label}
        </button>
      ))}
    </div>
  )

  if (!chain) {
    return (
      <div className="drill">
        {scopes}
        <div className="drill-empty">
          <p>이 범위는 꼬리질문이 아직 준비 중이에요.</p>
          <p className="drill-dim">지금은 OS · DevOps · 시스템 디자인 · 자료구조/알고리즘에서 연습할 수 있어요.</p>
          <button className="drill-scope" onClick={() => setScope('all')}>전체로 시작하기</button>
        </div>
      </div>
    )
  }

  const steps: { q: string; a: string }[] = [
    { q: chain.question, a: chain.answer },
    ...chain.followups.map((f) => ({ q: f.question, a: f.answer })),
  ]
  const total = steps.length
  const cur = steps[step]

  const nextCard = () => {
    setIndex((i) => (i + 1) % deck.length)
    resetCard()
  }

  const assess = (correct: boolean) => {
    recordQuizResult(chain.domain, correct)
    if (!correct && firstMiss === null) setFirstMiss(step)
    if (step < total - 1) { setStep((s) => s + 1); setRevealed(false) }
    else setFinished(true)
  }

  const survived = firstMiss === null ? total : firstMiss

  return (
    <div className="drill" style={{ ['--c' as string]: domainColor(chain.domain) }}>
      {scopes}

      <div className="drill-card">
        <div className="drill-meta">
          <span className="drill-count">{index + 1} / {deck.length}</span>
          <span className="drill-badge">{chain.nodeLabel}</span>
        </div>

        {finished ? (
          <div className="drill-summary">
            <div className="drill-depth"><LuShield size={20} /> 생존 깊이 <b>{survived}/{total}</b></div>
            <p className="drill-dim">
              {survived === total ? '끝까지 버텼어요. 완벽합니다!' : `${survived + 1}단계 꼬리질문부터 막혔어요. 이 개념을 다시 보세요.`}
            </p>
            <div className="drill-actions">
              <button className="drill-link" onClick={() => { select(chain.nodeId); setViewMode('list') }}>
                이 개념 보기 <LuArrowRight size={14} />
              </button>
              <button className="drill-next" onClick={nextCard}>다음 개념 <LuArrowRight size={14} /></button>
            </div>
          </div>
        ) : (
          <>
            <div className="drill-steps">
              {steps.map((_, i) => (
                <span key={i} className="drill-dot" data-done={i < step} data-active={i === step} />
              ))}
              <span className="drill-stepnum">단계 {step + 1}/{total}{step > 0 ? ' · 꼬리질문' : ''}</span>
            </div>
            <p className="drill-q">{cur.q}</p>
            {revealed ? (
              <div className="drill-a">
                <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{cur.a}</Markdown>
              </div>
            ) : (
              <button className="drill-reveal" onClick={() => setRevealed(true)}>답 보기</button>
            )}
            {revealed && (
              <div className="drill-assess">
                <button className="drill-miss" onClick={() => assess(false)}>몰랐음</button>
                <button className="drill-got" onClick={() => assess(true)}>알았음</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `DrillView.css`**

`interview-map/src/components/DrillView.css`:

```css
.drill { display: flex; flex-direction: column; gap: 14px; padding: 20px 24px; max-width: 760px; margin: 0 auto; width: 100%; }
.drill-dim { color: var(--text-dim); font-size: 13px; }

.drill-scopes { display: flex; flex-wrap: wrap; gap: 7px; }
.drill-scope {
  display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600;
  padding: 6px 12px; border-radius: 999px; cursor: pointer;
  border: 1.5px solid var(--border); background: transparent; color: var(--text-dim);
}
.drill-scope[data-active='true'] { border-color: var(--c, var(--accent)); color: var(--text); background: color-mix(in srgb, var(--c, var(--accent)) 14%, transparent); }

.drill-card { border: 1px solid var(--border); border-left: 4px solid var(--c, var(--accent)); border-radius: 12px; padding: 18px 20px; background: var(--bg-elev); }
.drill-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.drill-count { font-size: 12px; color: var(--text-dim); }
.drill-badge { font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 6px; background: color-mix(in srgb, var(--c, var(--accent)) 16%, transparent); color: var(--text); }

.drill-steps { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.drill-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); }
.drill-dot[data-done='true'] { background: var(--c, var(--accent)); }
.drill-dot[data-active='true'] { background: var(--c, var(--accent)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c, var(--accent)) 30%, transparent); }
.drill-stepnum { margin-left: 6px; font-size: 12px; color: var(--text-dim); }

.drill-q { font-size: 16px; font-weight: 600; line-height: 1.5; margin: 6px 0 14px; }
.drill-a { font-size: 14px; line-height: 1.65; }
.drill-a :first-child { margin-top: 0; }

.drill-reveal { align-self: flex-start; font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: 8px; cursor: pointer; border: 1px solid var(--c, var(--accent)); background: transparent; color: var(--text); }

.drill-assess { display: flex; gap: 8px; margin-top: 16px; }
.drill-miss, .drill-got { flex: 1; font-size: 13.5px; font-weight: 700; padding: 10px; border-radius: 8px; cursor: pointer; border: 1.5px solid; }
.drill-miss { border-color: #e06c5b; color: #e06c5b; background: transparent; }
.drill-got { border-color: #2fbf71; color: #fff; background: #2fbf71; }

.drill-summary { text-align: center; padding: 8px 0; }
.drill-depth { display: inline-flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; margin-bottom: 8px; }
.drill-depth b { color: var(--c, var(--accent)); }
.drill-actions { display: flex; gap: 8px; justify-content: center; margin-top: 14px; }
.drill-link, .drill-next { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; padding: 9px 15px; border-radius: 8px; cursor: pointer; }
.drill-link { border: 1px solid var(--border); background: transparent; color: var(--text); }
.drill-next { border: 1px solid var(--c, var(--accent)); background: var(--c, var(--accent)); color: #fff; }

.drill-empty { text-align: center; padding: 30px 10px; display: flex; flex-direction: column; gap: 10px; align-items: center; }

@media (max-width: 640px) {
  .drill { padding: 14px 14px; }
  .drill-q { font-size: 15px; }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd interview-map && npx tsc --noEmit`
Expected: 에러 없음. (DrillView는 Task 4에서 QuizTab에 연결되어야 브라우저 검증 가능)

- [ ] **Step 4: Commit**

```bash
cd /Users/jeongjin/Documents/cs-study
git add interview-map/src/components/DrillView.tsx interview-map/src/components/DrillView.css
git commit -m "feat: DrillView — interview follow-up drill-down UI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `QuizTab` 래퍼 + App 연결 + 실브라우저 검증

**Files:**
- Create: `interview-map/src/components/QuizTab.tsx`
- Create: `interview-map/src/components/QuizTab.css`
- Modify: `interview-map/src/App.tsx`

**Interfaces:**
- Consumes: `QuizView` (Task 2), `DrillView` (Task 3), `GraphNode`.
- Produces: `export function QuizTab({ nodes }: { nodes: GraphNode[] })`.

- [ ] **Step 1: Create `QuizTab.tsx`**

`interview-map/src/components/QuizTab.tsx`:

```tsx
import { useState } from 'react'
import { QuizView } from './QuizView'
import { DrillView } from './DrillView'
import type { GraphNode } from '../graph/types'
import './QuizTab.css'

type QuizMode = 'flash' | 'drill'

// Quiz tab shell: switches between flashcard practice and interview drill-down.
export function QuizTab({ nodes }: { nodes: GraphNode[] }) {
  const [mode, setMode] = useState<QuizMode>('flash')
  return (
    <div className="quiztab">
      <div className="quiztab-modes" role="tablist" aria-label="퀴즈 모드">
        <button className="quiztab-mode" role="tab" aria-selected={mode === 'flash'}
          data-active={mode === 'flash'} onClick={() => setMode('flash')}>
          플래시카드
        </button>
        <button className="quiztab-mode" role="tab" aria-selected={mode === 'drill'}
          data-active={mode === 'drill'} onClick={() => setMode('drill')}>
          🎤 드릴다운
        </button>
      </div>
      {mode === 'flash' ? <QuizView nodes={nodes} /> : <DrillView nodes={nodes} />}
    </div>
  )
}
```

- [ ] **Step 2: Create `QuizTab.css`**

`interview-map/src/components/QuizTab.css`:

```css
.quiztab { display: flex; flex-direction: column; height: 100%; overflow: auto; }
.quiztab-modes {
  display: inline-flex; gap: 4px; align-self: center; margin: 16px auto 0;
  padding: 4px; border-radius: 999px; background: var(--bg-elev); border: 1px solid var(--border);
}
.quiztab-mode {
  font-size: 13px; font-weight: 600; padding: 6px 16px; border-radius: 999px;
  cursor: pointer; border: none; background: transparent; color: var(--text-dim);
}
.quiztab-mode[data-active='true'] { background: var(--accent); color: #fff; }
```

- [ ] **Step 3: Wire into `App.tsx`**

`interview-map/src/App.tsx`:
- import 교체 (약 11행): `import { QuizView } from './components/QuizView'` → `import { QuizTab } from './components/QuizTab'`
- 렌더 교체 (약 45행): `{viewMode === 'quiz' && <QuizView nodes={data.nodes} />}` → `{viewMode === 'quiz' && <QuizTab nodes={data.nodes} />}`

- [ ] **Step 4: Typecheck + full test suite + build**

Run: `cd interview-map && npx tsc --noEmit && npx vitest run && npm run build`
Expected: 타입 에러 없음, 전체 테스트 통과, 빌드 성공.

- [ ] **Step 5: Real-browser end-to-end verify**

dev 서버 실행 후(`cd interview-map && npm run dev` 백그라운드, 포트 확인), 아래 Playwright 실행:

```js
// scratchpad/verify-drill.mjs
import pkg from '/Users/jeongjin/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js'
const { chromium } = pkg
const b = await chromium.launch(); const p = await b.newPage()
const errors = []; p.on('pageerror', e => errors.push(e.message))
await p.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1500)
await p.locator('.vt button', { hasText: '퀴즈' }).click()
await p.waitForTimeout(400)
// switch to drill mode
await p.locator('.quiztab-mode', { hasText: '드릴다운' }).click()
await p.waitForTimeout(1200)
console.log('drill scopes:', await p.locator('.drill-scope').count())
console.log('step indicator:', await p.locator('.drill-stepnum').innerText().catch(() => 'none'))
// step through the whole chain
for (let i = 0; i < 6; i++) {
  const reveal = p.locator('.drill-reveal')
  if (await reveal.count()) { await reveal.first().click(); await p.waitForTimeout(150) }
  const got = p.locator('.drill-got')
  if (await got.count()) { await got.first().click(); await p.waitForTimeout(200) }
  if (await p.locator('.drill-summary').count()) break
}
console.log('survival summary shown:', await p.locator('.drill-depth').innerText().catch(() => 'none'))
// next card works
await p.locator('.drill-next').first().click().catch(() => {})
await p.waitForTimeout(300)
console.log('errors:', errors.length ? errors : 'none')
await b.close()
```
Run: `node <scratchpad>/verify-drill.mjs`
Expected: `drill scopes: >0`, `step indicator` 포함 "단계 1/", `survival summary shown` 포함 "생존 깊이", `errors: none`.

- [ ] **Step 6: Verify weakness recording feeds 약점 보강**

같은 Playwright 세션(또는 이어서): 드릴에서 몇 문제 "몰랐음"으로 답한 뒤 플래시카드 모드로 전환 → `.quiz-weak-chip`이 나타나는지 확인 (자기평가가 기존 도메인 통계에 반영되는지). minSeen=3 이상 쌓여야 칩이 뜨므로, 같은 도메인 스코프로 3회 이상 몰랐음 처리:

```js
// append to verify-drill.mjs before b.close(), on a fresh page context if needed
// (수동 확인도 가능: 드릴에서 OS 스코프로 3+ 문제 몰랐음 → 플래시카드에서 🎯 약점 보강에 OS 등장)
```
Expected: 도메인 스코프로 3회↑ 몰랐음 후 플래시카드 전환 시 해당 도메인이 🎯 약점 보강 칩에 등장. (수동 확인 허용)

- [ ] **Step 7: Commit**

```bash
cd /Users/jeongjin/Documents/cs-study
git add interview-map/src/components/QuizTab.tsx interview-map/src/components/QuizTab.css interview-map/src/App.tsx
git commit -m "feat: quiz tab mode toggle — flashcard | drill-down

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- 상호작용 흐름(단계 진행/학습우선/생존깊이) → Task 3 (DrillView) ✓
- 배치(퀴즈 탭 모드 전환) → Task 4 (QuizTab) ✓
- 약점 연동(신규 저장소 없음, recordQuizResult) → Task 3 assess() ✓
- 범위/빈 상태(동적 도메인 칩 + 준비중) → Task 3 domains/empty ✓
- 파서 계약(extractDrillChains, 꼬리없음 제외, 펜스) → Task 1 ✓
- useNotePool 계약 → Task 2 ✓
- 결정적 덱(seededShuffle, :drill 접미사) → Task 3 ✓
- 테스트(단위 + 실브라우저 + 회귀) → Task 1/2/4 ✓
- 범위 밖(영속 생존깊이/콘텐츠확충/SRS/대시보드) → 미포함 ✓

**2. Placeholder scan:** 코드 블록 모두 완전 구현. Task 4 Step 6은 수동 확인 허용 명시(자동화 어려운 minSeen 임계값). placeholder 없음.

**3. Type consistency:**
- `NoteContext { domain, nodeId, nodeLabel, key }` — Task 2 정의, Task 3에서 `chain.domain/nodeId/nodeLabel` 사용 (buildItems가 부착) ✓
- `DrillChain { question, answer, followups }` / `DrillFollowup { question, answer }` — Task 1 정의, Task 3에서 `chain.followups.map(f => f.question/answer)` ✓
- `buildItems<T extends object>` — Task 2, Task 3 `buildItems(extractDrillChains)` (DrillChain은 object) ✓
- `recordQuizResult(domain, correct)` — 기존 store 시그니처 그대로 ✓
- `seededShuffle`, `hashSeed` — 기존 export ✓
