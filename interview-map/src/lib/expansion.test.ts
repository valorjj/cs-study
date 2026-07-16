import { describe, it, expect } from 'vitest'
import { visibleL2Ids } from './expansion'

const nodes = [
  { id: 'dsa', level: 0 as const },
  { id: 'dsa-tree', level: 1 as const },
  { id: 'dsa-sort', level: 1 as const },
  { id: 'dsa-bigo', level: 1 as const }, // L2 자식 없음
  { id: 'dsa-bst', level: 2 as const },
  { id: 'dsa-heap', level: 2 as const },
  { id: 'dsa-compare-sort', level: 2 as const },
]
const edges = [
  { source: 'dsa', target: 'dsa-tree' },
  { source: 'dsa', target: 'dsa-sort' },
  { source: 'dsa', target: 'dsa-bigo' },
  { source: 'dsa-tree', target: 'dsa-bst' },
  { source: 'dsa-tree', target: 'dsa-heap' },
  { source: 'dsa-sort', target: 'dsa-compare-sort' },
]

describe('visibleL2Ids', () => {
  it('선택이 null이면 빈 집합', () => {
    expect(visibleL2Ids(null, nodes, edges)).toEqual(new Set())
  })
  it('L1 선택 시 그 자식 L2들만', () => {
    expect(visibleL2Ids('dsa-tree', nodes, edges)).toEqual(new Set(['dsa-bst', 'dsa-heap']))
  })
  it('자식 없는 L1 선택 시 빈 집합', () => {
    expect(visibleL2Ids('dsa-bigo', nodes, edges)).toEqual(new Set())
  })
  it('L2 선택 시 자기 자신 + 형제 L2', () => {
    expect(visibleL2Ids('dsa-bst', nodes, edges)).toEqual(new Set(['dsa-bst', 'dsa-heap']))
  })
  it('다른 그룹의 L2는 포함하지 않음', () => {
    expect(visibleL2Ids('dsa-compare-sort', nodes, edges)).toEqual(new Set(['dsa-compare-sort']))
  })
  it('L0(도메인) 선택 시 빈 집합', () => {
    expect(visibleL2Ids('dsa', nodes, edges)).toEqual(new Set())
  })
})
