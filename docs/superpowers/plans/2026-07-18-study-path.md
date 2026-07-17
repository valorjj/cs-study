# Study Path Recommendation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A "경로" view (4th tab): pick a course (curated goal course or auto per-domain), work through ordered concepts, check them off (persisted), jump to each note.

**Architecture:** Pure `tracks.ts` (`buildDomainTracks`, `trackProgress`, `nextStepIndex`) + static `graph/tracks.ts` curated courses. Progress lives in the store (`studiedIds`) + a persistence hook. New `PathView` renders course list + checklist. `ViewMode` gains `'path'`.

**Tech Stack:** React, zustand, react-icons/lu, Vitest.

## Global Constraints

- Korean explanations + English code.
- Progress persisted in `localStorage["interview-map.progress.v1"]`; never mutate `node.status`.
- Public repo; commit email `30681841+valorjj@users.noreply.github.com`, include Co-Authored-By.

---

### Task 1: `tracks.ts` + curated courses

**Files:**
- Create: `interview-map/src/lib/tracks.ts`
- Create: `interview-map/src/graph/tracks.ts`
- Test: `interview-map/src/lib/tracks.test.ts`

**Interfaces:**
- Produces:
  - `interface Track { id: string; title: string; description: string; icon: string; steps: string[] }`
  - `buildDomainTracks(nodes, edges): Track[]`
  - `trackProgress(track, studied: Set<string>): { done: number; total: number }`
  - `nextStepIndex(track, studied: Set<string>): number`
  - `CURATED_TRACKS: Track[]`

- [ ] **Step 1: Write failing tests** — `tracks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import graphData from '../graph/graph.json'
import { CURATED_TRACKS } from '../graph/tracks'
import { buildDomainTracks, trackProgress, nextStepIndex, type Track } from './tracks'
import type { GraphNode, GraphEdge } from './types'

const N = (id: string, level: 0 | 1 | 2, domain = 'java'): GraphNode => ({
  id, label: id, domain, level, icon: '', summary: '', keywords: [], status: 'learning', position: { x: 0, y: 0 },
})
const nodes: GraphNode[] = [N('java', 0), N('jvm', 1), N('jvm-gc', 2), N('collections', 1)]
const edges: GraphEdge[] = [
  { source: 'java', target: 'jvm', type: 'hierarchy' },
  { source: 'jvm', target: 'jvm-gc', type: 'hierarchy' },
  { source: 'java', target: 'collections', type: 'hierarchy' },
]

describe('buildDomainTracks', () => {
  it('makes one track per domain, tree order, excluding the L0 node', () => {
    const tracks = buildDomainTracks(nodes, edges)
    expect(tracks).toHaveLength(1)
    expect(tracks[0].id).toBe('domain:java')
    expect(tracks[0].steps).toEqual(['jvm', 'jvm-gc', 'collections'])
  })
})

describe('trackProgress', () => {
  const t: Track = { id: 't', title: '', description: '', icon: '', steps: ['a', 'b', 'c'] }
  it('counts studied steps', () => {
    expect(trackProgress(t, new Set(['a', 'c']))).toEqual({ done: 2, total: 3 })
    expect(trackProgress(t, new Set())).toEqual({ done: 0, total: 3 })
  })
})

describe('nextStepIndex', () => {
  const t: Track = { id: 't', title: '', description: '', icon: '', steps: ['a', 'b', 'c'] }
  it('returns the first unstudied index, or -1 when complete', () => {
    expect(nextStepIndex(t, new Set())).toBe(0)
    expect(nextStepIndex(t, new Set(['a']))).toBe(1)
    expect(nextStepIndex(t, new Set(['a', 'b', 'c']))).toBe(-1)
  })
})

describe('CURATED_TRACKS validity', () => {
  const ids = new Set((graphData as { nodes: GraphNode[] }).nodes.map((n) => n.id))
  const l0 = new Set((graphData as { nodes: GraphNode[] }).nodes.filter((n) => n.level === 0).map((n) => n.id))
  it('every curated step id exists and is not a domain (L0) node', () => {
    for (const t of CURATED_TRACKS) {
      expect(t.steps.length).toBeGreaterThan(0)
      for (const s of t.steps) {
        expect(ids.has(s), `${t.id} step ${s} missing`).toBe(true)
        expect(l0.has(s), `${t.id} step ${s} is L0`).toBe(false)
      }
    }
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `cd interview-map && npx vitest run src/lib/tracks.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/lib/tracks.ts`:**

```ts
import type { GraphNode, GraphEdge } from '../graph/types'
import { buildTree, type TreeNode } from './tree'

