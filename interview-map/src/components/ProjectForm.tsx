// 프로젝트 등록·편집 폼. project가 null이면 신규, 아니면 그 프로젝트를 편집한다.
import { useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useResumeStore } from '../store/resumeStore'
import { matchLocal } from '../lib/conceptMatch'
import { STAGES, STAGE_LABELS } from '../lib/resumeTypes'
import type { Project, Stage } from '../lib/resumeTypes'
import type { GraphNode } from '../graph/types'
import './ProjectForm.css'

interface ProjectFormProps {
  project: Project | null
  nodes: GraphNode[]
  onDone: () => void
}

export function ProjectForm({ project, nodes, onDone }: ProjectFormProps) {
  const upsertProject = useResumeStore((s) => s.upsertProject)

  const [name, setName] = useState(project?.name ?? '')
  const [period, setPeriod] = useState(project?.period ?? '')
  const [role, setRole] = useState(project?.role ?? '')
  const [stack, setStack] = useState<string[]>(project?.stack ?? [])
  const [stackInput, setStackInput] = useState('')
  const [lifecycle, setLifecycle] = useState<Stage[]>(project?.lifecycle ?? [])
  const [narrative, setNarrative] = useState(project?.narrative ?? '')
  const [localError, setLocalError] = useState<string | null>(null)

  const addChip = (): void => {
    const v = stackInput.trim()
    if (!v) return
    setStack((cur) => (cur.includes(v) ? cur : [...cur, v]))
    setStackInput('')
  }

  const handleChipKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    addChip()
  }

  const removeChip = (chip: string): void => {
    setStack((cur) => cur.filter((c) => c !== chip))
  }

  const toggleStage = (stage: Stage): void => {
    setLifecycle((cur) => (cur.includes(stage) ? cur.filter((s) => s !== stage) : [...cur, stage]))
  }

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim() || !narrative.trim()) {
      setLocalError('이름과 한 일은 비워둘 수 없습니다.')
      return
    }
    setLocalError(null)

    // 로컬 매칭은 저장 때 한 번 돈다. 렌더마다 돌리면 122노드 × 서술문을 매 타이핑마다
    // 훑는다.
    const local = matchLocal({ stack, narrative }, nodes)
    // llm 매칭은 서술문에 이름이 없는 개념이라 로컬 재실행으로 복원되지 않는다.
    // 로컬 결과로 덮어쓰면 AI 추출 결과가 편집 한 번에 영구히 사라진다.
    const keptLlm = (project?.matches ?? []).filter((m) => m.via === 'llm')
    const seen = new Set(local.map((m) => m.nodeId))
    const matches = [...local, ...keptLlm.filter((m) => !seen.has(m.nodeId))]

    await upsertProject({
      id: project?.id ?? crypto.randomUUID(),
      name: name.trim(), period: period.trim(), role: role.trim(),
      stack, lifecycle,
      narrative,
      maskDecisions: project?.maskDecisions ?? [],
      matches,
      updatedAt: new Date().toISOString(),
    })
    onDone()
  }

  return (
    <form className="pf" onSubmit={(e) => { void submit(e) }}>
      <label htmlFor="pf-name">프로젝트 이름</label>
      <input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} />

      <label htmlFor="pf-period">기간</label>
      <input id="pf-period" value={period} onChange={(e) => setPeriod(e.target.value)} />

      <label htmlFor="pf-role">역할</label>
      <input id="pf-role" value={role} onChange={(e) => setRole(e.target.value)} />

      <label htmlFor="pf-stack">기술스택</label>
      <input
        id="pf-stack"
        value={stackInput}
        onChange={(e) => setStackInput(e.target.value)}
        onKeyDown={handleChipKeyDown}
      />
      <div className="pf-chips">
        {stack.map((chip) => (
          <span key={chip} className="pf-chip">
            {chip}
            <button type="button" aria-label={`${chip} 삭제`} onClick={() => removeChip(chip)}>
              ×
            </button>
          </span>
        ))}
      </div>

      <fieldset className="pf-stages">
        <legend>담당 단계</legend>
        {STAGES.map((stage) => (
          <label key={stage} htmlFor={`pf-stage-${stage}`} className="pf-stage-label">
            <input
              id={`pf-stage-${stage}`}
              type="checkbox"
              checked={lifecycle.includes(stage)}
              onChange={() => toggleStage(stage)}
            />
            {STAGE_LABELS[stage]}
          </label>
        ))}
      </fieldset>

      <label htmlFor="pf-narrative">한 일</label>
      <textarea id="pf-narrative" value={narrative} onChange={(e) => setNarrative(e.target.value)} />

      {localError && <p className="pf-error">{localError}</p>}

      <div className="pf-actions">
        <button type="button" onClick={onDone}>취소</button>
        <button type="submit">저장</button>
      </div>
    </form>
  )
}
