import { create } from 'zustand'

interface GraphState {
  selectedId: string | null
  select: (id: string | null) => void
}

export const useGraphStore = create<GraphState>((set) => ({
  selectedId: null,
  select: (id) => set({ selectedId: id }),
}))
