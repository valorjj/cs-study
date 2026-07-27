# 설계 가이드 v2 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 재사용 애니메이션 플로우 플레이어(`FlowPlayer`)를 만들고, "한 턴의 생애" 흐름을 그것으로 렌더하며, 가이드 페이지의 다크모드 제목 버그를 고치고 카피를 서사형(deep-fold)으로 개편한다. (Phase 1 — 사다리·순회 흐름은 후속 페이즈)

**Architecture:** `FlowPlayer`는 순수 데이터(`Flow`: stages/nodes/steps)로 구동되는 범용 컴포넌트다. 흐름은 `flows/*.ts` 데이터 파일로 분리되어 플레이어를 건드리지 않고 추가된다. 스텝 이동 시 활성 노드를 하이라이트하고 그 스텝의 엣지를 흐르는 점선으로 그린다(노드 위치는 ref 측정). GuideView는 서사 본문 + `<details class="deep">` 접기 + 섹션별 플레이어 임베드로 재구성된다.

**Tech Stack:** React 19 + TypeScript(Vite, `verbatimModuleSyntax` ON), Vitest + @testing-library/react(jsdom 전역), CSS 변수 테마.

## Global Constraints

- **작업 위치**: 모든 경로는 `interview-map/` 기준. 테스트 `npm test`, 타입 `npx tsc -b`(NOT `--noEmit`), 빌드 `npm run build` — 전부 `interview-map/`에서 실행.
- **verbatimModuleSyntax ON**: 타입 전용 import는 `import type` 사용.
- **테마 변수만 사용**(하드코딩 색 금지): `--text`(본문/제목 가독), `--text-dim`, `--text-h`, `--border`, `--bg-elev`, `--accent`. 라이트/다크 자동.
- **다크모드 제목 버그**: 전역 `src/index.css`의 `h1,h2 { color: var(--text-h) }`가 다크에서 안 보임. 가이드에서 `.guide h1, .guide h2 { color: var(--text); }`로 덮어 해결.
- **jsdom 안전**: `getBoundingClientRect`는 jsdom에서 0을 반환하고 `ResizeObserver`는 없을 수 있다. FlowPlayer는 이 둘이 0/없음이어도 **크래시하지 않아야** 한다(feature-detect + 방어).
- **자동재생 아님**: ▶를 눌러야 재생 시작.
- **기존 SVG(사다리·순회)는 Phase 1에서 유지**(회귀 방지). 아키텍처/시퀀스/캐시 SVG는 "한 턴" 플레이어로 대체되어 제거, "왜 graph DB" SVG는 제거하고 텍스트만 유지.
- **커밋**: 이메일 `30681841+valorjj@users.noreply.github.com`(공개 repo) + 각 커밋 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **deep-fold 패턴**: 앱에 이미 `details.deep`(NotePanel.css) 존재 — 가이드용 스타일은 `.guide details.deep`로 새로 둔다(테마 변수).

---

## File Structure

**새로:**
- `src/components/flow/types.ts` — Flow 데이터 타입.
- `src/components/flow/FlowPlayer.tsx` + `FlowPlayer.css` — 범용 플레이어.
- `src/components/flow/FlowPlayer.test.tsx` — 플레이어 동작 테스트.
- `src/components/flow/flows/validate.ts` — `validateFlow` 무결성 검사(순수).
- `src/components/flow/flows/validate.test.ts` — validate + 흐름 데이터 무결성 테스트.
- `src/components/flow/flows/turnLifecycle.ts` — "한 턴의 생애" 흐름 데이터.

**수정:**
- `src/components/GuideView.tsx` — 서사 카피 + deep-fold + FlowPlayer 임베드.
- `src/components/GuideView.css` — 다크모드 제목 수정 + deep-fold 스타일.
- `src/components/GuideView.test.tsx` — 새 구조에 맞게 갱신.

---

## Task 1: FlowPlayer — 범용 플레이어 컴포넌트

