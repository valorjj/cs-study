import type { GraphNode, GraphEdge } from '../graph/types'

export interface SubGraph { nodes: GraphNode[]; edges: GraphEdge[] }
export interface WalkState { path: string[]; visited: string[]; misses: number }
export const MISS_BUDGET = 2

// 한 도메인의 노드 + 양끝이 모두 그 노드 집합 안인 엣지만(타 도메인 crosslink 점프는 파일럿 스코프 밖).
export function networkSubgraph(nodes: GraphNode[], edges: GraphEdge[], domain = 'network'): SubGraph {
  const ns = nodes.filter((n) => n.domain === domain)
  const ids = new Set(ns.map((n) => n.id))
  const es = edges.filter((e) => ids.has(e.source) && ids.has(e.target))
  return { nodes: ns, edges: es }
}

const has = (st: WalkState, id: string) => st.visited.includes(id)

function childrenOf(sub: SubGraph, id: string): string[] {
  return sub.edges.filter((e) => e.type === 'hierarchy' && e.source === id).map((e) => e.target)
}
function parentsOf(sub: SubGraph, id: string): string[] {
  return sub.edges.filter((e) => e.type === 'hierarchy' && e.target === id).map((e) => e.source)
}
function crosslinksOf(sub: SubGraph, id: string): string[] {
  const out: string[] = []
  for (const e of sub.edges) {
    if (e.type !== 'crosslink') continue
    if (e.source === id) out.push(e.target)
    else if (e.target === id) out.push(e.source)
  }
  return out
}
function siblingsOf(sub: SubGraph, id: string): string[] {
  const out = new Set<string>()
  for (const p of parentsOf(sub, id)) for (const c of childrenOf(sub, p)) if (c !== id) out.add(c)
  return [...out]
}

// 시작: net-http 우선, 없으면 첫 L1, 없으면 첫 노드.
export function pickStart(sub: SubGraph): string | null {
  if (sub.nodes.some((n) => n.id === 'net-http')) return 'net-http'
  const l1 = sub.nodes.find((n) => n.level === 1)
  return l1?.id ?? sub.nodes[0]?.id ?? null
}

export function isOver(state: WalkState): boolean {
  return state.misses >= MISS_BUDGET
}

// 현재 노드가 막다른 길일 때: 지금까지 방문한 경로를 "최근 방문 순"으로 거슬러 올라가며
// 미방문 이웃(자식→crosslink)이 있는 첫 노드로 되돌아가 면접을 계속한다(백트래킹).
// 이래야 리프에서 2~3노드 만에 끝나지 않고 "끝없는 심층 세션"이 된다.
function backtrack(sub: SubGraph, state: WalkState): string | null {
  const fresh = (ids: string[]) => ids.find((id) => !has(state, id)) ?? null
  for (let i = state.path.length - 1; i >= 0; i--) {
    const n = state.path[i]
    const cand = fresh([...childrenOf(sub, n), ...crosslinksOf(sub, n)])
    if (cand) return cand
  }
  return null
}

// 현재 노드 = path의 마지막. 점수로 현재 노드 기준 우선 후보를 고르고(primary),
// 현재가 막히면 backtrack으로 방문 경로의 미방문 이웃을 잇는다. 없으면 null.
export function nextNode(sub: SubGraph, state: WalkState, score: number): string | null {
  const cur = state.path[state.path.length - 1]
  if (!cur) return null
  const fresh = (ids: string[]) => ids.find((id) => !has(state, id)) ?? null
  let primary: string | null
  if (score >= 4) {
    primary = fresh(childrenOf(sub, cur)) ?? fresh(crosslinksOf(sub, cur)) ?? fresh(siblingsOf(sub, cur))
  } else if (score === 3) {
    primary = fresh(siblingsOf(sub, cur)) ?? fresh(childrenOf(sub, cur))
  } else {
    // score <= 2: 형제 → 부모로 물러남
    primary = fresh(siblingsOf(sub, cur)) ?? fresh(parentsOf(sub, cur))
  }
  return primary ?? backtrack(sub, state)
}
