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
  projectId: string | null
  quizMode: QuizMode
}

// The set of ids a hash is allowed to name. Built once from graph.json by the
// caller so this module stays pure and cheap to test.
export interface RouteVocab {
  nodeIds: Set<string>
  trackIds: Set<string>
}

export const DEFAULT_ROUTE: Route = {
  view: 'home', nodeId: null, trackId: null, projectId: null, quizMode: 'flash',
}

const VIEWS: readonly string[] = ['home', 'graph', 'list', 'quiz', 'path', 'guide', 'resume']
const QUIZ_MODES: readonly string[] = ['flash', 'drill', 'review', 'graph']

// 프로젝트 id는 crypto.randomUUID() 결과다. VOCAB으로 검증할 수 없다(잠긴 금고의
// id 목록을 모른다) → 형식만 확인한다. 형식 검사는 보안 장치가 아니라, 주소창에
// 손으로 넣은 쓰레기가 store에 들어가지 않게 하는 위생 장치다.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  } else if (view === 'resume') {
    route.projectId = arg && UUID_RE.test(arg) ? arg : null
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
    case 'resume':
      return route.projectId ? `#/resume/${route.projectId}` : '#/resume'
    default:
      return `#/${route.view}`
  }
}
