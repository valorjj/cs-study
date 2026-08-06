import { useState } from 'react'
import type { FormEvent } from 'react'
import { useResumeStore } from '../store/resumeStore'
import './VaultGate.css'

const MIN_LENGTH = 12

// 복구 경로를 만들지 않은 이유는 store 주석과 같다: 키를 대신 쥘 사람이 생긴다.
const NOTICE =
  '패스프레이즈를 잊으면 저장된 이력을 복구할 수 없습니다. ' +
  '복구 경로를 만들면 누군가 키를 대신 갖는다는 뜻이라, 만들지 않았습니다.'

export function VaultGate() {
  const status = useResumeStore((s) => s.status)
  const error = useResumeStore((s) => s.error)
  const createVault = useResumeStore((s) => s.createVault)
  const unlock = useResumeStore((s) => s.unlock)

  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // store.error는 이 컴포넌트가 지울 수 없다(store를 건드리지 않기로 했다). 대신 사용자가
  // 다시 입력을 시작하면 "이전 시도의" 에러를 화면에서만 숨긴다 — 재시도 결과가 나오면
  // (handleUnlock 시작 시) 다시 보이게 한다.
  const [lockedErrorHidden, setLockedErrorHidden] = useState(false)

  if (status === 'unlocked') return null

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (passphrase !== confirm) {
      setLocalError('패스프레이즈가 일치하지 않습니다.')
      return
    }
    if (passphrase.length < MIN_LENGTH) {
      setLocalError(`패스프레이즈는 최소 ${MIN_LENGTH}자 이상이어야 합니다.`)
      return
    }
    setLocalError(null)
    setBusy(true)
    try {
      await createVault(passphrase)
    } catch {
      // deriveKey는 crypto.subtle이 없는 비보안 컨텍스트(http://) 등에서 던질 수 있다.
      // 여기서 잡지 않으면 unhandled rejection만 남고 화면은 조용히 비어, 성공과
      // 구분이 안 된다.
      setLocalError('금고를 만들지 못했습니다. 이 브라우저/연결에서는 암호화 기능을 쓸 수 없습니다.')
    } finally {
      setPassphrase('')
      setConfirm('')
      setBusy(false)
    }
  }

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setLocalError(null)
    setLockedErrorHidden(false)
    setBusy(true)
    try {
      await unlock(passphrase)
    } finally {
      setPassphrase('')
      setBusy(false)
    }
  }

  if (status === 'locked') {
    return (
      <div className="vg">
        <form className="vg-form" onSubmit={handleUnlock}>
          <h2>금고 잠김</h2>
          <label htmlFor="vg-unlock-pass">패스프레이즈</label>
          <input
            id="vg-unlock-pass"
            type="password"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value)
              setLockedErrorHidden(true)
            }}
          />
          {error && !lockedErrorHidden && <p className="vg-error">{error}</p>}
          <button type="submit" disabled={busy}>열기</button>
        </form>
      </div>
    )
  }

  const createMessage = localError ?? error

  return (
    <div className="vg">
      <form className="vg-form" onSubmit={handleCreate}>
        <h2>이력 금고 만들기</h2>
        <p className="vg-notice">{NOTICE}</p>
        <label htmlFor="vg-create-pass">패스프레이즈</label>
        <input
          id="vg-create-pass"
          type="password"
          value={passphrase}
          onChange={(e) => {
            setPassphrase(e.target.value)
            setLocalError(null)
          }}
        />
        <label htmlFor="vg-create-confirm">패스프레이즈 확인</label>
        <input
          id="vg-create-confirm"
          type="password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setLocalError(null)
          }}
        />
        {createMessage && <p className="vg-error">{createMessage}</p>}
        <button type="submit" disabled={busy}>금고 만들기</button>
      </form>
    </div>
  )
}
