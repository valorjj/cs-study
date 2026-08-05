import { useEffect, useMemo } from 'react'
import Markdown from 'react-markdown'
import { remarkPlugins } from '../lib/markdownPlugins'
import rehypeRaw from 'rehype-raw'
import { LuArrowRight, LuCircleCheck } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { extractQuizItems, weakDomains } from '../lib/quiz'
import { buildReviewDeck, GRADE_SETS } from '../lib/srs'
import { useNotePool } from '../hooks/useNotePool'
import { domainColor } from '../styles/theme'
import type { GraphNode } from '../graph/types'
import './ReviewView.css'

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Spaced-repetition review: today's due + new cards, graded on a 3-point scale.
export function ReviewView({ nodes }: { nodes: GraphNode[] }) {
  const openNote = useGraphStore((s) => s.openNote)
  const setViewMode = useGraphStore((s) => s.setViewMode)
  const srs = useGraphStore((s) => s.srs)
  const quizStats = useGraphStore((s) => s.quizStats)
  const recordReview = useGraphStore((s) => s.recordReview)
  const quizSettings = useGraphStore((s) => s.quizSettings)
  // Position + session deck live in the store: "이 개념 보기" unmounts the quiz tab
  // (App renders per viewMode), so local state would restart the review. See QuizPos.
  const pos = useGraphStore((s) => s.quizPos.review)
  const setPos = useGraphStore((s) => s.setQuizPos)

  const { loading, buildItems } = useNotePool(nodes)
  const pool = useMemo(() => buildItems(extractQuizItems), [buildItems])

  // Freeze the deck for the session: grading a card changes `srs`, which would
  // otherwise rebuild the deck and drop the just-graded card mid-run.
  const today = todayStr()
  const cap = quizSettings.newCardCap === 0 ? Infinity : quizSettings.newCardCap
  const deck = useMemo(() => {
    // A deck saved earlier this session wins: rebuilding it after a remount would
    // drop every card already graded today (they're no longer due) and shrink the
    // counter mid-run. Keys are resolved against the fresh pool.
    if (pos.deckKeys) {
      const byKey = new Map(pool.map((c) => [c.key, c]))
      const restored = pos.deckKeys.map((k) => byKey.get(k)).filter((c): c is typeof pool[number] => !!c)
      if (restored.length) return restored
    }
    const weakOrder = weakDomains(quizStats, { limit: 99 }).map((w) => w.domain)
    return buildReviewDeck(pool, srs, today, weakOrder, cap)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool])
  const grades = GRADE_SETS[quizSettings.gradeButtons] ?? GRADE_SETS[3]

  // Freeze the freshly built deck for the session so a remount restores it verbatim.
  useEffect(() => {
    if (!pos.deckKeys && deck.length) setPos('review', { deckKeys: deck.map((c) => c.key) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck])

  if (loading) return <div className="review"><p className="review-dim">복습 카드 불러오는 중…</p></div>

  // `finished` is the past-the-end marker a card key can't express.
  const found = pos.cardKey ? deck.findIndex((c) => c.key === pos.cardKey) : -1
  const index = pos.finished ? deck.length : found === -1 ? 0 : found
  const revealed = pos.revealed
  const setRevealed = (v: boolean) => setPos('review', { revealed: v })

  const card = deck[index]
  const grade = (g: number) => {
    if (card) recordReview(card.srsKey, card, g, today)
    const next = deck[index + 1]
    setPos('review', next
      ? { cardKey: next.key, revealed: false }
      : { finished: true, revealed: false })
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
          <p className="review-empty-title">{done ? <><LuCircleCheck size={18} /> 오늘 복습 완료</> : '복습할 카드가 아직 없어요'}</p>
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
            <Markdown remarkPlugins={remarkPlugins} rehypePlugins={[rehypeRaw]}>{card.answer}</Markdown>
          </div>
        ) : (
          <button className="review-reveal" onClick={() => setRevealed(true)}>답 보기</button>
        )}

        <div className="review-actions">
          <button className="review-link" onClick={() => openNote(card.nodeId)}>
            이 개념 보기 <LuArrowRight size={14} />
          </button>
          {revealed && (
            <div className="review-grades">
              {grades.map((g) => (
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
