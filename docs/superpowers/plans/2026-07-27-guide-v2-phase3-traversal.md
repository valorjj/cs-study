# 설계 가이드 v2 — Phase 3: 개념 사이 순회 흐름 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GuideView "개념 사이 — 그래프 순회" 섹션의 마지막 정적 SVG를 재사용 `FlowPlayer` 흐름(`traversal`)으로 교체하고, 교체로 전부 미사용이 된 가이드 SVG 6개를 삭제한다.

**Architecture:** Phase 1·2에서 만든 데이터 구동 `FlowPlayer`(불변)에 새 흐름 데이터 `traversal.ts` 하나만 추가한다. 순회는 결정 흐름이므로 **현재 개념 → 깊이 신호 → 다음 행선지** 3컬럼으로 매핑(각 신호가 어느 다음 노드로 가는지 갈래를 스텝으로 보여줌).

**Tech Stack:** React 19 + TypeScript(Vite, `verbatimModuleSyntax` ON → 타입 전용 import는 `import type`), Vitest + @testing-library/react(jsdom).

## Global Constraints

- 타입 전용 import는 반드시 `import type { ... }` 사용.
- 타입체크는 `npx tsc -b`(NOT `--noEmit`).
- 흐름 색상은 Phase 1 대비 검증 팔레트에서만 사용: `#0369a1` / `#1d4ed8` / `#6d28d9` / `#b45309`. 새 색 금지.
- 흐름 데이터는 `validateFlow`를 `[]`로 통과.
- 순회 의미는 `src/lib/graphWalk.ts`·`src/lib/ladder.ts` 실제 동작과 일치해야 함: `ladderSignal`(reached ≥4→4 / ≥1→3 / 0→2), `nextNode`(score≥4 자식→crosslink→형제 / ===3 형제→자식 / ≤2 형제→부모), 막다른 길이면 `backtrack`(방문 경로 최근순 미방문 이웃), `isOver`=misses≥2(MISS_BUDGET).
- `FlowPlayer.tsx`/`.css`, `types.ts`, `validate.ts` 불변.
- 커밋 이메일 GitHub noreply(`30681841+valorjj@users.noreply.github.com`), Co-Authored-By 포함.

---

### Task 1: `traversal` 흐름 데이터 + 무결성 테스트

**Files:**
- Create: `interview-map/src/components/flow/flows/traversal.ts`
- Modify: `interview-map/src/components/flow/flows/validate.test.ts`

**Interfaces:**
- Consumes: `Flow` from `../types`; `validateFlow` from `./validate`.
- Produces: `export const traversal: Flow` — GuideView(Task 2)가 import.

- [ ] **Step 1: 흐름 데이터 파일 작성**

Create `interview-map/src/components/flow/flows/traversal.ts`:

