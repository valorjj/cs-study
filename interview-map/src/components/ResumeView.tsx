import { useEffect } from 'react'
import { useResumeStore } from '../store/resumeStore'
import { VaultGate } from './VaultGate'
import './ResumeView.css'

export function ResumeView() {
  const status = useResumeStore((s) => s.status)
  const hydrate = useResumeStore((s) => s.hydrate)
  const lock = useResumeStore((s) => s.lock)
  const exportPlain = useResumeStore((s) => s.exportPlain)

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
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rv">
      {status === 'unlocked' ? (
        <div className="rv-list">
          <div className="rv-toolbar">
            <button type="button" onClick={lock}>잠그기</button>
            <button type="button" onClick={handleExport}>평문 JSON 내보내기</button>
            <span className="rv-export-warning">이 파일은 암호화되어 있지 않습니다</span>
          </div>
          준비 중
        </div>
      ) : (
        <VaultGate />
      )}
    </div>
  )
}
