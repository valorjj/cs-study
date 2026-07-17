# Study Path Recommendation — Design Spec

**Date:** 2026-07-18
**Status:** Approved (pending user review of this doc)

## Problem / Goal

Recommend an **order** to study the CS concepts for interview prep. The graph
has no prerequisite/progress data (edges are hierarchy + crosslink; `status` is
unused), so ordering must come from a new source. Provide curated goal-oriented
courses plus an auto per-domain path, in a new **"경로" (path) view tab**, with
per-concept progress the user can check off.

## Decisions (from brainstorming)

1. **Hybrid ordering:** a few hand-curated courses (ordered node-id lists) +
   one auto-generated course per domain (tree order). No prerequisite-edge
   authoring.
2. **Placement:** a 4th ViewToggle tab "경로" (지도/목록/퀴즈/경로).
3. **Progress:** user checks off concepts; persisted in localStorage. Does not
   modify `node.status` (that's static graph data).

## Data model

```ts
// src/lib/tracks.ts
export interface Track {
  id: string          // "curated:junior-backend" | "domain:network"
  title: string
  description: string
  icon: string        // emoji
  steps: string[]     // ordered node ids
}
```

### Curated courses — `src/graph/tracks.ts` (verified node ids)

- `curated:junior-backend` — 🎯 신입 백엔드 필수 (15):
  `dsa-bigo, dsa-hash, jvm, jvm-gc, collections, os-process, os-scheduling,
  concurrency, net-osi, net-tcp, net-http, db-index, db-tx, spring-ioc, spring-tx`
- `curated:crash-7` — ⚡ 면접 D-7 벼락치기 (10):
  `jvm-gc, collections, os-process, concurrency, net-tcp, net-http, db-index,
  db-tx, spring-ioc, spring-aop`
- `curated:java-deep` — 🧩 자바 백엔드 심화 (15):
  `jvm-memory, jvm-gc, jvm-jit, concurrency, collections, spring-ioc,
  spring-bean, spring-aop, spring-proxy, spring-tx, spring-tx-propagation,
  db-tx, db-isolation, db-mvcc, db-btree`

### Domain courses — generated at runtime

`buildDomainTracks(nodes, edges)` → one `Track` per L0 domain, id
`domain:<domainId>`, `steps` = DFS of that domain's subtree (L1 in graph order,
each followed by its L2 children), excluding the L0 node itself.

## Pure functions — `src/lib/tracks.ts`

```ts
export function buildDomainTracks(nodes: GraphNode[], edges: GraphEdge[]): Track[]

// Completed vs total for a track given the studied set.
export function trackProgress(track: Track, studied: Set<string>): { done: number; total: number }

// Index of the first step not yet studied; -1 when the whole track is done.
export function nextStepIndex(track: Track, studied: Set<string>): number
```

## Progress state

### `src/store/graphStore.ts`
- Add `studiedIds: string[]`, `toggleStudied(id: string)`, `isStudied` derived
  in components via `studiedIds.includes` (or a Set built in the component).
  Kept as an array for simple persistence.

### `src/hooks/useTheme.ts`
- Add `useProgressEffect()` (mirrors theme/viewMode persistence): hydrate
  `studiedIds` from `localStorage["interview-map.progress.v1"]` on mount; persist
  on change. Wire it in `App`.
- `useViewModeEffect` hydrate guard already accepts `'quiz'`; add `'path'`.

### `ViewMode`
- `'graph' | 'list' | 'quiz' | 'path'`.

## Components

### `src/components/ViewToggle.tsx`
- Add a 4th tab "경로" (icon e.g. `LuRoute`).

### `src/components/PathView.tsx` (new)
- Props: `nodes: GraphNode[]`, `edges: GraphEdge[]`, `nodesById`.
- `tracks = [...CURATED_TRACKS, ...buildDomainTracks(nodes, edges)]` (memo).
- Selected track state (default first curated). `studied` Set from store.
- Two-column layout (like DocsView, mobile collapses via `data-selected`):
  - **Left**: track list, grouped "추천 코스" / "도메인별 코스"; each row shows title
    + `done/total`.
  - **Right**: header (title, description, progress bar `done/total`, "다음: <label>"
    or "완료 🎉", an "이어서 학습 →" button that opens the next step's note); then
    an ordered step list. Each step row: checkbox (toggleStudied), index, icon,
    label, domain badge; clicking the label runs `select(id); setViewMode('list')`.
    The next-up step is visually highlighted.

### `src/App.tsx`
- `viewMode === 'path'` → `<PathView nodes={data.nodes} edges={data.edges} nodesById={nodesById} />`.
- Keep `SearchBar` hidden for `quiz` and `path` (`viewMode === 'graph' || viewMode === 'list'`).
- Call `useProgressEffect()` alongside the other hydrate hooks.

### `src/components/PathView.css` (new)
- Two-column path layout, track rows, progress bar, step rows (checkbox +
  highlight for next-up), reusing theme vars and existing conventions.

## Component boundaries

- `tracks.ts` is pure (nodes/edges/sets → tracks/among numbers), unit-tested.
- Curated data (`graph/tracks.ts`) is static and validated by a test against
  `graph.json` (every step id exists; no L0 ids in curated steps).
- `PathView` owns selection + rendering + navigation; progress lives in the
  store + a persistence hook.

## Testing

- **Unit** (`tracks.test.ts`):
  - `buildDomainTracks`: one track per domain; steps are that domain's L1+L2 in
    tree order; excludes the L0 id; ids all belong to the domain.
  - `trackProgress`: counts studied ∩ steps vs steps.length.
  - `nextStepIndex`: first unstudied index; -1 when all studied; 0 when none.
  - **Curated validity**: every `CURATED_TRACKS` step id exists in `graph.json`
    and is not a level-0 node.
- **Runtime (verify skill, real browser):**
  - 경로 tab → curated + domain tracks listed; select one → ordered steps render.
  - Check a step → progress bar + `done/total` update; reload → persists.
  - "이어서 학습 →" / clicking a step label → list view with that concept's note.
  - "다음: X" points at the first unchecked step.

## Out of scope

- Prerequisite-edge authoring / topological sort.
- Syncing progress with `node.status` or across devices.
- Path highlight drawn on the graph canvas (chosen against in brainstorming).
- Spaced repetition / scheduling.
```
