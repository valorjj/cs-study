import { tokensOf } from '../styles/themes'

/**
 * Mermaid's own themes are fixed palettes, so a diagram rendered with one would
 * look pasted onto the page in five of our six themes (and be unreadable in
 * Terminal, which is near-black on green). Instead we always use Mermaid's
 * `base` theme and drive every colour from the active theme's tokens.
 *
 * Only `themeVariables` keys Mermaid actually reads are emitted; unknown keys
 * are silently ignored by Mermaid, which makes typos invisible, so this list is
 * deliberately explicit and small.
 */
export function mermaidThemeVariables(themeId: string): Record<string, string> {
  const t = tokensOf(themeId)
  return {
    // canvas + generic node
    background: t.bg,
    primaryColor: t.bgElev,
    primaryTextColor: t.text,
    primaryBorderColor: t.borderStrong,
    secondaryColor: t.bgPanel,
    secondaryTextColor: t.text,
    secondaryBorderColor: t.border,
    tertiaryColor: t.bgPanel,
    tertiaryTextColor: t.textDim,
    tertiaryBorderColor: t.border,

    // text + lines
    lineColor: t.edgeCross,
    textColor: t.text,
    mainBkg: t.bgElev,
    nodeBorder: t.borderStrong,
    nodeTextColor: t.text,

    // subgraph containers (used heavily by the memory/containment diagrams)
    clusterBkg: color(t.bgPanel, t.bg),
    clusterBorder: t.border,

    // edge labels sit on top of lines, so they need the page background
    edgeLabelBackground: t.bg,

    // state diagrams
    labelBackgroundColor: t.bg,
    transitionColor: t.edgeCross,
    transitionLabelColor: t.textDim,
    stateBkg: t.bgElev,
    stateLabelColor: t.text,
    altBackground: t.bgPanel,
    compositeBackground: t.bgPanel,
    compositeBorder: t.border,
    compositeTitleBackground: t.bg,

    // sequence diagrams
    actorBkg: t.bgElev,
    actorBorder: t.borderStrong,
    actorTextColor: t.text,
    actorLineColor: t.edge,
    signalColor: t.text,
    signalTextColor: t.text,
    labelBoxBkgColor: t.bgElev,
    labelBoxBorderColor: t.border,
    labelTextColor: t.text,
    loopTextColor: t.text,
    noteBkgColor: color(t.accent, t.bg),
    noteTextColor: t.textStrong,
    noteBorderColor: t.accent,
    activationBkgColor: t.bgElev,
    activationBorderColor: t.borderStrong,
    sequenceNumberColor: t.nodeStudiedText,

    // accents used by `style`/`classDef` in the notes
    fontFamily:
      "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif",
    fontSize: '15px',
  }
}

// A translucent mix expressed as a literal, because Mermaid writes these values
// into SVG presentation attributes where `color-mix()` is not supported.
function color(fg: string, bg: string): string {
  const f = rgb(fg)
  const b = rgb(bg)
  if (!f || !b) return fg
  const mix = f.map((c, i) => Math.round(c * 0.16 + b[i] * 0.84))
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function rgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
