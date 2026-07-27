# FlowPlayer 크게 보기 + 엣지 정돈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** FlowPlayer에 전체화면 "크게 보기" 토글을 넣고, 점선 엣지 애니메이션을 느리고 부드럽게(+reduced-motion 존중) 정돈한다.

**Architecture:** `FlowPlayer.tsx`에 `expanded` 상태 추가 → 루트에 `flow-player--expanded` 클래스 + `role="dialog"`; CSS로 전체화면 오버레이 + 확대 레이아웃. `expanded` 변경 시 엣지 재측정. Esc로 닫기. 엣지 애니메이션은 CSS에서 정돈.

**Tech Stack:** React 19 + TS(Vite, verbatimModuleSyntax ON), Vitest + RTL(jsdom).

## Global Constraints

- 작업 위치 `interview-map/`. 테스트 `npm test`, 타입 `npx tsc -b`(0), 빌드 `npm run build`.
- **국소 변경만**: `FlowPlayer.tsx` + `FlowPlayer.css` + `FlowPlayer.test.tsx`. 흐름 데이터·GuideView·types 불변.
- verbatimModuleSyntax ON (`import type`). 테마 변수만(스테이지 `stage.color` 예외 유지).
- jsdom 안전 유지(ResizeObserver feature-detect, getBoundingClientRect 0 무해).
- 커밋: 이메일 `30681841+valorjj@users.noreply.github.com` + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: FlowPlayer 크게 보기 + 엣지 정돈

**Files:**
- Modify: `src/components/flow/FlowPlayer.tsx`
- Modify: `src/components/flow/FlowPlayer.css`
- Test: `src/components/flow/FlowPlayer.test.tsx`

**Interfaces:**
- Consumes: `Flow`(types.ts, 불변).
- Produces: 동일 export `FlowPlayer({ flow })`. 새 동작: 우측 `⛶ 크게 보기` 버튼 → 확대 시 루트 클래스 `flow-player--expanded` + `role="dialog"`, 버튼 라벨 `✕ 닫기`, `Esc`로 닫힘. 스텝/재생 상태는 확대·축소와 무관하게 유지.

- [ ] **Step 1: 실패 테스트 추가** — `src/components/flow/FlowPlayer.test.tsx`의 `describe('FlowPlayer', …)` 안에 아래 3개 `it`을 추가(기존 5개는 그대로 둔다). 파일 상단 import에 `fireEvent`가 이미 있으니 그대로 사용:

```tsx
  it('toggles fullscreen expand via the 크게 보기 button', () => {
    render(<FlowPlayer flow={flow} />)
    expect(document.querySelector('.flow-player--expanded')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /크게 보기/ }))
    expect(document.querySelector('.flow-player--expanded')).toBeTruthy()
    // 확대 중에도 카운터/버튼 라벨 유지
    expect(document.querySelector('.fp-counter')?.textContent).toBe('1 / 2')
    fireEvent.click(screen.getByRole('button', { name: /닫기/ }))
    expect(document.querySelector('.flow-player--expanded')).toBeNull()
  })

  it('closes expand on Escape', () => {
    render(<FlowPlayer flow={flow} />)
    fireEvent.click(screen.getByRole('button', { name: /크게 보기/ }))
    expect(document.querySelector('.flow-player--expanded')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('.flow-player--expanded')).toBeNull()
  })

  it('keeps step navigation working while expanded', () => {
    render(<FlowPlayer flow={flow} />)
    fireEvent.click(screen.getByRole('button', { name: /크게 보기/ }))
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    expect(document.querySelector('.fp-counter')?.textContent).toBe('2 / 2')
  })
```

- [ ] **Step 2: 실패 확인**

Run: `cd interview-map && npx vitest run src/components/flow/FlowPlayer.test.tsx`
Expected: 새 3개 FAIL(크게 보기 버튼/클래스 없음), 기존 5개 PASS.

- [ ] **Step 3: FlowPlayer.tsx 구현** — 파일 전체를 아래로 교체:

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Flow } from './types'
import './FlowPlayer.css'

const AUTOPLAY_MS = 1600

interface Box { x: number; y: number; w: number; h: number }

