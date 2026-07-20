import { useMemo, useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { LuArrowRight, LuShuffle, LuShield } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { extractDrillChains, seededShuffle, hashSeed } from '../lib/quiz'
import type { DrillChain } from '../lib/quiz'
import { useNotePool } from '../hooks/useNotePool'
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

  if (!chain) {
    return (
      <div className="drill">
        {scopes}
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
  }

  const assess = (correct: boolean) => {
    recordQuizResult(chain.domain, correct)
    if (!correct && firstMiss === null) setFirstMiss(step)
    if (step < total - 1) { setStep((s) => s + 1); setRevealed(false) }
    else setFinished(true)
  }

  const survived = firstMiss === null ? total : firstMiss

  return (
    <div className="drill" style={{ ['--c' as string]: domainColor(chain.domain) }}>
      {scopes}

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
      </div>
    </div>
  )
}
