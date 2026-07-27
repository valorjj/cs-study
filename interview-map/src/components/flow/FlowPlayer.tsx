import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Flow } from './types'
import './FlowPlayer.css'

// 자동재생 간격(ms). 슬라이더는 오른쪽=빠름이 직관적이라, 표시값은 뒤집어 매핑한다.
const SPEED_MIN = 600
const SPEED_MAX = 3000
const SPEED_STEP = 200
const SPEED_DEFAULT = 1600

interface Box { x: number; y: number; w: number; h: number }

export function FlowPlayer({ flow }: { flow: Flow }) {
  const [stepIdx, setStepIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [speedMs, setSpeedMs] = useState(SPEED_DEFAULT)
  const [boxes, setBoxes] = useState<Record<string, Box>>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const last = flow.steps.length - 1
  const step = flow.steps[stepIdx]
  const activeSet = new Set(step?.activeNodes ?? [])

  // 노드 위치 측정. 엣지 SVG(.fp-edges)가 .fp-stage-wrap에 inset:0으로 얹히므로,
  // 좌표 원점을 stage-wrap에 맞춰야 확대(세로 중앙정렬)에서도 엣지가 노드와 정렬된다.
  // jsdom에선 0이 나와도 무해(엣지가 0길이).
  const measure = () => {
    const wrap = wrapRef.current
    if (!wrap) return
    const base = wrap.getBoundingClientRect()
    const next: Record<string, Box> = {}
    for (const n of flow.nodes) {
      const el = nodeRefs.current[n.id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      next[n.id] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }
    }
    setBoxes(next)
  }

  // 확대/축소로 레이아웃이 바뀌므로 expanded도 측정 트리거에 포함.
  useLayoutEffect(() => {
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, expanded])

  // 자동재생: playing이면 다음 스텝으로, 마지막에서 정지.
  useEffect(() => {
    if (!playing) return
    if (stepIdx >= last) { setPlaying(false); return }
    const t = setTimeout(() => setStepIdx((i) => Math.min(i + 1, last)), speedMs)
    return () => clearTimeout(t)
  }, [playing, stepIdx, last, speedMs])

  // Esc로 확대 닫기(확대 중에만 리스너 활성).
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

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
    <div
      className={`flow-player${expanded ? ' flow-player--expanded' : ''}`}
      ref={rootRef}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded ? true : undefined}
    >
      <div className="fp-bar">
        <button onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ 일시정지' : '▶ 재생'}</button>
        <button onClick={() => go(stepIdx - 1)} disabled={stepIdx <= 0}>◀ 이전</button>
        <button onClick={() => go(stepIdx + 1)} disabled={stepIdx >= last}>다음 ▶</button>
        <button onClick={() => go(0)}>↻ 처음</button>
        <span className="fp-counter">{stepIdx + 1} / {flow.steps.length}</span>
        <span className="fp-steptitle" aria-live="polite">{step?.title}</span>
        <label className="fp-speed">
          <span aria-hidden="true">🐢</span>
          <input
            type="range"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={SPEED_STEP}
            value={SPEED_MIN + SPEED_MAX - speedMs}
            onChange={(e) => setSpeedMs(SPEED_MIN + SPEED_MAX - Number(e.target.value))}
            aria-label="재생 속도"
          />
          <span aria-hidden="true">⚡</span>
        </label>
        <button className="fp-expand" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '✕ 닫기' : '⛶ 크게 보기'}
        </button>
      </div>

      <div className="fp-stage-wrap" ref={wrapRef}>
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

      <div className="fp-legend" aria-hidden="true">
        <span className="fp-legend-item"><i className="fp-lg-active" /> 활성 노드(지금 집중)</span>
        <span className="fp-legend-item"><i className="fp-lg-flow" /> 흐르는 흐름</span>
        <span className="fp-legend-item"><i className="fp-lg-dim" /> 이번 스텝과 무관</span>
      </div>
    </div>
  )
}
