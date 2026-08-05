import { useEffect } from 'react'
import graphData from '../graph/graph.json'
import type { GraphData } from '../graph/types'
import { ALL_TRACKS } from '../lib/tracks'
import { parseHash, formatHash, type Route, type RouteVocab } from '../lib/route'
import { useGraphStore } from '../store/graphStore'
import { VIEW_KEY } from './useTheme'

const data = graphData as GraphData

// Built once at module load: graph.json is static and already bundled, so the
// vocab is available synchronously and a deep link needs no async gate to
// validate. Route application itself still happens in useEffect below, i.e.
// after the first paint — a deep link briefly paints the default view first.
// ALL_TRACKS is itself module-load-once (shared with PathView), so this adds
// no extra buildTree pass.
const VOCAB: RouteVocab = {
  nodeIds: new Set(data.nodes.map((n) => n.id)),
  trackIds: new Set(ALL_TRACKS.map((t) => t.id)),
}

// Which store fields ride in the URL, per view. Everything else (theme,
// progress, quiz settings) is preference state and belongs in localStorage.
function routeFromState(s: ReturnType<typeof useGraphStore.getState>): Route {
  return {
    view: s.viewMode, nodeId: s.selectedId, trackId: s.trackId, quizMode: s.quizMode,
    projectId: s.activeProjectId,
  }
}

// parseHash defaults quizMode to 'flash' for every non-quiz view (it's not part
// of that view's URL), so only write it when the route actually names a quiz
// mode — otherwise navigating away from and back to the quiz tab would reset
// the user's chosen sub-mode. activeProjectId follows the same rule: it's
// route state that lives in graphStore (like trackId/quizMode), not vault
// state, so it belongs in this one atomic setState — a second store writing
// on a separate notification would let the subscriber below fire on a stale
// snapshot mid-transition (see useUrlSync.test.ts's resume-navigation case).
function applyRoute(r: Route): void {
  useGraphStore.setState({
    viewMode: r.view,
    selectedId: r.nodeId,
    trackId: r.trackId,
    ...(r.view === 'quiz' ? { quizMode: r.quizMode } : {}),
    // resume 뷰가 아닐 때 activeProjectId를 지우지 않는다 — 노트를 보고 돌아왔을 때
    // 열려 있던 프로젝트로 복귀해야 한다(Task 7). URL에 안 실릴 뿐이다.
    ...(r.view === 'resume' ? { activeProjectId: r.projectId } : {}),
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
// in this codebase that touches window.history — but not the only code that
// mutates the fragment: @supabase/auth-js also replaceStates (PKCE) or clears
// window.location.hash (implicit flow) after an OAuth redirect, which is
// exactly the non-canonical-entry case handled below.
//
// Loop guard: just the string compare in the subscriber below. Applying a
// route to the store makes formatHash(state) equal location.hash, so the
// push is skipped — but only if location.hash was already canonical. On
// popstate/hashchange it might not be (a non-canonical entry from a manual
// address-bar edit, or Supabase's implicit-flow hash clear), so we
// canonicalise the URL with replaceState BEFORE applying the route: that
// keeps the string compare true instead of suppressing it. No flags, no refs.
export function useUrlSync(): void {
  useEffect(() => {
    const route = parseHash(initialHash(), VOCAB)
    applyRoute(route)
    // replaceState, not push: entering the app shouldn't leave a stale entry
    // behind, and it keeps StrictMode's double-mount idempotent.
    window.history.replaceState(null, '', formatHash(route))

    // Handles both popstate (Back/Forward) and hashchange (manual address-bar
    // edits, and Supabase's implicit-flow `window.location.hash = ''` after
    // consuming the OAuth token fragment — hashchange fires but popstate does
    // not). Order matters: replaceState must run before applyRoute, because
    // the store subscriber below runs synchronously inside applyRoute's
    // setState and reads window.location.hash to decide whether to push.
    const applyFromUrl = () => {
      const r = parseHash(window.location.hash, VOCAB)
      const canon = formatHash(r)
      if (canon !== window.location.hash) window.history.replaceState(null, '', canon)
      applyRoute(r)
    }
    window.addEventListener('popstate', applyFromUrl)
    window.addEventListener('hashchange', applyFromUrl)

    const unsubscribe = useGraphStore.subscribe(() => {
      const next = formatHash(routeFromState(useGraphStore.getState()))
      if (next !== window.location.hash) window.history.pushState(null, '', next)
    })

    return () => {
      window.removeEventListener('popstate', applyFromUrl)
      window.removeEventListener('hashchange', applyFromUrl)
      unsubscribe()
    }
  }, [])
}