**Files:**
- Create: `src/components/flow/types.ts`
- Create: `src/components/flow/FlowPlayer.tsx`
- Create: `src/components/flow/FlowPlayer.css`
- Test: `src/components/flow/FlowPlayer.test.tsx`

**Interfaces:**
- Produces:
  - `types.ts`: `FlowStage{id:string;label:string;color:string}`, `FlowNode{id:string;stage:string;title:string;subtitle?:string}`, `FlowStep{title:string;activeNodes:string[];edges:{from:string;to:string}[];note?:string}`, `Flow{stages:FlowStage[];nodes:FlowNode[];steps:FlowStep[]}`.
  - `FlowPlayer.tsx`: `export function FlowPlayer({ flow }: { flow: Flow }): JSX.Element`. 렌더 루트에 `className="flow-player"`. 각 노드 요소에 `data-node={id}` + `data-active={boolean}`. 컨트롤 버튼 접근명(정규식 매칭용): `처음`, `이전`, `다음`, 재생 토글은 재생중이면 `일시정지` 아니면 `재생`. 스텝 카운터 요소 `className="fp-counter"` 텍스트 `"{stepIdx+1} / {steps.length}"`.

- [ ] **Step 1: 타입 작성** — `src/components/flow/types.ts`:

```ts
export interface FlowStage { id: string; label: string; color: string }
export interface FlowNode { id: string; stage: string; title: string; subtitle?: string }
export interface FlowStep {
  title: string
  activeNodes: string[]
  edges: { from: string; to: string }[]
  note?: string
}
export interface Flow { stages: FlowStage[]; nodes: FlowNode[]; steps: FlowStep[] }
```

- [ ] **Step 2: 실패 테스트 작성** — `src/components/flow/FlowPlayer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { FlowPlayer } from './FlowPlayer'
import type { Flow } from './types'

const flow: Flow = {
  stages: [ { id: 'a', label: 'A', color: '#3b82f6' }, { id: 'b', label: 'B', color: '#10b981' } ],
  nodes: [
    { id: 'n1', stage: 'a', title: 'Node1' },
    { id: 'n2', stage: 'b', title: 'Node2' },
  ],
  steps: [
    { title: 'step one', activeNodes: ['n1'], edges: [] },
    { title: 'step two', activeNodes: ['n2'], edges: [{ from: 'n1', to: 'n2' }] },
  ],
}

const active = (id: string) =>
  document.querySelector(`[data-node="${id}"]`)?.getAttribute('data-active') === 'true'

describe('FlowPlayer', () => {
  it('renders all nodes and starts at step 1', () => {
    render(<FlowPlayer flow={flow} />)
    expect(screen.getByText('Node1')).toBeTruthy()
    expect(screen.getByText('Node2')).toBeTruthy()
    expect(document.querySelector('.fp-counter')?.textContent).toBe('1 / 2')
    expect(active('n1')).toBe(true)
    expect(active('n2')).toBe(false)
  })

  it('next advances the active step, prev goes back, both clamp', () => {
    render(<FlowPlayer flow={flow} />)
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    expect(document.querySelector('.fp-counter')?.textContent).toBe('2 / 2')
    expect(active('n2')).toBe(true)
    expect(active('n1')).toBe(false)
    // clamp at last
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    expect(document.querySelector('.fp-counter')?.textContent).toBe('2 / 2')
    // prev back to 1, clamp at first
    fireEvent.click(screen.getByRole('button', { name: /이전/ }))
    expect(document.querySelector('.fp-counter')?.textContent).toBe('1 / 2')
    fireEvent.click(screen.getByRole('button', { name: /이전/ }))
    expect(document.querySelector('.fp-counter')?.textContent).toBe('1 / 2')
  })

  it('restart returns to step 1', () => {
    render(<FlowPlayer flow={flow} />)
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    fireEvent.click(screen.getByRole('button', { name: /처음/ }))
    expect(document.querySelector('.fp-counter')?.textContent).toBe('1 / 2')
    expect(active('n1')).toBe(true)
  })

  it('play button toggles to 일시정지 label', () => {
    render(<FlowPlayer flow={flow} />)
    const play = screen.getByRole('button', { name: /재생/ })
    fireEvent.click(play)
    expect(screen.getByRole('button', { name: /일시정지/ })).toBeTruthy()
  })

  it('renders step title and stage labels', () => {
    render(<FlowPlayer flow={flow} />)
    expect(screen.getByText('step one')).toBeTruthy()
    const root = document.querySelector('.flow-player') as HTMLElement
    expect(within(root).getByText('A')).toBeTruthy()
    expect(within(root).getByText('B')).toBeTruthy()
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd interview-map && npx vitest run src/components/flow/FlowPlayer.test.tsx`
Expected: FAIL (모듈 없음).

