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
            onChange={(e) => setPassphrase(e.target.value)}
          />
          {error && <p className="vg-error">{error}</p>}
          <button type="submit" disabled={busy}>열기</button>
        </form>
      </div>
    )
  }

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
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <label htmlFor="vg-create-confirm">패스프레이즈 확인</label>
        <input
          id="vg-create-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {localError && <p className="vg-error">{localError}</p>}
        <button type="submit" disabled={busy}>금고 만들기</button>
      </form>
    </div>
  )
}
