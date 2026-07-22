import { useMemo, useState } from 'react'
import { LuMic, LuRepeat, LuSettings, LuTrash2 } from 'react-icons/lu'
import { QuizView } from './QuizView'
import { DrillView } from './DrillView'
import { ReviewView } from './ReviewView'
import { InfoPopover } from './InfoPopover'
import { useGraphStore } from '../store/graphStore'
import { useNotePool } from '../hooks/useNotePool'
import { extractQuizItems } from '../lib/quiz'
import { dueCount } from '../lib/srs'
import { MODE_HELP, SRS_HELP } from '../lib/quizHelp'
import type { GraphNode } from '../graph/types'
import './QuizTab.css'

type QuizMode = 'flash' | 'drill' | 'review'

const CAP_OPTIONS: { value: number; label: string }[] = [
  { value: 10, label: '10' }, { value: 15, label: '15' }, { value: 20, label: '20' },
  { value: 30, label: '30' }, { value: 0, label: '무제한' },
]
const BUTTON_OPTIONS: (2 | 3 | 5)[] = [2, 3, 5]

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Quiz tab shell: flashcard practice, interview drill-down, and SRS review,
// plus a settings gear (new-card cap, grade buttons, data reset) and mode help.
export function QuizTab({ nodes }: { nodes: GraphNode[] }) {
  const [mode, setMode] = useState<QuizMode>('flash')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const srs = useGraphStore((s) => s.srs)
  const quizSettings = useGraphStore((s) => s.quizSettings)
  const setQuizSettings = useGraphStore((s) => s.setQuizSettings)
  const setSrs = useGraphStore((s) => s.setSrs)
  const setQuizStats = useGraphStore((s) => s.setQuizStats)
  const { buildItems } = useNotePool(nodes)
  const pool = useMemo(() => buildItems(extractQuizItems), [buildItems])
  const cap = quizSettings.newCardCap === 0 ? Infinity : quizSettings.newCardCap
  const due = useMemo(() => dueCount(pool, srs, todayStr(), cap), [pool, srs, cap])

  const resetData = () => {
    if (!window.confirm('퀴즈/복습 기록(정답률·복습 일정)을 모두 초기화할까요? 학습 경로 진도는 유지됩니다.')) return
    setSrs({})
    setQuizStats({})
  }

  return (
    <div className="quiztab">
      <div className="quiztab-bar">
        <div className="quiztab-modes" role="tablist" aria-label="퀴즈 모드">
          <button className="quiztab-mode" role="tab" aria-selected={mode === 'flash'}
            data-active={mode === 'flash'} onClick={() => setMode('flash')}>
            플래시카드
          </button>
          <button className="quiztab-mode" role="tab" aria-selected={mode === 'drill'}
            data-active={mode === 'drill'} onClick={() => setMode('drill')}>
            <LuMic size={14} /> 드릴다운
          </button>
          <button className="quiztab-mode" role="tab" aria-selected={mode === 'review'}
            data-active={mode === 'review'} onClick={() => setMode('review')}>
            <LuRepeat size={14} /> 복습{due > 0 && <span className="quiztab-badge">{due}</span>}
          </button>
        </div>
        <div className="quiztab-tools">
          <InfoPopover title="퀴즈 모드 설명" body={MODE_HELP} align="right" />
          <div className="quiztab-settings">
            <button className="quiztab-gear" aria-label="퀴즈 설정" aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((o) => !o)}>
              <LuSettings size={16} />
            </button>
            {settingsOpen && (
              <div className="quiztab-panel" role="dialog" aria-label="퀴즈 설정">
                <div className="quiztab-set">
                  <div className="quiztab-set-head">
                    <span>하루 새 카드 상한</span>
                    <InfoPopover title="새 카드 상한" body={SRS_HELP.cap} align="right" />
                  </div>
                  <div className="quiztab-seg">
                    {CAP_OPTIONS.map((o) => (
                      <button key={o.value} data-active={quizSettings.newCardCap === o.value}
                        onClick={() => setQuizSettings({ newCardCap: o.value })}>{o.label}</button>
                    ))}
                  </div>
                </div>
                <div className="quiztab-set">
                  <div className="quiztab-set-head">
                    <span>난이도 버튼 수 (복습)</span>
                    <InfoPopover title="난이도 버튼 수" body={SRS_HELP.buttons} align="right" />
                  </div>
                  <div className="quiztab-seg">
                    {BUTTON_OPTIONS.map((n) => (
                      <button key={n} data-active={quizSettings.gradeButtons === n}
                        onClick={() => setQuizSettings({ gradeButtons: n })}>{n}개</button>
                    ))}
                  </div>
                </div>
                <button className="quiztab-reset" onClick={resetData}>
                  <LuTrash2 size={14} /> 퀴즈/복습 기록 초기화
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {mode === 'flash' && <QuizView nodes={nodes} />}
      {mode === 'drill' && <DrillView nodes={nodes} />}
      {mode === 'review' && <ReviewView nodes={nodes} />}
    </div>
  )
}