- [ ] **Step 4: 구현** — `src/components/flow/FlowPlayer.tsx`:

```tsx
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
```

- [ ] **Step 5: CSS 작성** — `src/components/flow/FlowPlayer.css`:

```css
.flow-player { position: relative; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-elev); padding: 12px; margin: 12px 0; overflow-x: auto; }
.fp-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.fp-bar button { font-size: 13px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-elev); color: var(--text); cursor: pointer; }
.fp-bar button:disabled { opacity: .4; cursor: default; }
.fp-counter { font-size: 12px; color: var(--text-dim); margin-left: 4px; }
.fp-steptitle { font-size: 13px; color: var(--text); font-weight: 600; }
.fp-stage-wrap { position: relative; }
.fp-edges { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 1; }
.fp-edge { fill: none; stroke: var(--accent); stroke-width: 2; stroke-dasharray: 6 6; animation: fp-flow 0.7s linear infinite; opacity: .9; }
@keyframes fp-flow { to { stroke-dashoffset: -24; } }
.fp-stages { display: flex; gap: 24px; align-items: flex-start; position: relative; z-index: 2; min-width: min-content; }
.fp-stage { flex: 1 1 0; min-width: 130px; }
.fp-stage-head { color: #fff; font-size: 12px; font-weight: 700; padding: 6px 10px; border-radius: 6px; text-align: center; }
.fp-stage-body { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.fp-node { border: 1.5px solid var(--border); border-radius: 8px; padding: 8px 10px; background: var(--bg-elev); transition: opacity .2s, border-color .2s, box-shadow .2s; opacity: .45; }
.fp-node[data-active="true"] { opacity: 1; border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
.fp-node-title { font-size: 13px; font-weight: 600; color: var(--text); }
.fp-node-sub { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
.fp-note { font-size: 13px; color: var(--text-dim); margin: 12px 0 0; }
```

- [ ] **Step 6: 통과 확인**

