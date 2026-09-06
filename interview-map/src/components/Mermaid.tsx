import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useGraphStore } from '../store/graphStore'
import { mermaidThemeVariables } from '../lib/mermaidTheme'
import { fitWidth } from '../lib/mermaidFit'
import './Mermaid.css'

// mermaid is ~700KB gzipped — an unacceptable cost on the home screen or the
// graph, neither of which renders a diagram. Loading it from inside this
// component means the chunk is fetched only once a note that actually contains
// a ```mermaid fence is opened, and never in jsdom tests.
let mermaidPromise: Promise<typeof import('mermaid')['default']> | null = null
function loadMermaid() {
  mermaidPromise ??= import('mermaid').then((m) => m.default)
  return mermaidPromise
}

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; svg: string }
  | { kind: 'error'; message: string }

export function Mermaid({ chart, caption }: { chart: string; caption?: string }) {
  const themeId = useGraphStore((s) => s.themeId)
  const [state, setState] = useState<State>({ kind: 'loading' })
  // useId gives a stable, collision-free id; mermaid needs one per render pass
  // and reuses it as an SVG element id, so two diagrams sharing it would clash.
  const baseId = useId().replace(/:/g, '')
  const renderSeq = useRef(0)
  const holderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const seq = ++renderSeq.current
    let cancelled = false
    setState({ kind: 'loading' })

    loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: mermaidThemeVariables(themeId),
          // The notes are authored in this repo, not user input, but mermaid's
          // default 'strict' already blocks inline styles/scripts and costs us
          // nothing, so keep it.
          securityLevel: 'strict',
          flowchart: {
            curve: 'basis', htmlLabels: true, padding: 12,
            // Mermaid wraps labels at 200px by default, which chops these
            // Korean labels into two or three lines.
            wrappingWidth: 340, nodeSpacing: 45, rankSpacing: 55,
            // useMaxWidth would scale the whole SVG — labels included — down to
            // the column. We take the natural size and size it ourselves, so a
            // wide diagram scrolls instead of becoming unreadable. See fitWidth.
            useMaxWidth: false,
          },
          sequence: { useMaxWidth: false, actorMargin: 40, boxMargin: 8 },
          state: { useMaxWidth: false },
        })
        const { svg } = await mermaid.render(`m-${baseId}-${seq}`, chart)
        if (!cancelled && seq === renderSeq.current) setState({ kind: 'ok', svg })
      })
      .catch((e: unknown) => {
        if (cancelled || seq !== renderSeq.current) return
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      })

    return () => { cancelled = true }
  }, [chart, themeId, baseId])

  const fit = useCallback(() => {
    const holder = holderRef.current
    const svg = holder?.querySelector('svg')
    if (!holder || !svg) return
    const viewBox = svg.getAttribute('viewBox')?.split(/\s+/).map(Number)
    const natural = viewBox?.[2]
    if (!natural) return
    const width = fitWidth(natural, holder.clientWidth)
    svg.style.width = `${width}px`
    svg.style.maxWidth = 'none'
    svg.style.height = 'auto'
    // Tells the CSS whether to show the "scroll me" edge fade.
    holder.dataset.overflowing = String(width > holder.clientWidth + 1)
  }, [])

  useLayoutEffect(() => {
    if (state.kind !== 'ok') return
    fit()
    const holder = holderRef.current
    if (!holder || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    ro.observe(holder)
    return () => ro.disconnect()
  }, [state, fit])

  // A diagram that fails to parse must never leave a hole in the note: fall
  // back to the source so the information is still there to read.
  if (state.kind === 'error') {
    return (
      <figure className="mmd prose-wide" data-state="error">
        <pre className="mmd-fallback"><code>{chart}</code></pre>
        <figcaption>
          다이어그램을 그리지 못해 원본을 표시합니다 — {state.message}
        </figcaption>
      </figure>
    )
  }

  return (
    <figure className="mmd prose-wide" data-state={state.kind}>
      {state.kind === 'loading'
        ? <div className="mmd-skeleton" aria-label="다이어그램 불러오는 중" />
        // mermaid output is generated from repo-authored note markdown and
        // sanitised by mermaid's own strict security level before it gets here.
        : <div className="mmd-svg" ref={holderRef} dangerouslySetInnerHTML={{ __html: state.svg }} />}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}
