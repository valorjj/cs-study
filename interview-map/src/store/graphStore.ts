import { create } from 'zustand'
import { DEFAULT_THEME } from '../styles/themes'

interface GraphState {
  selectedId: string | null
  select: (id: string | null) => void
  focusRequestId: string | null   // 카메라 이동 요청 (검색 등)
  requestFocus: (id: string) => void
  clearFocusRequest: () => void
  visited: Record<string, boolean>
  toggleVisited: (id: string) => void
  trackingOn: boolean
  setTracking: (b: boolean) => void
  themeId: string
  setTheme: (id: string) => void
}

export const useGraphStore = create<GraphState>((set) => ({
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  focusRequestId: null,
  requestFocus: (id) => set({ focusRequestId: id, selectedId: id }),
  clearFocusRequest: () => set({ focusRequestId: null }),
  visited: {},
  toggleVisited: (id) => set((s) => ({ visited: { ...s.visited, [id]: !s.visited[id] } })),
  trackingOn: false,
  setTracking: (b) => set({ trackingOn: b }),
  themeId: DEFAULT_THEME,
  setTheme: (id) => set({ themeId: id }),
}))
