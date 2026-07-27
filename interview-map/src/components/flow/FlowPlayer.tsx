import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Flow } from './types'
import './FlowPlayer.css'

const AUTOPLAY_MS = 1600

interface Box { x: number; y: number; w: number; h: number }

export function FlowPlayer({ flow }: { flow: Flow }) {
  const [stepIdx, setStepIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [boxes, setBoxes] = useState<Record<string, Box>>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const last = flow.steps.length - 1
  const step = flow.steps[stepIdx]
  const activeSet = new Set(step?.activeNodes ?? [])

  // 노드 위치 측정(컨테이너 기준). jsdom에선 0이 나와도 무해(엣지가 0길이).
  const measure = () => {
    const root = rootRef.current
    if (!root) return
    const base = root.getBoundingClientRect()
    const next: Record<string, Box> = {}
    for (const n of flow.nodes) {
      const el = nodeRefs.current[n.id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      next[n.id] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }
    }
    setBoxes(next)
  }

  useLayoutEffect(() => {
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    if (rootRef.current) ro.observe(rootRef.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow])

  // 자동재생: playing이면 다음 스텝으로, 마지막에서 정지.
  useEffect(() => {
    if (!playing) return
    if (stepIdx >= last) { setPlaying(false); return }
    const t = setTimeout(() => setStepIdx((i) => Math.min(i + 1, last)), AUTOPLAY_MS)
    return () => clearTimeout(t)
  }, [playing, stepIdx, last])

  const go = (i: number) => { setPlaying(false); setStepIdx(Math.max(0, Math.min(i, last))) }

  const byStage = (sid: string) => flow.nodes.filter((n) => n.stage === sid)

  const edgePath = (from: string, to: string): string | null => {
    const a = boxes[from], b = boxes[to]
    if (!a || !b) return null
    const x1 = a.x + a.w, y1 = a.y + a.h / 2
    const x2 = b.x, y2 = b.y + b.h / 2
    const dx = Math.max(40, Math.abs(x2 - x1) / 2)
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
  }

  return (
    <div className="flow-player" ref={rootRef}>
      <div className="fp-bar">
        <button onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ 일시정지' : '▶ 재생'}</button>
        <button onClick={() => go(stepIdx - 1)} disabled={stepIdx <= 0}>◀ 이전</button>
        <button onClick={() => go(stepIdx + 1)} disabled={stepIdx >= last}>다음 ▶</button>
        <button onClick={() => go(0)}>↻ 처음</button>
        <span className="fp-counter">{stepIdx + 1} / {flow.steps.length}</span>
        <span className="fp-steptitle">{step?.title}</span>
      </div>

      <div className="fp-stage-wrap">
        <svg className="fp-edges" aria-hidden="true">
          {(step?.edges ?? []).map((e, i) => {
            const d = edgePath(e.from, e.to)
            return d ? <path key={i} d={d} className="fp-edge" /> : null
          })}
        </svg>
        <div className="fp-stages">
          {flow.stages.map((s) => (
            <div className="fp-stage" key={s.id}>
              <div className="fp-stage-head" style={{ background: s.color }}>{s.label}</div>
              <div className="fp-stage-body">
                {byStage(s.id).map((n) => (
                  <div
                    key={n.id}
                    data-node={n.id}
                    data-active={activeSet.has(n.id)}
                    className="fp-node"
                    ref={(el) => { nodeRefs.current[n.id] = el }}
                  >
                    <div className="fp-node-title">{n.title}</div>
                    {n.subtitle && <div className="fp-node-sub">{n.subtitle}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {step?.note && <p className="fp-note">{step.note}</p>}
    </div>
  )
}
