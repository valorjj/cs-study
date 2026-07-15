import { useEffect } from 'react'
import type { GraphNode, NodeStatus } from '../graph/types'
import { useGraphStore } from '../store/graphStore'

const KEY = 'interview-map.progress.v1'

export function mergeStatus(authorStatus: NodeStatus, visited: boolean): NodeStatus {
  return visited ? 'studied' : authorStatus
}

export function domainProgress(
  nodes: GraphNode[],
  statusOf: (n: GraphNode) => NodeStatus,
): Array<{ domain: string; studied: number; total: number; pct: number }> {
  const map = new Map<string, { studied: number; total: number }>()
  for (const n of nodes) {
    if (n.level === 0) continue
    const e = map.get(n.domain) ?? { studied: 0, total: 0 }
    e.total += 1
    if (statusOf(n) === 'studied') e.studied += 1
    map.set(n.domain, e)
  }
  return [...map.entries()].map(([domain, { studied, total }]) => ({
    domain, studied, total, pct: total ? Math.round((studied / total) * 100) : 0,
  }))
}

// Hook: hydrate from localStorage once, persist on change.
export function useProgressPersistence(): void {
  const visited = useGraphStore((s) => s.visited)
  const trackingOn = useGraphStore((s) => s.trackingOn)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { visited?: Record<string, boolean>; trackingOn?: boolean }
        useGraphStore.setState({ visited: parsed.visited ?? {}, trackingOn: parsed.trackingOn ?? false })
      }
    } catch { /* ignore */ }
    // hydrate once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ visited, trackingOn })) } catch { /* ignore */ }
  }, [visited, trackingOn])
}
