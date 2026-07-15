import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeRaw from 'rehype-raw'
import { useGraphStore } from '../store/graphStore'
import { parseNoteRef, parseSections } from '../lib/notes'
import { rehypeFoldQA } from '../lib/rehypeFoldQA'
import { domainColor } from '../styles/theme'
import type { GraphNode } from '../graph/types'
import { NodeIcon } from './NodeIcon'
import './NotePanel.css'

// Note renderer shared by the graph-mode overlay (NotePanel) and the list-mode
// docs pane (DocsView): fetches the note markdown, splits it into section tabs,
// renders quiz <details> folds, and shows related-concept (crosslink) chips.
export function NoteView({ node, nodesById, neighbors }: {
  node: GraphNode
  nodesById: Map<string, GraphNode>
  neighbors: Map<string, string[]>
}) {
  const select = useGraphStore((s) => s.select)
  const [md, setMd] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // User-picked tab, scoped to a node id so it never bleeds across notes
  // (all notes share the "핵심-질문-quiz" slug). null → follow the default.
  const [override, setOverride] = useState<{ id: string; slug: string } | null>(null)

  useEffect(() => {
    setMd(null)
    if (!node.noteRef) { setLoading(false); return }
    let cancelled = false
    const { path } = parseNoteRef(node.noteRef)
    setLoading(true)
    fetch(path)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => { if (!cancelled) setMd(text) })
      .catch(() => { if (!cancelled) setMd(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [node.noteRef])

  const parsed = useMemo(() => (md ? parseSections(md) : null), [md])

  const color = domainColor(node.domain)
  const related = (neighbors.get(node.id) ?? []).map((id) => nodesById.get(id)).filter(Boolean) as GraphNode[]
  const sections = parsed?.sections ?? []

  // Default tab (derived synchronously — no post-paint flash): the noteRef
  // anchor's section if it matches, else the first section.
  const anchor = node.noteRef ? parseNoteRef(node.noteRef).anchor : null
  const defaultSlug = (anchor && sections.find((s) => s.slug === anchor)?.slug) || sections[0]?.slug || null
  const activeSlug = (override && override.id === node.id && sections.some((s) => s.slug === override.slug))
    ? override.slug : defaultSlug
  const active = sections.find((s) => s.slug === activeSlug) ?? sections[0]

  return (
    <>
      <div className="np-top">
        <header className="np-head" style={{ borderColor: color }}>
          <span className="np-icon"><NodeIcon id={node.id} domain={node.domain} size={22} /></span>
          <h2>{node.label}</h2>
        </header>
        <p className="np-summary">{node.summary}</p>
        {node.keywords.length > 0 && (
          <div className="np-keywords">{node.keywords.map((k) => <span key={k}>{k}</span>)}</div>
        )}
        {related.length > 0 && (
          <div className="np-related">
            <h3>연결된 개념</h3>
            <div className="np-chips">
              {related.map((r) => (
                <button key={r.id} className="np-chip" style={{ borderColor: domainColor(r.domain) }}
                  onClick={() => select(r.id)}><NodeIcon id={r.id} domain={r.domain} size={15} /> {r.label}</button>
              ))}
            </div>
          </div>
        )}
        {sections.length > 1 && (
          <nav className="np-tabs" aria-label="노트 섹션">
            {sections.map((s) => (
              <button
                key={s.slug}
                className="np-tab"
                data-active={s.slug === active?.slug}
                style={{ '--c': color } as CSSProperties}
                onClick={() => setOverride({ id: node.id, slug: s.slug })}
              >
                {s.heading}
              </button>
            ))}
          </nav>
        )}
      </div>
      <div className="np-note" key={`${node.id}:${active?.slug ?? 'none'}`}>
        {loading && <p className="np-dim">노트 불러오는 중…</p>}
        {!loading && active && (
          <>
            <h2 className="np-section-title">{active.heading}</h2>
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeFoldQA, rehypeSlug]}>{active.body}</Markdown>
          </>
        )}
        {!loading && md && sections.length === 0 && (
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeFoldQA, rehypeSlug]}>{md}</Markdown>
        )}
        {!loading && !md && node.noteRef && <p className="np-dim">노트를 불러오지 못했습니다.</p>}
        {!loading && !node.noteRef && <p className="np-dim">아직 노트가 없는 개념입니다.</p>}
      </div>
    </>
  )
}