export interface Track {
  id: string
  title: string
  description: string
  icon: string
  steps: string[]
}

// DFS a domain subtree into an ordered id list, excluding the root (L0) node.
function flattenSteps(root: TreeNode): string[] {
  const out: string[] = []
  const walk = (t: TreeNode) => {
    for (const c of t.children) { out.push(c.node.id); walk(c) }
  }
  walk(root)
  return out
}

// One auto course per domain: its concepts in tree (graph) order.
export function buildDomainTracks(nodes: GraphNode[], edges: GraphEdge[]): Track[] {
  return buildTree(nodes, edges).map((root) => ({
    id: `domain:${root.node.domain}`,
    title: root.node.label,
    description: `${root.node.label} 개념을 트리 순서대로`,
    icon: root.node.icon,
    steps: flattenSteps(root),
  }))
}

export function trackProgress(track: Track, studied: Set<string>): { done: number; total: number } {
  let done = 0
  for (const id of track.steps) if (studied.has(id)) done++
  return { done, total: track.steps.length }
}

// Index of the first not-yet-studied step; -1 when the whole track is done.
export function nextStepIndex(track: Track, studied: Set<string>): number {
  for (let i = 0; i < track.steps.length; i++) if (!studied.has(track.steps[i])) return i
  return -1
}
```

- [ ] **Step 4: Implement `src/graph/tracks.ts`:**

```ts
import type { Track } from '../lib/tracks'

// Hand-curated, goal-oriented courses (ordered node ids verified against graph.json).
export const CURATED_TRACKS: Track[] = [
  {
    id: 'curated:junior-backend',
    title: '신입 백엔드 필수',
    description: 'CS 기초부터 웹·DB·스프링까지 면접 필수 순서',
    icon: '🎯',
    steps: [
      'dsa-bigo', 'dsa-hash', 'jvm', 'jvm-gc', 'collections',
      'os-process', 'os-scheduling', 'concurrency',
      'net-osi', 'net-tcp', 'net-http',
      'db-index', 'db-tx', 'spring-ioc', 'spring-tx',
    ],
  },
  {
    id: 'curated:crash-7',
    title: '면접 D-7 벼락치기',
    description: '가장 자주 나오는 핵심만 빠르게',
    icon: '⚡',
    steps: [
      'jvm-gc', 'collections', 'os-process', 'concurrency',
      'net-tcp', 'net-http', 'db-index', 'db-tx', 'spring-ioc', 'spring-aop',
    ],
  },
  {
    id: 'curated:java-deep',
    title: '자바 백엔드 심화',
    description: 'JVM·스프링·DB 내부 동작 깊게',
    icon: '🧩',
    steps: [
      'jvm-memory', 'jvm-gc', 'jvm-jit', 'concurrency', 'collections',
      'spring-ioc', 'spring-bean', 'spring-aop', 'spring-proxy',
      'spring-tx', 'spring-tx-propagation',
      'db-tx', 'db-isolation', 'db-mvcc', 'db-btree',
    ],
  },
]
```

- [ ] **Step 5: Run — expect pass**

Run: `cd interview-map && npx vitest run src/lib/tracks.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add interview-map/src/lib/tracks.ts interview-map/src/graph/tracks.ts interview-map/src/lib/tracks.test.ts
git commit -m "feat: tracks lib + curated courses (domain auto-tracks, progress helpers)"
```

---

### Task 2: Progress state + view wiring

**Files:**
- Modify: `interview-map/src/store/graphStore.ts`
- Modify: `interview-map/src/hooks/useTheme.ts`
- Modify: `interview-map/src/components/ViewToggle.tsx`

**Interfaces:**
- Produces: `ViewMode` includes `'path'`; store `studiedIds`, `toggleStudied`, `setStudiedIds`; `useProgressEffect()`.

- [ ] **Step 1: Extend the store** in `graphStore.ts` — update the type and add state:

Change `ViewMode`:
```ts
export type ViewMode = 'graph' | 'list' | 'quiz' | 'path'
```
Add to the `GraphState` interface:
```ts
  studiedIds: string[]              // 학습 완료 체크된 노드 (localStorage 저장)
  toggleStudied: (id: string) => void
  setStudiedIds: (ids: string[]) => void
