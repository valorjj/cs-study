import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUrlSync } from './useUrlSync'
import { useGraphStore } from '../store/graphStore'

function setHash(h: string) {
  window.history.replaceState(null, '', h)
}

describe('useUrlSync', () => {
  beforeEach(() => {
    localStorage.clear()
    setHash('#/home')
    useGraphStore.setState({
      viewMode: 'home', selectedId: null, trackId: null, quizMode: 'flash', activeProjectId: null,
    })
  })

  it('applies the initial hash to the store', () => {
    setHash('#/list/dsa-bigo')
    renderHook(() => useUrlSync())
    const s = useGraphStore.getState()
    expect(s.viewMode).toBe('list')
    expect(s.selectedId).toBe('dsa-bigo')
  })

  it('canonicalises a non-canonical hash without adding a history entry', () => {
    setHash('#/quiz')
    const before = window.history.length
    renderHook(() => useUrlSync())
    expect(window.location.hash).toBe('#/quiz/flash')
    expect(window.history.length).toBe(before)
  })

  it('restores the saved view mode when the hash is empty', () => {
    localStorage.setItem('interview-map.viewMode.v1', 'guide')
    setHash('#')
    renderHook(() => useUrlSync())
    expect(useGraphStore.getState().viewMode).toBe('guide')
    expect(window.location.hash).toBe('#/guide')
  })

  it('pushes a history entry when the store navigates', () => {
    renderHook(() => useUrlSync())
    const before = window.history.length
    useGraphStore.getState().openNote('dsa-bigo')
    expect(window.location.hash).toBe('#/list/dsa-bigo')
    expect(window.history.length).toBe(before + 1)
  })

  it('pushes exactly one entry per navigation, across two navigations', () => {
    renderHook(() => useUrlSync())
    const before = window.history.length
    useGraphStore.getState().setViewMode('path')
    useGraphStore.getState().setTrackId('curated:junior-backend')
    expect(window.history.length).toBe(before + 2)
    expect(window.location.hash).toBe('#/path/curated:junior-backend')
  })

  it('does not push when unrelated state changes', () => {
    renderHook(() => useUrlSync())
    const before = window.history.length
    useGraphStore.getState().toggleStudied('dsa-bigo')
    expect(window.history.length).toBe(before)
  })

  it('preserves quizMode across a popstate that lands on a non-quiz view', () => {
    // Repro from findings: set drill mode -> push #/home -> back to #/quiz/drill
    // (restored) -> forward to #/home again must NOT reset quizMode to 'flash',
    // since parseHash defaults quizMode to 'flash' for every non-quiz view.
    renderHook(() => useUrlSync())
    useGraphStore.getState().setQuizMode('drill')
    useGraphStore.getState().setViewMode('home')
    expect(window.location.hash).toBe('#/home')

    setHash('#/quiz/drill')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(useGraphStore.getState().quizMode).toBe('drill')

    setHash('#/home')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(useGraphStore.getState().viewMode).toBe('home')
    expect(useGraphStore.getState().quizMode).toBe('drill')
  })

  it('applies popstate back to the store', () => {
    renderHook(() => useUrlSync())
    useGraphStore.getState().openNote('dsa-bigo')

    setHash('#/path/curated:junior-backend')
    window.dispatchEvent(new PopStateEvent('popstate'))

    const s = useGraphStore.getState()
    expect(s.viewMode).toBe('path')
    expect(s.trackId).toBe('curated:junior-backend')
    expect(s.selectedId).toBeNull()
  })

  it('does not push back after a popstate (no feedback loop)', () => {
    renderHook(() => useUrlSync())
    setHash('#/list/dsa-bigo')
    const before = window.history.length
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/list/dsa-bigo')
  })

  it('does not push back after a popstate onto a non-canonical hash (#/quiz)', () => {
    renderHook(() => useUrlSync())
    setHash('#/quiz')
    const before = window.history.length
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/quiz/flash')
  })

  it('does not push back after a popstate onto a non-canonical hash (#, empty)', () => {
    renderHook(() => useUrlSync())
    setHash('#')
    const before = window.history.length
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/home')
  })

  it('does not push back after a popstate onto an unknown track id (#/path/domain:ghost)', () => {
    renderHook(() => useUrlSync())
    setHash('#/path/domain:ghost')
    const before = window.history.length
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/path')
  })

  it('canonicalises on hashchange too (address-bar edits, supabase hash clear)', () => {
    renderHook(() => useUrlSync())
    setHash('#/quiz')
    const before = window.history.length
    window.dispatchEvent(new Event('hashchange'))
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/quiz/flash')
    expect(useGraphStore.getState().viewMode).toBe('quiz')
  })

  it('survives a double mount without duplicating entries', () => {
    setHash('#/list/dsa-bigo')
    const before = window.history.length
    const a = renderHook(() => useUrlSync())
    a.unmount()
    renderHook(() => useUrlSync())
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/list/dsa-bigo')
  })

  it('stops listening after unmount', () => {
    const { unmount } = renderHook(() => useUrlSync())
    unmount()
    const before = window.history.length
    useGraphStore.getState().setViewMode('guide')
    expect(window.history.length).toBe(before)
  })

  // Regression for the review round-1 finding: when activeProjectId lived in a
  // second store (resumeStore) subscribed alongside graphStore, applyRoute's
  // two separate setState calls fired the pushIfChanged subscriber twice, once
  // per store, and the first firing read a stale activeProjectId — producing a
  // spurious extra pushState on every resume-project navigation. Moving
  // activeProjectId into graphStore's single setState call (this file) closes
  // that window: one state transition, one notification.
  const PROJECT_A = '7f3c2a91-0000-4000-8000-000000000001'
  const PROJECT_B = '7f3c2a91-0000-4000-8000-000000000002'

  it('navigating between two resume project ids via popstate pushes no extra history entries', () => {
    renderHook(() => useUrlSync())
    setHash(`#/resume/${PROJECT_A}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(useGraphStore.getState().activeProjectId).toBe(PROJECT_A)

    const before = window.history.length
    setHash(`#/resume/${PROJECT_B}`)
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe(`#/resume/${PROJECT_B}`)
    expect(useGraphStore.getState().activeProjectId).toBe(PROJECT_B)
  })

  // review round 4 finding 3b: applyRoute는 r.view==='resume'일 때만 activeProjectId를
  // 쓴다(그 조건문의 주석이 존재하는 이유가 곧 이 요건이다). 무조건 쓰게 만들면 resume이
  // 아닌 뷰로 가는 popstate 한 번에 열려 있던 프로젝트가 지워진다 — 이 계획 전체의 헤드라인
  // 요건인 "노트 보고 돌아오면 지도가 그대로"가 깨진다. 아래 Back 테스트는 이 뮤테이션을
  // 잡지 못한다: 그 시나리오는 마지막에 `#/resume/A`로 돌아오므로 URL이 id를 다시 실어와
  // 복원해버린다. 진짜로 무너지는 경로는 "노트에서 탭으로 돌아오기"다 — 그때 URL에는 id가
  // 없고, 오직 store에 살아남은 activeProjectId만이 지도를 다시 열 수 있다.
  it('keeps activeProjectId through a popstate onto a non-resume view (returning via the tab, not Back)', () => {
    renderHook(() => useUrlSync())
    setHash(`#/resume/${PROJECT_A}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(useGraphStore.getState().activeProjectId).toBe(PROJECT_A)

    // 노트 화면으로 이동하는 popstate(뒤로/앞으로, 주소창 편집) — 이 URL에는 projectId가
    // 실리지 않는다.
    setHash('#/list/dsa-bigo')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(useGraphStore.getState().viewMode).toBe('list')
    expect(useGraphStore.getState().activeProjectId).toBe(PROJECT_A)

    // 이력 탭을 다시 누르는 경로(store 이동). 열려 있던 프로젝트가 그대로 살아 있어야
    // URL도 그 프로젝트로 복귀한다.
    useGraphStore.getState().setViewMode('resume')
    expect(useGraphStore.getState().activeProjectId).toBe(PROJECT_A)
    expect(window.location.hash).toBe(`#/resume/${PROJECT_A}`)
  })

  it('returns to the resume project via Back after visiting a note, with activeProjectId intact', () => {
    renderHook(() => useUrlSync())
    setHash(`#/resume/${PROJECT_A}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(useGraphStore.getState().activeProjectId).toBe(PROJECT_A)

    setHash('#/list/dsa-bigo')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(useGraphStore.getState().viewMode).toBe('list')

    setHash(`#/resume/${PROJECT_A}`)
    window.dispatchEvent(new PopStateEvent('popstate'))

    const s = useGraphStore.getState()
    expect(s.viewMode).toBe('resume')
    expect(s.activeProjectId).toBe(PROJECT_A)
  })
})
