# L2 클릭 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지식 그래프 캔버스에서 L2 세부 개념 노드를 zoom으로 전부 노출하는 대신, 부모 L1 노드를 클릭하면 그 자식 L2만 펼치고 다시 클릭하면 접는 토글 상호작용으로 전환한다.

**Architecture:** 새 전역 상태 없이 기존 `selectedId`(zustand)를 재사용한다. 순수 함수 `visibleL2Ids`가 "현재 보여야 할 L2 id 집합"을 파생하고, `GraphCanvas`의 `visibleNodes` 필터가 이를 사용한다. `useSemanticZoom`은 L2 자동 노출을 제거한다. 노드 위치는 로드 시 dagre로 이미 고정되어 재레이아웃이 없다.

**Tech Stack:** React, @xyflow/react, zustand, Vitest.

## Global Constraints

- 테스트 러너: `npx vitest run <path>` (watch 아님).
- 순수 로직은 `src/lib/`에 두고 plain 객체로 단위 테스트한다(React/flow 의존 금지).
- 기존 파일 패턴 유지: 순수 함수 파일 + 동일 폴더 `*.test.ts`.
- 타입: `GraphNode.level`은 `0 | 1 | 2`, 엣지 `type`은 `'hierarchy' | 'crosslink'`.

---

### Task 1: `visibleL2Ids` 순수 함수

선택된 노드로부터 화면에 보여야 할 L2 노드 id 집합을 계산하는 순수 함수.

**Files:**
- Create: `interview-map/src/lib/expansion.ts`
- Test: `interview-map/src/lib/expansion.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function visibleL2Ids(
    selectedId: string | null,
    nodes: ReadonlyArray<{ id: string; level: 0 | 1 | 2 }>,
    hierarchyEdges: ReadonlyArray<{ source: string; target: string }>,
  ): Set<string>
  ```
  규칙: 반환 집합은 (a) `selectedId`가 L1이면 그 L1의 L2 자식들, (b) `selectedId`가 L2이면 자기 자신 + 같은 부모의 형제 L2들, (c) 그 외(null·L0·무관)면 빈 집합.

- [ ] **Step 1: 실패하는 테스트 작성**

`interview-map/src/lib/expansion.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { visibleL2Ids } from './expansion'

const nodes = [
  { id: 'dsa', level: 0 as const },
  { id: 'dsa-tree', level: 1 as const },
  { id: 'dsa-sort', level: 1 as const },
  { id: 'dsa-bigo', level: 1 as const }, // L2 자식 없음
  { id: 'dsa-bst', level: 2 as const },
  { id: 'dsa-heap', level: 2 as const },
  { id: 'dsa-compare-sort', level: 2 as const },
]
const edges = [
  { source: 'dsa', target: 'dsa-tree' },
  { source: 'dsa', target: 'dsa-sort' },
  { source: 'dsa', target: 'dsa-bigo' },
  { source: 'dsa-tree', target: 'dsa-bst' },
  { source: 'dsa-tree', target: 'dsa-heap' },
  { source: 'dsa-sort', target: 'dsa-compare-sort' },
]

describe('visibleL2Ids', () => {
  it('선택이 null이면 빈 집합', () => {
    expect(visibleL2Ids(null, nodes, edges)).toEqual(new Set())
  })
  it('L1 선택 시 그 자식 L2들만', () => {
    expect(visibleL2Ids('dsa-tree', nodes, edges)).toEqual(new Set(['dsa-bst', 'dsa-heap']))
  })
  it('자식 없는 L1 선택 시 빈 집합', () => {
    expect(visibleL2Ids('dsa-bigo', nodes, edges)).toEqual(new Set())
  })
  it('L2 선택 시 자기 자신 + 형제 L2', () => {
    expect(visibleL2Ids('dsa-bst', nodes, edges)).toEqual(new Set(['dsa-bst', 'dsa-heap']))
  })
  it('다른 그룹의 L2는 포함하지 않음', () => {
    expect(visibleL2Ids('dsa-compare-sort', nodes, edges)).toEqual(new Set(['dsa-compare-sort']))
  })
  it('L0(도메인) 선택 시 빈 집합', () => {
    expect(visibleL2Ids('dsa', nodes, edges)).toEqual(new Set())
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd interview-map && npx vitest run src/lib/expansion.test.ts`
Expected: FAIL — `visibleL2Ids` 모듈/함수 없음.

