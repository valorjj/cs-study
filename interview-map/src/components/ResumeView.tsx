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

export function ResumeView() {
  const status = useResumeStore((s) => s.status)
  const hydrate = useResumeStore((s) => s.hydrate)
  const lock = useResumeStore((s) => s.lock)
  const exportPlain = useResumeStore((s) => s.exportPlain)
  const projects = useResumeStore((s) => s.projects)
  const removeProject = useResumeStore((s) => s.removeProject)

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

  return (
    <div className="rv">
      {status === 'unlocked' ? (
        <div className="rv-list">
          <div className="rv-toolbar">
            <button type="button" onClick={lock}>잠그기</button>
            <button type="button" onClick={handleExport}>평문 JSON 내보내기</button>
            <span className="rv-export-warning">이 파일은 암호화되어 있지 않습니다</span>
          </div>

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
                        <button type="button" onClick={() => { void removeProject(p.id) }}>삭제</button>
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
