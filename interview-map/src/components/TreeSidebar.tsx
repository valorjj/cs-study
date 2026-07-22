import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { LuChevronRight, LuCheck } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { ancestorsOf, type TreeNode } from '../lib/tree'
import { domainProgress } from '../lib/tracks'
import { domainColor } from '../styles/theme'
import { NodeIcon } from './NodeIcon'
import type { GraphEdge, GraphNode } from '../graph/types'
import './TreeSidebar.css'

type DomainProg = Map<string, { done: number; total: number }>

function Row({ item, depth, expanded, toggle, rowRef, studied, domainProg }: {
  item: TreeNode
  depth: number
  expanded: Set<string>
  toggle: (id: string) => void
  rowRef: (id: string, el: HTMLButtonElement | null) => void
  studied: Set<string>
  domainProg: DomainProg
}) {
  const selectedId = useGraphStore((s) => s.selectedId)
  const select = useGraphStore((s) => s.select)
  const { node, children } = item
  const hasChildren = children.length > 0
  const hasNote = !!node.noteRef
  const isOpen = expanded.has(node.id)
  const color = domainColor(node.domain)
  const isDone = studied.has(node.id)
  const prog = depth === 0 ? domainProg.get(node.domain) : undefined

  const onRowClick = () => {
    if (hasNote) select(node.id)
    else if (hasChildren) toggle(node.id)
  }

  return (
    <>
      <button
        ref={(el) => rowRef(node.id, el)}
        className="tsb-row"
        data-selected={selectedId === node.id}
        data-domain={depth === 0}
        style={{ '--c': color, '--depth': depth } as CSSProperties}
        onClick={onRowClick}
      >
        <span
          className="tsb-caret"
          data-open={isOpen}
          data-has={hasChildren}
          onClick={(e) => { if (hasChildren) { e.stopPropagation(); toggle(node.id) } }}
        >
          {hasChildren && <LuChevronRight size={14} />}
        </span>
        <span className="tsb-icon"><NodeIcon id={node.id} domain={node.domain} size={depth === 0 ? 18 : 15} /></span>
        <span className="tsb-label">{node.label}</span>
        {prog && prog.done > 0 && <span className="tsb-count">{prog.done}/{prog.total}</span>}
        {isDone && <span className="tsb-check" aria-label="완료"><LuCheck size={11} strokeWidth={3} /></span>}
      </button>
      {hasChildren && isOpen && children.map((c) => (
        <Row key={c.node.id} item={c} depth={depth + 1} expanded={expanded} toggle={toggle} rowRef={rowRef} studied={studied} domainProg={domainProg} />
      ))}
    </>
  )
}

export function TreeSidebar({ tree, edges }: { tree: TreeNode[]; edges: GraphEdge[] }) {
  const selectedId = useGraphStore((s) => s.selectedId)
  const studiedIds = useGraphStore((s) => s.studiedIds)
  const studied = useMemo(() => new Set(studiedIds), [studiedIds])
  const domainProg = useMemo(() => {
    const all: GraphNode[] = []
    const walk = (t: TreeNode) => { all.push(t.node); t.children.forEach(walk) }
    tree.forEach(walk)
    return domainProgress(all, studied)
  }, [tree, studied])
  // Domains (level 0) start expanded so the manual reads top-down at a glance.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.map((t) => t.node.id)))
  const rows = useRef(new Map<string, HTMLButtonElement>())

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const rowRef = (id: string, el: HTMLButtonElement | null) => {
    if (el) rows.current.set(id, el); else rows.current.delete(id)
  }

  // Auto-expand ancestors of the selection (e.g. search into a nested node),
  // then scroll it into view.
  useEffect(() => {
    if (!selectedId) return
    const anc = ancestorsOf(selectedId, edges)
    if (anc.length) setExpanded((prev) => new Set([...prev, ...anc]))
    // scroll after the expand has a chance to render
    const raf = requestAnimationFrame(() =>
      rows.current.get(selectedId)?.scrollIntoView({ block: 'nearest' }))
    return () => cancelAnimationFrame(raf)
  }, [selectedId, edges])

  return (
    <nav className="tsb" aria-label="주제 목록">
      {tree.map((t) => (
        <Row key={t.node.id} item={t} depth={0} expanded={expanded} toggle={toggle} rowRef={rowRef} studied={studied} domainProg={domainProg} />
      ))}
    </nav>
  )
}