```typescript
import type { Flow } from '../types'

// "개념 사이 순회": 한 개념을 끝낸 뒤 도달 깊이(reached)를 신호로 바꿔 다음 개념을 고른다.
// 스테이지 = 결정 3단(현재 개념 → 깊이 신호 → 다음 행선지). graphWalk.nextNode / ladder.ladderSignal 반영.
export const traversal: Flow = {
  stages: [
    { id: 'cur', label: '방금 끝낸 개념', color: '#1d4ed8' },
    { id: 'sig', label: '깊이 신호', color: '#6d28d9' },
    { id: 'nxt', label: '다음 행선지', color: '#b45309' },
  ],
  nodes: [
    { id: 'cur', stage: 'cur', title: '방금 끝낸 개념', subtitle: 'reached = 도달 깊이' },
    { id: 'sig-deep', stage: 'sig', title: '깊이 마스터', subtitle: 'reached ≥ 4' },
    { id: 'sig-ok', stage: 'sig', title: '무난', subtitle: 'reached 1~3' },
    { id: 'sig-stuck', stage: 'sig', title: '입구서 막힘', subtitle: 'reached 0' },
    { id: 'nxt-child', stage: 'nxt', title: '자식 → 더 깊이', subtitle: '없으면 crosslink → 형제' },
    { id: 'nxt-sib', stage: 'nxt', title: '형제 → 옆으로', subtitle: '없으면 자식' },
    { id: 'nxt-parent', stage: 'nxt', title: '부모 → 물러남', subtitle: 'miss + 1' },
    { id: 'nxt-back', stage: 'nxt', title: '백트래킹', subtitle: '미방문 이웃으로' },
  ],
  steps: [
    { title: '1. 개념 하나를 끝냈다', activeNodes: ['cur'], edges: [],
      note: '한 개념(사다리)을 끝내면, 거기서 얼마나 깊이 갔는지(reached)가 다음 행선지를 정한다.' },
    { title: '2. 깊이를 신호로 바꾼다', activeNodes: ['cur', 'sig-deep', 'sig-ok', 'sig-stuck'],
      edges: [{ from: 'cur', to: 'sig-deep' }, { from: 'cur', to: 'sig-ok' }, { from: 'cur', to: 'sig-stuck' }],
      note: 'ladderSignal: reached ≥4 / 1~3 / 0 → 세 갈래.' },
    { title: '3. 깊이 마스터 → 자식으로 더 깊이', activeNodes: ['sig-deep', 'nxt-child'],
      edges: [{ from: 'sig-deep', to: 'nxt-child' }],
      note: 'reached ≥4면 자식 개념으로 한 단계 더 깊이 — 없으면 crosslink, 그다음 형제.' },
    { title: '4. 무난 → 형제로 옆으로', activeNodes: ['sig-ok', 'nxt-sib'],
      edges: [{ from: 'sig-ok', to: 'nxt-sib' }],
      note: 'reached 1~3이면 형제 개념으로 폭을 넓힌다 — 없으면 자식.' },
    { title: '5. 입구서 막힘 → 부모로 물러남', activeNodes: ['sig-stuck', 'nxt-parent'],
      edges: [{ from: 'sig-stuck', to: 'nxt-parent' }],
      note: 'reached 0이면 형제→부모로 물러나고 miss가 하나 쌓인다.' },
    { title: '6. 막다른 길이면 백트래킹', activeNodes: ['cur', 'nxt-back'],
      edges: [{ from: 'cur', to: 'nxt-back' }],
      note: '어느 갈래든 미방문 이웃이 없으면, 방문 경로를 최근순으로 거슬러 올라가 미방문 이웃으로 되돌아간다. 리프에서 조기 종료 방지 = 끝없는 심층 세션의 핵심.' },
    { title: '7. 막힘 2번이면 세션 종료', activeNodes: ['nxt-parent'],
      edges: [],
      note: 'miss가 MISS_BUDGET(2)에 닿으면 isOver — 한 세션이 끝난다.' },
  ],
}
```

- [ ] **Step 2: 무결성 테스트 추가**

Modify `interview-map/src/components/flow/flows/validate.test.ts` — import 추가(기존 `import { depthLadder } from './depthLadder'` 아래):
```typescript
import { traversal } from './traversal'
```

파일 끝에 추가:
```typescript
describe('traversal data', () => {
  it('is internally consistent', () => {
    expect(validateFlow(traversal)).toEqual([])
  })
  it('has the three decision stages and enough steps', () => {
    expect(traversal.stages.map((s) => s.id)).toEqual(['cur', 'sig', 'nxt'])
    expect(traversal.steps.length).toBeGreaterThanOrEqual(6)
  })
})
```

- [ ] **Step 3: 테스트 실행**

Run: `cd interview-map && npx vitest run src/components/flow/flows/validate.test.ts`
Expected: PASS (기존 7 + 신규 2 = 9).

- [ ] **Step 4: 타입체크**

Run: `cd interview-map && npx tsc -b`
Expected: 오류 없음.

- [ ] **Step 5: 커밋**

```bash
git add interview-map/src/components/flow/flows/traversal.ts interview-map/src/components/flow/flows/validate.test.ts
git commit -m "feat(guide): 순회 흐름 데이터(traversal) + 무결성 테스트"
```

---

### Task 2: GuideView 순회 섹션 교체 + 미사용 SVG 삭제

**Files:**
- Modify: `interview-map/src/components/GuideView.tsx`
- Modify: `interview-map/src/components/GuideView.test.tsx`
- Delete: `interview-map/src/assets/guide/01-architecture.svg` … `06-cache-refresh.svg` (6개 전부)

**Interfaces:**
- Consumes: `traversal`(Task 1), 기존 `FlowPlayer`.

- [ ] **Step 1: import 교체**

`GuideView.tsx` 최상단에서 제거:
```typescript
import travUrl from '../assets/guide/04-node-traversal.svg'
```
추가(`import { depthLadder } from './flow/flows/depthLadder'` 아래):
```typescript
import { traversal } from './flow/flows/traversal'
```

- [ ] **Step 2: 순회 섹션 본문 교체**

`GuideView.tsx`의 "개념 사이 — 그래프 순회" `<section>` 안에서 아래 두 줄을 교체:

