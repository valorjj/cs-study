# 설계 가이드 v2 — Phase 2: 깊이 사다리 흐름 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GuideView "개념 안 — 깊이 사다리" 섹션의 정적 SVG를 재사용 `FlowPlayer` 애니메이션 흐름(`depthLadder`)으로 교체한다.

**Architecture:** Phase 1에서 만든 데이터 구동 `FlowPlayer`(불변)에 새 흐름 데이터 파일 하나(`depthLadder.ts`)만 추가하고, GuideView에서 `<img src={ladderUrl}>` + 안내 문구를 `<FlowPlayer flow={depthLadder}/>`로 교체한다. 스테이지=계단(L1~L4)을 좌→우 컬럼으로 매핑해 "오른쪽으로 갈수록 깊어짐"을 엣지 흐름으로 표현.

**Tech Stack:** React 19 + TypeScript(Vite, `verbatimModuleSyntax` ON → 타입 전용 import는 `import type`), Vitest + @testing-library/react(jsdom).

## Global Constraints

- 타입 전용 import는 반드시 `import type { ... }` 사용(`verbatimModuleSyntax` ON).
- 타입체크는 `npx tsc -b`(NOT `--noEmit`).
- 흐름 색상은 Phase 1에서 흰 글자 대비(≥4.5:1) 검증된 팔레트 재사용: `#0369a1`(cyan) / `#1d4ed8`(blue) / `#6d28d9`(purple) / `#b45309`(amber). 새 색 도입 금지.
- 흐름 데이터는 반드시 `validateFlow`를 `[]`(오류 없음)로 통과.
- `FlowPlayer.tsx` / `FlowPlayer.css` / `types.ts` / `validate.ts` **불변**(이 페이즈는 흐름 데이터 + GuideView만).
- 커밋 이메일은 공개 repo 규칙상 GitHub noreply(`30681841+valorjj@users.noreply.github.com`), Co-Authored-By 트레일러 포함.

---

### Task 1: `depthLadder` 흐름 데이터 + 무결성 테스트

**Files:**
- Create: `interview-map/src/components/flow/flows/depthLadder.ts`
- Modify: `interview-map/src/components/flow/flows/validate.test.ts`

**Interfaces:**
- Consumes: `Flow`, `FlowStage`, `FlowNode`, `FlowStep` from `../types`; `validateFlow` from `./validate`.
- Produces: `export const depthLadder: Flow` — GuideView(Task 2)가 import.

- [ ] **Step 1: 흐름 데이터 파일 작성**

Create `interview-map/src/components/flow/flows/depthLadder.ts`:

