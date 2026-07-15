import { useEffect } from 'react'
import type { GraphNode } from '../graph/types'
import { useGraphStore } from '../store/graphStore'
import { NodeIcon } from './NodeIcon'
import './ContextMenu.css'

export interface MenuState { x: number; y: number; nodeId: string }

export function ContextMenu({ menu, nodesById, neighbors, onClose }: {
  menu: MenuState | null
  nodesById: Map<string, GraphNode>
  neighbors: Map<string, string[]>
  onClose: () => void
}) {
  const requestFocus = useGraphStore((s) => s.requestFocus)
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, onClose])
  if (!menu) return null
  const node = nodesById.get(menu.nodeId)
  if (!node) return null
  const related = (neighbors.get(menu.nodeId) ?? [])
    .map((id) => nodesById.get(id)).filter(Boolean) as GraphNode[]
  // keep within viewport
  const left = Math.min(menu.x, window.innerWidth - 240)
  const top = Math.min(menu.y, window.innerHeight - 320)
  return (
    <div className="cm" style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>
      <div className="cm-head"><NodeIcon id={node.id} domain={node.domain} size={16} /> {node.label}</div>
      <div className="cm-sub">연결된 개념</div>
      {related.length === 0 && <div className="cm-empty">연결된 개념 없음</div>}
      {related.map((r) => (
        <button key={r.id} className="cm-item" onClick={() => { requestFocus(r.id); onClose() }}>
          <NodeIcon id={r.id} domain={r.domain} size={15} />
          <span>{r.label}</span>
        </button>
      ))}
    </div>
  )
}
