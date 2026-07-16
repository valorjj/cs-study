# L2 서브노드 클릭 확장 (Selection-driven L2 expansion)

- 날짜: 2026-07-16
- 대상 앱: `interview-map/` (Vite + React + @xyflow/react)
- 상태: 승인됨 (설계)

## 배경 / 문제

지식 그래프 캔버스는 semantic-zoom으로 노드를 레벨별로 노출한다.

```
현재 useSemanticZoom.visibleLevels(zoom):
  zoom < 0.6  → [0]         (도메인 중심만)
  zoom < 1.1  → [0, 1]      (도메인 + 대분류)
  zoom ≥ 1.1  → [0, 1, 2]   (+ L2 세부 개념 전부)
```

L2 세부 개념 노드(예: `dsa-bst` BST·균형트리, `dsa-heap` 힙, `dsa-compare-sort` 비교 정렬)는
이미 그래프 데이터(`graph.json`)에 아이콘·계층 엣지·noteRef까지 완비되어 있고, dagre 레이아웃으로
부모 아래 슬롯에 위치까지 계산된다. 그러나 **zoom ≥ 1.1에서 모든 L2가 한꺼번에** 나타나
화면이 붐비고, 특정 부모의 하위 개념만 골라 보는 흐름이 없다.

## 목표

- L2 노드는 기본적으로 **모든 zoom 레벨에서 숨김**.
- 부모 L1 노드를 **클릭하면 그 부모의 L2 자식만 펼쳐지고**, 다시 클릭하면 접힌다(토글).
- 새 전역 상태 도입 없이 기존 `selectedId` 인프라에 얹는다(접근법 A, 선택 기반 확장).

## 비목표 (YAGNI)

- 여러 L1 그룹을 동시에 펼치기(다중 확장) — 채택 안 함. 한 번에 한 그룹.
- 호버 미리보기 — 채택 안 함(클릭 토글만).
- 확장/축소 애니메이션, 재레이아웃 — 위치는 이미 고정이라 불필요.

## 설계

### 1. 상태 모델
새 상태 없음. 기존 zustand store의 `selectedId: string | null` 하나로 "어떤 L2가 보이는가"를 파생한다.
노드 위치는 로드 시 `layoutNodes`(dagre)로 이미 계산되어 고정 → 확장은 **순수 가시성 토글**이며 재레이아웃이 없다.

### 2. semantic-zoom 변경 (`src/hooks/useSemanticZoom.ts`)
`visibleLevels`에서 L2 자동 노출을 제거한다.

```
변경 후:
  zoom < 0.6  → [0]
  zoom ≥ 0.6  → [0, 1]
```
L2는 더 이상 zoom으로 노출되지 않는다. (테스트 동반 수정)

### 3. L2 가시성 파생 규칙 (순수 함수로 분리)
`src/lib`에 순수 함수 `visibleL2Ids(selectedId, nodes, edges): Set<string>`를 추가해 단위 테스트 가능하게 한다.
반환값은 "지금 보여야 할 L2 노드 id 집합"이며, GraphCanvas는 L2 노드를 이 집합 포함 여부로 필터한다.

입력: `selectedId`, 노드 목록(id·level 포함), hierarchy 엣지(부모 관계 유도용). 규칙:

- L0, L1 노드: §2의 zoom 규칙을 따름(이 함수의 관심사 아님).
- **L2 노드는 다음 중 하나일 때만 visible**:
  1. `selectedId`가 이 L2의 **부모 L1**과 같다. (부모 클릭 → 자식 펼침)
  2. `selectedId`가 이 L2와 **형제(같은 부모의 다른 L2)** 이거나 자기 자신이다. (L2 선택 시 그룹 유지)
- 그 외(`selectedId`가 null이거나 무관한 노드) → 모든 L2 숨김.

부모 관계는 hierarchy 엣지에서 유도한다(기존 `buildAdjacency`/layout이 쓰는 것과 동일 소스).

### 4. GraphCanvas 통합 (`src/components/GraphCanvas.tsx`)
- `visibleNodes` 필터를 변경: L0/L1은 기존 `visibleLevels(zoom)` 유지, **L2는 §3 규칙으로 판정**.
- `visibleEdges`는 이미 "양 끝 노드가 모두 보일 때만" 표시하므로 수정 불필요 — L1→L2 hierarchy 엣지는 L2가 펼쳐질 때만 자동으로 그려진다.
- 기존 `computeFocus(selectedId)` 하이라이트/dim 로직 유지: 부모 클릭 시 서브트리 하이라이트 + 노트 패널 열림 + L2 펼침이 한 번에 일어난다.

### 5. 토글 동작 (`onNodeClick`)
현재:
```ts
const onNodeClick = (_, node) => { select(node.id); setMenu(null) }
```
변경: 클릭한 노드가 **이미 선택된 L1이면** `select(null)`(접힘), 아니면 `select(node.id)`.

```ts
const onNodeClick = (_, node) => {
  const n = nodesById.get(node.id)
  if (selectedId === node.id && n?.level === 1) select(null)
  else select(node.id)
  setMenu(null)
}
```
- Pane 클릭: 기존 `select(null)` 유지 → 전체 접힘.

### 6. 검색 / 사이드바 연동
`store.requestFocus(id)`는 이미 `selectedId: id`를 함께 설정한다(`requestFocus: (id) => set({ focusRequestId: id, selectedId: id })`).
따라서 검색으로 **L2 노드를 선택하면** §3 규칙(선택된 L2 → 자기 자신/형제 표시)에 의해 그 L2 그룹이 자동으로 화면에 나타난다. **추가 보정 불필요.**
`TreeSidebar`의 `select(node.id)`도 동일하게 동작한다.

### 7. 엣지 케이스
- 자식이 없는 L1(예: `dsa-bigo`, `dsa-array`, `dsa-hash`) 클릭 → 펼칠 L2 없음, 노트만 열림. 정상.
- 모바일/터치: 탭 = 클릭이므로 동일 동작. 별도 처리 없음.
- `selectedId`가 L0(도메인)인 경우 → L2는 모두 숨김(도메인은 L1 자식만 하이라이트).

## 테스트

- `src/hooks/useSemanticZoom.test.ts` 수정: `zoom ≥ 1.1`에서도 `2`가 반환되지 않음을 검증. 경계값(0.6, 1.1) 확인.
- §3 순수 함수 신규 단위 테스트:
  - 선택 = 부모 L1 → 그 자식 L2들 visible, 다른 L2 hidden.
  - 선택 = 특정 L2 → 자기 + 형제 visible, 타 그룹 hidden.
  - 선택 = 무관 L1 / L0 / null → 모든 L2 hidden.
- (선택) GraphCanvas 토글 로직: 같은 L1 재클릭 시 `select(null)` 호출 검증.

## 영향 파일

- `src/hooks/useSemanticZoom.ts` (L2 제거)
- `src/hooks/useSemanticZoom.test.ts` (테스트 수정)
- `src/lib/` 신규 순수 함수 + 테스트
- `src/components/GraphCanvas.tsx` (visibleNodes 필터 + onNodeClick 토글)

## 리스크 / 완화

- L2를 zoom으로 못 보게 되어 "확장 방법을 모르는" 발견성 저하 가능 → L1 클릭이 이미 노트 패널을 여는 자연스러운 진입점이라 위험 낮음. 필요 시 후속으로 부모 노드에 "자식 있음" 시각 힌트(예: chevron/뱃지) 추가 검토(이번 범위 밖).
