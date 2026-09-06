import { LuCheck } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { domainColor } from '../styles/theme'
import { NodeIcon } from './NodeIcon'
import type { OutlineItem } from '../lib/notes'
import type { GraphNode } from '../graph/types'
import './OutlineRail.css'

/**
 * Everything that used to sit between the title and the first sentence.
 *
 * The section outline was a `flex-wrap` cloud of ~20 pills that took two rows
 * and read as noise; vertical it reads as a table of contents, and there is
 * room to mark where the reader currently is. Keywords, crosslinks and the read
 * toggle follow it — off the reading path but always in view.
 *
 * `variant` places the same content in the two slots the layout has room for:
 * a standing column on wide screens, or a card above the body when the third
 * column is dropped. Exactly one is ever displayed (see OutlineRail.css), so
 * rendering both costs no duplicate content to a screen reader.
 */
export function OutlineRail({ node, outline, activeSlug, onJump, related, variant = 'rail' }: {
  node: GraphNode
  outline: OutlineItem[]
  activeSlug: string | null
  onJump: (slug: string) => void
  related: GraphNode[]
  variant?: 'rail' | 'inline'
}) {
  const select = useGraphStore((s) => s.select)
  const studiedIds = useGraphStore((s) => s.studiedIds)
  const toggleStudied = useGraphStore((s) => s.toggleStudied)
  const isDone = studiedIds.includes(node.id)
  const color = domainColor(node.domain)

  const items = outline.map((o) => (
    <button
      key={o.slug}
      className="orail-item"
      data-sub={o.depth === 3}
      data-active={o.slug === activeSlug}
      onClick={() => onJump(o.slug)}
    >
      {o.text}
    </button>
  ))

  return (
    <aside className="orail" data-variant={variant} style={{ ['--c' as string]: color }}
      aria-label="문서 정보">
      <button className="orail-done" data-done={isDone} aria-pressed={isDone}
        onClick={() => toggleStudied(node.id)}>
        <LuCheck size={14} strokeWidth={2.5} /> {isDone ? '읽음 완료' : '읽음 표시'}
      </button>

      {outline.length >= 2 && (
        variant === 'rail' ? (
          <nav className="orail-toc" aria-label="섹션 목차">
            <h2 className="orail-h">이 문서</h2>
            {items}
          </nav>
        ) : (
          // Folded when it shares the reading column — 20 open items here would
          // recreate the wall of chrome this redesign removed.
          <details className="orail-fold">
            <summary>이 문서 · {outline.length}개 섹션</summary>
            <nav className="orail-toc" aria-label="섹션 목차">{items}</nav>
          </details>
        )
      )}

      {node.keywords.length > 0 && (
        <section className="orail-sec">
          <h2 className="orail-h">키워드</h2>
          <div className="orail-keywords">
            {node.keywords.map((k) => <span key={k}>{k}</span>)}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="orail-sec">
          <h2 className="orail-h">연결된 개념</h2>
          <div className="orail-links">
            {related.map((r) => (
              <button key={r.id} className="orail-link"
                style={{ ['--rc' as string]: domainColor(r.domain) }}
                onClick={() => select(r.id)}>
                <NodeIcon id={r.id} domain={r.domain} size={14} />
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </aside>
  )
}
