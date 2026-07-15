import { useMemo } from 'react'
import { useGraphStore } from '../store/graphStore'
import { mergeStatus, domainProgress } from '../hooks/useProgress'
import { domainColor } from '../styles/theme'
import type { GraphNode, NodeStatus } from '../graph/types'
import './ProgressLegend.css'

const STATUS_LABELS: Record<NodeStatus, string> = {
  studied: '학습 완료',
  learning: '학습 중',
  todo: '미학습',
}

export function ProgressLegend({ nodes }: { nodes: GraphNode[] }) {
  const visited = useGraphStore((s) => s.visited)
  const trackingOn = useGraphStore((s) => s.trackingOn)
  const setTracking = useGraphStore((s) => s.setTracking)

  const statusOf = useMemo(
    () => (n: GraphNode): NodeStatus => (trackingOn ? mergeStatus(n.status, !!visited[n.id]) : n.status),
    [trackingOn, visited],
  )
  const progress = useMemo(() => domainProgress(nodes, statusOf), [nodes, statusOf])

  return (
    <aside className="pl-panel">
      <div className="pl-legend">
        {(Object.keys(STATUS_LABELS) as NodeStatus[]).map((s) => (
          <span key={s} className="pl-legend-item">
            <span className={`pl-dot pl-dot-${s}`} />
            {STATUS_LABELS[s]}
          </span>
        ))}
      </div>
      <label className="pl-toggle">
        <input
          type="checkbox"
          checked={trackingOn}
          onChange={(e) => setTracking(e.target.checked)}
        />
        내 진행도 추적
      </label>
      {trackingOn && (
        <div className="pl-domains">
          {progress.map(({ domain, studied, total, pct }) => (
            <div key={domain} className="pl-domain-row">
              <span className="pl-domain-name">{domain}</span>
              <div className="pl-bar-track">
                <div
                  className="pl-bar-fill"
                  style={{ width: `${pct}%`, background: domainColor(domain) }}
                />
              </div>
              <span className="pl-domain-pct">{studied}/{total} ({pct}%)</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
