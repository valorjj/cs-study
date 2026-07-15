import { LuChevronLeft, LuBookOpen } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { TreeSidebar } from './TreeSidebar'
import { NoteView } from './NoteView'
import type { TreeNode } from '../lib/tree'
import type { GraphEdge, GraphNode } from '../graph/types'
import './DocsView.css'

// List (docs) mode: hierarchical tree on the left, note content on the right.
// On mobile it collapses to a tree ↔ note toggle driven by data-selected.
export function DocsView({ tree, edges, nodesById, neighbors }: {
  tree: TreeNode[]
  edges: GraphEdge[]
  nodesById: Map<string, GraphNode>
  neighbors: Map<string, string[]>
}) {
  const selectedId = useGraphStore((s) => s.selectedId)
  const select = useGraphStore((s) => s.select)
  const node = selectedId ? nodesById.get(selectedId) : undefined

  return (
    <div className="docs" data-selected={!!node}>
      <div className="docs-tree">
        <TreeSidebar tree={tree} edges={edges} />
      </div>
      <div className="docs-content">
        <button className="docs-back" onClick={() => select(null)}>
          <LuChevronLeft size={16} /> 목록
        </button>
        {node ? (
          <NoteView node={node} nodesById={nodesById} neighbors={neighbors} />
        ) : (
          <div className="docs-empty">
            <LuBookOpen size={40} />
            <p>왼쪽 목록에서 주제를 선택하세요.</p>
          </div>
        )}
      </div>
    </div>
  )
}
