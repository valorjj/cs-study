import type { ViewMode, QuizMode } from '../store/graphStore'

// The app's URL grammar (hash-based, no router dependency):
//   #/home  #/guide
//   #/graph  #/graph/<nodeId>
//   #/list   #/list/<nodeId>
//   #/path/<trackId>        e.g. #/path/curated:junior-backend
//   #/quiz/<mode>           mode ∈ flash | drill | review | graph
// Segments are left unencoded on purpose: node ids are [a-z0-9-] slugs and ':'
// is legal in a fragment, so the URLs stay readable.
export interface Route {
  view: ViewMode
  nodeId: string | null
  trackId: string | null
  quizMode: QuizMode
}

// The set of ids a hash is allowed to name. Built once from graph.json by the
// caller so this module stays pure and cheap to test.
export interface RouteVocab {
  nodeIds: Set<string>
  trackIds: Set<string>
}

export const DEFAULT_ROUTE: Route = { view: 'home', nodeId: null, trackId: null, quizMode: 'flash' }

const VIEWS: readonly string[] = ['home', 'graph', 'list', 'quiz', 'path', 'guide']
const QUIZ_MODES: readonly string[] = ['flash', 'drill', 'review', 'graph']

// Total function: never throws, always returns a valid Route. Anything the
// grammar doesn't recognise degrades to the nearest valid state (unknown view
// → home, unknown id → no selection) rather than rendering a broken screen.
export function parseHash(hash: string, vocab: RouteVocab): Route {
  const parts = hash.replace(/^#/, '').split('/').filter(Boolean)
  const view = parts[0]
  const arg = parts[1]
  if (!view || !VIEWS.includes(view)) return { ...DEFAULT_ROUTE }
  const route: Route = { ...DEFAULT_ROUTE, view: view as ViewMode }
  if (view === 'graph' || view === 'list') {
    route.nodeId = arg && vocab.nodeIds.has(arg) ? arg : null
  } else if (view === 'path') {
    route.trackId = arg && vocab.trackIds.has(arg) ? arg : null
  } else if (view === 'quiz') {
    route.quizMode = arg && QUIZ_MODES.includes(arg) ? (arg as QuizMode) : 'flash'
  }
  return route
}

// Inverse of parseHash for every reachable state. formatHash(parseHash(h)) is a
// fixed point, which is what lets useUrlSync compare against location.hash to
// decide whether a push is needed.
export function formatHash(route: Route): string {
  switch (route.view) {
    case 'graph':
    case 'list':
      return route.nodeId ? `#/${route.view}/${route.nodeId}` : `#/${route.view}`
    case 'path':
      return route.trackId ? `#/path/${route.trackId}` : '#/path'
    case 'quiz':
      return `#/quiz/${route.quizMode}`
    default:
      return `#/${route.view}`
  }
}
