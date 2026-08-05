import { useEffect, useState } from 'react'
import { useResumeStore } from '../store/resumeStore'
import { useGraphStore } from '../store/graphStore'
import { VaultGate } from './VaultGate'
import { ProjectForm } from './ProjectForm'
import { MaskPanel } from './MaskPanel'
import { ConceptMapModal } from './ConceptMapModal'
import type { Project } from '../lib/resumeTypes'
import graphData from '../graph/graph.json'
import type { GraphData } from '../graph/types'
import './ResumeView.css'

const data = graphData as GraphData

// 잠그기 전 확인 문구(review round 1 finding 4). round 1 원문은 "그 내용이 사라지고
// 복구할 수 없습니다"라고 단정했는데, 실패한 쓰기가 *삭제*였던 경우엔 틀린 말이다 — 그
// 삭제가 디스크에 반영 안 된 채로 잠기면, 다음 unlock에서 그 프로젝트가 다시 나타날 뿐 아무
// 것도 사라지지 않는다(사라지는 건 오히려 "삭제됐다"는 화면 상태 쪽이다). 추가/수정
// 실패와 삭제 실패를 구분해 별도 문구를 만드는 대신(round 2 리뷰가 고른 두 선택지 중 더
// 단순한 쪽), 두 경우 모두 참인 문구로 바꿨다 — 어느 쪽이든 "방금 한 일이 반영 안 된 채로
// 돌아갈 수 있다"는 사실은 같다(review round 2 minor 1).
const LOCK_WITH_UNSAVED_FAILURE_CONFIRM =
  '저장하지 못한 변경사항이 있습니다. 지금 잠그면 방금 추가·수정한 내용이 사라지거나, ' +
  '방금 삭제한 항목이 되돌아갈 수 있습니다. 잠그기 전에 "평문 JSON 내보내기"로 백업할 수 ' +
  '있습니다. 그래도 잠그시겠습니까?'