```typescript
import type { Flow } from '../types'

// "깊이 사다리": 한 개념 안에서 L1→L4로 오른다. 3점↑ climb / 2점↓ 힌트+재시도(계단당 최대 2번).
// 스테이지 = 계단(좌→우로 깊어짐). 색은 Phase 1 대비 검증 팔레트를 깊이 그라데이션으로 재사용.
export const depthLadder: Flow = {
  stages: [
    { id: 'l1', label: 'L1 · 정의', color: '#0369a1' },
    { id: 'l2', label: 'L2 · 실무', color: '#1d4ed8' },
    { id: 'l3', label: 'L3 · 내부', color: '#6d28d9' },
    { id: 'l4', label: 'L4 · 엣지', color: '#b45309' },
  ],
  nodes: [
    { id: 'l1-q', stage: 'l1', title: '정의 질문', subtitle: '"포트가 뭐죠?"' },
    { id: 'l2-q', stage: 'l2', title: '실무 질문', subtitle: '"8080에 앱 띄우면?"' },
    { id: 'l2-hint', stage: 'l2', title: '힌트 → 재시도', subtitle: '답변 기반 한 줄' },
    { id: 'l3-q', stage: 'l3', title: '내부 질문', subtitle: '"OS 레벨에선?"' },
    { id: 'l4-q', stage: 'l4', title: '엣지 질문', subtitle: '"같은 포트 둘이 잡으면?"' },
    { id: 'l4-done', stage: 'l4', title: '개념 종료', subtitle: 'reached = 4' },
  ],
  steps: [
    { title: '1. L1 · 정의부터', activeNodes: ['l1-q'], edges: [],
      note: '가장 가벼운 질문으로 문을 연다 — "포트가 뭐죠?"' },
    { title: '2. 3점 이상 → 한 계단 위로', activeNodes: ['l1-q', 'l2-q'],
      edges: [{ from: 'l1-q', to: 'l2-q' }],
      note: 'advanceLadder: score ≥ 3이면 climb. reached를 현재 계단으로 올린다.' },
    { title: '3. L2 · 실무 적용', activeNodes: ['l2-q'], edges: [],
      note: '"그럼 8080에 앱을 띄우면 무슨 일이 나죠?"' },
    { title: '4. 2점 이하 → 힌트 후 재시도', activeNodes: ['l2-q', 'l2-hint'],
      edges: [{ from: 'l2-q', to: 'l2-hint' }],
      note: 'attempts=0이면 offer-hint — 답변에 맞춘 한 줄 힌트 + 재시도 1회(계단당 최대 2번).' },
    { title: '5. 재시도 통과 → 다시 위로', activeNodes: ['l2-hint', 'l3-q'],
      edges: [{ from: 'l2-hint', to: 'l3-q' }],
      note: '재시도에서 3점↑이면 climb. 두 번째도 막히면 여기서 node-done.' },
    { title: '6. L3 · 내부 동작', activeNodes: ['l3-q'], edges: [],
      note: '"OS 레벨에선 어떻게 되죠?"' },
    { title: '7. L4 · 엣지 케이스로', activeNodes: ['l3-q', 'l4-q'],
      edges: [{ from: 'l3-q', to: 'l4-q' }],
      note: '"두 프로세스가 같은 포트를 잡으면요?" — 가장 깊은 계단.' },
    { title: '8. 통과 → 개념 종료(reached=4)', activeNodes: ['l4-q', 'l4-done'],
      edges: [{ from: 'l4-q', to: 'l4-done' }],
      note: 'L4까지 오르면 이 개념 최대 깊이 달성. 얼마나 깊이 갔는지가 다음 개념을 정한다(→ 순회).' },
  ],
}
```

- [ ] **Step 2: 무결성 테스트 추가**

Modify `interview-map/src/components/flow/flows/validate.test.ts` — 파일 상단 import에 depthLadder를 추가하고, 파일 맨 끝에 새 describe 블록을 추가.

import 줄 추가(기존 `import { turnLifecycle } from './turnLifecycle'` 아래):
```typescript
import { depthLadder } from './depthLadder'
```

파일 끝(마지막 `})` 다음)에 추가:
```typescript
describe('depthLadder data', () => {
  it('is internally consistent', () => {
    expect(validateFlow(depthLadder)).toEqual([])
  })
  it('has the four ladder-rung stages and enough steps', () => {
    expect(depthLadder.stages.map((s) => s.id)).toEqual(['l1', 'l2', 'l3', 'l4'])
    expect(depthLadder.steps.length).toBeGreaterThanOrEqual(6)
  })
})
```

- [ ] **Step 3: 테스트 실행**

Run: `cd interview-map && npx vitest run src/components/flow/flows/validate.test.ts`
Expected: PASS (기존 5개 + 신규 2개).

- [ ] **Step 4: 타입체크**

Run: `cd interview-map && npx tsc -b`
Expected: 오류 없음.

- [ ] **Step 5: 커밋**

```bash
git add interview-map/src/components/flow/flows/depthLadder.ts interview-map/src/components/flow/flows/validate.test.ts
git commit -m "feat(guide): 깊이 사다리 흐름 데이터(depthLadder) + 무결성 테스트"
```

---

### Task 2: GuideView 사다리 섹션 → FlowPlayer 교체

**Files:**
- Modify: `interview-map/src/components/GuideView.tsx`
- Modify: `interview-map/src/components/GuideView.test.tsx`

**Interfaces:**
- Consumes: `depthLadder`(Task 1), 기존 `FlowPlayer`.

- [ ] **Step 1: import 교체**

`GuideView.tsx` 최상단 import 블록을 수정.

