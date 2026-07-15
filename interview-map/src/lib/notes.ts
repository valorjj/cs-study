export function parseNoteRef(ref: string): { path: string; anchor: string | null } {
  const [rawPath, anchor] = ref.split('#')
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  return { path, anchor: anchor ?? null }
}
