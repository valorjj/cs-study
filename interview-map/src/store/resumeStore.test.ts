import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useResumeStore, readStoredVault, RESUME_KEY } from './resumeStore'
import { toB64 } from '../lib/vault'
import type { Project } from '../lib/resumeTypes'

const project = (id: string, name: string): Project => ({
  id, name, period: '2025', role: 'backend', stack: ['Redis'],
  lifecycle: ['tx'], narrative: '서술문', maskDecisions: [], matches: [],
  updatedAt: '2026-08-05T00:00:00.000Z',
})

describe('resumeStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useResumeStore.setState(useResumeStore.getInitialState())
  })

  it('starts with no vault', () => {
    expect(useResumeStore.getState().status).toBe('none')
    expect(useResumeStore.getState().projects).toEqual([])
  })

  it('createVault unlocks and persists an encrypted blob', async () => {
    await useResumeStore.getState().createVault('pw')
    expect(useResumeStore.getState().status).toBe('unlocked')
    await useResumeStore.getState().upsertProject(project('p1', '정산'))
    const stored = readStoredVault()
    expect(stored).not.toBeNull()
    expect(stored!.salt.length).toBeGreaterThan(0)
    expect(stored!.blob.iv.length).toBeGreaterThan(0)
    expect(stored!.blob.ct.length).toBeGreaterThan(0)
    const raw = localStorage.getItem(RESUME_KEY)!
    expect(raw).not.toContain('projects')
    expect(raw).not.toContain('정산')
    // 평문을 base64로만 감싼 가짜 암호화라면 이 단정이 깨진다.
    // btoa는 Latin1 범위 밖 문자('정산' 등)에서 InvalidCharacterError를 던지므로,
    // 이 저장소의 toB64(UTF-8 바이트 배열 인코딩)로 동등한 비교를 만든다.
    const fakePlain = toB64(new TextEncoder().encode(JSON.stringify({
      version: 1, projects: [project('p1', '정산')],
    })))
    expect(stored!.blob.ct).not.toBe(fakePlain)
  })

  it('upsertProject adds then updates in place, and persists', async () => {
    const s = useResumeStore.getState()
    await s.createVault('pw')
    await useResumeStore.getState().upsertProject(project('p1', '정산'))
    expect(useResumeStore.getState().projects.map((p) => p.name)).toEqual(['정산'])
    await useResumeStore.getState().upsertProject({ ...project('p1', '정산 v2') })
    expect(useResumeStore.getState().projects).toHaveLength(1)
    expect(useResumeStore.getState().projects[0].name).toBe('정산 v2')
  })

  it('removeProject drops one entry', async () => {
    await useResumeStore.getState().createVault('pw')
    await useResumeStore.getState().upsertProject(project('p1', 'A'))
    await useResumeStore.getState().upsertProject(project('p2', 'B'))
    await useResumeStore.getState().removeProject('p1')
    expect(useResumeStore.getState().projects.map((p) => p.id)).toEqual(['p2'])
  })

  it('lock forgets the key and the plaintext but keeps the ciphertext', async () => {
    await useResumeStore.getState().createVault('pw')
    await useResumeStore.getState().upsertProject(project('p1', '정산'))
    useResumeStore.getState().lock()
    const s = useResumeStore.getState()
    expect(s.status).toBe('locked')
    expect(s.projects).toEqual([])
    expect(s.sealed).not.toBeNull()
  })

  it('hydrate finds a stored vault and reports locked', async () => {
    await useResumeStore.getState().createVault('pw')
    await useResumeStore.getState().upsertProject(project('p1', '정산'))
    useResumeStore.setState(useResumeStore.getInitialState())
    useResumeStore.getState().hydrate()
    expect(useResumeStore.getState().status).toBe('locked')
  })

  // 파생 키는 메모리 전용이라, 이미 unlocked인 상태에서 hydrate가 무조건 재실행되면
  // (컴포넌트 재마운트, StrictMode의 이펙트 이중 호출 등) 키를 잃고 강제로 재잠금된다.
  // 사용자는 아무것도 안 했는데 200k PBKDF2를 다시 치르게 된다.
  it('hydrate is a no-op while already unlocked — it must not re-lock or drop the key', async () => {
    await useResumeStore.getState().createVault('pw')
    await useResumeStore.getState().upsertProject(project('p1', '정산'))
    const before = useResumeStore.getState()
    useResumeStore.getState().hydrate()
    const after = useResumeStore.getState()
    expect(after.status).toBe('unlocked')
    expect(after.key).toBe(before.key)
    expect(after.projects).toEqual(before.projects)
  })

  it('unlock with the right passphrase restores the projects', async () => {
    await useResumeStore.getState().createVault('pw')
    await useResumeStore.getState().upsertProject(project('p1', '정산'))
    useResumeStore.setState(useResumeStore.getInitialState())
    useResumeStore.getState().hydrate()
    const ok = await useResumeStore.getState().unlock('pw')
    expect(ok).toBe(true)
    expect(useResumeStore.getState().projects.map((p) => p.name)).toEqual(['정산'])
  })

  it('unlock with a wrong passphrase fails, sets an error and stays locked', async () => {
    await useResumeStore.getState().createVault('pw')
    useResumeStore.setState(useResumeStore.getInitialState())
    useResumeStore.getState().hydrate()
    const ok = await useResumeStore.getState().unlock('nope')
    expect(ok).toBe(false)
    expect(useResumeStore.getState().status).toBe('locked')
    expect(useResumeStore.getState().error).toMatch(/패스프레이즈/)
  })

  it('exportPlain returns the payload for user-owned backup', async () => {
    await useResumeStore.getState().createVault('pw')
    await useResumeStore.getState().upsertProject(project('p1', '정산'))
    expect(useResumeStore.getState().exportPlain()).toEqual({
      version: 1, projects: [expect.objectContaining({ id: 'p1' })],
    })
  })

  it('exportPlain returns null while locked', async () => {
    await useResumeStore.getState().createVault('pw')
    useResumeStore.getState().lock()
    expect(useResumeStore.getState().exportPlain()).toBeNull()
  })

  it('refuses to upsert while locked, and says so instead of losing the edit', async () => {
    await useResumeStore.getState().createVault('pw')
    useResumeStore.getState().lock()
    await useResumeStore.getState().upsertProject(project('p1', '정산'))
    const s = useResumeStore.getState()
    expect(s.projects).toEqual([])
    expect(s.status).toBe('locked')
    expect(s.error).toMatch(/잠겨/)
  })

  it('refuses to remove while locked', async () => {
    await useResumeStore.getState().createVault('pw')
    await useResumeStore.getState().upsertProject(project('p1', 'A'))
    useResumeStore.getState().lock()
    await useResumeStore.getState().removeProject('p1')
    expect(useResumeStore.getState().projects).toEqual([])   // 잠금 상태라 목록 자체가 비어 있다
    expect(useResumeStore.getState().error).toMatch(/잠겨/)
  })

  it('createVault refuses while locked, leaving the stored blob untouched', async () => {
    await useResumeStore.getState().createVault('pw')
    await useResumeStore.getState().upsertProject(project('p1', '정산'))
    useResumeStore.getState().lock()
    const before = localStorage.getItem(RESUME_KEY)
    await useResumeStore.getState().createVault('new-pw')
    expect(localStorage.getItem(RESUME_KEY)).toBe(before)
    expect(useResumeStore.getState().status).toBe('locked')
    expect(useResumeStore.getState().error).toMatch(/이미 금고/)
  })

  it('createVault refuses while unlocked, leaving the stored blob untouched', async () => {
    await useResumeStore.getState().createVault('pw')
    await useResumeStore.getState().upsertProject(project('p1', '정산'))
    const before = localStorage.getItem(RESUME_KEY)
    await useResumeStore.getState().createVault('new-pw')
    expect(localStorage.getItem(RESUME_KEY)).toBe(before)
    expect(useResumeStore.getState().status).toBe('unlocked')
    expect(useResumeStore.getState().projects.map((p) => p.name)).toEqual(['정산'])
    expect(useResumeStore.getState().error).toMatch(/이미 금고/)
  })

  it('destroyVault then createVault succeeds', async () => {
    await useResumeStore.getState().createVault('pw')
    await useResumeStore.getState().upsertProject(project('p1', '정산'))
    useResumeStore.getState().destroyVault()
    expect(useResumeStore.getState().status).toBe('none')
    await useResumeStore.getState().createVault('pw2')
    expect(useResumeStore.getState().status).toBe('unlocked')
    expect(useResumeStore.getState().projects).toEqual([])
  })

  it('destroyVault clears localStorage', async () => {
    await useResumeStore.getState().createVault('pw')
    await useResumeStore.getState().upsertProject(project('p1', '정산'))
    useResumeStore.getState().destroyVault()
    expect(localStorage.getItem(RESUME_KEY)).toBeNull()
    expect(useResumeStore.getState().salt).toBeNull()
    expect(useResumeStore.getState().sealed).toBeNull()
    expect(useResumeStore.getState().key).toBeNull()
  })

  it('upsertProject sets an error and leaves sealed unchanged when the disk write fails', async () => {
    await useResumeStore.getState().createVault('pw')
    const sealedBefore = useResumeStore.getState().sealed
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const result = await useResumeStore.getState().upsertProject(project('p1', '정산'))
    spy.mockRestore()
    // 이 단정이 핵심이다 — 반환값을 무시하고 memory만 보면(store.projects에 p1이
    // 있는지) 이 실패를 절대 볼 수 없다. 실제로 있음도 확인한다(설계 판단: 롤백하지
    // 않고 메모리는 유지한다).
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/저장하지 못했습니다|저장 공간/)
    expect(useResumeStore.getState().error).toMatch(/저장하지 못했습니다|저장 공간/)
    expect(useResumeStore.getState().sealed).toBe(sealedBefore)
    expect(useResumeStore.getState().projects.map((p) => p.id)).toEqual(['p1'])
  })

  it('upsertProject returns ok:true when the disk write succeeds', async () => {
    await useResumeStore.getState().createVault('pw')
    const result = await useResumeStore.getState().upsertProject(project('p1', '정산'))
    expect(result).toEqual({ ok: true })
  })

  it('upsertProject returns ok:false with an error when the vault is locked', async () => {
    await useResumeStore.getState().createVault('pw')
    useResumeStore.getState().lock()
    const result = await useResumeStore.getState().upsertProject(project('p1', '정산'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/잠겨/)
  })

  it('removeProject sets an error but still reports the disk-write failure via the return value', async () => {
    await useResumeStore.getState().createVault('pw')
    await useResumeStore.getState().upsertProject(project('p1', '정산'))
    const sealedBefore = useResumeStore.getState().sealed
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const result = await useResumeStore.getState().removeProject('p1')
    spy.mockRestore()
    expect(result.ok).toBe(false)
    // 설계 판단(brief Step 3)은 "메모리는 그 호출이 만든 결과를 그대로 유지하고 실패를
    // 반환한다"이다 — removeProject의 경우 그 결과는 "제거됨"이므로 메모리에서도
    // 제거된 채로 둔다. 롤백하지 않는다는 건 sealed(디스크 스냅샷)가 그대로라는
    // 뜻이지, 방금 한 메모리 연산을 되돌린다는 뜻이 아니다.
    expect(useResumeStore.getState().projects).toEqual([])
    expect(useResumeStore.getState().sealed).toBe(sealedBefore)
  })

  it('createVault rolls back to status "none" and reports an error when the first disk write fails', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    await useResumeStore.getState().createVault('pw')
    spy.mockRestore()
    // 지킬 사용자 입력이 없는 케이스(빈 금고)라 롤백을 택했다 — status는 'none'에
    // 머물러야 하고, 디스크에도 아무것도 남지 않아야 한다(반쪽 상태 방지).
    expect(useResumeStore.getState().status).toBe('none')
    expect(useResumeStore.getState().error).toMatch(/저장 공간|금고를 만들지 못했습니다/)
    expect(localStorage.getItem(RESUME_KEY)).toBeNull()
  })

  it('persists both of two concurrent upserts', async () => {
    await useResumeStore.getState().createVault('pw')
    // 개별 await 없이 동시에 발사한다 — 직렬화가 없으면 하나가 디스크에서 사라진다.
    await Promise.all([
      useResumeStore.getState().upsertProject(project('p1', 'A')),
      useResumeStore.getState().upsertProject(project('p2', 'B')),
    ])
    // 메모리를 버리고 디스크에서 다시 읽어 확인한다.
    useResumeStore.setState(useResumeStore.getInitialState())
    useResumeStore.getState().hydrate()
    expect(await useResumeStore.getState().unlock('pw')).toBe(true)
    expect(useResumeStore.getState().projects.map((p) => p.id).sort()).toEqual(['p1', 'p2'])
  })
})