- [ ] **Step 3: 최소 구현**

`interview-map/src/lib/expansion.ts`:
```ts
export function visibleL2Ids(
  selectedId: string | null,
  nodes: ReadonlyArray<{ id: string; level: 0 | 1 | 2 }>,
  hierarchyEdges: ReadonlyArray<{ source: string; target: string }>,
): Set<string> {
  const empty = new Set<string>()
  if (!selectedId) return empty

  const levelById = new Map(nodes.map((n) => [n.id, n.level]))
  const parentOf = new Map<string, string>()
  for (const e of hierarchyEdges) parentOf.set(e.target, e.source)

  const selectedLevel = levelById.get(selectedId)
  let activeParent: string | undefined
  if (selectedLevel === 1) activeParent = selectedId
  else if (selectedLevel === 2) activeParent = parentOf.get(selectedId)
  if (!activeParent) return empty

  const result = new Set<string>()
  for (const n of nodes) {
    if (n.level === 2 && parentOf.get(n.id) === activeParent) result.add(n.id)
  }
  return result
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd interview-map && npx vitest run src/lib/expansion.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add interview-map/src/lib/expansion.ts interview-map/src/lib/expansion.test.ts
git commit -m "feat(graph): visibleL2Ids pure fn for selection-driven L2 expansion"
```

---

### Task 2: semantic-zoom에서 L2 자동 노출 제거

`visibleLevels`가 어떤 zoom에서도 `2`를 반환하지 않도록 변경.

**Files:**
- Modify: `interview-map/src/hooks/useSemanticZoom.ts`
- Test: `interview-map/src/hooks/useSemanticZoom.test.ts`

**Interfaces:**
- Produces: `visibleLevels(zoom: number): Array<0 | 1>` — `zoom < 0.6` → `[0]`, 그 외 → `[0, 1]`.

- [ ] **Step 1: 테스트 수정(실패 상태로)**

`interview-map/src/hooks/useSemanticZoom.test.ts` 전체를 아래로 교체:
```ts
import { describe, it, expect } from 'vitest'
import { visibleLevels } from './useSemanticZoom'

describe('visibleLevels', () => {
  it('shows only domains when zoomed far out', () => {
    expect(visibleLevels(0.4)).toEqual([0])
  })
  it('shows domains + major at mid zoom', () => {
    expect(visibleLevels(0.8)).toEqual([0, 1])
  })
  it('does NOT auto-reveal L2 even when zoomed in', () => {
    expect(visibleLevels(1.5)).toEqual([0, 1])
  })
  it('boundary at 0.6 shows major', () => {
    expect(visibleLevels(0.6)).toEqual([0, 1])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd interview-map && npx vitest run src/hooks/useSemanticZoom.test.ts`
Expected: FAIL — 현재 구현이 `zoom ≥ 1.1`에서 `[0,1,2]` 반환.

- [ ] **Step 3: 구현 변경**

`interview-map/src/hooks/useSemanticZoom.ts` 전체를 아래로 교체:
```ts
export function visibleLevels(zoom: number): Array<0 | 1> {
  if (zoom < 0.6) return [0]
  return [0, 1]
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd interview-map && npx vitest run src/hooks/useSemanticZoom.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add interview-map/src/hooks/useSemanticZoom.ts interview-map/src/hooks/useSemanticZoom.test.ts
git commit -m "feat(graph): stop auto-revealing L2 nodes by zoom level"
```

---

### Task 3: GraphCanvas 통합 (L2 필터 + 클릭 토글)

`visibleNodes`가 L2를 `visibleL2Ids`로 판정하고, `onNodeClick`이 이미 선택된 L1 재클릭 시 접히도록 토글.

**Files:**
- Modify: `interview-map/src/components/GraphCanvas.tsx`

**Interfaces:**
- Consumes: `visibleL2Ids` (Task 1), `visibleLevels` (Task 2, 이제 `Array<0|1>`), 기존 `useGraphStore.selectedId`/`select`, flow edges의 `data.type`, flow nodes의 `data.node` (`GraphNode`).

