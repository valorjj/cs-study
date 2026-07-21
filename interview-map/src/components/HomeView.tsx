import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { LuMap, LuBrain, LuRoute, LuArrowRight } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import type { ViewMode } from '../store/graphStore'
import { useNotePool } from '../hooks/useNotePool'
import { extractQuizItems } from '../lib/quiz'
import { dueCount } from '../lib/srs'
import type { GraphNode } from '../graph/types'
import './HomeView.css'

interface ModeCard { icon: ReactNode; title: string; desc: string; cta: string; target: ViewMode }

const CARDS: ModeCard[] = [
  { icon: <LuRoute size={26} />, title: '학습 경로', desc: '추천 순서대로 CS·백엔드 기초를 정복', cta: '시작', target: 'path' },
  { icon: <LuBrain size={26} />, title: '면접 퀴즈', desc: '플래시카드 + 면접 꼬리질문 드릴다운', cta: '풀기', target: 'quiz' },
  { icon: <LuMap size={26} />, title: '개념 지도', desc: '개념 간 연결을 그래프로 탐색', cta: '열기', target: 'graph' },
]

// 오늘 날짜를 YYYY-MM-DD 형식으로 반환 (SRS due 계산용)
function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Landing home: orients a first-time visitor with a one-line intro and three
// mode entry cards. Each card just switches viewMode; the quiz card also
// shows today's SRS due count as a badge.
export function HomeView({ nodes }: { nodes: GraphNode[] }) {
  const setViewMode = useGraphStore((s) => s.setViewMode)
  const srs = useGraphStore((s) => s.srs)
  const { buildItems } = useNotePool(nodes)
  const pool = useMemo(() => buildItems(extractQuizItems), [buildItems])
  const due = useMemo(() => dueCount(pool, srs, todayStr()), [pool, srs])
  return (
    <div className="home">
      <header className="home-hero">
        <h1>CS · 백엔드 면접 지도</h1>
        <p>개념을 잇고 · 면접처럼 파고들고 · 순서대로 정복</p>
      </header>
      <div className="home-cards">
        {CARDS.map((c) => (
          <button key={c.target} className="home-card" onClick={() => setViewMode(c.target)}>
            <span className="home-card-icon">{c.icon}</span>
            <span className="home-card-title">{c.title}</span>
            <span className="home-card-desc">{c.desc}</span>
            {c.target === 'quiz' && due > 0 && (
              <span className="home-card-badge">🔁 오늘 {due}개</span>
            )}
            <span className="home-card-cta">{c.cta} <LuArrowRight size={14} /></span>
          </button>
        ))}
      </div>
    </div>
  )
}
