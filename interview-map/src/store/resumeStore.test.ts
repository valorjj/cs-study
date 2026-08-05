import { describe, it, expect, beforeEach } from 'vitest'
import { useResumeStore, readStoredVault, RESUME_KEY } from './resumeStore'
import { toB64 } from '../lib/vault'
import type { Project } from '../lib/resumeTypes'

const project = (id: string, name: string): Project => ({
  id, name, period: '2025', role: 'backend', stack: ['Redis'],
  lifecycle: ['tx'], narrative: '서술문', maskDict: {}, matches: [],
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
