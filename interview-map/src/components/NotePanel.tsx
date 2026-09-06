import { useCallback, useMemo, useRef } from 'react'
import { useGraphStore } from '../store/graphStore'
import { useNote } from '../hooks/useNote'
import { useActiveHeading } from '../hooks/useActiveHeading'
import { NoteDocument } from './NoteDocument'
import { OutlineRail } from './OutlineRail'
import type { GraphNode } from '../graph/types'
import './NotePanel.css'

// Graph-mode overlay: a panel over the right of the canvas wrapping the same
// document component list mode uses. It is `position: absolute` inside the
// shell's main cell rather than `fixed` to the viewport, so it starts below the
// top bar instead of under it.
export function NotePanel({ nodesById, neighbors }: {
  nodesById: Map<string, GraphNode>
  neighbors: Map<string, string[]>
}) {
  const selectedId = useGraphStore((s) => s.selectedId)
  const viewMode = useGraphStore((s) => s.viewMode)
  const node = selectedId ? nodesById.get(selectedId) : undefined
  if (viewMode !== 'graph' || !node) return null
  return <Panel key={node.id} node={node} nodesById={nodesById} neighbors={neighbors} />
}

function Panel({ node, nodesById, neighbors }: {
  node: GraphNode
  nodesById: Map<string, GraphNode>
  neighbors: Map<string, string[]>
}) {
  const select = useGraphStore((s) => s.select)
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

  return (
    <aside className="np-panel">
      <button className="np-close" onClick={() => select(null)} aria-label="닫기">×</button>
      <NoteDocument node={node} note={note} domainLabel={domainLabel} scrollRef={scrollRef}
        meta={<OutlineRail variant="inline" node={node} outline={note.outline}
          activeSlug={activeSlug} onJump={jumpTo} related={related} />} />
    </aside>
  )
}