```
Add to the store body (after `setViewMode`):
```ts
  studiedIds: [],
  toggleStudied: (id) => set((s) => ({
    studiedIds: s.studiedIds.includes(id)
      ? s.studiedIds.filter((x) => x !== id)
      : [...s.studiedIds, id],
  })),
  setStudiedIds: (ids) => set({ studiedIds: ids }),
```

- [ ] **Step 2: Add persistence + path guard** in `useTheme.ts`:

In `useViewModeEffect`, update the guard:
```ts
    if (saved === 'graph' || saved === 'list' || saved === 'quiz' || saved === 'path') setViewMode(saved)
```
Append a new hook at the end of the file:
```ts
const PROGRESS_KEY = 'interview-map.progress.v1'

// Persist study-path progress (studied node ids) across sessions.
export function useProgressEffect(): void {
  const studiedIds = useGraphStore((s) => s.studiedIds)
  const setStudiedIds = useGraphStore((s) => s.setStudiedIds)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROGRESS_KEY)
      if (saved) setStudiedIds(JSON.parse(saved) as string[])
    } catch { /* ignore */ }
    // hydrate once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(studiedIds)) } catch { /* ignore */ }
  }, [studiedIds])
}
```

- [ ] **Step 3: Add the 4th tab** in `ViewToggle.tsx` — import and button:

Change the icon import:
```ts
import { LuMap, LuList, LuBrain, LuRoute } from 'react-icons/lu'
```
Append after the 퀴즈 button (before `</div>`):
```tsx
      <button
        role="tab"
        aria-selected={viewMode === 'path'}
        data-active={viewMode === 'path'}
        onClick={() => setViewMode('path')}
      >
        <LuRoute size={15} /> 경로
      </button>
```

- [ ] **Step 4: Typecheck**

Run: `cd interview-map && npx tsc --noEmit`
Expected: no errors (App handles path in Task 3; until then `'path'` falls through to no view — acceptable mid-plan).

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/store/graphStore.ts interview-map/src/hooks/useTheme.ts interview-map/src/components/ViewToggle.tsx
git commit -m "feat: progress store slice + persistence + 'path' view mode/tab"
```

---

### Task 3: PathView component + CSS + App wiring

**Files:**
- Create: `interview-map/src/components/PathView.tsx`
- Create: `interview-map/src/components/PathView.css`
- Modify: `interview-map/src/App.tsx`

**Interfaces:**
- Consumes: `CURATED_TRACKS` (graph/tracks), `buildDomainTracks`/`trackProgress`/`nextStepIndex` (lib/tracks), `useGraphStore`, `domainColor`, `NodeIcon`.

- [ ] **Step 1: Create `PathView.tsx`:**

