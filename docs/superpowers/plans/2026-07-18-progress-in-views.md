# Reflect Progress in Map & List Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ✓ badge on completed concept nodes and `done/total` on domains, in both the graph and tree views, driven by `studiedIds`.

**Architecture:** Pure `domainProgress(nodes, studied)` in `tracks.ts`. GraphCanvas injects `studied`/`progress` into node data; ConceptNode/DomainNode render badges. TreeSidebar threads `studied`/`domainProg` into rows. Completion color = `--accent`.

## Global Constraints
- Korean explanations + English code. Completion color `--accent` / `--node-studied-text` (matches PathView). Public repo commit rules.

---

### Task 1: `domainProgress` helper

**Files:** Modify `interview-map/src/lib/tracks.ts`; Test `interview-map/src/lib/tracks.test.ts`.

**Interfaces:** Produces `domainProgress(nodes: GraphNode[], studied: Set<string>): Map<string, { done: number; total: number }>`.

- [ ] **Step 1: Failing test** — append to `tracks.test.ts`:

```ts
import { domainProgress } from './tracks'

describe('domainProgress', () => {
  const ns: GraphNode[] = [
    N('java', 0, 'java'), N('jvm', 1, 'java'), N('jvm-gc', 2, 'java'), N('collections', 1, 'java'),
    N('os', 0, 'os'), N('os-proc', 1, 'os'),
  ]
  it('counts studied L1/L2 per domain, ignoring L0', () => {
    const m = domainProgress(ns, new Set(['jvm', 'jvm-gc']))
    expect(m.get('java')).toEqual({ done: 2, total: 3 })
    expect(m.get('os')).toEqual({ done: 0, total: 1 })
  })
})
```

- [ ] **Step 2: Run — expect fail.** `cd interview-map && npx vitest run src/lib/tracks.test.ts`

- [ ] **Step 3: Implement** — append to `tracks.ts`:

```ts
// Completed vs total concept nodes (level 1|2) per domain id.
export function domainProgress(
  nodes: GraphNode[], studied: Set<string>,
): Map<string, { done: number; total: number }> {
  const m = new Map<string, { done: number; total: number }>()
  for (const n of nodes) {
    if (n.level === 0) continue
    const e = m.get(n.domain) ?? { done: 0, total: 0 }
    e.total++
    if (studied.has(n.id)) e.done++
    m.set(n.domain, e)
  }
  return m
}
```

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat: domainProgress helper (studied count per domain)"`

---

### Task 2: Map view badges

**Files:** Modify `GraphCanvas.tsx`, `ConceptNode.tsx`, `DomainNode.tsx`, `nodes.css`.

- [ ] **Step 1: GraphCanvas** — read progress and inject into node data.

Add near the other store reads in `Inner`:
```tsx
  const studiedIds = useGraphStore((s) => s.studiedIds)
  const studied = useMemo(() => new Set(studiedIds), [studiedIds])
  const domainProg = useMemo(() => domainProgress(allNodesList, studied), [allNodesList, studied])
```
Import it:
```tsx
import { domainProgress } from '../lib/tracks'
```
In the `visibleNodes` `.map(...)`, extend `data` and add `studied`/`domainProg` to the memo deps:
```tsx
      .map((n) => {
        const node = (n.data as { node: GraphNode }).node
        return {
          ...n,
          data: {
            ...n.data,
            hasChildren: parentSet.has(n.id),
            expanded: n.id === activeParent,
            studied: node.level !== 0 && studied.has(n.id),
            progress: node.level === 0 ? domainProg.get(node.domain) : undefined,
          },
          style: { ...(n.style ?? {}), opacity: isActive && !focused.has(n.id) ? 0.15 : 1 },
        }
      })
  }, [nodes, levelKey, isActive, focused, l2Visible, parentSet, activeParent, studied, domainProg])
```

- [ ] **Step 2: ConceptNode** — badge. Update the data cast and render:

```tsx
  const d = data as { node: GraphNode; hasChildren?: boolean; expanded?: boolean; studied?: boolean }
```
Add just after the opening `<div className="km-node km-concept" ...>` handle, before `.km-icon` (or anywhere inside the node):
```tsx
      {d.studied && <span className="km-check" aria-label="완료">✓</span>}
```

- [ ] **Step 3: DomainNode** — count. Update cast and render:

