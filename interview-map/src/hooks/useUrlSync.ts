import { useEffect } from 'react'
import graphData from '../graph/graph.json'
import type { GraphData } from '../graph/types'
import { CURATED_TRACKS } from '../graph/tracks'
import { buildDomainTracks } from '../lib/tracks'
import { parseHash, formatHash, type Route, type RouteVocab } from '../lib/route'
import { useGraphStore } from '../store/graphStore'
import { VIEW_KEY } from './useTheme'

const data = graphData as GraphData

// Built once at module load: graph.json is static and already bundled, so a
// deep link can be validated synchronously before the first paint.
const VOCAB: RouteVocab = {
  nodeIds: new Set(data.nodes.map((n) => n.id)),
  trackIds: new Set([...CURATED_TRACKS, ...buildDomainTracks(data.nodes, data.edges)].map((t) => t.id)),
}

// Which store fields ride in the URL, per view. Everything else (theme,
// progress, quiz settings) is preference state and belongs in localStorage.
function routeFromState(s: ReturnType<typeof useGraphStore.getState>): Route {
  return { view: s.viewMode, nodeId: s.selectedId, trackId: s.trackId, quizMode: s.quizMode }
}

function applyRoute(r: Route): void {
  useGraphStore.setState({
    viewMode: r.view,
    selectedId: r.nodeId,
    trackId: r.trackId,
    quizMode: r.quizMode,
    focusRequestId: null,
  })
}

// A bare visit ('' or '#') has no route to restore, so fall back to the tab the
// user was last on — the behaviour useTheme's hydrate effect used to provide.
function initialHash(): string {
  const raw = window.location.hash
  if (raw.replace(/^#\/?/, '') !== '') return raw
  const saved = localStorage.getItem(VIEW_KEY)
  return saved ? `#/${saved}` : ''
}

// Two-way bridge between the store and the browser's history. The ONLY place
// that touches window.history.
//
// Loop guard: just the string compare below. On popstate location.hash has
// already changed, so applying it to the store makes formatHash(state) equal
// location.hash and the push is skipped. No flags, no refs.
export function useUrlSync(): void {
  useEffect(() => {
    const route = parseHash(initialHash(), VOCAB)
    applyRoute(route)
    // replaceState, not push: entering the app shouldn't leave a stale entry
    // behind, and it keeps StrictMode's double-mount idempotent.
    window.history.replaceState(null, '', formatHash(route))

    const onPop = () => applyRoute(parseHash(window.location.hash, VOCAB))
    window.addEventListener('popstate', onPop)

    const unsubscribe = useGraphStore.subscribe(() => {
      const next = formatHash(routeFromState(useGraphStore.getState()))
      if (next !== window.location.hash) window.history.pushState(null, '', next)
    })

    return () => {
      window.removeEventListener('popstate', onPop)
      unsubscribe()
    }
  }, [])
}