기존:
```tsx
        <img className="guide-diagram" src={travUrl} alt="개념 사이 순회" />
        <p className="guide-note">※ 이 그림도 다음 업데이트에서 흐름도로 바뀝니다.</p>
```

교체 후:
```tsx
        <FlowPlayer flow={traversal} />
        <details className="deep">
          <summary>더 깊이 — nextNode가 다음 개념을 고르는 우선순위</summary>
          <ul>
            <li><b>score ≥ 4</b> — 자식 → crosslink → 형제 순으로 미방문 노드.</li>
            <li><b>score = 3</b> — 형제 → 자식.</li>
            <li><b>score ≤ 2</b> — 형제 → 부모(물러남, miss + 1).</li>
            <li><b>막다른 길</b> — 우선 후보가 모두 방문됐으면 <code>backtrack</code>: 방문 경로를 최근순으로 거슬러 미방문 이웃(자식·crosslink)을 잇는다.</li>
            <li><b>종료</b> — <code>misses ≥ MISS_BUDGET(2)</code>면 <code>isOver</code>. (파일럿은 Network 계층 하강; 크로스도메인 crosslink 점프는 다음 이터레이션.)</li>
          </ul>
        </details>
```

- [ ] **Step 3: GuideView 테스트 보강**

`GuideView.test.tsx`의 플레이어 개수 테스트를 3개로 갱신:

기존:
```tsx
  it('embeds FlowPlayers for the turn lifecycle and the depth ladder', () => {
    render(<GuideView />)
    // 한 턴의 생애 + 깊이 사다리 → 플레이어 2개
    expect(document.querySelectorAll('.flow-player').length).toBeGreaterThanOrEqual(2)
    expect(document.querySelectorAll('.fp-counter').length).toBeGreaterThanOrEqual(2)
  })
```
교체 후:
```tsx
  it('embeds FlowPlayers for all three living flows', () => {
    render(<GuideView />)
    // 한 턴의 생애 + 깊이 사다리 + 개념 사이 순회 → 플레이어 3개
    expect(document.querySelectorAll('.flow-player').length).toBeGreaterThanOrEqual(3)
    expect(document.querySelectorAll('.fp-counter').length).toBeGreaterThanOrEqual(3)
  })
```

- [ ] **Step 4: 미사용 SVG 삭제**

교체로 `src/assets/guide/*.svg` 6개 전부 미참조가 된다(Phase 1에서 01/02/05/06 import 제거, Phase 2에서 03, 여기서 04). 삭제 전 참조 0 확인 후 제거.

```bash
grep -rn "assets/guide" interview-map/src/   # 결과 없어야 함
git rm interview-map/src/assets/guide/01-architecture.svg \
       interview-map/src/assets/guide/02-why-no-graphdb.svg \
       interview-map/src/assets/guide/03-depth-ladder.svg \
       interview-map/src/assets/guide/04-node-traversal.svg \
       interview-map/src/assets/guide/05-turn-sequence.svg \
       interview-map/src/assets/guide/06-cache-refresh.svg
```

- [ ] **Step 5: 타입체크 + 전체 테스트 + 빌드**

Run: `cd interview-map && npx tsc -b && npx vitest run && npm run build`
Expected: 타입 오류 없음, 전체 테스트 PASS, 빌드 성공(미사용 SVG 삭제로 깨진 import 없음).

- [ ] **Step 6: 커밋**

```bash
git add interview-map/src/components/GuideView.tsx interview-map/src/components/GuideView.test.tsx
git commit -m "feat(guide): 순회 섹션을 FlowPlayer(traversal)로 교체 + 미사용 가이드 SVG 6개 삭제"
```

---

## 참고: 스코프 밖 / 후속

- **속도 슬라이더·색상 범례** — 스펙 §7에서 Phase 3 "선택". 이번엔 제외(플레이어 안정성 우선). 원하면 별도 소규모 후속으로.
- **크로스도메인 crosslink 점프**(순회 인터뷰 기능 자체) — 여전히 다음 이터레이션. 이 가이드 흐름은 그 규칙을 이미 설명하되, 파일럿 미시연임을 deep-fold에 명시.

## 실브라우저 검증(최종 리뷰 후 수행)

- 가이드 탭 → 순회 섹션에 플레이어 present(총 3개), ▶ 재생 7스텝, 3컬럼 헤더(방금 끝낸 개념/깊이 신호/다음 행선지), 엣지 흐름·정렬, 콘솔 0.
- `npm run build` 성공.