```tsx
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { LuArrowRight, LuCheck } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { CURATED_TRACKS } from '../graph/tracks'
import { buildDomainTracks, trackProgress, nextStepIndex } from '../lib/tracks'
import { domainColor } from '../styles/theme'
import { NodeIcon } from './NodeIcon'
import type { GraphNode, GraphEdge } from '../graph/types'
import './PathView.css'

// Study-path view: choose a course (curated or per-domain) and work through its
// ordered concepts, checking each off (persisted) and jumping to its note.
export function PathView({ nodes, edges, nodesById }: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodesById: Map<string, GraphNode>
}) {
  const select = useGraphStore((s) => s.select)
  const setViewMode = useGraphStore((s) => s.setViewMode)
  const studiedIds = useGraphStore((s) => s.studiedIds)
  const toggleStudied = useGraphStore((s) => s.toggleStudied)

  const studied = useMemo(() => new Set(studiedIds), [studiedIds])
  const tracks = useMemo(() => [...CURATED_TRACKS, ...buildDomainTracks(nodes, edges)], [nodes, edges])
  const domainLabel = useMemo(
    () => new Map(nodes.filter((n) => n.level === 0).map((n) => [n.domain, n.label])),
    [nodes],
  )
  const [selectedId, setSelectedId] = useState(tracks[0]?.id ?? '')
  const [mobileDetail, setMobileDetail] = useState(false)

  const curated = tracks.filter((t) => t.id.startsWith('curated:'))
  const domainTracks = tracks.filter((t) => t.id.startsWith('domain:'))
  const track = tracks.find((t) => t.id === selectedId) ?? tracks[0]
  const { done, total } = trackProgress(track, studied)
  const nextIdx = nextStepIndex(track, studied)
  const nextNode = nextIdx >= 0 ? nodesById.get(track.steps[nextIdx]) : undefined
  const pct = total ? Math.round((done / total) * 100) : 0

  const openNode = (id: string) => { select(id); setViewMode('list') }
  const pickTrack = (id: string) => { setSelectedId(id); setMobileDetail(true) }

  const TrackRow = ({ id, title, icon }: { id: string; title: string; icon: string }) => {
    const t = tracks.find((x) => x.id === id)!
    const p = trackProgress(t, studied)
    return (
      <button className="path-track" data-active={id === selectedId} onClick={() => pickTrack(id)}>
        <span className="path-track-icon">{icon}</span>
        <span className="path-track-title">{title}</span>
        <span className="path-track-prog">{p.done}/{p.total}</span>
      </button>
    )
  }

  return (
    <div className="path" data-detail={mobileDetail}>
      <div className="path-tracks">
        <div className="path-group">추천 코스</div>
        {curated.map((t) => <TrackRow key={t.id} id={t.id} title={t.title} icon={t.icon} />)}
        <div className="path-group">도메인별 코스</div>
        {domainTracks.map((t) => <TrackRow key={t.id} id={t.id} title={t.title} icon={t.icon} />)}
      </div>

      <div className="path-main">
        <button className="path-back" onClick={() => setMobileDetail(false)}>← 코스 목록</button>
        <div className="path-head">
          <h2><span className="path-head-icon">{track.icon}</span> {track.title}</h2>
          <p className="path-desc">{track.description}</p>
          <div className="path-bar"><span style={{ width: `${pct}%` }} /></div>
          <div className="path-status">
            <span>{done} / {total} 완료</span>
            {nextNode ? (
              <button className="path-continue" onClick={() => openNode(nextNode.id)}>
                이어서: {nextNode.label} <LuArrowRight size={14} />
              </button>
            ) : <span className="path-done">완료 🎉</span>}
          </div>
        </div>

        <ol className="path-steps">
          {track.steps.map((id, i) => {
            const n = nodesById.get(id)
            if (!n) return null
            const isDone = studied.has(id)
            return (
              <li key={id} className="path-step" data-next={i === nextIdx} data-done={isDone}
                style={{ ['--c']: domainColor(n.domain) } as CSSProperties}>
                <button className="path-check" data-done={isDone}
                  onClick={() => toggleStudied(id)} aria-label={`${n.label} 완료 토글`}>
                  {isDone && <LuCheck size={13} />}
                </button>
                <span className="path-num">{i + 1}</span>
                <button className="path-step-label" onClick={() => openNode(id)}>
                  <NodeIcon id={n.id} domain={n.domain} size={15} />
                  <span className="path-step-name">{n.label}</span>
                  <span className="path-step-domain">{domainLabel.get(n.domain) ?? n.domain}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `PathView.css`:**

```css
.path { position: fixed; inset: 0; display: flex; background: var(--bg);
  padding-top: 60px; box-sizing: border-box; font-family: system-ui, sans-serif; }
.path-tracks { width: 300px; flex: none; height: 100%; overflow-y: auto; padding: 12px 10px 80px;
  border-right: 1px solid var(--border); box-sizing: border-box; }
.path-group { font-size: 12px; color: var(--text-dim); text-transform: none; font-weight: 700;
  padding: 12px 8px 6px; }
.path-track { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  background: none; border: none; border-radius: 10px; padding: 9px 10px; cursor: pointer;
  color: var(--text); font-size: 13px; }
.path-track:hover { background: var(--bg-elev); }
.path-track[data-active="true"] { background: color-mix(in srgb, var(--accent) 16%, transparent); }
.path-track-icon { font-size: 15px; flex: none; }
.path-track-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.path-track-prog { flex: none; color: var(--text-dim); font-size: 12px; font-variant-numeric: tabular-nums; }

.path-main { flex: 1 1 auto; min-width: 0; height: 100%; overflow-y: auto; background: var(--bg-panel);
  padding: 22px 26px 80px; box-sizing: border-box; }
