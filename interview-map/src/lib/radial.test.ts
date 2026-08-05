import { describe, it, expect } from 'vitest'
import { sortForCap, layoutRadial, PER_DOMAIN_CAP, type ConceptItem, type DomainGroup } from './radial'

const item = (nodeId: string, tier: ConceptItem['tier'], via: ConceptItem['via'] = 'keyword'): ConceptItem =>
  ({ nodeId, label: nodeId, tier, via })

const group = (domain: string, items: ConceptItem[]): DomainGroup =>
  ({ domain, label: domain.toUpperCase(), items })

describe('sortForCap', () => {
  it('orders unverified, then shaky, then solid', () => {
    const out = sortForCap([item('a', 'solid'), item('b', 'unverified'), item('c', 'shaky')])
    expect(out.map((i) => i.nodeId)).toEqual(['b', 'c', 'a'])
  })

  it('within a tier prefers llm, then chip, then keyword', () => {
    const out = sortForCap([
      item('a', 'shaky', 'keyword'), item('b', 'shaky', 'llm'), item('c', 'shaky', 'chip'),
    ])
    expect(out.map((i) => i.nodeId)).toEqual(['b', 'c', 'a'])
  })

  it('breaks remaining ties by nodeId for stability', () => {
    const out = sortForCap([item('z', 'shaky', 'chip'), item('a', 'shaky', 'chip')])
    expect(out.map((i) => i.nodeId)).toEqual(['a', 'z'])
  })

  it('does not mutate the input array', () => {
    const input = [item('a', 'solid'), item('b', 'unverified')]
    sortForCap(input)
    expect(input.map((i) => i.nodeId)).toEqual(['a', 'b'])
  })
})

describe('layoutRadial', () => {
  it('always places the project at the origin on ring 0', () => {
    const out = layoutRadial('정산 서비스', [])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'project', label: '정산 서비스', x: 0, y: 0, ring: 0 })
  })

  it('places one domain node and its concepts on rings 1 and 2', () => {
    const out = layoutRadial('P', [group('database', [item('db-tx', 'solid')])])
    expect(out.map((p) => p.kind)).toEqual(['project', 'domain', 'concept'])
    const [, dom, con] = out
    expect(dom.ring).toBe(1)
    expect(con.ring).toBe(2)
    expect(Math.hypot(con.x, con.y)).toBeGreaterThan(Math.hypot(dom.x, dom.y))
  })

  it('caps concepts per domain and reports the remainder on the domain node', () => {
    const many = Array.from({ length: 9 }, (_, i) => item(`n${i}`, 'solid'))
    const out = layoutRadial('P', [group('database', many)], { perDomainCap: 6 })
    expect(out.filter((p) => p.kind === 'concept')).toHaveLength(6)
    expect(out.find((p) => p.kind === 'domain')!.hiddenCount).toBe(3)
  })

  it('leaves hiddenCount undefined when nothing was cut', () => {
    const out = layoutRadial('P', [group('database', [item('a', 'solid')])])
    expect(out.find((p) => p.kind === 'domain')!.hiddenCount).toBeUndefined()
  })

  it('keeps the weakest concepts when cutting', () => {
    const items = [
      ...Array.from({ length: 6 }, (_, i) => item(`solid${i}`, 'solid')),
      item('gap', 'unverified'),
    ]
    const out = layoutRadial('P', [group('database', items)], { perDomainCap: 6 })
    expect(out.filter((p) => p.kind === 'concept').map((p) => p.id)).toContain('gap')
  })

  it('gives every placed node a distinct position', () => {
    const out = layoutRadial('P', [
      group('database', [item('a', 'solid'), item('b', 'shaky')]),
      group('spring', [item('c', 'solid'), item('d', 'unverified')]),
      group('devops', [item('e', 'solid')]),
    ])
    const seen = new Set(out.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`))
    expect(seen.size).toBe(out.length)
  })

  it('allocates angle in proportion to visible concept count', () => {
    // 4개 도메인 중 하나만 개념이 3개면 그 도메인이 더 넓은 각을 받는다.
    const out = layoutRadial('P', [
      group('a', [item('a1', 'solid'), item('a2', 'solid'), item('a3', 'solid')]),
      group('b', [item('b1', 'solid')]),
    ])
    const angle = (id: string) => {
      const p = out.find((x) => x.id === id)!
      return Math.atan2(p.y, p.x)
    }
    // a는 3/4 원(1.5π)을 받고 그 안에서 a1과 a3는 span*2/3 = π 만큼 떨어진다.
    expect(Math.abs(angle('a1') - angle('a3'))).toBeCloseTo(Math.PI, 5)
  })

  it('is deterministic — same input yields identical output', () => {
    const groups = [group('database', [item('a', 'solid'), item('b', 'shaky')])]
    expect(layoutRadial('P', groups)).toEqual(layoutRadial('P', groups))
  })

  it('carries tier and via onto concept nodes', () => {
    const out = layoutRadial('P', [group('database', [item('a', 'unverified', 'llm')])])
    const con = out.find((p) => p.kind === 'concept')!
    expect(con.tier).toBe('unverified')
    expect(con.via).toBe('llm')
  })

  it('exports a default cap of 6', () => {
    expect(PER_DOMAIN_CAP).toBe(6)
  })
})
