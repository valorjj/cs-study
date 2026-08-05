// 프로젝트 입력 → 실재 그래프 노드 매칭. 순수 함수.
// level 0(도메인) 노드는 개념이 아니라 그룹 헤더이므로 매칭 대상에서 제외한다.
import type { GraphNode } from '../graph/types'
import type { Match } from './resumeTypes'

export function normalizeTerm(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.]/g, '')
}

// 정규화된 용어 → 그 용어를 가진 개념 노드 id들
function buildIndex(nodes: GraphNode[]): Map<string, string[]> {
  const idx = new Map<string, string[]>()
  const add = (term: string, id: string): void => {
    const k = normalizeTerm(term)
    if (k.length < 2) return
    const cur = idx.get(k)
    if (!cur) { idx.set(k, [id]); return }
    if (!cur.includes(id)) cur.push(id)
  }
  for (const n of nodes) {
    if (n.level === 0) continue
    add(n.label, n.id)
    for (const k of n.keywords) add(k, n.id)
  }
  return idx
}

// 라틴 낱말과 한글 낱말을 각각 한 토큰으로. 2글자 용어의 오탐(부분문자열)을 막는 데 쓴다.
const TOKEN_RE = /[a-z0-9]+|[가-힣]+/g

export function matchLocal(
  input: { stack: string[]; narrative: string }, nodes: GraphNode[],
): Match[] {
  const idx = buildIndex(nodes)
  const out: Match[] = []
  const seen = new Set<string>()

  const push = (nodeId: string, via: Match['via'], evidence: string): void => {
    if (seen.has(nodeId)) return
    seen.add(nodeId)
    out.push({ nodeId, via, evidence })
  }

  // 칩이 가장 강한 신호이므로 먼저 확정한다 (같은 노드는 뒤에서 덮이지 않는다).
  for (const chip of input.stack) {
    for (const id of idx.get(normalizeTerm(chip)) ?? []) push(id, 'chip', chip)
  }

  const flat = normalizeTerm(input.narrative)
  const tokens = new Set((input.narrative.toLowerCase().match(TOKEN_RE) ?? []))
  for (const [term, ids] of idx) {
    // 3글자 이상은 정규화 본문 부분일치, 2글자는 토큰 완전일치만 인정한다.
    const hit = term.length >= 3 ? flat.includes(term) : tokens.has(term)
    if (!hit) continue
    for (const id of ids) push(id, 'keyword', term)
  }

  return out
}

export function mergeLlm(
  local: Match[],
  llm: { nodeIds: string[]; reasons: Record<string, string> },
  nodes: GraphNode[],
): { matches: Match[]; dropped: number } {
  const concept = new Set(nodes.filter((n) => n.level !== 0).map((n) => n.id))
  const have = new Set(local.map((m) => m.nodeId))
  const matches = [...local]
  let dropped = 0

  for (const id of llm.nodeIds) {
    if (!concept.has(id)) { dropped += 1; continue }   // 환각 또는 도메인 노드
    if (have.has(id)) continue                         // 이미 로컬이 더 강한 근거로 잡음
    have.add(id)
    matches.push({ nodeId: id, via: 'llm', evidence: llm.reasons[id] ?? '서술문에서 암시됨' })
  }
  return { matches, dropped }
}
