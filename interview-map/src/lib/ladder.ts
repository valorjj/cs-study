// 개념 안 "깊이 사다리" 순수 엔진. UI/네트워크 없음 → 결정적·테스트 쉬움.
// 계단당 최대 2번 답변(첫 답 실패 → 힌트 제안 + 재시도 1회). score>=3이면 상승.
export type Rung = 1 | 2 | 3 | 4
export interface LadderState { rung: Rung; attempts: number; reached: 0 | 1 | 2 | 3 | 4 }
export const START_LADDER: LadderState = { rung: 1, attempts: 0, reached: 0 }

export type LadderAction =
  | { kind: 'climb'; state: LadderState }
  | { kind: 'offer-hint'; state: LadderState }
  | { kind: 'node-done'; reached: 0 | 1 | 2 | 3 | 4; weak: boolean }

const nextRung = (r: Rung): Rung | null => (r < 4 ? ((r + 1) as Rung) : null)

export function advanceLadder(state: LadderState, score: number): LadderAction {
  if (score >= 3) {
    const reached = Math.max(state.reached, state.rung) as LadderState['reached']
    const nr = nextRung(state.rung)
    if (nr === null) return { kind: 'node-done', reached, weak: reached === 0 }
    return { kind: 'climb', state: { rung: nr, attempts: 0, reached } }
  }
  // score <= 2
  if (state.attempts === 0) {
    return { kind: 'offer-hint', state: { ...state, attempts: 1 } }
  }
  return { kind: 'node-done', reached: state.reached, weak: state.reached === 0 }
}

// 순회 신호: 깊이 마스터(≥4)→더 깊이, 어느 정도(≥1)→옆, 입구서 막힘(0)→물러남.
export function ladderSignal(reached: number): number {
  if (reached >= 4) return 4
  if (reached >= 1) return 3
  return 2
}

// 계단 질문 생성이 skip이면(재료 부족) 그 노드를 현재 reached로 종료.
export function applySkip(state: LadderState): LadderAction {
  return { kind: 'node-done', reached: state.reached, weak: state.reached === 0 }
}
