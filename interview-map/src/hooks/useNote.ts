import { useEffect, useMemo, useState } from 'react'
import { parseNoteRef, parseSections, extractOutline, type NoteSection, type OutlineItem } from '../lib/notes'
import type { GraphNode } from '../graph/types'

export interface LoadedNote {
  loading: boolean
  /** Raw markdown, or null when there is no note or the fetch failed. */
  md: string | null
  /** The one section this node anchors to; falls back to the first section. */
  active: NoteSection | undefined
  /** H2/H3 sub-headings of the active section, in document order. */
  outline: OutlineItem[]
  /** True when the note loaded but has no H1 sections (render it whole). */
  unsectioned: boolean
}

/**
 * Loads and parses the markdown behind a concept node.
 *
 * Lifted out of the old NoteView so the document body and the outline rail can
 * live in different columns of the reading layout while sharing one fetch.
 */
export function useNote(node: GraphNode): LoadedNote {
  const [md, setMd] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
  const sections = parsed?.sections ?? []

  const anchor = node.noteRef ? parseNoteRef(node.noteRef).anchor : null
  const active = (anchor && sections.find((s) => s.slug === anchor)) || sections[0]
  const outline = useMemo(() => (active ? extractOutline(active.body) : []), [active])

  return { loading, md, active, outline, unsectioned: !!md && sections.length === 0 }
}
