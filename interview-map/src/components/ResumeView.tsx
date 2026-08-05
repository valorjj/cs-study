import { useEffect, useState } from 'react'
import { useResumeStore } from '../store/resumeStore'
import { VaultGate } from './VaultGate'
import { ProjectForm } from './ProjectForm'
import { MaskPanel } from './MaskPanel'
import type { Project } from '../lib/resumeTypes'
import graphData from '../graph/graph.json'
import type { GraphData } from '../graph/types'
import './ResumeView.css'

const data = graphData as GraphData

// 잠그기 전 확인 문구(review round 1 finding 4) — 사용자가 무엇을 잃는지, 그리고 잃기
// 전에 빠져나갈 방법(평문 내보내기)이 있다는 것을 둘 다 말한다.
const LOCK_WITH_UNSAVED_FAILURE_CONFIRM =
  '저장하지 못한 변경사항이 있습니다. 지금 잠그면 그 내용이 사라지고 복구할 수 없습니다. ' +
  '잠그기 전에 "평문 JSON 내보내기"로 백업할 수 있습니다. 그래도 잠그시겠습니까?'

export function ResumeView() {
  const status = useResumeStore((s) => s.status)
  const hydrate = useResumeStore((s) => s.hydrate)
  const lock = useResumeStore((s) => s.lock)
  const exportPlain = useResumeStore((s) => s.exportPlain)
  const projects = useResumeStore((s) => s.projects)
  const removeProject = useResumeStore((s) => s.removeProject)
  const error = useResumeStore((s) => s.error)
  const clearError = useResumeStore((s) => s.clearError)
  const hasUnsavedFailure = useResumeStore((s) => s.hasUnsavedFailure)

  // 폼이 열려 있지 않으면 null. 열려 있으면 편집 대상(신규는 null 그대로 project prop에 전달).
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)

  // 마스킹 패널을 여는 프로젝트의 id만 들고 있는다 — id로 store.projects에서 매번
  // 다시 찾아야, 패널을 여는 동안 다른 경로(편집 등)로 프로젝트가 갱신돼도 최신
  // narrative/maskDecisions를 본다. 대상이 삭제되면 lookup이 undefined가 되어
  // 패널이 자동으로 닫힌다.
  const [maskingId, setMaskingId] = useState<string | null>(null)
  const maskingProject = maskingId ? (projects.find((p) => p.id === maskingId) ?? null) : null

  // store는 status:'none'으로 시작한다. 저장된 금고가 있는지는 localStorage를 읽어야
  // 알 수 있고, 그 읽기는 이 탭에 들어올 때 한 번이면 된다 — 다른 탭만 쓰는 사용자에게
  // 이력 기능의 존재를 알릴 필요가 없다(패스프레이즈 요구 시점 = 이 탭 진입).
  useEffect(() => { hydrate() }, [hydrate])

  const handleExport = () => {
    const payload = exportPlain()
    if (!payload) return
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'resume-vault-export.json'
    // Firefox/Safari는 문서에 붙어 있지 않은 <a>의 프로그래매틱 클릭을 다운로드로
    // 이어가지 않을 수 있고, click()과 같은 태스크에서 revoke하면 다운로드가 blob URL을
    // 읽기 전에 무효화될 수 있다. 그래서 문서에 붙였다가 다음 tick에 지우고 revoke한다.
    document.body.appendChild(a)
    try {
      a.click()
    } finally {
      setTimeout(() => {
        a.remove()
        URL.revokeObjectURL(url)
      }, 0)
    }
  }

  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (p: Project) => { setEditing(p); setFormOpen(true) }
  const closeForm = () => { setFormOpen(false); setEditing(null) }

  // 잠그기는 store.projects를 비운다(lock()). 저장 실패로 디스크와 어긋난 채 남은 내용이
  // 있으면(hasUnsavedFailure) 그게 사용자 모르게 사라진다 — 그래서 잠그기 전에 명시적
  // 확인을 받는다. 잠그기 자체를 막지는 않는다(보안 동작은 항상 가능해야 한다) — 사용자가
  // 그래도 잠그겠다고 답하면 그대로 진행한다.
  const handleLock = () => {
    if (hasUnsavedFailure && !window.confirm(LOCK_WITH_UNSAVED_FAILURE_CONFIRM)) return
    lock()
  }

  // removeProject의 반환값을 실제로 읽는다(review round 1 finding 3) — 실패해도 store가
  // error를 세팅해 위 배너가 뜨지만, 호출 지점에서 결과를 그냥 버리면(fire-and-forget) 이
  // 자리에서 나중에 추가할 처리(예: 재시도 유도)가 조용히 무시되는 패턴이 반복된다.
  const handleRemove = async (id: string): Promise<void> => {
    await removeProject(id)
  }

  return (
    <div className="rv">
      {status === 'unlocked' ? (
        <div className="rv-list">
          <div className="rv-toolbar">
            <button type="button" onClick={handleLock}>잠그기</button>
            <button type="button" onClick={handleExport}>평문 JSON 내보내기</button>
            <span className="rv-export-warning">이 파일은 암호화되어 있지 않습니다</span>
          </div>

          {/* 어느 하위 화면(목록/폼/마스킹)이 열려 있어도 보인다 — 저장 실패는 사용자가
              지우거나 다음 저장이 성공할 때까지 남아야 한다(설계 판단). 삭제 버튼처럼
              반환값을 보여줄 자기 UI가 없는 호출도 여기서 잡힌다(review round 1 finding 3). */}
          {error && (
            <div className="rv-error-banner" role="alert">
              <span>{error}</span>
              <button type="button" onClick={clearError}>닫기</button>
            </div>
          )}

          {maskingProject ? (
            <div className="rv-masking">
              <button type="button" onClick={() => setMaskingId(null)}>목록으로</button>
              <MaskPanel key={maskingProject.id} project={maskingProject} nodes={data.nodes} />
            </div>
          ) : formOpen ? (
            <ProjectForm project={editing} nodes={data.nodes} onDone={closeForm} />
          ) : (
            <>
              <div className="rv-list-toolbar">
                <button type="button" onClick={openNew}>새 프로젝트</button>
              </div>
              {projects.length === 0 ? (
                <p className="rv-empty">등록된 프로젝트가 없습니다.</p>
              ) : (
                <ul className="rv-projects">
                  {projects.map((p) => (
                    <li key={p.id} className="rv-project">
                      <div className="rv-project-main">
                        <span className="rv-project-name">{p.name}</span>
                        <span className="rv-project-meta">
                          {p.period && <span>{p.period}</span>}
                          <span>매칭 {p.matches.length}개</span>
                        </span>
                      </div>
                      <div className="rv-project-actions">
                        <button type="button" onClick={() => openEdit(p)}>편집</button>
                        <button type="button" onClick={() => { void handleRemove(p.id) }}>삭제</button>
                        <button type="button" onClick={() => setMaskingId(p.id)}>마스킹</button>
                        <button type="button">개념 지도</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : (
        <VaultGate />
      )}
    </div>
  )
}