```tsx
export function DomainNode({ data }: NodeProps) {
  const d = data as { node: GraphNode; progress?: { done: number; total: number } }
  const node = d.node
  const color = domainColor(node.domain)
  ...
      {d.progress && d.progress.done > 0 && (
        <span className="km-progress">{d.progress.done}/{d.progress.total}</span>
      )}
```
(place the pill inside the `.km-node.km-domain` div, after the label)

- [ ] **Step 4: nodes.css** — add badge styles + relative positioning:

```css
.km-node { position: relative; }
.km-check { position: absolute; top: -7px; right: -7px; width: 18px; height: 18px;
  border-radius: 50%; background: var(--accent); color: var(--node-studied-text);
  font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.35); }
.km-progress { margin-top: 4px; font-size: 11px; font-weight: 700; color: var(--node-studied-text);
  background: color-mix(in srgb, var(--accent) 88%, transparent); border-radius: 999px; padding: 1px 8px; }
```

- [ ] **Step 5: Typecheck** — `cd interview-map && npx tsc --noEmit`

- [ ] **Step 6: Commit** — `git commit -m "feat: completion badge on graph nodes + domain progress count"`

---

### Task 3: List view badges

**Files:** Modify `TreeSidebar.tsx`, `TreeSidebar.css`.

- [ ] **Step 1: TreeSidebar** — compute progress and thread to `Row`.

In `TreeSidebar`, add (needs `nodes`; derive from the tree or accept nodes — the tree already holds every node, so flatten it):
```tsx
  const studiedIds = useGraphStore((s) => s.studiedIds)
  const studied = useMemo(() => new Set(studiedIds), [studiedIds])
  const domainProg = useMemo(() => {
    const all: GraphNode[] = []
    const walk = (t: TreeNode) => { all.push(t.node); t.children.forEach(walk) }
    tree.forEach(walk)
    return domainProgress(all, studied)
  }, [tree, studied])
```
Imports:
```tsx
import { useMemo } from 'react'   // add to existing react import
import { domainProgress } from '../lib/tracks'
import type { GraphNode } from '../graph/types'   // extend existing type import
```
Pass to each root `Row`: `studied={studied} domainProg={domainProg}`, and forward through the recursive `Row` children too.

Update `Row` signature and body:
```tsx
function Row({ item, depth, expanded, toggle, rowRef, studied, domainProg }: {
  item: TreeNode
  depth: number
  expanded: Set<string>
  toggle: (id: string) => void
  rowRef: (id: string, el: HTMLButtonElement | null) => void
  studied: Set<string>
  domainProg: Map<string, { done: number; total: number }>
}) {
  ...
  const isDone = studied.has(node.id)
  const prog = depth === 0 ? domainProg.get(node.domain) : undefined
  ...
```
Inside the `<button className="tsb-row" ...>`, after `.tsb-label`:
```tsx
        {prog && prog.done > 0 && <span className="tsb-count">{prog.done}/{prog.total}</span>}
        {isDone && <span className="tsb-check" aria-label="완료">✓</span>}
```
And in the recursive children map, forward the new props:
```tsx
        <Row key={c.node.id} item={c} depth={depth + 1} expanded={expanded} toggle={toggle} rowRef={rowRef} studied={studied} domainProg={domainProg} />
```

- [ ] **Step 2: TreeSidebar.css** — badges:

```css
.tsb-check { margin-left: auto; flex: none; width: 17px; height: 17px; border-radius: 50%;
  background: var(--accent); color: var(--node-studied-text); font-size: 10px; font-weight: 800;
  display: flex; align-items: center; justify-content: center; }
.tsb-count { margin-left: auto; flex: none; font-size: 11px; color: var(--text-dim);
  font-variant-numeric: tabular-nums; }
/* when both count and check exist on a domain row, count keeps margin-left:auto, check sits after */
.tsb-count + .tsb-check { margin-left: 8px; }
```
(If `.tsb-label` currently has `flex: 1`, keep it so the badges push right. If not, verify layout after the change.)

- [ ] **Step 3: Typecheck + full tests** — `cd interview-map && npx tsc --noEmit && npx vitest run`

- [ ] **Step 4: Commit** — `git commit -m "feat: completion badge + domain count in tree sidebar"`

---

## Final verification (verify skill — real browser)
- `npm run dev`, Playwright: in 경로 check a few concepts → switch to 지도 (some nodes ✓, domain nodes n/m) and 목록 (tree rows ✓, domain rows n/m); uncheck one → updates. Screenshot each. Then `superpowers:finishing-a-development-branch`.
