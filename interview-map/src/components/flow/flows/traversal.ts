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
