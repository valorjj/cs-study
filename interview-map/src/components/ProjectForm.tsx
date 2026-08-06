// 프로젝트 등록·편집 폼. project가 null이면 신규, 아니면 그 프로젝트를 편집한다.
import { useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useResumeStore } from '../store/resumeStore'
import { matchLocal, mergeLlm, normalizeTerm } from '../lib/conceptMatch'
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

  // 마운트 시점에 한 번만 정한다 — 실패한 저장을 재시도할 때도 같은 id를 써야
  // upsertProject의 findIndex가 이 폼이 만든 이전 시도를 찾아 갱신한다. 예전엔 submit()
  // 안에서 매번 `project?.id ?? crypto.randomUUID()`를 새로 계산했는데, 실패 후 폼이 열린
  // 채로 재시도하면(설계 판단: 실패해도 폼을 닫지 않는다) 매번 새 id가 나와 findIndex가
  // -1을 돌려주고 append된다 — 같은 내용의 프로젝트가 디스크에 두 개로 쌓인다
  // (review round 1 finding 2, 실제로 재현됨: 용량 초과 → 재시도 → 용량 확보 후 저장 →
  // 동일 내용 두 항목).
  const [id] = useState(() => project?.id ?? crypto.randomUUID())
  // "이 폼이 기존 프로젝트를 편집 중인가"도 마운트 시점에 한 번만 정한다. prop이 나중에
  // null이 되더라도(부모가 id로 다시 찾는 방식이라, 그 사이 프로젝트가 삭제되면 null이
  // 온다) 이 폼이 편집 폼이었다는 사실은 변하지 않아야 한다 — 그러지 않으면 아래
  // "이미 삭제되었습니다" 가드가 조용히 꺼지고, 저장이 삭제된 프로젝트를 같은 id로
  // 되살린다(review round 4 finding 1).
  const [editTargetId] = useState<string | null>(project?.id ?? null)

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
    // matchLocal이 실제로 보는 동치 관계(normalizeTerm)로 중복을 잡는다 — 대소문자·공백만
    // 다른 칩("Redis"/"redis")을 저장 데이터에 두 벌 남기지 않는다. 화면 표기는 사용자가
    // 처음 입력한 원문 대소문자를 그대로 유지한다.
    const norm = normalizeTerm(v)
    setStack((cur) => (cur.some((c) => normalizeTerm(c) === norm) ? cur : [...cur, v]))
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

    // base는 이 렌더의 `project` prop이 아니라 저장을 누른 시점에 store에서 직접 읽는다
    // (review round 4 finding 1) — MaskPanel.persist / MaskPanel.runExtract가 이미 같은
    // 이유로 그렇게 한다. 폼이 열려 있는 동안 다른 경로가 이 프로젝트를 갱신할 수 있고
    // (대표적으로 AI 추출 응답이 뒤늦게 도착해 via:'llm' 매칭이 병합되는 경우), 캡처된
    // 스냅샷을 기준으로 저장하면 그 갱신이 조용히 되돌아간다.
    const base = editTargetId
      ? (useResumeStore.getState().projects.find((p) => p.id === editTargetId) ?? null)
      : null

    // 편집 중인 프로젝트가 그 사이 다른 경로(목록의 삭제 버튼 등)로 지워졌을 수 있다.
    // 그대로 upsertProject를 부르면 findIndex가 -1을 돌려주고 append되어 지운
    // 프로젝트가 같은 id로 되살아난다. 폼은 그대로 열어 두어 사용자가 입력한 내용을
    // 잃지 않고 복사해 갈 수 있게 한다.
    if (editTargetId && !base) {
      setLocalError('이 프로젝트는 이미 삭제되었습니다. 필요하면 아래 내용을 복사해 두세요.')
      return
    }

    setLocalError(null)

    // 로컬 매칭은 저장 때 한 번 돈다. 렌더마다 돌리면 122노드 × 서술문을 매 타이핑마다
    // 훑는다.
    const local = matchLocal({ stack, narrative }, nodes)
    // llm 매칭은 서술문에 이름이 없는 개념이라 로컬 재실행으로 복원되지 않는다.
    // 로컬 결과로 덮어쓰면 AI 추출 결과가 편집 한 번에 영구히 사라진다. mergeLlm을 그대로
    // 재사용해 conceptMatch.ts의 규칙(환각/도메인 노드 드롭, 로컬과 중복 시 스킵)과
    // 두 벌로 갈라지지 않게 한다 — 노드가 나중에 쪼개지거나 삭제되면 옛 llm 매칭이
    // 가리키던 nodeId가 사라질 수 있고, 그 유령 매칭을 걸러내는 게 바로 이 규칙이다.
    const keptLlm = (base?.matches ?? []).filter((m) => m.via === 'llm')
    const { matches } = mergeLlm(
      local,
      {
        nodeIds: keptLlm.map((m) => m.nodeId),
        reasons: Object.fromEntries(keptLlm.map((m) => [m.nodeId, m.evidence])),
      },
      nodes,
    )

    const updatedAt = new Date().toISOString()
    const result = await upsertProject({
      id,
      name: name.trim(), period: period.trim(), role: role.trim(),
      stack, lifecycle,
      narrative,
      maskDecisions: base?.maskDecisions ?? [],
      matches,
      updatedAt,
    })

    // upsertProject가 금고 잠김이든 디스크 쓰기 실패든 실패를 반환값으로 알린다.
    // 폼을 닫지 않고 입력을 그대로 남겨 사용자가 복사해 갈 수 있게 한다.
    if (!result.ok) {
      setLocalError(result.error)
      return
    }
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
