import { useEffect, useMemo, useState } from 'react'
import { parseNoteRef, parseSections } from '../lib/notes'
import type { GraphNode } from '../graph/types'

export interface NoteContext {
  domain: string
  nodeId: string
  nodeLabel: string
  key: string
}

// Shared note loader for the quiz tab. Fetches every concept note once, then
// `buildItems(extract)` runs any per-section extractor (flashcard items, drill
// chains, …) and tags each result with the owning node's domain/id/label so the
// views don't duplicate the fetch + node-mapping logic.
export function useNotePool(nodes: GraphNode[]): {
  loading: boolean
  buildItems: <T extends object>(extract: (body: string) => T[]) => Array<T & NoteContext>
} {
  const maps = useMemo(() => {
    const concept = nodes.filter((n) => n.level !== 0 && n.noteRef)
    const domainNode = new Map(nodes.filter((n) => n.level === 0).map((n) => [n.domain, n]))
    const anchorMap = new Map<string, Map<string, GraphNode>>()
    const fileDomain = new Map<string, string>()
    for (const n of concept) {
      const { path, anchor } = parseNoteRef(n.noteRef!)
      fileDomain.set(path, n.domain)
      if (!anchor) continue
      if (!anchorMap.has(path)) anchorMap.set(path, new Map())
      anchorMap.get(path)!.set(anchor, n)
    }
    const files = [...new Set(concept.map((n) => parseNoteRef(n.noteRef!).path))]
    return { domainNode, anchorMap, fileDomain, files }
  }, [nodes])

  const [results, setResults] = useState<ReadonlyArray<readonly [string, string]> | null>(null)

  useEffect(() => {
    let cancelled = false
    setResults(null)
    Promise.all(
      maps.files.map((f) =>
        fetch(f).then((r) => (r.ok ? r.text() : '')).catch(() => '').then((md) => [f, md] as const),
      ),
    ).then((res) => { if (!cancelled) setResults(res) })
    return () => { cancelled = true }
  }, [maps])

  const buildItems = useMemo(() => {
    return function <T extends object>(extract: (body: string) => T[]): Array<T & NoteContext> {
      if (!results) return []
      const out: Array<T & NoteContext> = []
      for (const [path, md] of results) {
        if (!md) continue
        const { sections } = parseSections(md)
        for (const s of sections) {
          const raws = extract(s.body)
          if (!raws.length) continue
          const owner = maps.anchorMap.get(path)?.get(s.slug)
          const domain = owner?.domain ?? maps.fileDomain.get(path) ?? ''
          const dn = maps.domainNode.get(domain)
          const nodeId = owner?.id ?? dn?.id ?? ''
          const nodeLabel = owner?.label ?? dn?.label ?? domain
          raws.forEach((r, i) =>
            out.push({ ...r, domain, nodeId, nodeLabel, key: `${path}#${s.slug}#${i}` }),
          )
        }
      }
      return out
    }
  }, [results, maps])

  return { loading: results === null, buildItems }
}
