import { describe, it, expect, beforeEach } from 'vitest'
import { useResumeStore, readStoredVault, RESUME_KEY } from './resumeStore'
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
    const stored = readStoredVault()
    expect(stored).not.toBeNull()
    expect(stored!.salt.length).toBeGreaterThan(0)
    // 저장된 것이 평문이 아님을 확인한다
    expect(localStorage.getItem(RESUME_KEY)).not.toContain('projects')
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
})
