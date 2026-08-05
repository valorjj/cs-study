import { useEffect } from 'react'
import { useResumeStore } from '../store/resumeStore'
import './ResumeView.css'

export function ResumeView() {
  const status = useResumeStore((s) => s.status)
  const hydrate = useResumeStore((s) => s.hydrate)

  // store는 status:'none'으로 시작한다. 저장된 금고가 있는지는 localStorage를 읽어야
  // 알 수 있고, 그 읽기는 이 탭에 들어올 때 한 번이면 된다 — 다른 탭만 쓰는 사용자에게
  // 이력 기능의 존재를 알릴 필요가 없다(패스프레이즈 요구 시점 = 이 탭 진입).
  useEffect(() => { hydrate() }, [hydrate])

  return (
    <div className="rv">
      {status === 'unlocked' ? <div className="rv-list">준비 중</div> : <div className="rv-gate">준비 중</div>}
    </div>
  )
}
