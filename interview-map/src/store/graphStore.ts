import { create } from 'zustand'
import { DEFAULT_THEME } from '../styles/themes'

export type ViewMode = 'graph' | 'list'

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
}

export const useGraphStore = create<GraphState>((set) => ({
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  focusRequestId: null,
  requestFocus: (id) => set({ focusRequestId: id, selectedId: id }),
  clearFocusRequest: () => set({ focusRequestId: null }),
  themeId: DEFAULT_THEME,
  setTheme: (id) => set({ themeId: id }),
  viewMode: 'graph',
  setViewMode: (m) => set({ viewMode: m }),
}))
