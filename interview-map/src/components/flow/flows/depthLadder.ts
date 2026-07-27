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
