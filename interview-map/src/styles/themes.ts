export interface ThemeTokens {
  bg: string; bgPanel: string; bgElev: string
  text: string; textDim: string; textStrong: string
  border: string; borderStrong: string
  edge: string; edgeCross: string; grid: string
  accent: string; nodeStudiedText: string
}
export interface Theme { id: string; label: string; tokens: ThemeTokens }

export const THEMES: Theme[] = [
  { id: 'midnight', label: 'Midnight', tokens: {
    bg:'#0b1220', bgPanel:'#0f172a', bgElev:'#1e293b', text:'#e6edf6', textDim:'#94a3b8',
    textStrong:'#f8fafc', border:'#2b3a4f', borderStrong:'#475569', edge:'#3a4a63',
    edgeCross:'#7c8aa5', grid:'#1c2738', accent:'#3b82f6', nodeStudiedText:'#0b1220' } },
  { id: 'daylight', label: 'Daylight', tokens: {
    bg:'#f7f9fc', bgPanel:'#ffffff', bgElev:'#eef2f7', text:'#1f2937', textDim:'#5b6b7f',
    textStrong:'#0f172a', border:'#d3dbe6', borderStrong:'#94a3b8', edge:'#9aa7ba',
    edgeCross:'#6b7a90', grid:'#e3e9f0', accent:'#2563eb', nodeStudiedText:'#0b1220' } },
  { id: 'nord', label: 'Nord', tokens: {
    bg:'#2e3440', bgPanel:'#3b4252', bgElev:'#434c5e', text:'#e5e9f0', textDim:'#aeb7c8',
    textStrong:'#eceff4', border:'#4c566a', borderStrong:'#616e88', edge:'#59647d',
    edgeCross:'#88c0d0', grid:'#3b4252', accent:'#88c0d0', nodeStudiedText:'#2e3440' } },
  { id: 'terminal', label: 'Terminal', tokens: {
    bg:'#050b06', bgPanel:'#0a150b', bgElev:'#0f2010', text:'#7ee787', textDim:'#4e9a5a',
    textStrong:'#b7f7c0', border:'#14532d', borderStrong:'#1c6b3a', edge:'#1f7a3f',
    edgeCross:'#35d167', grid:'#0e1c10', accent:'#35d167', nodeStudiedText:'#05130a' } },
  { id: 'dracula', label: 'Dracula', tokens: {
    bg:'#282a36', bgPanel:'#21222c', bgElev:'#343746', text:'#f8f8f2', textDim:'#9ea3ba',
    textStrong:'#ffffff', border:'#44475a', borderStrong:'#6272a4', edge:'#4e5269',
    edgeCross:'#bd93f9', grid:'#2f3240', accent:'#bd93f9', nodeStudiedText:'#21222c' } },
  { id: 'monokai', label: 'Monokai Pro', tokens: {
    bg:'#2d2a2e', bgPanel:'#232024', bgElev:'#363137', text:'#fcfcfa', textDim:'#a59fa6',
    textStrong:'#ffffff', border:'#403e41', borderStrong:'#5b595c', edge:'#514e55',
    edgeCross:'#ffd866', grid:'#353036', accent:'#ffd866', nodeStudiedText:'#2d2a2e' } },
]
export const DEFAULT_THEME = 'midnight'

const VAR: Record<keyof ThemeTokens, string> = {
  bg:'--bg', bgPanel:'--bg-panel', bgElev:'--bg-elev', text:'--text', textDim:'--text-dim',
  textStrong:'--text-strong', border:'--border', borderStrong:'--border-strong', edge:'--edge',
  edgeCross:'--edge-cross', grid:'--grid', accent:'--accent', nodeStudiedText:'--node-studied-text',
}
export function applyTheme(id: string): void {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0]
  const root = document.documentElement
  root.dataset.theme = theme.id
  for (const k of Object.keys(theme.tokens) as (keyof ThemeTokens)[])
    root.style.setProperty(VAR[k], theme.tokens[k])
}
export function tokensOf(id: string): ThemeTokens {
  return (THEMES.find((t) => t.id === id) ?? THEMES[0]).tokens
}
