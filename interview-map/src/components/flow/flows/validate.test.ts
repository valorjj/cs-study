import { describe, it, expect } from 'vitest'
import { validateFlow } from './validate'
import { turnLifecycle } from './turnLifecycle'
import { depthLadder } from './depthLadder'
import { traversal } from './traversal'
import type { Flow } from '../types'

describe('validateFlow', () => {
  it('returns [] for a valid flow', () => {
    const ok: Flow = {
      stages: [{ id: 's', label: 'S', color: '#000' }],
      nodes: [{ id: 'n', stage: 's', title: 'N' }],
      steps: [{ title: 't', activeNodes: ['n'], edges: [] }],
    }
    expect(validateFlow(ok)).toEqual([])
  })
  it('flags a node in an unknown stage', () => {
    const bad: Flow = {
      stages: [{ id: 's', label: 'S', color: '#000' }],
      nodes: [{ id: 'n', stage: 'nope', title: 'N' }],
      steps: [],
    }
    expect(validateFlow(bad).length).toBeGreaterThan(0)
  })
  it('flags a step referencing a missing node', () => {
    const bad: Flow = {
      stages: [{ id: 's', label: 'S', color: '#000' }],
      nodes: [{ id: 'n', stage: 's', title: 'N' }],
      steps: [{ title: 't', activeNodes: ['ghost'], edges: [{ from: 'n', to: 'ghost' }] }],
    }
    expect(validateFlow(bad).length).toBeGreaterThan(0)
  })
})

describe('turnLifecycle data', () => {
  it('is internally consistent', () => {
    expect(validateFlow(turnLifecycle)).toEqual([])
  })
  it('has multiple steps and the four runtime stages', () => {
    expect(turnLifecycle.steps.length).toBeGreaterThanOrEqual(7)
    expect(turnLifecycle.stages.map((s) => s.id).sort()).toEqual(['browser', 'db', 'edge', 'llm'])
  })
})

describe('depthLadder data', () => {
  it('is internally consistent', () => {
    expect(validateFlow(depthLadder)).toEqual([])
  })
  it('has the four ladder-rung stages and enough steps', () => {
    expect(depthLadder.stages.map((s) => s.id)).toEqual(['l1', 'l2', 'l3', 'l4'])
    expect(depthLadder.steps.length).toBeGreaterThanOrEqual(6)
  })
})

describe('traversal data', () => {
  it('is internally consistent', () => {
    expect(validateFlow(traversal)).toEqual([])
  })
  it('has the three decision stages and enough steps', () => {
    expect(traversal.stages.map((s) => s.id)).toEqual(['cur', 'sig', 'nxt'])
    expect(traversal.steps.length).toBeGreaterThanOrEqual(6)
  })
})
