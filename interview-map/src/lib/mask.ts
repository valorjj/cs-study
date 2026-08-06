// 마스킹. 자동 탐지는 보조 수단이고, 실제 안전 보증은 전송 전 전문 미리보기 +
// 명시적 보내기 버튼이다(스펙 참조). 한국어 회사명·사내 코드명은 대문자 같은
// 표기 신호가 없어 규칙으로 완전히 잡을 수 없다는 전제로 설계했다.
import type { GraphNode } from '../graph/types'
import type { CandidateKind, MaskDecision } from './resumeTypes'
export type { CandidateKind }

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

// 번호는 순서대로 매기며(종류별로), 중복 text가 있으면 뒤엣것이 앞엣것을 덮어써
// 사전 항목 수보다 번호가 커질 수 있다(예: [COMPANY_2]만 남고 [COMPANY_1]이
// 안 보임) — 이가 빠진 번호처럼 보이지만, 서로 다른 텍스트끼리는 절대 번호가
// 충돌하지 않고, 미리보기와 전송은 한 번의 상호작용 안에서 같은 객체를 두 번
// 계산할 뿐이라 그 사이에 번호가 달라지지도 않는다. "번호를 촘촘하게 채우자"는
// 리팩터는 오히려 같은 결정 목록이 렌더마다 다른 토큰을 낼 위험을 만든다 — 건드리지 말 것.
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
// 대소문자 무시(gi) — "SettleHub"를 가리기로 했다면 서술문에 소문자로 적힌
// "settlehub"(URL·호스트명·소문자 산문에서 흔하다)도 같은 실체이므로 함께 가려야
// 한다. neverMask 판정도 이미 normalize()에서 대소문자를 접어 비교한다 — 마스킹
// 쪽만 대소문자에 민감했다면 둘의 전제가 어긋난다.
export function applyMask(text: string, dict: Record<string, string>): string {
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length)
  let out = text
  for (const k of keys) out = out.replace(new RegExp(escapeRe(k), 'gi'), dict[k])
  return out
}

// 결정 목록에서 사전을 파생한다. 저장된 사전은 없다 — 서술문이 바뀌면 후보가 바뀌고,
// 저장된 사전은 그 순간 낡는다. 순서가 같으면 결과가 같으므로 렌더마다 안전하다.
//
// 빈 문자열(또는 공백뿐인) 텍스트는 여기서 걸러낸다 — assertNoPlaintext는 빈 키를
// 일부러 건너뛰지만(모든 문자열에 걸리므로), applyMask는 그런 방어가 없다.
// new RegExp('', 'gi')는 모든 위치에 매치되어 서술문 전체를 토큰으로 채워버리고,
// assertNoPlaintext는 빈 키를 스킵하므로 그 결과를 잡아내지도 못한다. 그러니
// "스캔이 나중에 걸러주겠지"에 기대지 않고 사전을 만드는 시점에 미리 막는다.
export function dictOf(decisions: MaskDecision[]): Record<string, string> {
  return buildMaskDict(decisions.filter((d) => d.mask && d.text.trim() !== '').map((d) => ({
    text: d.text, kind: d.kind, count: 1,
  })))
}

export interface MaskGateResult {
  ready: boolean
  undecided: Candidate[]
}

// 지금 서술문에서 발견되는 모든 후보에 결정이 있는지 본다. 서술문에 더 이상 없는
// 결정(낡은 것)은 무시한다 — 사용자가 문장을 지웠으면 그 결정도 의미가 없다.
export function maskGate(
  narrative: string,
  decisions: MaskDecision[],
  neverMask: Set<string>,
): MaskGateResult {
  // text만 보고 매칭한다 — kind는 비교하지 않는다. 결정은 "이 문자열을 가릴지"에
  // 대한 것이지 "이 문자열이 어떤 종류로 탐지됐는지"에 대한 것이 아니다. 저장된
  // 결정의 kind가 이번 탐지의 kind와 달라도(예: 전에는 contact로 결정했는데 이번엔
  // company로 잡힘) 사용자가 이미 그 문자열에 대해 결정을 내렸다는 사실은 유효하다.
  const decided = new Set(decisions.map((d) => d.text))
  const undecided = findCandidates(narrative, neverMask).filter((c) => !decided.has(c.text))
  return { ready: undecided.length === 0, undecided }
}
