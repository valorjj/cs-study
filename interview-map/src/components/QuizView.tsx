import { useMemo, useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { LuArrowRight, LuShuffle } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { extractQuizItems, seededShuffle, hashSeed, weakDomains } from '../lib/quiz'
import { useNotePool } from '../hooks/useNotePool'
import { domainColor } from '../styles/theme'
import type { GraphNode } from '../graph/types'
import './QuizView.css'

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Flashcard quiz: interview Q&A drawn in a date-seeded order within the chosen scope.
export function QuizView({ nodes }: { nodes: GraphNode[] }) {
  const select = useGraphStore((s) => s.select)
  const setViewMode = useGraphStore((s) => s.setViewMode)
  const recordReview = useGraphStore((s) => s.recordReview)
  const quizStats = useGraphStore((s) => s.quizStats)
  const requestTrack = useGraphStore((s) => s.requestTrack)
  const [scope, setScope] = useState<string>('all')
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)

  const { loading, buildItems } = useNotePool(nodes)
  const pool = useMemo(() => buildItems(extractQuizItems), [buildItems])

  const domains = useMemo(() => {
    const present = new Set(pool.map((i) => i.domain))
    return nodes.filter((n) => n.level === 0 && present.has(n.domain))
  }, [pool, nodes])

  const deck = useMemo(() => {
    const scoped = scope === 'all' ? pool : pool.filter((i) => i.domain === scope)
    return seededShuffle(scoped, hashSeed(`${todayStr()}:${scope}`))
  }, [pool, scope])

  useEffect(() => { setIndex(0); setRevealed(false) }, [scope])

  if (loading) return <div className="quiz"><p className="quiz-dim">퀴즈 불러오는 중…</p></div>
  const card = deck[index]

  const domainLabel = new Map(nodes.filter((n) => n.level === 0).map((n) => [n.domain, n.label]))
  const weak = weakDomains(quizStats)
  const advance = () => { setIndex((i) => (i + 1) % deck.length); setRevealed(false) }
  const assess = (correct: boolean) => {
    if (card) recordReview(card.srsKey, card, correct ? 4 : 0, todayStr())
    advance()
  }

  return (
    <div className="quiz">
      <div className="quiz-scopes">
        <button className="quiz-scope" data-active={scope === 'all'} onClick={() => setScope('all')}>
          <LuShuffle size={13} /> 전체 랜덤
        </button>
        {domains.map((d) => (
          <button
            key={d.domain}
            className="quiz-scope"
            data-active={scope === d.domain}
            style={{ ['--c' as string]: domainColor(d.domain) }}
            onClick={() => setScope(d.domain)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {weak.length > 0 && (
        <div className="quiz-weak">
          <span className="quiz-weak-label">🎯 약점 보강</span>
          {weak.map((w) => (
            <button key={w.domain} className="quiz-weak-chip" onClick={() => requestTrack(`domain:${w.domain}`)}>
              {domainLabel.get(w.domain) ?? w.domain} <b>{w.correct}/{w.seen}</b>
            </button>
          ))}
        </div>
      )}

      {card ? (
        <div className="quiz-card" style={{ ['--c' as string]: domainColor(card.domain) }}>
          <div className="quiz-meta">
            <span className="quiz-count">{index + 1} / {deck.length}</span>
            <span className="quiz-badge">{card.nodeLabel}</span>
          </div>
          <p className="quiz-q">{card.question}</p>

          {revealed ? (
            <div className="quiz-a">
              <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{card.answer}</Markdown>
            </div>
          ) : (
            <button className="quiz-reveal" onClick={() => setRevealed(true)}>답 보기</button>
          )}

          <div className="quiz-actions">
            <button className="quiz-link" onClick={() => { select(card.nodeId); setViewMode('list') }}>
              이 개념 보기 <LuArrowRight size={14} />
            </button>
            {revealed ? (
              <div className="quiz-assess">
                <button className="quiz-miss" onClick={() => assess(false)}>몰랐음</button>
                <button className="quiz-got" onClick={() => assess(true)}>알았음</button>
              </div>
            ) : (
              <button className="quiz-next" onClick={advance}>다음 <LuArrowRight size={14} /></button>
            )}
          </div>
        </div>
      ) : (
        <p className="quiz-dim">이 범위에 문제가 없습니다.</p>
      )}
    </div>
  )
}
