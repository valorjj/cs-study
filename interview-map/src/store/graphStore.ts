import { create } from 'zustand'
import { DEFAULT_THEME } from '../styles/themes'

export type ViewMode = 'graph' | 'list' | 'quiz' | 'path'

// Study-path progress key. Loaded synchronously at store creation so the first
// render already has the saved state — avoids an effect-order hydrate/persist
// race that StrictMode's double-mount would otherwise clobber.
export const PROGRESS_KEY = 'interview-map.progress.v1'
function loadStudied(): string[] {
  try {
    const s = localStorage.getItem(PROGRESS_KEY)
    return s ? (JSON.parse(s) as string[]) : []
  } catch {
    return []
  }
}

export interface QuizStat { correct: number; seen: number }
export const QUIZSTATS_KEY = 'interview-map.quizstats.v1'
function loadQuizStats(): Record<string, QuizStat> {
  try {
    const s = localStorage.getItem(QUIZSTATS_KEY)
    return s ? (JSON.parse(s) as Record<string, QuizStat>) : {}
  } catch {
    return {}
  }
}

interface GraphState {
  selectedId: string | null
  select: (id: string | null) => void
  focusRequestId: string | null   // 카메라 이동 요청 (검색 등)
  requestFocus: (id: string) => void
  clearFocusRequest: () => void
  themeId: string
  setTheme: (id: string) => void
  viewMode: ViewMode              // 지도(graph) vs 목록(list)
  setViewMode: (m: ViewMode) => void
  studiedIds: string[]            // 학습 완료 체크된 노드 (localStorage 저장)
  toggleStudied: (id: string) => void
  setStudiedIds: (ids: string[]) => void
  quizStats: Record<string, QuizStat>       // 도메인별 퀴즈 정답/시도 (localStorage 저장)
  recordQuizResult: (domain: string, correct: boolean) => void
  setQuizStats: (stats: Record<string, QuizStat>) => void
  pathTrackId: string | null                // 퀴즈 약점 칩 → 경로 코스 열기 요청
  requestTrack: (trackId: string) => void
  clearPathTrack: () => void
}

export const useGraphStore = create<GraphState>((set) => ({
  selectedId: null,
  // Clear any pending camera-focus so a stale search target can't hijack the
  // graph camera after the user picks a different node (e.g. in list mode).
  select: (id) => set({ selectedId: id, focusRequestId: null }),
  focusRequestId: null,
  requestFocus: (id) => set({ focusRequestId: id, selectedId: id }),
  clearFocusRequest: () => set({ focusRequestId: null }),
  themeId: DEFAULT_THEME,
  setTheme: (id) => set({ themeId: id }),
  viewMode: 'graph',
  setViewMode: (m) => set({ viewMode: m }),
  studiedIds: loadStudied(),
  toggleStudied: (id) => set((s) => ({
    studiedIds: s.studiedIds.includes(id)
      ? s.studiedIds.filter((x) => x !== id)
      : [...s.studiedIds, id],
  })),
  setStudiedIds: (ids) => set({ studiedIds: ids }),
  quizStats: loadQuizStats(),
  recordQuizResult: (domain, correct) => set((s) => {
    const cur = s.quizStats[domain] ?? { correct: 0, seen: 0 }
    return { quizStats: { ...s.quizStats, [domain]: { correct: cur.correct + (correct ? 1 : 0), seen: cur.seen + 1 } } }
  }),
  setQuizStats: (stats) => set({ quizStats: stats }),
  pathTrackId: null,
  requestTrack: (trackId) => set({ pathTrackId: trackId, viewMode: 'path' }),
  clearPathTrack: () => set({ pathTrackId: null }),
}))
