export function computeFocus(
  selectedId: string | null,
  adjacency: Map<string, string[]>,
): { focused: Set<string>; isActive: boolean } {
  if (!selectedId) return { focused: new Set(), isActive: false }
  const focused = new Set<string>([selectedId])
  for (const n of adjacency.get(selectedId) ?? []) focused.add(n)
  return { focused, isActive: true }
}
