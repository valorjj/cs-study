import { useMemo, type ReactNode, type RefObject } from 'react'
import Markdown from 'react-markdown'
import rehypeSlug from 'rehype-slug'
import rehypeRaw from 'rehype-raw'
import { remarkPlugins } from '../lib/markdownPlugins'
import { markdownComponents } from '../lib/markdownComponents'
import { rehypeFoldQA } from '../lib/rehypeFoldQA'
import { domainColor } from '../styles/theme'
import { NodeIcon } from './NodeIcon'
import type { LoadedNote } from '../hooks/useNote'
import type { GraphNode } from '../graph/types'
import '../styles/prose.css'
import './NoteDocument.css'

const rehypePlugins = [rehypeRaw, rehypeFoldQA, rehypeSlug]

// The reading column: eyebrow, title, lede, then the body at a fixed measure.
//
// The old layout stacked five bands of chrome — title, summary, keyword chips,
// related-concept chips and a 20-item wrapping outline strip — before the first
// word of content, about 250px. Keywords, crosslinks and the read toggle now
// live in the outline rail (desktop) or a fold under the lede (narrow), so a
// note opens on its own first sentence.
export function NoteDocument({ node, note, domainLabel, scrollRef, meta }: {
  node: GraphNode
  note: LoadedNote
  domainLabel?: string
  scrollRef?: RefObject<HTMLDivElement | null>
  /** Outline/keyword card shown here when the layout has no room for a rail. */
  meta?: ReactNode
}) {
  const { loading, md, active, unsectioned } = note
  const color = domainColor(node.domain)
  // Remount the prose on note change so rehype-slug's dedup counters and any
  // open <details> folds don't carry over from the previous concept.
  const bodyKey = `${node.id}:${active?.slug ?? 'whole'}`

  const body = useMemo(() => {
    if (loading) return <p className="doc-dim">노트 불러오는 중…</p>
    if (active) {
      return (
        <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={markdownComponents}>
          {active.body}
        </Markdown>
      )
    }
    if (unsectioned && md) {
      return (
        <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={markdownComponents}>
          {md}
        </Markdown>
      )
    }
    if (node.noteRef) return <p className="doc-dim">노트를 불러오지 못했습니다.</p>
    return <p className="doc-dim">아직 노트가 없는 개념입니다.</p>
  }, [loading, active, unsectioned, md, node.noteRef])

  return (
    <div className="doc-scroll" ref={scrollRef}>
      <article className="doc">
        <header className="doc-head">
          <div className="doc-eyebrow" style={{ ['--c' as string]: color }}>
            <NodeIcon id={node.id} domain={node.domain} size={15} />
            <span>{domainLabel ?? node.domain}</span>
          </div>
          <h1 className="doc-title">{node.label}</h1>
          {node.summary && <p className="doc-lede">{node.summary}</p>}
        </header>
        {meta}
        <div className="prose" key={bodyKey}>{body}</div>
      </article>
    </div>
  )
}
