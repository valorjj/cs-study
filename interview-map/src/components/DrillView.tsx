import { useMemo, useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { LuArrowRight, LuShuffle, LuShield } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { extractDrillChains, seededShuffle, hashSeed } from '../lib/quiz'
import type { DrillChain } from '../lib/quiz'
import { useNotePool } from '../hooks/useNotePool'
import { useAuth } from '../hooks/useAuth'
import { gradeAnswer } from '../lib/scoring'
import type { ScoreResult } from '../lib/scoring'
import { domainColor } from '../styles/theme'
import type { GraphNode } from '../graph/types'
import './DrillView.css'

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Interview drill-down: step through a main Q and its follow-up chain like an
// interviewer probing deeper. "Learning-first" — a 몰랐음 still reveals the answer
// and continues; survival depth = the first step the user missed. Each step feeds
// the existing domain weakness stats via recordQuizResult.
export function DrillView({ nodes }: { nodes: GraphNode[] }) {
  const select = useGraphStore((s) => s.select)
  const setViewMode = useGraphStore((s) => s.setViewMode)
  const recordQuizResult = useGraphStore((s) => s.recordQuizResult)
  const [scope, setScope] = useState<string>('all')
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState(0)          // 0 = main Q, 1..n = followups
  const [revealed, setRevealed] = useState(false)
  const [firstMiss, setFirstMiss] = useState<number | null>(null)
  const [finished, setFinished] = useState(false)

  const { user } = useAuth()
  const aiEnabled = !!user                    // 로그인 시에만 AI 채점 가능
  const [aiMode, setAiMode] = useState(false)
  const [draft, setDraft] = useState('')      // 답변 입력
  const [grading, setGrading] = useState(false)
  const [scored, setScored] = useState<ScoreResult | null>(null)
  const [gradeErr, setGradeErr] = useState<string | null>(null)
  const retry = () => { setScored(null); setDraft(''); setGradeErr(null) }  // 같은 질문 재도전

  const { loading, buildItems } = useNotePool(nodes)
  const pool = useMemo(() => buildItems(extractDrillChains), [buildItems])

  const domains = useMemo(() => {
    const present = new Set(pool.map((c) => c.domain))
    return nodes.filter((n) => n.level === 0 && present.has(n.domain))
  }, [pool, nodes])

  const deck = useMemo(() => {
    const scoped = scope === 'all' ? pool : pool.filter((c) => c.domain === scope)
    return seededShuffle(scoped, hashSeed(`${todayStr()}:${scope}:drill`))
  }, [pool, scope])

  useEffect(() => {
    setIndex(0)
    setStep(0); setRevealed(false); setFirstMiss(null); setFinished(false)
    setDraft(''); setScored(null); setGradeErr(null)
  }, [scope])

  if (loading) return <div className="drill"><p className="drill-dim">불러오는 중…</p></div>

  const chain = deck[index] as (DrillChain & { domain: string; nodeId: string; nodeLabel: string }) | undefined

  const scopes = (
    <div className="drill-scopes">
      <button className="drill-scope" data-active={scope === 'all'} onClick={() => setScope('all')}>
        <LuShuffle size={13} /> 전체 랜덤
      </button>
      {domains.map((d) => (
        <button key={d.domain} className="drill-scope" data-active={scope === d.domain}
          style={{ ['--c' as string]: domainColor(d.domain) }} onClick={() => setScope(d.domain)}>
          {d.label}
        </button>
      ))}
    </div>
  )

  const modeToggle = (
    <div className="drill-mode">
      <button className="drill-modebtn" data-active={!aiMode} onClick={() => { setAiMode(false); retry() }}>자가채점</button>
      <button className="drill-modebtn" data-active={aiMode} disabled={!aiEnabled}
        onClick={() => setAiMode(true)} title={aiEnabled ? '' : '로그인하면 AI 채점을 쓸 수 있어요'}>
        🤖 AI 채점
      </button>
    </div>
  )

  if (!chain) {
    return (
      <div className="drill">
        {scopes}
        {modeToggle}
        <div className="drill-empty">
          <p>이 범위는 꼬리질문이 아직 준비 중이에요.</p>
          <p className="drill-dim">지금은 OS · DevOps · 시스템 디자인 · 자료구조/알고리즘에서 연습할 수 있어요.</p>
          <button className="drill-scope" onClick={() => setScope('all')}>전체로 시작하기</button>
        </div>
      </div>
    )
  }

  const steps: { q: string; a: string }[] = [
    { q: chain.question, a: chain.answer },
    ...chain.followups.map((f) => ({ q: f.question, a: f.answer })),
  ]
  const total = steps.length
  const cur = steps[step]

  const nextCard = () => {
    setIndex((i) => (i + 1) % deck.length)
    setStep(0); setRevealed(false); setFirstMiss(null); setFinished(false)
    setDraft(''); setScored(null); setGradeErr(null)   // ← AI 상태 리셋 추가
  }

  const assess = (correct: boolean) => {
    recordQuizResult(chain.domain, correct)
    if (!correct && firstMiss === null) setFirstMiss(step)
    if (step < total - 1) { setStep((s) => s + 1); setRevealed(false) }
    else setFinished(true)
  }

  // 답변을 서버로 보내 채점받고, score로 체인을 진행하거나(≥3) 코칭을 띄운다(≤2).
  const submitAnswer = async () => {
    if (!chain || grading || !draft.trim()) return
    setGrading(true); setGradeErr(null); setScored(null)
    const out = await gradeAnswer({
      question: cur.q, reference: cur.a, userAnswer: draft, nodeId: chain.nodeId,
    })
    setGrading(false)
    if (!out.ok) {
      setGradeErr(
        out.reason === 'rate_limited' ? '오늘 채점 횟수를 다 썼어요. 내일 다시 하거나 자가채점으로 전환하세요.'
        : out.reason === 'unauthenticated' ? '로그인이 필요합니다.'
        : '채점 서버에 연결하지 못했어요. 자가채점으로 전환하거나 잠시 후 다시 시도하세요.')
      return
    }
    setScored(out.result)
    recordQuizResult(chain.domain, out.result.score >= 3)   // ≥3 = 정답 취급
    if (out.action === 'EASIER') {
      if (firstMiss === null) setFirstMiss(step)             // 생존 깊이 = 첫 막힘
    }
    // ≥3(PASS/DRILL_DOWN): 사용자가 결과 확인 후 "다음 단계"를 누르면 진행(advanceAfterScore)
  }

  // 채점 결과를 확인하고 다음 단계로. ≤2에서 재도전하려면 대신 retry를 쓴다.
  const advanceAfterScore = () => {
    const wasLast = step >= total - 1
    const easier = scored !== null && scored.score <= 2
    setScored(null); setDraft(''); setGradeErr(null)
    if (easier || wasLast) { setFinished(true); return }     // 막힘 or 체인 끝 → 종료
    setStep((s) => s + 1)                                     // 더 깊은 꼬리질문
  }

  const survived = firstMiss === null ? total : firstMiss

  return (
    <div className="drill" style={{ ['--c' as string]: domainColor(chain.domain) }}>
      {scopes}
      {modeToggle}

      <div className="drill-card">
        <div className="drill-meta">
          <span className="drill-count">{index + 1} / {deck.length}</span>
          <span className="drill-badge">{chain.nodeLabel}</span>
        </div>

        {finished ? (
          <div className="drill-summary">
            <div className="drill-depth"><LuShield size={20} /> 생존 깊이 <b>{survived}/{total}</b></div>
            <p className="drill-dim">
              {survived === total ? '끝까지 버텼어요. 완벽합니다!' : `${survived + 1}단계 꼬리질문부터 막혔어요. 이 개념을 다시 보세요.`}
            </p>
            <div className="drill-actions">
              <button className="drill-link" onClick={() => { select(chain.nodeId); setViewMode('list') }}>
                이 개념 보기 <LuArrowRight size={14} />
              </button>
              <button className="drill-next" onClick={nextCard}>다음 개념 <LuArrowRight size={14} /></button>
            </div>
          </div>
        ) : (
          <>
            <div className="drill-steps">
              {steps.map((_, i) => (
                <span key={i} className="drill-dot" data-done={i < step} data-active={i === step} />
              ))}
              <span className="drill-stepnum">단계 {step + 1}/{total}{step > 0 ? ' · 꼬리질문' : ''}</span>
            </div>
            <p className="drill-q">{cur.q}</p>
            {aiMode ? (
              <div className="drill-ai">
                {scored ? (
                  <div className="drill-scored" data-band={scored.score >= 4 ? 'good' : scored.score >= 3 ? 'mid' : 'low'}>
                    <div className="drill-score">채점 <b>{scored.score}</b> / 5</div>
                    <p className="drill-fb">{scored.feedback}</p>
                    {scored.missing_keywords.length > 0 && (
                      <ul className="drill-missing">{scored.missing_keywords.map((k, i) => <li key={i}>{k}</li>)}</ul>
                    )}
                    {scored.score <= 2 ? (
                      <div className="drill-a">
                        <p className="drill-dim">모범답안:</p>
                        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{cur.a}</Markdown>
                        <div className="drill-assess">
                          <button className="drill-miss" onClick={retry}>다시 답변</button>
                          <button className="drill-got" onClick={advanceAfterScore}>다음으로</button>
                        </div>
                      </div>
                    ) : (
                      <button className="drill-next" onClick={advanceAfterScore}>
                        {step >= total - 1 ? '결과 보기' : '더 깊은 꼬리질문 →'}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <textarea className="drill-input" value={draft} onChange={(e) => setDraft(e.target.value)}
                      placeholder="답변을 서술형으로 작성하세요…" rows={5} disabled={grading} />
                    {gradeErr && <p className="drill-err">{gradeErr}</p>}
                    <button className="drill-grade" onClick={submitAnswer} disabled={grading || !draft.trim()}>
                      {grading ? '채점 중…' : '채점하기'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                {revealed ? (
                  <div className="drill-a">
                    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{cur.a}</Markdown>
                  </div>
                ) : (
                  <button className="drill-reveal" onClick={() => setRevealed(true)}>답 보기</button>
                )}
                {revealed && (
                  <div className="drill-assess">
                    <button className="drill-miss" onClick={() => assess(false)}>몰랐음</button>
                    <button className="drill-got" onClick={() => assess(true)}>알았음</button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