export function FlowPlayer({ flow }: { flow: Flow }) {
  const [stepIdx, setStepIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [expanded, setExpanded] = useState(false)
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

  // 확대/축소로 레이아웃이 바뀌므로 expanded도 측정 트리거에 포함.
  useLayoutEffect(() => {
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    if (rootRef.current) ro.observe(rootRef.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, expanded])

  // 자동재생: playing이면 다음 스텝으로, 마지막에서 정지.
  useEffect(() => {
    if (!playing) return
    if (stepIdx >= last) { setPlaying(false); return }
    const t = setTimeout(() => setStepIdx((i) => Math.min(i + 1, last)), AUTOPLAY_MS)
    return () => clearTimeout(t)
  }, [playing, stepIdx, last])

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
        <button className="fp-expand" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '✕ 닫기' : '⛶ 크게 보기'}
        </button>
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
```

- [ ] **Step 4: FlowPlayer.css 수정** — 두 부분을 바꾸고, 새 규칙을 append한다.

(a) 기존 `.fp-edge`와 `@keyframes fp-flow`를 아래로 **교체**(엣지 정돈: 얇게·투명·간격↑·느리게):
```css
.fp-edge { fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 4 8; animation: fp-flow 2s linear infinite; opacity: .55; }
@keyframes fp-flow { to { stroke-dashoffset: -12; } }
@media (prefers-reduced-motion: reduce) { .fp-edge { animation: none; } }
```

(b) 파일 끝에 append(크게 보기 버튼 + 전체화면 오버레이 + 확대 레이아웃):
```css
.fp-expand { margin-left: auto; }

.flow-player--expanded {
  position: fixed;
  inset: 0;
  z-index: 1000;
  margin: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--bg) 94%, black);
  overflow: auto;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.flow-player--expanded .fp-stages { gap: 48px; }
.flow-player--expanded .fp-stage { min-width: 200px; }
.flow-player--expanded .fp-node { padding: 14px 16px; }
.flow-player--expanded .fp-node-title { font-size: 16px; }
.flow-player--expanded .fp-node-sub { font-size: 13px; }
.flow-player--expanded .fp-stage-head { font-size: 15px; padding: 10px 14px; }
.flow-player--expanded .fp-steptitle { font-size: 16px; }
.flow-player--expanded .fp-note { font-size: 15px; }
```
(주의: `--bg`는 앱 테마 변수. 만약 존재하지 않으면 `--bg-elev`로 대체.)

- [ ] **Step 5: 통과 확인**

Run: `cd interview-map && npx vitest run src/components/flow/FlowPlayer.test.tsx && npx tsc -b && npm test && npm run build`
Expected: 8개 PASS(기존5+신규3), 타입 0, 전체 스위트 PASS, 빌드 성공.

- [ ] **Step 6: Commit**

```bash
git add src/components/flow/FlowPlayer.tsx src/components/flow/FlowPlayer.css src/components/flow/FlowPlayer.test.tsx
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(printf 'feat(guide): FlowPlayer 크게 보기(전체화면) + 엣지 애니메이션 정돈(reduced-motion)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: 검증 + 병합 (수동 게이트)

**Files:** (없음)

- [ ] **Step 1**: `cd interview-map && npm test && npx tsc -b && npm run build` — 전부 통과.
- [ ] **Step 2**: 실브라우저 — 가이드 → 플레이어 `⛶ 크게 보기` → 전체화면 확대, 노드/엣지 넉넉, `Esc`/`✕ 닫기` 복귀, 엣지 애니메이션 차분함. 콘솔 0. (컨트롤러가 Playwright 스크린샷으로 확인 후 사용자에게 제시.)
- [ ] **Step 3**: 사용자 확인 후 main ff-merge + push. Vercel 자동 재배포.

---

## Notes for the Executor
- 국소 변경(FlowPlayer 3파일)만. 흐름 데이터·GuideView 절대 건드리지 말 것.
- `expanded`를 `useLayoutEffect` 측정 deps에 포함해 확대 시 엣지가 재측정되게 유지.
- Esc 리스너는 `expanded`일 때만 등록하고 cleanup 필수(리스너 누수 금지).
