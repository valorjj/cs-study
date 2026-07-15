import { create } from 'zustand'

interface GraphState {
  selectedId: string | null
  select: (id: string | null) => void
  focusRequestId: string | null   // 카메라 이동 요청 (검색 등)
  requestFocus: (id: string) => void
  clearFocusRequest: () => void
}

export const useGraphStore = create<GraphState>((set) => ({
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  focusRequestId: null,
  requestFocus: (id) => set({ focusRequestId: id, selectedId: id }),
  clearFocusRequest: () => set({ focusRequestId: null }),
}))