.path-back { display: none; }
.path-head h2 { margin: 0 0 6px; font-size: 20px; color: var(--text-strong); display: flex; align-items: center; gap: 8px; }
.path-head-icon { font-size: 22px; }
.path-desc { color: var(--text-dim); font-size: 13px; margin: 0 0 14px; }
.path-bar { height: 8px; border-radius: 999px; background: var(--bg-elev); overflow: hidden; }
.path-bar span { display: block; height: 100%; background: var(--accent); transition: width 0.25s ease; }
.path-status { display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin: 10px 0 20px; font-size: 13px; color: var(--text); }
.path-continue { display: inline-flex; align-items: center; gap: 6px; background: var(--accent);
  color: var(--node-studied-text); border: none; border-radius: 10px; padding: 8px 14px;
  cursor: pointer; font-size: 13px; font-weight: 600; }
.path-continue:hover { filter: brightness(1.08); }
.path-done { color: var(--accent); font-weight: 700; }

.path-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.path-step { display: flex; align-items: center; gap: 10px; border: 1px solid var(--border);
  border-radius: 12px; padding: 8px 12px; background: var(--bg); }
.path-step[data-next="true"] { border-color: var(--c); box-shadow: 0 0 0 1px var(--c) inset; }
.path-step[data-done="true"] { opacity: 0.62; }
.path-check { flex: none; width: 22px; height: 22px; border-radius: 6px; border: 1.5px solid var(--border-strong);
  background: none; color: var(--node-studied-text); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.path-check[data-done="true"] { background: var(--accent); border-color: var(--accent); }
.path-num { flex: none; width: 22px; text-align: center; color: var(--text-dim); font-size: 12px; font-variant-numeric: tabular-nums; }
.path-step-label { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px;
  background: none; border: none; color: var(--text); cursor: pointer; font-size: 14px; padding: 2px 0; text-align: left; }
.path-step-label:hover .path-step-name { color: var(--c); }
.path-step-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.path-step-domain { flex: none; font-size: 11px; color: var(--text-dim); border: 1px solid var(--border);
  border-radius: 999px; padding: 1px 8px; }

@media (max-width: 768px) {
  .path { padding-top: calc(72px + env(safe-area-inset-top)); }
  .path-tracks { width: 100vw; }
  .path-main { display: none; }
  .path[data-detail="true"] .path-tracks { display: none; }
  .path[data-detail="true"] .path-main { display: block; }
  .path-back { display: flex; align-items: center; gap: 4px; background: var(--bg-elev); border: none;
    border-bottom: 1px solid var(--border); color: var(--text); font-size: 14px; font-weight: 600;
    padding: 12px 16px; margin: -22px -26px 16px; cursor: pointer; width: calc(100% + 52px); }
}
```

- [ ] **Step 3: Wire `App.tsx`** — import, hook, branch:

Add import after the QuizView import:
```tsx
import { PathView } from './components/PathView'
```
Add the progress hook near the other hooks:
```tsx
import { useThemeEffect, useViewModeEffect, useProgressEffect } from './hooks/useTheme'
```
and inside `App()` body with the others:
```tsx
  useProgressEffect()
```
Add a render branch after the quiz branch and update the SearchBar guard:
```tsx
      {viewMode === 'quiz' && <QuizView nodes={data.nodes} />}
      {viewMode === 'path' && <PathView nodes={data.nodes} edges={data.edges} nodesById={nodesById} />}
      {(viewMode === 'graph' || viewMode === 'list') && <SearchBar nodes={data.nodes} />}
```
(Replace the old `{viewMode !== 'quiz' && <SearchBar .../>}` line.)

- [ ] **Step 4: Typecheck + full tests**

Run: `cd interview-map && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/components/PathView.tsx interview-map/src/components/PathView.css interview-map/src/App.tsx
git commit -m "feat: PathView study-path view (courses, checklist, progress, note links)"
```

---

## Final verification (verify skill — real browser)

- `npm run dev`, Playwright:
  1. 경로 tab → 추천 코스 (3) + 도메인별 코스 (11) listed; select "신입 백엔드 필수" → 15 ordered steps render.
  2. Check a step → progress bar + `done/total` (list + track row) update; "다음: X" moves.
  3. Reload → checked steps persist.
  4. Click a step label / "이어서: X" → 목록 view opens that concept's note.
- Screenshot each. Then run `superpowers:finishing-a-development-branch`.
```
