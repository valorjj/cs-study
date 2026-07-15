import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import { useGraphStore } from '../store/graphStore'
import { parseNoteRef } from '../lib/notes'
import { domainColor } from '../styles/theme'
import type { GraphNode } from '../graph/types'
import './NotePanel.css'

export function NotePanel({ nodesById, neighbors }: {
  nodesById: Map<string, GraphNode>
  neighbors: Map<string, string[]>
}) {
  const selectedId = useGraphStore((s) => s.selectedId)
  const select = useGraphStore((s) => s.select)
  const trackingOn = useGraphStore((s) => s.trackingOn)
  const visited = useGraphStore((s) => s.visited)
  const toggleVisited = useGraphStore((s) => s.toggleVisited)
  const node = selectedId ? nodesById.get(selectedId) : undefined
  const [md, setMd] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setMd(null)
    if (!node?.noteRef) return
    let cancelled = false
    const { path, anchor } = parseNoteRef(node.noteRef)
    setLoading(true)
    fetch(path)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (cancelled) return
        setMd(text)
        if (anchor) requestAnimationFrame(() =>
          document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' }))
      })
      .catch(() => { if (!cancelled) setMd(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [node?.noteRef])

  if (!node) return null
  const color = domainColor(node.domain)
  const related = (neighbors.get(node.id) ?? []).map((id) => nodesById.get(id)).filter(Boolean) as GraphNode[]

  return (
    <aside className="np-panel">
      <button className="np-close" onClick={() => select(null)} aria-label="close">×</button>
      <header className="np-head" style={{ borderColor: color }}>
        <span className="np-icon">{node.icon}</span>
        <h2>{node.label}</h2>
        <span className="np-status" data-status={node.status}>{node.status}</span>
      </header>
      <p className="np-summary">{node.summary}</p>
      {trackingOn && (
        <button
          className="np-study-toggle"
          data-visited={!!visited[node.id]}
          onClick={() => toggleVisited(node.id)}
        >
          {visited[node.id] ? '공부함 (해제)' : '공부함으로 표시'}
        </button>
      )}
      {node.keywords.length > 0 && (
        <div className="np-keywords">{node.keywords.map((k) => <span key={k}>{k}</span>)}</div>
      )}
      {related.length > 0 && (
        <div className="np-related">
          <h3>연결된 개념</h3>
          <div className="np-chips">
            {related.map((r) => (
              <button key={r.id} className="np-chip" style={{ borderColor: domainColor(r.domain) }}
                onClick={() => select(r.id)}>{r.icon} {r.label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="np-note">
        {loading && <p className="np-dim">노트 불러오는 중…</p>}
        {!loading && md && (
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>{md}</Markdown>
        )}
        {!loading && !md && node.noteRef && <p className="np-dim">노트를 불러오지 못했습니다.</p>}
        {!node.noteRef && <p className="np-dim">아직 노트가 없는 개념입니다.</p>}
      </div>
    </aside>
  )
}
