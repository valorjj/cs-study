import { useEffect, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { LuArrowRight, LuShuffle } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { parseNoteRef, parseSections } from '../lib/notes'
import { extractQuizItems, seededShuffle, hashSeed, weakDomains } from '../lib/quiz'
import { domainColor } from '../styles/theme'
import type { GraphNode } from '../graph/types'
import './QuizView.css'

interface QuizItem {
  id: string
  question: string
  answer: string
  domain: string
  nodeId: string
  nodeLabel: string
}

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Flashcard quiz: build the item pool from concept-note interview questions,
// draw them in a date-seeded order within the chosen scope.
export function QuizView({ nodes }: { nodes: GraphNode[] }) {
  const select = useGraphStore((s) => s.select)
  const setViewMode = useGraphStore((s) => s.setViewMode)
  const recordQuizResult = useGraphStore((s) => s.recordQuizResult)
  const quizStats = useGraphStore((s) => s.quizStats)
  const requestTrack = useGraphStore((s) => s.requestTrack)
  const [pool, setPool] = useState<QuizItem[] | null>(null)
  const [scope, setScope] = useState<string>('all')
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const concept = nodes.filter((n) => n.level !== 0 && n.noteRef)
    const domainNode = new Map(nodes.filter((n) => n.level === 0).map((n) => [n.domain, n]))
    const anchorMap = new Map<string, Map<string, GraphNode>>()
    const fileDomain = new Map<string, string>()
    for (const n of concept) {
      const { path, anchor } = parseNoteRef(n.noteRef!)
      fileDomain.set(path, n.domain)
      if (!anchor) continue
      if (!anchorMap.has(path)) anchorMap.set(path, new Map())
      anchorMap.get(path)!.set(anchor, n)
    }
    const files = [...new Set(concept.map((n) => parseNoteRef(n.noteRef!).path))]
    Promise.all(
      files.map((f) =>
        fetch(f).then((r) => (r.ok ? r.text() : '')).catch(() => '').then((md) => [f, md] as const),
      ),
    ).then((results) => {
      if (cancelled) return
      const items: QuizItem[] = []
      for (const [path, md] of results) {
        if (!md) continue
        const { sections } = parseSections(md)
        for (const s of sections) {
          const raws = extractQuizItems(s.body)
          if (!raws.length) continue
          const owner = anchorMap.get(path)?.get(s.slug)
          const domain = owner?.domain ?? fileDomain.get(path) ?? ''
          const dn = domainNode.get(domain)
          const nodeId = owner?.id ?? dn?.id ?? ''
          const nodeLabel = owner?.label ?? dn?.label ?? domain
          raws.forEach((r, i) =>
            items.push({ id: `${path}#${s.slug}#${i}`, ...r, domain, nodeId, nodeLabel }),
          )
        }
      }
      setPool(items)
    })
    return () => { cancelled = true }
  }, [nodes])

  const domains = useMemo(() => {
    if (!pool) return []
    const present = new Set(pool.map((i) => i.domain))
    return nodes.filter((n) => n.level === 0 && present.has(n.domain))
  }, [pool, nodes])

  const deck = useMemo(() => {
    if (!pool) return []
    const scoped = scope === 'all' ? pool : pool.filter((i) => i.domain === scope)
    return seededShuffle(scoped, hashSeed(`${todayStr()}:${scope}`))
  }, [pool, scope])

  useEffect(() => { setIndex(0); setRevealed(false) }, [scope])

  if (!pool) return <div className="quiz"><p className="quiz-dim">퀴즈 불러오는 중…</p></div>
  const card = deck[index]

  const domainLabel = new Map(nodes.filter((n) => n.level === 0).map((n) => [n.domain, n.label]))
  const weak = weakDomains(quizStats)
  const advance = () => { setIndex((i) => (i + 1) % deck.length); setRevealed(false) }
  const assess = (correct: boolean) => { if (card) recordQuizResult(card.domain, correct); advance() }

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
