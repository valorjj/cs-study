import type { GraphNode, GraphEdge } from '../graph/types'
import { buildTree, type TreeNode } from './tree'

export interface Track {
  id: string
  title: string
  description: string
  icon: string
  steps: string[]
}

// DFS a domain subtree into an ordered id list, excluding the root (L0) node.
function flattenSteps(root: TreeNode): string[] {
  const out: string[] = []
  const walk = (t: TreeNode) => {
    for (const c of t.children) { out.push(c.node.id); walk(c) }
  }
  walk(root)
  return out
}

// One auto course per domain: its concepts in tree (graph) order.
export function buildDomainTracks(nodes: GraphNode[], edges: GraphEdge[]): Track[] {
  return buildTree(nodes, edges).map((root) => ({
    id: `domain:${root.node.domain}`,
    title: root.node.label,
    description: `${root.node.label} 개념을 트리 순서대로`,
    icon: root.node.icon,
    steps: flattenSteps(root),
  }))
}

export function trackProgress(track: Track, studied: Set<string>): { done: number; total: number } {
  let done = 0
  for (const id of track.steps) if (studied.has(id)) done++
  return { done, total: track.steps.length }
}

// Index of the first not-yet-studied step; -1 when the whole track is done.
export function nextStepIndex(track: Track, studied: Set<string>): number {
  for (let i = 0; i < track.steps.length; i++) if (!studied.has(track.steps[i])) return i
  return -1
}

// Completed vs total concept nodes (level 1|2) per domain id.
export function domainProgress(
  nodes: GraphNode[], studied: Set<string>,
): Map<string, { done: number; total: number }> {
  const m = new Map<string, { done: number; total: number }>()
  for (const n of nodes) {
    if (n.level === 0) continue
    const e = m.get(n.domain) ?? { done: 0, total: 0 }
    e.total++
    if (studied.has(n.id)) e.done++
    m.set(n.domain, e)
  }
  return m
}
