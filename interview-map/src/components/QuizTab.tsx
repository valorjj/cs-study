import { useState } from 'react'
import { QuizView } from './QuizView'
import { DrillView } from './DrillView'
import type { GraphNode } from '../graph/types'
import './QuizTab.css'

type QuizMode = 'flash' | 'drill'

// Quiz tab shell: switches between flashcard practice and interview drill-down.
export function QuizTab({ nodes }: { nodes: GraphNode[] }) {
  const [mode, setMode] = useState<QuizMode>('flash')
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
      </div>
      {mode === 'flash' ? <QuizView nodes={nodes} /> : <DrillView nodes={nodes} />}
    </div>
  )
}