- [ ] **Step 1: hierarchyEdges + l2Visible 파생 추가**

`GraphCanvas.tsx` 상단 import에 추가:
```ts
import { visibleL2Ids } from '../lib/expansion'
```
`Inner` 컴포넌트에서 `visibleNodes` useMemo **앞에** 아래를 추가:
```ts
  const hierarchyEdges = useMemo(
    () => edges
      .filter((e) => (e.data as { type?: string } | undefined)?.type === 'hierarchy')
      .map((e) => ({ source: e.source, target: e.target })),
    [edges])
  const l2Visible = useMemo(
    () => visibleL2Ids(selectedId, [...nodesById.values()], hierarchyEdges),
    [selectedId, nodesById, hierarchyEdges])
```
(`nodesById`는 이미 `Inner`에 존재: `Map<string, GraphNode>`.)

- [ ] **Step 2: visibleNodes 필터를 L2 인지형으로 교체**

기존 `visibleNodes` useMemo의 `.filter(...)` 부분을 아래로 교체(나머지 `.map(...)` opacity 로직은 유지):
```ts
  const visibleNodes = useMemo(() => {
    const lv = levelKey.split(',').map(Number)
    return nodes
      .filter((n) => {
        const node = (n.data as { node: GraphNode }).node
        if (node.level === 2) return l2Visible.has(n.id)
        return lv.includes(node.level)
      })
      .map((n) => ({
        ...n,
        style: { ...(n.style ?? {}), opacity: isActive && !focused.has(n.id) ? 0.15 : 1 },
      }))
  }, [nodes, levelKey, isActive, focused, l2Visible])
```

- [ ] **Step 3: onNodeClick 토글로 교체**

기존:
```ts
  const onNodeClick: NodeMouseHandler = (_, node) => { select(node.id); setMenu(null) }
```
교체:
```ts
  const onNodeClick: NodeMouseHandler = (_, node) => {
    const n = nodesById.get(node.id)
    if (selectedId === node.id && n?.level === 1) select(null)
    else select(node.id)
    setMenu(null)
  }
```

- [ ] **Step 4: 타입체크 + 전체 테스트 + 빌드**

Run: `cd interview-map && npx vitest run && npx tsc --noEmit`
Expected: 전체 테스트 PASS, 타입 에러 없음.

- [ ] **Step 5: 수동 검증 (dev 서버)**

Run: `cd interview-map && npm run dev`
확인:
1. 기본 상태: 어느 zoom에서도 L2(예: BST·균형트리, 힙)가 안 보임.
2. `Tree & BST`(L1) 클릭 → 그 아래 `BST·균형트리`, `힙` L2 아이콘이 나타나고 노트 패널이 열림.
3. `Tree & BST` 다시 클릭 → L2 접힘 + 선택 해제.
4. 빈 공간(pane) 클릭 → 전체 접힘.
5. 검색으로 L2(예: "힙") 선택 → 해당 L2 그룹이 화면에 나타남.

- [ ] **Step 6: 커밋**

```bash
git add interview-map/src/components/GraphCanvas.tsx
git commit -m "feat(graph): click L1 to toggle-expand its L2 children"
```

---

## Self-Review

- **Spec coverage:** §2 zoom 변경→Task 2. §3 파생 규칙→Task 1. §4 GraphCanvas 필터→Task 3 Step 2. §5 토글→Task 3 Step 3. §6 검색 연동→`requestFocus`가 `selectedId`를 세팅하므로 Task 1 규칙(b)로 자동 커버(Task 3 Step 5.5에서 수동 검증). §7 엣지케이스(자식 없는 L1)→Task 1 테스트로 커버. 테스트 항목 모두 매핑됨.
- **Placeholder scan:** 플레이스홀더 없음. 모든 코드 단계에 실제 코드 포함.
- **Type consistency:** `visibleL2Ids` 시그니처가 Task 1 정의와 Task 3 호출부 일치. `visibleLevels` 반환 타입 `Array<0|1>`로 Task 2에서 축소, Task 3의 `lv.includes(node.level)`는 여전히 number 비교라 호환.
