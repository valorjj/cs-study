import { useCallback, useMemo, useRef } from 'react'
import { LuChevronLeft, LuBookOpen } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { useNote } from '../hooks/useNote'
import { useActiveHeading } from '../hooks/useActiveHeading'
import { TreeSidebar } from './TreeSidebar'
import { NoteDocument } from './NoteDocument'
import { OutlineRail } from './OutlineRail'
import type { TreeNode } from '../lib/tree'
import type { GraphEdge, GraphNode } from '../graph/types'
import './DocsView.css'

// List (docs) mode. Three columns: the concept tree, the document at a fixed
// reading measure, and the outline rail. The rail folds into the document at
// 1200px and the tree becomes a full-screen list at 768px.
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
      {node ? (
        <Reading key={node.id} node={node} nodesById={nodesById} neighbors={neighbors}
          onBack={() => select(null)} />
      ) : (
        <div className="docs-empty">
          <LuBookOpen size={38} />
          <p>왼쪽 목록에서 주제를 선택하세요.</p>
        </div>
      )}
    </div>
  )
}

// Keyed on node id by the parent, so the scroll position and the outline reset
// cleanly when the reader moves to another concept.
function Reading({ node, nodesById, neighbors, onBack }: {
  node: GraphNode
  nodesById: Map<string, GraphNode>
  neighbors: Map<string, string[]>
  onBack: () => void
}) {
  const note = useNote(node)
  const scrollRef = useRef<HTMLDivElement>(null)
  const slugs = useMemo(() => note.outline.map((o) => o.slug), [note.outline])
  const activeSlug = useActiveHeading(scrollRef, slugs)

  const domainLabel = useMemo(() => {
    for (const n of nodesById.values()) if (n.level === 0 && n.domain === node.domain) return n.label
    return node.domain
  }, [nodesById, node.domain])

  const related = useMemo(
    () => (neighbors.get(node.id) ?? [])
      .map((id) => nodesById.get(id))
      .filter((n): n is GraphNode => !!n),
    [neighbors, nodesById, node.id])

  const jumpTo = useCallback((slug: string) => {
    scrollRef.current?.querySelector(`[id="${CSS.escape(slug)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const rail = (variant: 'rail' | 'inline') => (
    <OutlineRail variant={variant} node={node} outline={note.outline}
      activeSlug={activeSlug} onJump={jumpTo} related={related} />
  )

  return (
    <>
      <div className="docs-doc">
        <button className="docs-back" onClick={onBack}>
          <LuChevronLeft size={16} /> 목록
        </button>
        <NoteDocument node={node} note={note} domainLabel={domainLabel}
          scrollRef={scrollRef} meta={rail('inline')} />
      </div>
      <div className="docs-rail">{rail('rail')}</div>
    </>
  )
}