Run: `cd interview-map && npx vitest run src/components/flow/FlowPlayer.test.tsx && npx tsc -b`
Expected: 5개 PASS, 타입 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/flow/types.ts src/components/flow/FlowPlayer.tsx src/components/flow/FlowPlayer.css src/components/flow/FlowPlayer.test.tsx
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(printf 'feat(guide): 재사용 FlowPlayer(데이터 구동·스텝 재생·흐르는 엣지)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: 흐름 데이터 무결성 검사 + "한 턴의 생애" 흐름

**Files:**
- Create: `src/components/flow/flows/validate.ts`
- Create: `src/components/flow/flows/turnLifecycle.ts`
- Test: `src/components/flow/flows/validate.test.ts`

**Interfaces:**
- Consumes: `Flow`(Task 1 `types.ts`).
- Produces:
  - `validate.ts`: `validateFlow(flow: Flow): string[]` — 위반 메시지 배열(빈 배열 = 정상). 검사: 모든 `node.stage`가 `stages`에 존재; 모든 `step.activeNodes`·`step.edges.from/to`가 `nodes`에 존재.
  - `turnLifecycle.ts`: `export const turnLifecycle: Flow`.

- [ ] **Step 1: 실패 테스트 작성** — `src/components/flow/flows/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateFlow } from './validate'
import { turnLifecycle } from './turnLifecycle'
import type { Flow } from '../types'

describe('validateFlow', () => {
  it('returns [] for a valid flow', () => {
    const ok: Flow = {
      stages: [{ id: 's', label: 'S', color: '#000' }],
      nodes: [{ id: 'n', stage: 's', title: 'N' }],
      steps: [{ title: 't', activeNodes: ['n'], edges: [] }],
    }
    expect(validateFlow(ok)).toEqual([])
  })
  it('flags a node in an unknown stage', () => {
    const bad: Flow = {
      stages: [{ id: 's', label: 'S', color: '#000' }],
      nodes: [{ id: 'n', stage: 'nope', title: 'N' }],
      steps: [],
    }
    expect(validateFlow(bad).length).toBeGreaterThan(0)
  })
  it('flags a step referencing a missing node', () => {
    const bad: Flow = {
      stages: [{ id: 's', label: 'S', color: '#000' }],
      nodes: [{ id: 'n', stage: 's', title: 'N' }],
      steps: [{ title: 't', activeNodes: ['ghost'], edges: [{ from: 'n', to: 'ghost' }] }],
    }
    expect(validateFlow(bad).length).toBeGreaterThan(0)
  })
})

describe('turnLifecycle data', () => {
  it('is internally consistent', () => {
    expect(validateFlow(turnLifecycle)).toEqual([])
  })
  it('has multiple steps and the four runtime stages', () => {
    expect(turnLifecycle.steps.length).toBeGreaterThanOrEqual(7)
    expect(turnLifecycle.stages.map((s) => s.id).sort()).toEqual(['browser', 'db', 'edge', 'llm'])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd interview-map && npx vitest run src/components/flow/flows/validate.test.ts`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: validate 구현** — `src/components/flow/flows/validate.ts`:

```ts
import type { Flow } from '../types'

// 흐름 데이터 무결성: 참조되는 stage/node가 실제로 존재하는지. 빈 배열 = 정상.
export function validateFlow(flow: Flow): string[] {
  const errs: string[] = []
  const stageIds = new Set(flow.stages.map((s) => s.id))
  const nodeIds = new Set(flow.nodes.map((n) => n.id))
  for (const n of flow.nodes) {
    if (!stageIds.has(n.stage)) errs.push(`node ${n.id} → unknown stage ${n.stage}`)
  }
  flow.steps.forEach((st, i) => {
    for (const a of st.activeNodes) if (!nodeIds.has(a)) errs.push(`step ${i} activeNode ${a} missing`)
    for (const e of st.edges) {
      if (!nodeIds.has(e.from)) errs.push(`step ${i} edge.from ${e.from} missing`)
      if (!nodeIds.has(e.to)) errs.push(`step ${i} edge.to ${e.to} missing`)
    }
  })
  return errs
}
```

- [ ] **Step 4: 흐름 데이터 구현** — `src/components/flow/flows/turnLifecycle.ts`:

```ts
import type { Flow } from '../types'

// "한 턴의 생애": 개념 진입 → 캐시 조회 → (미스) 상한·생성·저장 → 질문 → 채점 → 힌트 → 다음.
export const turnLifecycle: Flow = {
  stages: [
    { id: 'browser', label: '브라우저', color: '#3b82f6' },
    { id: 'edge', label: 'Edge Functions', color: '#8b5cf6' },
    { id: 'db', label: 'Postgres', color: '#0ea5e9' },
    { id: 'llm', label: 'Gemini flash', color: '#f59e0b' },
  ],
  nodes: [
    { id: 'b-enter', stage: 'browser', title: '개념 진입', subtitle: '순회·사다리' },
    { id: 'b-question', stage: 'browser', title: '질문 표시' },
    { id: 'b-answer', stage: 'browser', title: '답변 입력' },
    { id: 'e-generate', stage: 'edge', title: 'generate' },
    { id: 'e-grade', stage: 'edge', title: 'grade' },
    { id: 'e-hint', stage: 'edge', title: 'hint' },
    { id: 'db-cache', stage: 'db', title: 'question_cache', subtitle: '공유 캐시' },
    { id: 'db-usage', stage: 'db', title: 'grade_usage', subtitle: '일일 상한' },
    { id: 'db-events', stage: 'db', title: 'grade_events', subtitle: '사용량 미터' },
    { id: 'g-llm', stage: 'llm', title: 'Gemini flash', subtitle: 'LLM 질문/채점' },
  ],
  steps: [
    { title: '1. 개념 진입', activeNodes: ['b-enter'], edges: [],
      note: '순회 엔진이 다음 개념(노드)을 고르고, 그 노드의 현재 계단 질문을 요청한다.' },
    { title: '2. 캐시 먼저 조회', activeNodes: ['e-generate', 'db-cache'],
      edges: [{ from: 'b-enter', to: 'e-generate' }, { from: 'e-generate', to: 'db-cache' }],
      note: 'generate는 LLM보다 먼저 question_cache를 본다. 히트면 여기서 끝(토큰 0).' },
    { title: '3. 캐시 미스 → 상한 예약', activeNodes: ['e-generate', 'db-usage'],
      edges: [{ from: 'e-generate', to: 'db-usage' }],
      note: '미스일 때만 일일 상한을 원자적으로 예약(reserve). 실패는 나중에 환불.' },
    { title: '4. Gemini가 질문 생성', activeNodes: ['e-generate', 'g-llm'],
      edges: [{ from: 'e-generate', to: 'g-llm' }, { from: 'g-llm', to: 'e-generate' }],
      note: '노트를 근거로 이 계단의 질문 + 모범답안을 만든다.' },
    { title: '5. 캐시에 저장 + 미터 로깅', activeNodes: ['e-generate', 'db-cache', 'db-events'],
      edges: [{ from: 'e-generate', to: 'db-cache' }, { from: 'e-generate', to: 'db-events' }],
      note: '생성 결과를 캐시에 넣어 다음 사용자는 토큰 0. 호출 1건을 미터에 기록.' },
    { title: '6. 질문 표시', activeNodes: ['e-generate', 'b-question'],
      edges: [{ from: 'e-generate', to: 'b-question' }],
      note: '브라우저가 질문을 렌더한다.' },
    { title: '7. 답변 → 채점', activeNodes: ['b-answer', 'e-grade', 'g-llm'],
      edges: [{ from: 'b-answer', to: 'e-grade' }, { from: 'e-grade', to: 'g-llm' }],
      note: '사용자 답변을 grade가 Gemini로 1~5점 채점.' },
    { title: '8. 막히면 힌트', activeNodes: ['b-answer', 'e-hint', 'g-llm'],
      edges: [{ from: 'b-answer', to: 'e-hint' }, { from: 'e-hint', to: 'g-llm' }],
      note: '점수가 낮으면(≤2) 답변 기반 힌트를 한 줄 준다.' },
    { title: '9. 다음 개념으로', activeNodes: ['e-grade', 'b-enter'],
      edges: [{ from: 'e-grade', to: 'b-enter' }],
      note: '점수가 다음 계단/노드를 정한다(advanceLadder → 순회).' },
  ],
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd interview-map && npx vitest run src/components/flow/flows/validate.test.ts && npx tsc -b`
Expected: PASS(5개), 타입 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/flow/flows/validate.ts src/components/flow/flows/turnLifecycle.ts src/components/flow/flows/validate.test.ts
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(printf 'feat(guide): 흐름 무결성 검사 + 한 턴의 생애 흐름 데이터\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: GuideView 개편 — 다크모드 수정 + 서사 카피 + 플레이어 임베드

**Files:**
- Modify: `src/components/GuideView.tsx`
- Modify: `src/components/GuideView.css`
- Modify: `src/components/GuideView.test.tsx`

**Interfaces:**
- Consumes: `FlowPlayer`(Task 1), `turnLifecycle`(Task 2). 기존 SVG는 사다리(`03-depth-ladder.svg`)·순회(`04-node-traversal.svg`)만 유지; 아키텍처/시퀀스/캐시/왜-graphdb SVG import는 제거.

- [ ] **Step 1: 다크모드 + deep-fold CSS** — `src/components/GuideView.css` 끝에 append:

```css
/* 전역 h1,h2 { color: var(--text-h) } 가 다크모드에서 안 보여서 가독 색으로 덮는다. */
.guide h1, .guide h2 { color: var(--text); }

.guide details.deep {
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  border-radius: 8px;
  padding: 8px 12px;
  margin: 10px 0 0;
  background: var(--bg-elev);
  font-size: 13px;
}
.guide details.deep > summary {
  cursor: pointer;
  color: var(--accent);
  font-weight: 600;
  font-size: 13px;
}
.guide details.deep[open] { padding-bottom: 12px; }
.guide details.deep p, .guide details.deep li { color: var(--text-dim); }
```

- [ ] **Step 2: 실패 테스트 갱신** — `src/components/GuideView.test.tsx` 전체 교체:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuideView } from './GuideView'

describe('GuideView', () => {
  it('renders the lead heading and key section headings', () => {
    render(<GuideView />)
    expect(screen.getByText(/설계 가이드/)).toBeTruthy()
    expect(screen.getByText(/왜 graph DB/)).toBeTruthy()
    expect(screen.getByText(/한 턴의 생애/)).toBeTruthy()
  })
  it('embeds the FlowPlayer for the turn lifecycle', () => {
    render(<GuideView />)
    expect(document.querySelector('.flow-player')).toBeTruthy()
    // 플레이어의 스텝 카운터가 존재
    expect(document.querySelector('.fp-counter')).toBeTruthy()
  })
  it('has at least one deep-fold for technical detail', () => {
    render(<GuideView />)
    expect(document.querySelector('details.deep')).toBeTruthy()
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd interview-map && npx vitest run src/components/GuideView.test.tsx`
Expected: FAIL (한 턴의 생애/flow-player/deep 없음 — 현재 GuideView는 정적 SVG 구조).

- [ ] **Step 4: GuideView 구현** — `src/components/GuideView.tsx` 전체 교체:

```tsx
import ladderUrl from '../assets/guide/03-depth-ladder.svg'
import travUrl from '../assets/guide/04-node-traversal.svg'
import { FlowPlayer } from './flow/FlowPlayer'
import { turnLifecycle } from './flow/flows/turnLifecycle'
import './GuideView.css'

export function GuideView() {
  return (
    <div className="guide">
      <h1>설계 가이드 — 왜 이렇게 만들었나</h1>
      <p className="guide-lead">
        이 면접 시뮬레이터를 만들며 <b>견고하고(solid) 안전하고(safe) 오래가는(durable)</b> 설계를 목표로 삼았습니다.
        처음 보는 동료나 면접 준비자가 "왜 이 구조인지" 편하게 이해하도록, 비유부터 살아 움직이는 흐름도까지 정리했습니다.
      </p>

      <section>
        <h2>비유: 좋은 면접관은 사다리를 오른다</h2>
        <p>
          진짜 면접관은 "포트가 뭐죠?"로 가볍게 시작합니다. 답을 들으면 "그럼 8080에 앱을 띄우면 무슨 일이 나죠?"로
          한 발 더, 또 "OS 레벨에선 어떻게 되죠?", "두 프로세스가 같은 포트를 잡으면요?"로 <b>한 개념을 계속 깊이</b> 팝니다.
          우리는 이 "점점 깊어지는" 리듬을 개념마다 4계단(L1~L4)의 사다리로 코드에 새겼습니다. 아래 흐름도가 그 한 판을 보여줍니다.
        </p>
      </section>

      <section>
        <h2>한 턴의 생애 — 질문 하나가 만들어지는 과정</h2>
        <p>
          사용자가 개념 하나를 마주하면, 브라우저·Edge Function·데이터베이스·Gemini가 손발을 맞춰 질문 하나를 만들어냅니다.
          <b>▶ 재생</b>을 눌러 한 턴이 어떻게 흘러가는지 따라가 보세요. 핵심은 "캐시를 먼저 본다"는 것 —
          이미 있으면 LLM을 아예 부르지 않아 토큰이 0입니다.
        </p>
        <FlowPlayer flow={turnLifecycle} />
        <details className="deep">
          <summary>더 깊이 — 캐시·상한·미터가 실제로 도는 법</summary>
          <ul>
            <li><b>캐시 키</b>는 <code>(node_id, rung, note_hash)</code>이고, <code>note_hash</code>는 <b>서버가 노트 텍스트에서 직접 계산</b>합니다(클라 값 불신 → 공유 캐시 오염 차단).</li>
            <li><b>상한</b>은 <code>reserve_grade_slot</code> 한 문장으로 예약+증가를 원자화(TOCTOU 없음), LLM 실패 시 <code>refund</code>로 되돌립니다(실패는 무료).</li>
            <li><b>미터</b>는 <code>grade_events</code>에 성공 호출만 로깅 — 캐시 히트는 로깅도 예약도 하지 않습니다.</li>
          </ul>
        </details>
      </section>

      <section>
        <h2>왜 graph DB를 쓰지 않았나</h2>
        <p>
          "개념이 그래프로 얽혀 있으니 Neo4j 같은 graph DB가 필요하지 않나?" — 자연스러운 질문이지만, 답은 "아니오"였습니다.
          개념 연결(122노드·169엣지)은 이미 <code>graph.json</code>에 있고, 순회는 브라우저 메모리에서 순수 함수로 <b>마이크로초</b> 만에 끝납니다.
          graph DB가 값을 하는 건 수백만 노드, 서버측 다단계 질의, 동시 영속화가 필요할 때입니다. 무엇보다 graph DB는
          <b>질문을 만들어 주지도, 토큰을 아껴 주지도</b> 않습니다 — 그건 전혀 다른 문제(LLM과 캐시)였으니까요.
        </p>
        <details className="deep">
          <summary>더 깊이 — 그래도 언제 graph DB가 정당한가</summary>
          <p>노드가 수백만 규모거나, "6홉 이내 연결 경로" 같은 깊은 그래프 질의를 서버에서 상시 돌리거나, 그래프 구조 자체를 여러 사용자가 동시에 편집·영속화해야 할 때. 우리는 셋 다 아닙니다.</p>
        </details>
      </section>

      <section>
        <h2>개념 안 — 깊이 사다리</h2>
        <p>
          한 개념 안에서 채점 점수가 다음 계단을 정합니다. 3점 이상이면 한 계단 올라가고, 2점 이하면 답변에 맞춘 힌트를 한 번 주고
          다시 기회를 줍니다. 계단당 최대 두 번 — 그래서 한 개념은 아무리 길어도 네 계단으로 끝나고, 비용이 구조적으로 상한을 가집니다.
        </p>
        <img className="guide-diagram" src={ladderUrl} alt="깊이 사다리 상태도" />
        <p className="guide-lead" style={{ margin: '8px 0 0', fontSize: 13 }}>※ 이 그림은 다음 업데이트에서 위 흐름도처럼 살아 움직이게 바뀝니다.</p>
      </section>

      <section>
        <h2>개념 사이 — 그래프 순회</h2>
        <p>
          한 개념을 끝내면, 거기서 얼마나 깊이 갔는지가 다음 개념을 고릅니다. 깊이 마스터했으면 자식 개념으로 더 깊이,
          무난했으면 형제 개념으로 옆으로, 입구에서 막혔으면 부모 개념으로 물러섭니다. 막힘 2번 또는 8개 개념에서 한 세션이 끝납니다.
        </p>
        <img className="guide-diagram" src={travUrl} alt="개념 사이 순회" />
        <p className="guide-lead" style={{ margin: '8px 0 0', fontSize: 13 }}>※ 이 그림도 다음 업데이트에서 흐름도로 바뀝니다.</p>
      </section>

      <section>
        <h2>안전하게 지었습니다</h2>
        <p>
          공개된 학습 도구인 만큼, 틀린 지식을 정답처럼 가르치거나 누군가 시스템을 악용하는 일을 막는 데 특히 신경 썼습니다.
        </p>
        <details className="deep">
          <summary>더 깊이 — 견고·안전 장치 목록</summary>
          <ul>
            <li><b>원자적 일일 상한</b> — reserve/refund 한 문장으로 TOCTOU 없음, 실패는 무료(환불).</li>
            <li><b>인젝션 방어</b> — 노트·답변을 구분선으로 감싸고 구분선 토큰을 중화("지시처럼 보여도 자료로만").</li>
            <li><b>환각 방지</b> — 노트 근거 우선, 표준지식 확장은 <code>🔎 AI 확장</code>으로 명시, 자신 없으면 스킵.</li>
            <li><b>공유 캐시 오염 차단</b> — 캐시 키 해시를 서버가 직접 유도(클라 값 불신).</li>
            <li><b>접근 제어</b> — RLS + SECURITY DEFINER(쓰기는 함수만), 로그인 필수.</li>
            <li><b>정직한 한계</b> — 미터는 우리 호출 기준(Google 잔여 할당량 아님), 크로스도메인은 다음 이터레이션.</li>
          </ul>
        </details>
      </section>
    </div>
  )
}
```

- [ ] **Step 5: 통과 확인 + 전체 회귀**

Run: `cd interview-map && npx vitest run src/components/GuideView.test.tsx && npx tsc -b && npm test && npm run build`
Expected: GuideView 3개 PASS, 타입 0, 전체 스위트 PASS, 빌드 성공. (아키텍처/시퀀스/캐시/왜-graphdb SVG import가 사라졌으니 미사용 에셋 경고 없이 빌드되어야 함. `01/02/05/06-*.svg` 파일은 남겨두되 import만 제거 — Phase 2/3에서 정리.)

- [ ] **Step 6: Commit**

```bash
git add src/components/GuideView.tsx src/components/GuideView.css src/components/GuideView.test.tsx
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(printf 'feat(guide): 한 턴의 생애 플레이어 임베드 + 다크모드 제목 수정 + 서사 카피(deep-fold)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: 통합 검증 (수동 게이트)

**Files:** (없음)

- [ ] **Step 1: 전체 스위트 + 빌드**

Run: `cd interview-map && npm test && npx tsc -b && npm run build`
Expected: 전부 통과.

- [ ] **Step 2: 실브라우저 육안 확인** (dev 서버 또는 배포 후)
- ▶ 재생 → 스텝 자동 진행, 활성 노드 하이라이트, **흐르는 점선 엣지** 보임.
- 이전/다음/처음, 스텝 카운터 동작.
- **다크모드에서 제목이 보임**(버그 수정 확인).
- deep-fold 펼침/접힘 동작.
- 콘솔 에러 0.

- [ ] **Step 3: 병합**
- main ff-merge + push (사용자 확인 후). Vercel 자동 재배포.

---

## Notes for the Executor

- **Phase 1만**입니다. 사다리·순회 섹션은 기존 정적 SVG를 유지하고 "다음 업데이트에서 살아 움직인다" 안내 문구를 답니다. Phase 2(사다리 흐름), Phase 3(순회 흐름 + 속도 슬라이더·범례)는 후속 플랜.
- **jsdom 주의**: `FlowPlayer`의 `getBoundingClientRect`/`ResizeObserver`는 jsdom에서 0/없음 → 엣지 path가 `null`이 되어 그려지지 않을 뿐 크래시하지 않아야 함(테스트는 지오메트리 대신 스텝/활성 로직만 검증).
- **테마 변수**: 하드코딩 색 금지(스테이지 헤더 색은 흐름 데이터의 `color`가 유일한 예외 — 브랜드 팔레트). 나머지는 `var(--*)`.
- 미사용으로 남는 SVG 파일(`01/02/05/06`)은 삭제하지 말 것(Phase 2/3에서 판단) — import만 제거.
