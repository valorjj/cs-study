import { useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { LuArrowRight } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { extractQuizItems, weakDomains } from '../lib/quiz'
import { buildReviewDeck } from '../lib/srs'
import { useNotePool } from '../hooks/useNotePool'
import { domainColor } from '../styles/theme'
import type { GraphNode } from '../graph/types'
import './ReviewView.css'

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const GRADES = [
  { grade: 0, label: '모름', cls: 'review-g0' },
  { grade: 3, label: '애매', cls: 'review-g3' },
  { grade: 5, label: '쉬움', cls: 'review-g5' },
]

// Spaced-repetition review: today's due + new cards, graded on a 3-point scale.
export function ReviewView({ nodes }: { nodes: GraphNode[] }) {
  const select = useGraphStore((s) => s.select)
  const setViewMode = useGraphStore((s) => s.setViewMode)
  const srs = useGraphStore((s) => s.srs)
  const quizStats = useGraphStore((s) => s.quizStats)
  const recordReview = useGraphStore((s) => s.recordReview)

  const { loading, buildItems } = useNotePool(nodes)
  const pool = useMemo(() => buildItems(extractQuizItems), [buildItems])

  // Freeze the deck for the session: grading a card changes `srs`, which would
  // otherwise rebuild the deck and drop the just-graded card mid-run.
  const today = todayStr()
  const deck = useMemo(() => {
    const weakOrder = weakDomains(quizStats, { limit: 99 }).map((w) => w.domain)
    return buildReviewDeck(pool, srs, today, weakOrder)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool])

  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)

  if (loading) return <div className="review"><p className="review-dim">복습 카드 불러오는 중…</p></div>

  const card = deck[index]
  const grade = (g: number) => {
    if (card) recordReview(card.srsKey, card, g, today)
    setIndex((i) => i + 1)
    setRevealed(false)
  }

  if (!card) {
    // Finished the deck (or nothing was due). Show the soonest upcoming due date.
    const upcoming = pool
      .map((c) => srs[c.srsKey]?.due)
      .filter((d): d is string => !!d && d > today)
      .sort()
    const done = deck.length > 0
    return (
      <div className="review">
        <div className="review-empty">
          <p className="review-empty-title">{done ? '오늘 복습 완료 🎉' : '복습할 카드가 아직 없어요'}</p>
          {upcoming.length > 0
            ? <p className="review-dim">다음 복습: {upcoming[0]}</p>
            : <p className="review-dim">플래시카드를 몇 개 풀면 복습 일정이 생겨요.</p>}
          <button className="review-link" onClick={() => setViewMode('quiz')}>
            플래시카드로 채우기 <LuArrowRight size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="review">
      <div className="review-card" style={{ ['--c' as string]: domainColor(card.domain) }}>
        <div className="review-meta">
          <span className="review-count">{index + 1} / {deck.length}</span>
          <span className="review-badge">{card.nodeLabel}</span>
        </div>
        <p className="review-q">{card.question}</p>

        {revealed ? (
          <div className="review-a">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{card.answer}</Markdown>
          </div>
        ) : (
          <button className="review-reveal" onClick={() => setRevealed(true)}>답 보기</button>
        )}

        <div className="review-actions">
          <button className="review-link" onClick={() => { select(card.nodeId); setViewMode('list') }}>
            이 개념 보기 <LuArrowRight size={14} />
          </button>
          {revealed && (
            <div className="review-grades">
              {GRADES.map((g) => (
                <button key={g.grade} className={`review-grade ${g.cls}`} onClick={() => grade(g.grade)}>
                  {g.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
