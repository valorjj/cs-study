import { useEffect, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import graphData from '../graph/graph.json'
import type { GraphData, GraphNode } from '../graph/types'
import { networkSubgraph, pickStart, nextNode, isOver, type WalkState } from '../lib/graphWalk'
import { generateQuestion } from '../lib/generate'
import { getHint } from '../lib/hint'
import { noteHash } from '../lib/noteHash'
import { START_LADDER, advanceLadder, ladderSignal, applySkip, type LadderState } from '../lib/ladder'
import { gradeAnswer, type ScoreResult } from '../lib/scoring'
import { recentUsage, type Usage } from '../lib/usageMeter'
import { useAuth } from '../hooks/useAuth'
import { useNotePool } from '../hooks/useNotePool'
import { useGraphStore } from '../store/graphStore'
import './GraphInterviewView.css'

const data = graphData as GraphData
const NODE_CAP = 8

interface QA { question: string; reference: string; grounded: boolean }

export function GraphInterviewView({ nodes }: { nodes: GraphNode[] }) {
  const { user } = useAuth()
  const recordQuizResult = useGraphStore((s) => s.recordQuizResult)
  const sub = useMemo(() => networkSubgraph(data.nodes, data.edges, 'network'), [])
  const { loading, buildItems } = useNotePool(nodes)

  const noteByNode = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of buildItems((body) => [{ body }])) {
      const prev = m.get(it.nodeId) ?? ''
      m.set(it.nodeId, prev ? `${prev}\n\n${it.body}` : it.body)
    }
    return m
  }, [buildItems])

  const [state, setState] = useState<WalkState>({ path: [], visited: [], misses: 0 })
  const [cur, setCur] = useState<string | null>(null)
  const [ladder, setLadder] = useState<LadderState>(START_LADDER)
  const [qa, setQa] = useState<QA | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [scored, setScored] = useState<ScoreResult | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [hintOffered, setHintOffered] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [usage, setUsage] = useState<Usage | null>(null)

  const label = (id: string) => sub.nodes.find((n) => n.id === id)?.label ?? id

  useEffect(() => {
    if (!user) return
    let alive = true
    const tick = () => recentUsage().then((u) => { if (alive) setUsage(u) })
    tick(); const t = setInterval(tick, 10000)
    return () => { alive = false; clearInterval(t) }
  }, [user])

  // 특정 노드의 특정 계단 질문을 로드. skip이면 콜백으로 알림.
  const loadRung = async (nodeId: string, rung: number): Promise<'ok' | 'skip' | 'error'> => {
    setBusy(true); setErr(null); setScored(null); setDraft(''); setHint(null); setHintOffered(false); setQa(null)
    const note = noteByNode.get(nodeId) ?? ''
    const out = await generateQuestion(nodeId, note, rung, noteHash(note))
    setBusy(false)
    if (!out.ok) {
      setErr(out.reason === 'rate_limited' ? '오늘 AI 한도를 다 썼어요.'
        : out.reason === 'unauthenticated' ? '로그인이 필요합니다.'
        : '질문 생성 실패. 다시 시도하세요.')
      return 'error'
    }
    if (out.skip) return 'skip'
    setQa({ question: out.question, reference: out.reference, grounded: out.grounded })
    return 'ok'
  }

  const enterNode = async (nodeId: string) => {
    setLadder(START_LADDER)
    const res = await loadRung(nodeId, 1)
    if (res === 'skip') setErr('이 개념은 지금 다룰 자료가 부족해요. 다음 개념으로 넘어가세요.')
  }

  const start = async () => {
    const s = pickStart(sub)
    if (!s) return
    setFinished(false); setState({ path: [s], visited: [s], misses: 0 }); setCur(s)
    await enterNode(s)
  }

  const submit = async () => {
    if (!cur || !qa || busy || !draft.trim()) return
    setBusy(true); setErr(null)
    const out = await gradeAnswer({ question: qa.question, reference: qa.reference, userAnswer: draft, nodeId: cur })
    setBusy(false)
    if (!out.ok) {
      setErr(out.reason === 'rate_limited' ? '오늘 AI 한도를 다 썼어요.' : '채점 실패. 다시 시도하세요.')
      return
    }
    setScored(out.result)
    recordQuizResult('network', out.result.score >= 3)
  }

  const askHint = async () => {
    if (!qa || busy) return
    setBusy(true)
    const out = await getHint(qa.question, qa.reference, draft)
    setBusy(false)
    if (out.ok) setHint(out.hint)
    else setErr('힌트 생성 실패. 그냥 다시 답변해보세요.')
  }

  // 사다리 산출로 다음 노드 선택(개념 사이 순회).
  const goNextNode = async (reached: number, weak: boolean) => {
    const misses = state.misses + (weak ? 1 : 0)
    const st2: WalkState = { ...state, misses }
    if (isOver(st2) || st2.path.length >= NODE_CAP) { setState(st2); setFinished(true); return }
    const next = nextNode(sub, st2, ladderSignal(reached))
    if (!next) { setState(st2); setFinished(true); return }
    setState({ path: [...st2.path, next], visited: [...st2.visited, next], misses })
    setCur(next)
    await enterNode(next)
  }

  // 채점 결과를 사다리에 적용 → climb / offer-hint / node-done.
  const advance = async () => {
    if (!scored || !cur) return
    const act = advanceLadder(ladder, scored.score)
    if (act.kind === 'offer-hint') {
      setLadder(act.state); setScored(null); setDraft(''); setHintOffered(true)
      return
    }
    if (act.kind === 'climb') {
      setLadder(act.state)
      const res = await loadRung(cur, act.state.rung)
      if (res === 'skip') {
        const done = applySkip(act.state)
        if (done.kind === 'node-done') await goNextNode(done.reached, done.weak)
      }
      return
    }
    // node-done
    await goNextNode(act.reached, act.weak)
  }

  if (!user) return <div className="gi"><p className="gi-dim">로그인하면 그래프 면접을 시작할 수 있어요.</p></div>
  if (loading) return <div className="gi"><p className="gi-dim">노트 불러오는 중…</p></div>

  return (
    <div className="gi">
      <div className="gi-meter">
        AI 호출 — 분 {usage?.perMin ?? '·'} · 시간 {usage?.perHour ?? '·'} · 오늘 {usage?.perDay ?? '·'}
      </div>
      {state.path.length === 0 ? (
        <button className="gi-start" onClick={start}>면접 시작 (Network)</button>
      ) : (
        <>
          <div className="gi-path">{state.path.map((id, i) => (
            <span key={i} className="gi-crumb" data-cur={i === state.path.length - 1}>{label(id)}</span>
          ))}</div>
          {finished ? (
            <div className="gi-summary">
              <p>면접 종료 — <b>{state.path.length}</b>개 개념을 거쳤어요 (miss {state.misses}/2).</p>
              <button className="gi-start" onClick={start}>다시 시작</button>
            </div>
          ) : (
            <div className="gi-card">
              <div className="gi-node">
                {cur ? label(cur) : ''}
                <span className="gi-rung">L{ladder.rung}</span>
                {qa && !qa.grounded && <span className="gi-badge">🔎 AI 확장</span>}
              </div>
              {busy && !qa ? <p className="gi-dim">질문 생성 중…</p> : qa && (
                <p className="gi-q">{qa.question}</p>
              )}
              {err && <p className="gi-err">{err}</p>}
              {!qa && !busy && !finished && err && (
                <div className="gi-actions">
                  <button className="gi-grade" onClick={() => { if (cur) loadRung(cur, ladder.rung) }}>다시 시도</button>
                  <button className="gi-next" onClick={() => goNextNode(0, true)}>다음 개념 →</button>
                </div>
              )}
              {qa && !scored && (
                <>
                  <textarea className="gi-input" rows={5} value={draft} disabled={busy}
                    onChange={(e) => setDraft(e.target.value)} placeholder="답변을 서술형으로 작성하세요…" />
                  {hintOffered && (
                    <div className="gi-hintbox">
                      {hint ? <p className="gi-hint">💡 {hint}</p>
                        : <button className="gi-hintbtn" onClick={askHint} disabled={busy}>💡 힌트 볼까요?</button>}
                    </div>
                  )}
                  <button className="gi-grade" onClick={submit} disabled={busy || !draft.trim()}>
                    {busy ? '처리 중…' : hintOffered ? '다시 채점' : '채점하기'}
                  </button>
                </>
              )}
              {scored && (
                <div className="gi-scored" data-band={scored.score >= 4 ? 'good' : scored.score >= 3 ? 'mid' : 'low'}>
                  <div className="gi-score">채점 <b>{scored.score}</b> / 5</div>
                  <p className="gi-fb">{scored.feedback}</p>
                  {scored.score <= 2 && ladder.attempts >= 1 && (
                    <div className="gi-coach">
                      <p className="gi-dim">모범답안:</p>
                      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{qa?.reference ?? ''}</Markdown>
                    </div>
                  )}
                  <div className="gi-actions">
                    <button className="gi-next" onClick={advance}>
                      {scored.score >= 4 ? '더 깊이 →' : scored.score >= 3 ? '다음 계단 →' : ladder.attempts === 0 ? '힌트 받고 재도전 →' : '다음 개념 →'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
