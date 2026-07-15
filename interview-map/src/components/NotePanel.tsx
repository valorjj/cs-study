import { useGraphStore } from '../store/graphStore'
import { NoteView } from './NoteView'
import type { GraphNode } from '../graph/types'
import './NotePanel.css'

// Graph-mode overlay: a fixed right panel wrapping the shared NoteView.
// Renders only in graph mode; list mode uses DocsView instead.
export function NotePanel({ nodesById, neighbors }: {
  nodesById: Map<string, GraphNode>
  neighbors: Map<string, string[]>
}) {
  const selectedId = useGraphStore((s) => s.selectedId)
  const viewMode = useGraphStore((s) => s.viewMode)
  const select = useGraphStore((s) => s.select)
  const node = selectedId ? nodesById.get(selectedId) : undefined
  if (viewMode !== 'graph' || !node) return null

  return (
    <aside className="np-panel">
      <button className="np-close" onClick={() => select(null)} aria-label="close">×</button>
      <NoteView node={node} nodesById={nodesById} neighbors={neighbors} />
    </aside>
  )
}