제거할 줄:
```typescript
import ladderUrl from '../assets/guide/03-depth-ladder.svg'
```

추가할 줄(`import { turnLifecycle } from './flow/flows/turnLifecycle'` 아래):
```typescript
import { depthLadder } from './flow/flows/depthLadder'
```

(주의: `import travUrl from '../assets/guide/04-node-traversal.svg'`는 Phase 3에서 교체하므로 **유지**.)

- [ ] **Step 2: 사다리 섹션 본문 교체**

`GuideView.tsx`의 "개념 안 — 깊이 사다리" `<section>` 안에서 아래 두 줄을 교체:

기존:
```tsx
        <img className="guide-diagram" src={ladderUrl} alt="깊이 사다리 상태도" />
        <p className="guide-note">※ 이 그림은 다음 업데이트에서 위 흐름도처럼 살아 움직이게 바뀝니다.</p>
```

교체 후:
```tsx
        <FlowPlayer flow={depthLadder} />
        <details className="deep">
          <summary>더 깊이 — 사다리 엔진이 계단을 정하는 규칙</summary>
          <ul>
            <li><b>climb</b> — <code>score ≥ 3</code>이면 다음 계단으로, <code>reached</code>를 현재 계단까지 올림.</li>
            <li><b>offer-hint</b> — <code>score ≤ 2</code>이고 <code>attempts = 0</code>이면 답변 기반 힌트 + 재시도 1회.</li>
            <li><b>node-done</b> — L4를 넘거나 재시도도 <code>≤ 2</code>면 종료. 계단당 최대 2번이라 한 개념은 아무리 길어도 유한 — 비용이 구조적으로 상한을 가짐.</li>
          </ul>
        </details>
```

- [ ] **Step 3: GuideView 테스트 보강**

`GuideView.test.tsx`의 "embeds the FlowPlayer for the turn lifecycle" 테스트를 아래로 교체(이제 플레이어가 2개):

기존:
```tsx
  it('embeds the FlowPlayer for the turn lifecycle', () => {
    render(<GuideView />)
    expect(document.querySelector('.flow-player')).toBeTruthy()
    // 플레이어의 스텝 카운터가 존재
    expect(document.querySelector('.fp-counter')).toBeTruthy()
  })
```

교체 후:
```tsx
  it('embeds FlowPlayers for the turn lifecycle and the depth ladder', () => {
    render(<GuideView />)
    // 한 턴의 생애 + 깊이 사다리 → 플레이어 2개
    expect(document.querySelectorAll('.flow-player').length).toBeGreaterThanOrEqual(2)
    expect(document.querySelectorAll('.fp-counter').length).toBeGreaterThanOrEqual(2)
  })
```

- [ ] **Step 4: 테스트 실행**

Run: `cd interview-map && npx vitest run src/components/GuideView.test.tsx`
Expected: PASS.

- [ ] **Step 5: 타입체크 + 전체 테스트**

Run: `cd interview-map && npx tsc -b && npx vitest run`
Expected: 타입 오류 없음, 전체 테스트 PASS.

- [ ] **Step 6: 커밋**

```bash
git add interview-map/src/components/GuideView.tsx interview-map/src/components/GuideView.test.tsx
git commit -m "feat(guide): 사다리 섹션을 FlowPlayer(depthLadder)로 교체 + deep-fold 규칙"
```

---

## 참고: 스코프 밖(Phase 3)

- `traversal.ts` 흐름 + 순회 섹션 `04-node-traversal.svg` 교체 → 다음 페이즈.
- 속도 슬라이더·색상 범례 → Phase 3+.
- 미사용 SVG(`01/02/03/05/06`) 파일 정리 → Phase 3 종료 시 일괄 결정(지금은 import만 제거, 파일 잔존).

## 실브라우저 검증(SDD 최종 리뷰 후 컨트롤러가 수행)

- `npm run dev` → 가이드 탭 → 사다리 섹션에 플레이어 present, ▶ 재생 시 8스텝 진행, 엣지 흐름, 콘솔 0.
- 라이트/다크 모두 제목·노드 가독.
