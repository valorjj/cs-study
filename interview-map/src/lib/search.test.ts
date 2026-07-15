import { describe, it, expect } from 'vitest'
import { searchNodes } from './search'
import type { GraphNode } from '../graph/types'

const n = (id: string, label: string, keywords: string[]): GraphNode =>
  ({ id, label, domain: 'x', level: 2, icon: '', summary: '', keywords, status: 'todo', position: { x: 0, y: 0 } })
const nodes = [n('jvm-gc', 'Garbage Collection', ['STW', 'G1']), n('jvm-jit', 'JIT Compiler', ['hotspot'])]

describe('searchNodes', () => {
  it('empty query returns nothing', () => expect(searchNodes('', nodes)).toEqual([]))
  it('matches label case-insensitively', () =>
    expect(searchNodes('garbage', nodes).map((x) => x.id)).toEqual(['jvm-gc']))
  it('matches keywords', () =>
    expect(searchNodes('stw', nodes).map((x) => x.id)).toEqual(['jvm-gc']))
})
