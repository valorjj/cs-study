// 마스킹. 자동 탐지는 보조 수단이고, 실제 안전 보증은 전송 전 전문 미리보기 +
// 명시적 보내기 버튼이다(스펙 참조). 한국어 회사명·사내 코드명은 대문자 같은
// 표기 신호가 없어 규칙으로 완전히 잡을 수 없다는 전제로 설계했다.
import type { GraphNode } from '../graph/types'

export type CandidateKind = 'company' | 'system' | 'person' | 'contact'

export interface Candidate {
  text: string
  kind: CandidateKind
  count: number   // 등장 횟수. 코드명 후보만 2회 이상을 요구한다 — 연락처·회사는 1회로도 채택된다
}

// 기술 용어는 절대 가리면 안 된다 — Redis가 [SYSTEM_1]이 되면 추출 신호가 사라진다.
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.]/g, '')
}

export function buildNeverMask(nodes: GraphNode[]): Set<string> {
  const out = new Set<string>()
  for (const n of nodes) {
    out.add(normalize(n.label))
    for (const k of n.keywords) out.add(normalize(k))
  }
  return out
}

// 회사명: (주)X · ㈜X · X 주식회사
const COMPANY_RE = /(?:\(주\)|㈜)\s*([가-힣A-Za-z0-9]{2,20})|([가-힣]{2,20})\s*주식회사/g
// 연락처류: 이메일 · 하이픈 전화번호 · 사번(영문 2~4자 + 숫자 4자 이상)
const CONTACT_RE = /[\w.+-]+@[\w-]+\.[\w.]+|\d{2,4}-\d{3,4}-\d{4}|\b[A-Za-z]{2,4}\d{4,}\b/g
// 사내 코드명 후보: CamelCase 또는 ALLCAPS 라틴 토큰
const CODENAME_RE = /\b(?:[A-Z][a-z0-9]+){2,}\b|\b[A-Z]{3,}\b/g

function bump(map: Map<string, Candidate>, text: string, kind: CandidateKind): void {
  const cur = map.get(text)
  if (cur) { cur.count += 1; return }
  map.set(text, { text, kind, count: 1 })
}

export function findCandidates(text: string, neverMask: Set<string>): Candidate[] {
  const found = new Map<string, Candidate>()

  // 연락처·회사 마커는 1회 등장만으로도 후보다 (신호가 명확하다).
  for (const m of text.matchAll(CONTACT_RE)) {
    bump(found, m[0], 'contact')
  }
  for (const m of text.matchAll(COMPANY_RE)) {
    const name = m[1] ?? m[2]
    if (!name) continue
    bump(found, name, 'company')
  }

  // 코드명 후보는 기술 사전에 없고 2회 이상 나올 때만 채택한다.
  const counts = new Map<string, number>()
  for (const m of text.matchAll(CODENAME_RE)) {
    if (neverMask.has(normalize(m[0]))) continue
    counts.set(m[0], (counts.get(m[0]) ?? 0) + 1)
  }
  for (const [word, n] of counts) {
    if (n < 2 || found.has(word)) continue
    found.set(word, { text: word, kind: 'system', count: n })
  }

  // 기술 용어는 어떤 경로(회사/연락처/코드명)로 발견되든 최종적으로 걸러낸다.
  return [...found.values()]
    .filter((c) => !neverMask.has(normalize(c.text)))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
}

const KIND_TOKEN: Record<CandidateKind, string> = {
  company: 'COMPANY', system: 'SYSTEM', person: 'PERSON', contact: 'CONTACT',
}

export function buildMaskDict(confirmed: Candidate[]): Record<string, string> {
  const seq: Record<CandidateKind, number> = { company: 0, system: 0, person: 0, contact: 0 }
  const dict: Record<string, string> = {}
  for (const c of confirmed) {
    seq[c.kind] += 1
    dict[c.text] = `[${KIND_TOKEN[c.kind]}_${seq[c.kind]}]`
  }
  return dict
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 긴 키를 먼저 치환한다 — "Settle"이 "SettleHub"를 반쪽만 갈아먹는 것을 막는다.
export function applyMask(text: string, dict: Record<string, string>): string {
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length)
  let out = text
  for (const k of keys) out = out.replace(new RegExp(escapeRe(k), 'g'), dict[k])
  return out
}
