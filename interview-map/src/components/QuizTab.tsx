import { useMemo, useState } from 'react'
import { QuizView } from './QuizView'
import { DrillView } from './DrillView'
import { ReviewView } from './ReviewView'
import { useGraphStore } from '../store/graphStore'
import { useNotePool } from '../hooks/useNotePool'
import { extractQuizItems } from '../lib/quiz'
import { dueCount } from '../lib/srs'
import type { GraphNode } from '../graph/types'
import './QuizTab.css'

type QuizMode = 'flash' | 'drill' | 'review'

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Quiz tab shell: flashcard practice, interview drill-down, and SRS review.
export function QuizTab({ nodes }: { nodes: GraphNode[] }) {
  const [mode, setMode] = useState<QuizMode>('flash')
  const srs = useGraphStore((s) => s.srs)
  const { buildItems } = useNotePool(nodes)
  const pool = useMemo(() => buildItems(extractQuizItems), [buildItems])
  const due = useMemo(() => dueCount(pool, srs, todayStr()), [pool, srs])

  return (
    <div className="quiztab">
      <div className="quiztab-modes" role="tablist" aria-label="퀴즈 모드">
        <button className="quiztab-mode" role="tab" aria-selected={mode === 'flash'}
          data-active={mode === 'flash'} onClick={() => setMode('flash')}>
          플래시카드
        </button>
        <button className="quiztab-mode" role="tab" aria-selected={mode === 'drill'}
          data-active={mode === 'drill'} onClick={() => setMode('drill')}>
          🎤 드릴다운
        </button>
        <button className="quiztab-mode" role="tab" aria-selected={mode === 'review'}
          data-active={mode === 'review'} onClick={() => setMode('review')}>
          🔁 복습{due > 0 && <span className="quiztab-badge">{due}</span>}
        </button>
      </div>
      {mode === 'flash' && <QuizView nodes={nodes} />}
      {mode === 'drill' && <DrillView nodes={nodes} />}
      {mode === 'review' && <ReviewView nodes={nodes} />}
    </div>
  )
}
