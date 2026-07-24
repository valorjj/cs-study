import { useEffect, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import graphData from '../graph/graph.json'
import type { GraphData, GraphNode } from '../graph/types'
import { networkSubgraph, pickStart, nextNode, isOver, type WalkState } from '../lib/graphWalk'
import { generateQuestion } from '../lib/generate'
import { gradeAnswer, type ScoreResult } from '../lib/scoring'
import { recentUsage, type Usage } from '../lib/usageMeter'
import { useAuth } from '../hooks/useAuth'
import { useNotePool } from '../hooks/useNotePool'
import { useGraphStore } from '../store/graphStore'
import './GraphInterviewView.css'

const data = graphData as GraphData

export function GraphInterviewView({ nodes }: { nodes: GraphNode[] }) {
  const { user } = useAuth()
  const recordQuizResult = useGraphStore((s) => s.recordQuizResult)
  const sub = useMemo(() => networkSubgraph(data.nodes, data.edges, 'network'), [])
  const { loading, buildItems } = useNotePool(nodes)

  // nodeId → 노트 섹션 텍스트
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
  const [qa, setQa] = useState<{ question: string; reference: string } | null>(null)
  const cache = useMemo(() => new Map<string, { question: string; reference: string }>(), [])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [scored, setScored] = useState<ScoreResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [usage, setUsage] = useState<Usage | null>(null)

  const label = (id: string) => sub.nodes.find((n) => n.id === id)?.label ?? id

  // 사용량 미터 폴링(10초)
  useEffect(() => {
    if (!user) return
    let alive = true
    const tick = () => recentUsage().then((u) => { if (alive) setUsage(u) })
    tick(); const t = setInterval(tick, 10000)
    return () => { alive = false; clearInterval(t) }
  }, [user])

  const loadNode = async (id: string) => {
    setBusy(true); setErr(null); setScored(null); setDraft('')
    const cached = cache.get(id)
    if (cached) { setQa(cached); setBusy(false); return }
    const note = noteByNode.get(id) ?? ''
    const out = await generateQuestion(id, note)
    setBusy(false)
    if (!out.ok) {
      setErr(out.reason === 'rate_limited' ? '오늘 AI 한도를 다 썼어요.'
        : out.reason === 'unauthenticated' ? '로그인이 필요합니다.'
        : '질문 생성 실패. 다시 시도하세요.')
      return
    }
    const q = { question: out.question, reference: out.reference }
    cache.set(id, q); setQa(q)
  }

  const start = async () => {
    const s = pickStart(sub)
    if (!s) return
    setFinished(false); setState({ path: [s], visited: [s], misses: 0 }); setCur(s)
    await loadNode(s)
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

  const advance = async () => {
    if (!scored || !cur) return
    const misses = state.misses + (scored.score <= 2 ? 1 : 0)
    const st2: WalkState = { ...state, misses }
    if (isOver(st2)) { setState(st2); setFinished(true); return }
    const next = nextNode(sub, st2, scored.score)
    if (!next) { setState(st2); setFinished(true); return }
    setState({ path: [...st2.path, next], visited: [...st2.visited, next], misses })
    setCur(next); setScored(null); setDraft('')
    await loadNode(next)
  }

  const retry = () => { setScored(null); setDraft('') }

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
              <div className="gi-node">{cur ? label(cur) : ''}</div>
              {busy && !qa ? <p className="gi-dim">질문 생성 중…</p> : qa && (
                <p className="gi-q">{qa.question}</p>
              )}
              {err && <p className="gi-err">{err}</p>}
              {qa && !scored && (
                <>
                  <textarea className="gi-input" rows={5} value={draft} disabled={busy}
                    onChange={(e) => setDraft(e.target.value)} placeholder="답변을 서술형으로 작성하세요…" />
                  <button className="gi-grade" onClick={submit} disabled={busy || !draft.trim()}>
                    {busy ? '채점 중…' : '채점하기'}
                  </button>
                </>
              )}
              {scored && (
                <div className="gi-scored" data-band={scored.score >= 4 ? 'good' : scored.score >= 3 ? 'mid' : 'low'}>
                  <div className="gi-score">채점 <b>{scored.score}</b> / 5</div>
                  <p className="gi-fb">{scored.feedback}</p>
                  {scored.score <= 2 && (
                    <div className="gi-coach">
                      <p className="gi-dim">모범답안:</p>
                      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{qa?.reference ?? ''}</Markdown>
                    </div>
                  )}
                  <div className="gi-actions">
                    {scored.score <= 2 && <button className="gi-retry" onClick={retry}>다시 답변</button>}
                    <button className="gi-next" onClick={advance}>
                      {scored.score >= 4 ? '더 깊이 →' : scored.score >= 3 ? '다음 개념 →' : '물러서기 →'}
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
