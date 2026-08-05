// 프로젝트 중심 방사형 배치. 결정적(난수 없음)이라 스냅샷 테스트가 가능하다.
// 각도를 도메인의 개념 수에 비례 배분하므로 겹침이 구조적으로 발생하지 않는다 —
// 충돌 회피 로직이 아니라 배분 계산이어서 테스트가 단순하다.
import type { Tier } from './mastery'
import type { MatchVia } from './resumeTypes'

// 25개를 넘으면 방사형은 읽을 수 없다. 전체 상한 대신 도메인당 상한만 둔다 —
// 규칙이 하나면 최대 밀도가 그것으로 정해지고 테스트도 하나다.
export const PER_DOMAIN_CAP = 6

const DOMAIN_RADIUS = 170
const CONCEPT_RADIUS = 320

export interface ConceptItem {
  nodeId: string
  label: string
  tier: Tier
  via: MatchVia
}

export interface DomainGroup {
  domain: string
  label: string
  items: ConceptItem[]
}

export interface Placed {
  id: string
  kind: 'project' | 'domain' | 'concept'
  label: string
  x: number
  y: number
  ring: 0 | 1 | 2
  tier?: Tier
  via?: MatchVia
  hiddenCount?: number   // 도메인 노드에만: cap으로 접힌 개념 수
}

const TIER_RANK: Record<Tier, number> = { unverified: 0, shaky: 1, solid: 2 }
const VIA_RANK: Record<MatchVia, number> = { llm: 0, chip: 1, keyword: 2 }

// 약한 것 우선. cap으로 자를 때 앞에서부터 남긴다.
export function sortForCap(items: ConceptItem[]): ConceptItem[] {
  return items.slice().sort((a, b) =>
    TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
    VIA_RANK[a.via] - VIA_RANK[b.via] ||
    a.nodeId.localeCompare(b.nodeId))
}

export function layoutRadial(
  projectName: string,
  groups: DomainGroup[],
  opts: { perDomainCap?: number; domainRadius?: number; conceptRadius?: number } = {},
): Placed[] {
  const cap = opts.perDomainCap ?? PER_DOMAIN_CAP
  const r1 = opts.domainRadius ?? DOMAIN_RADIUS
  const r2 = opts.conceptRadius ?? CONCEPT_RADIUS

  const out: Placed[] = [
    { id: '__project__', kind: 'project', label: projectName, x: 0, y: 0, ring: 0 },
  ]

  const visible = groups.map((g) => {
    const sorted = sortForCap(g.items)
    return { group: g, shown: sorted.slice(0, cap), hidden: Math.max(0, sorted.length - cap) }
  }).filter((v) => v.shown.length > 0)

  const total = visible.reduce((sum, v) => sum + v.shown.length, 0)
  if (total === 0) return out

  const TAU = Math.PI * 2
  let cursor = -Math.PI / 2   // 12시 방향부터 시계방향

  for (const v of visible) {
    const span = TAU * (v.shown.length / total)
    const mid = cursor + span / 2
    out.push({
      id: v.group.domain,
      kind: 'domain',
      label: v.group.label,
      x: Math.cos(mid) * r1,
      y: Math.sin(mid) * r1,
      ring: 1,
      ...(v.hidden > 0 ? { hiddenCount: v.hidden } : {}),
    })
    v.shown.forEach((item, i) => {
      const a = cursor + (span * (i + 0.5)) / v.shown.length
      out.push({
        id: item.nodeId,
        kind: 'concept',
        label: item.label,
        x: Math.cos(a) * r2,
        y: Math.sin(a) * r2,
        ring: 2,
        tier: item.tier,
        via: item.via,
      })
    })
    cursor += span
  }
  return out
}
