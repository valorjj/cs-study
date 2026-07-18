# Reflect Progress in Map & List Views — Design Spec

**Date:** 2026-07-18
**Status:** Approved (pending user review)

## Goal

Show study-path progress (`studiedIds`) in the map (graph) and list (tree)
views: a ✓ badge on completed concept nodes, and a `done/total` count on each
domain (so progress is visible even at the default zoom, where only domains show).

## Decisions (from brainstorming)

- **✓ badge** on completed L1/L2 nodes; no dimming (keep them sharp).
- **Domain `n/m`** count of completed descendants on domain nodes/rows; shown
  only when `done > 0` (avoid `0/12` noise everywhere).
- **Color** = `--accent` / `--node-studied-text` (same as PathView checkboxes),
  so the "done" signal is theme-consistent app-wide.

## Data

`studiedIds` already lives in the store (persisted). Progress is not stored on
nodes; it is derived.

### Pure helper — `src/lib/tracks.ts`

```ts
// Completed vs total concept nodes (level 1|2) per domain id.
export function domainProgress(
  nodes: GraphNode[], studied: Set<string>,
): Map<string, { done: number; total: number }>
```

Groups by `node.domain`, ignoring level-0 nodes.

## Map view

### `src/components/GraphCanvas.tsx`
- Read `studiedIds` → `studied` Set; `domainProgress(allNodesList, studied)` (memo).
- In the `visibleNodes` data injection, add:
  - level 0: `progress: domainProg.get(node.domain)`
  - level 1|2: `studied: studied.has(n.id)`

### `src/components/ConceptNode.tsx`
- Read `d.studied`; when true, render a `.km-check` badge (✓).

### `src/components/DomainNode.tsx`
- Read `d.progress`; when `done > 0`, render a `.km-progress` pill `done/total`.

### `src/components/nodes.css`
- `.km-node { position: relative }` so badges can anchor.
- `.km-check`: small accent circle with ✓, top-right corner.
- `.km-progress`: small pill (done/total) on domain nodes.

## List view

### `src/components/TreeSidebar.tsx`
- Compute `studied` Set + `domainProgress` once; thread `studied` and
  `domainProg` into `Row`.
- `Row`: when `studied.has(node.id)` → show `.tsb-check` (✓). When
  `node.level === 0` and its progress `done > 0` → show `.tsb-count` (done/total).

### `src/components/TreeSidebar.css`
- `.tsb-check` (accent ✓, right-aligned), `.tsb-count` (dim count).

## Testing

- **Unit** (`tracks.test.ts`): `domainProgress` — counts studied among a
  domain's L1/L2 nodes; excludes L0; domains with no studied → `done: 0`.
- **Runtime (verify skill, browser):**
  - In 경로, check a few concepts (e.g. junior-backend first steps).
  - Map: those concept nodes show ✓; their domain nodes show `n/m` at default zoom.
  - List: same nodes show ✓ in the tree; domain rows show `n/m`.
  - Uncheck one → badge/count update live.

## Out of scope

- Replacing the static `node.status` field (separate cleanup).
- Per-node manual "mark studied" outside the path view (toggle stays in 경로).
- Aggregate rings/percent visuals (a plain count is enough).
```