// review round 2 new important 1: hasUnsavedFailure는 "이미 실패한 적이 있다"만 안다 —
// 저장을 누르고 encrypt가 끝나기 전에 곧바로 잠그기를 누르면(둘 다 동기 클릭이라 그 사이
// 어떤 await도 없다) 실패가 기록될 기회조차 없이 잠금이 먼저 끝나 방금 입력한 내용이 아무
// 경고 없이 사라진다. pendingWrites(진행 중인 쓰기 개수)가 이 창을 잡는다 — 그 값은
// upsertProject/removeProject의 동기 구간에서 이미 올라가 있으므로, 두 번째 클릭(잠그기)
// 시점에 이미 관측 가능하다.
const LOCK_WITH_PENDING_WRITE_CONFIRM =
  '저장이 아직 끝나지 않았습니다. 지금 잠그면 방금 입력한 내용이 반영되지 않을 수 있습니다. ' +
  '잠그기 전에 저장이 끝나길 기다리는 것을 권장합니다. 그래도 잠그시겠습니까?'

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
  const pendingWrites = useResumeStore((s) => s.pendingWrites)
  const setMapOpen = useResumeStore((s) => s.setMapOpen)

  // activeProjectId는 graphStore에 있다(라우트 상태, URL에 실린다). id로 매 렌더마다
  // projects에서 다시 찾는다 — maskingProject와 같은 이유다: 지도가 열려 있는 동안
  // 다른 경로로 프로젝트가 갱신돼도 최신 매칭을 보여줘야 하고, 프로젝트가 삭제되면
  // 지도가 자동으로 닫혀야 한다(lookup이 null이 되므로).
  const activeProjectId = useGraphStore((s) => s.activeProjectId)
  const setActiveProject = useGraphStore((s) => s.setActiveProject)
  const mapProject = activeProjectId ? (projects.find((p) => p.id === activeProjectId) ?? null) : null

  // 특정 항목의 삭제가 디스크에 반영되지 않았을 때, 어떤 항목이었는지와 reason을 이용해
  // store.error(일반 문구)보다 구체적인 안내를 보여준다 — result를 실제로 읽어서 쓴다
  // (review round 2 finding 3, 두 번째 절: round 1은 소비한다고 주석에 썼지만 실제로는
  // await만 하고 반환값을 버렸다 — 반환값을 지우고 풀스위트를 돌려도 초록이었다는 게 그
  // 증거였다).
  const [removeFailure, setRemoveFailure] = useState<string | null>(null)

  // 폼이 열려 있지 않으면 formOpen=false. 열려 있고 editingId가 null이면 신규 등록이다.
  // 편집 대상은 *객체가 아니라 id만* 들고 있는다 — maskingProject/mapProject와 정확히 같은
  // 이유다(review round 4 finding 1). 객체 스냅샷을 들고 있으면 (1) 폼이 열려 있는 동안
  // 다른 경로로 그 프로젝트가 갱신돼도(예: 마스킹 패널에서 띄운 AI 추출 응답이 뒤늦게
  // 도착해 via:'llm' 매칭이 store에 병합되는 경우) 폼은 낡은 스냅샷을 보고 저장해 그
  // 갱신을 지워버리고, (2) lock() 이후에도 복호화된 서술문이 이 state 안에 살아남아
  // 다음 unlock 때 projects가 비어 있어도 textarea에 다시 그려진다. id만 들고 매 렌더마다
  // projects에서 다시 찾으면 두 문제 모두 사라진다.
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const editingProject = editingId ? (projects.find((p) => p.id === editingId) ?? null) : null

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

  // 금고가 unlocked를 벗어나면(잠그기, 파기) 이 컴포넌트의 세션 UI 상태도 함께 버린다.
  // removeFailure는 store가 아니라 여기 있는 값이라 lock()이 지워주지 않는다 — 그대로
  // 두면 다음 unlock 화면에 "'X' 삭제가 …" 같은 낡은 실패 문단이 다시 나타나고, 그 항목은
  // 이미 목록에 없어 사용자가 그 문장을 지울 방법조차 없다(review round 4 finding 1).
  // 폼 상태도 함께 닫는다 — 잠그면 편집 대상 자체가 사라지므로, 다음 unlock에서 열려 있을
  // 이유가 없다(빈 신규 폼이 열린 채로 복귀하는 것도 혼란스럽다).
  useEffect(() => {
    if (status === 'unlocked') return
    setRemoveFailure(null)
    setFormOpen(false)
    setEditingId(null)
    setMaskingId(null)
  }, [status])

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

  const openNew = () => { setEditingId(null); setFormOpen(true) }
  const openEdit = (p: Project) => { setEditingId(p.id); setFormOpen(true) }
  const closeForm = () => { setFormOpen(false); setEditingId(null) }

  // 잠그기는 store.projects를 비운다(lock()). 두 가지 경우를 확인한다 — 순서가 중요하다.
  // (1) pendingWrites > 0: 지금 진행 중인 쓰기가 있다. hasUnsavedFailure는 아직 이 쓰기가
  //     실패했는지조차 모른다(그 판정은 미래에 일어난다) — 그래서 먼저 본다.
  // (2) hasUnsavedFailure: 과거에 이미 실패한 적이 있다.
  // 잠그기 자체를 막지는 않는다(보안 동작은 항상 가능해야 한다) — 사용자가 그래도
  // 잠그겠다고 답하면 그대로 진행한다.
  const handleLock = () => {
    if (pendingWrites > 0) {
      if (!window.confirm(LOCK_WITH_PENDING_WRITE_CONFIRM)) return
    } else if (hasUnsavedFailure && !window.confirm(LOCK_WITH_UNSAVED_FAILURE_CONFIRM)) {
      return
    }
    lock()
  }

  // removeProject의 반환값을 실제로 읽어서 쓴다 — round 1은 `await removeProject(id)`만
  // 하고 반환값을 버렸다("반환값을 실제로 읽는다"는 그 주석은 거짓이었다: round 2 리뷰가
  // 반환값 읽기 자체를 지워도 풀스위트가 그대로 초록임을 보여 증명했다). 여기서는 실패
  // 원인(reason)에 따라 store.error(일반 문구)보다 더 구체적인, 이 항목의 이름이 들어간
  // 안내를 만든다 — reason을 실제로 소비하는 첫 production 코드다.
  const handleRemove = async (p: Project): Promise<void> => {
    const result = await removeProject(p.id)
    if (!result.ok) {
      const detail = result.reason === 'locked'
        ? '금고가 잠겨 있어 반영되지 않았습니다.'
        : '디스크에 반영하지 못했습니다. 새로고침하면 되살아날 수 있습니다.'
      setRemoveFailure(`'${p.name}' 삭제가 ${detail}`)
      return
    }
    setRemoveFailure(null)
  }

  return (
    <div className="rv">
      {status === 'unlocked' ? (
        <div className="rv-list">
          {/* mapProject가 있으면(=activeProjectId가 살아있는 프로젝트를 가리키면) 항상
              마운트해 둔다 — 열림 여부는 컴포넌트 내부에서 store.mapOpen을 직접 구독해
              결정한다. 그래서 mapOpen이 false여도 여기서 조건부로 걷어내지 않는다: 걷어내면
              다음에 mapOpen이 true가 될 때 새로 마운트되어 store 구독이 한 틱 늦어질 수
              있고, 무엇보다 "열림 위치는 store가 유일한 진실"이라는 이 태스크의 요점이
              부모 쪽 조건문으로 다시 새어나간다. key={mapProject.id}는 MaskPanel과 같은
              이유 — 다른 프로젝트로 바뀌면 이전 프로젝트의 내부 상태를 물려받지 않는다. */}
          {mapProject && <ConceptMapModal key={mapProject.id} project={mapProject} nodes={data.nodes} />}

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

          {/* store.error(일반 문구)와 별개로, "어떤" 항목의 삭제가 반영되지 않았는지 구체적으로
              알린다. role="alert"를 주지 않는다 — 위 배너와 동시에 뜰 수 있어 role="alert" 두
              개는 getByRole('alert')를 모호하게 만든다. */}
          {removeFailure && <p className="rv-remove-error">{removeFailure}</p>}

          {maskingProject ? (
            <div className="rv-masking">
              <button type="button" onClick={() => setMaskingId(null)}>목록으로</button>
              <MaskPanel key={maskingProject.id} project={maskingProject} nodes={data.nodes} />
            </div>
          ) : formOpen ? (
            <ProjectForm project={editingProject} nodes={data.nodes} onDone={closeForm} />
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
                        <button type="button" onClick={() => { void handleRemove(p) }}>삭제</button>
                        <button type="button" onClick={() => setMaskingId(p.id)}>마스킹</button>
                        <button
                          type="button"
                          onClick={() => { setActiveProject(p.id); setMapOpen(true) }}
                        >
                          개념 지도
                        </button>
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
