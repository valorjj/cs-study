import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConceptMapModal } from './ConceptMapModal'
import { ResumeView } from './ResumeView'
import { useResumeStore } from '../store/resumeStore'
import { useGraphStore } from '../store/graphStore'
import type { Project } from '../lib/resumeTypes'
import type { GraphNode } from '../graph/types'

// conceptGroups.test.ts의 node() 헬퍼와 같은 형태.
const node = (id: string, label: string, domain: string, level: 0 | 1 | 2 = 1): GraphNode => ({
  id, label, domain, level, icon: '', summary: '', keywords: [], status: 'todo',
  position: { x: 0, y: 0 },
})

// database 도메인에 7개(PER_DOMAIN_CAP=6을 넘겨 cap 테스트를 성립시킨다) +
// system-design 도메인에 1개. 라벨은 프로젝트 매칭 테스트에서 그대로 검증한다.
const nodes: GraphNode[] = [
  node('database', 'Database', 'database', 0),
  node('db-nosql', 'SQL vs NoSQL / Redis', 'database'),
  node('db-tx', '트랜잭션', 'database'),
  node('db-isolation', '격리수준', 'database'),
  node('db-index', '인덱스', 'database'),
  node('db-replication', '레플리케이션', 'database'),
  node('db-partition', '샤딩', 'database'),
  node('db-cache', '캐싱', 'database'),
  node('system-design', 'System Design', 'system-design', 0),
  node('sd-mq', '메시지 큐', 'system-design'),
]

const DB_SEVEN = [
  'db-nosql', 'db-tx', 'db-isolation', 'db-index', 'db-replication', 'db-partition', 'db-cache',
]

const project: Project = {
  id: '7f3c2a91-0000-4000-8000-000000000001', name: '정산 서비스', period: '', role: '',
  stack: [], lifecycle: [], narrative: '한 일', maskDecisions: [],
  matches: [
    { nodeId: 'db-nosql', via: 'chip', evidence: 'Redis' },
    { nodeId: 'db-tx', via: 'keyword', evidence: '트랜잭션' },
    { nodeId: 'sd-mq', via: 'chip', evidence: 'Kafka' },
  ],
  updatedAt: '2026-08-06T00:00:00.000Z',
}

beforeEach(() => {
  useResumeStore.setState({ status: 'unlocked', projects: [project], mapOpen: true })
  useGraphStore.setState({ viewMode: 'resume', selectedId: null, activeProjectId: project.id })
  // useSrsKeysByNode → useNotePool은 nodes의 noteRef로 실제 노트를 fetch한다. 이 스위트의
  // fixture nodes는 noteRef가 없어 무해하지만, 아래 real-composition 테스트는 ResumeView를
  // 통해 실제 graph.json(수십 개의 noteRef)을 넘기므로 스텁 없이는 매 테스트가 실제 파일
  // fetch를 시도해 act 경고와 느려짐을 낳는다.
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, text: () => Promise.resolve('') } as Response)))
})

describe('ConceptMapModal', () => {
  it('renders the project at the center and one button per matched concept', () => {
    render(<ConceptMapModal project={project} nodes={nodes} />)
    expect(screen.getByText('정산 서비스')).toBeTruthy()
    for (const label of ['SQL vs NoSQL / Redis', '트랜잭션', '메시지 큐']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy()
    }
  })

  it('shows a +N badge on a domain whose concepts were capped', () => {
    // PER_DOMAIN_CAP = 6. 같은 도메인에 7개를 주면 도메인 노드에 +1이 붙는다.
    const many: Project = {
      ...project,
      matches: DB_SEVEN.map((id) => ({ nodeId: id, via: 'chip' as const, evidence: 'x' })),
    }
    render(<ConceptMapModal project={many} nodes={nodes} />)
    expect(screen.getByText('+1')).toBeTruthy()
  })

  it('opens the note and closes the modal when a concept is clicked', () => {
    render(<ConceptMapModal project={project} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /트랜잭션/ }))
    expect(useGraphStore.getState().viewMode).toBe('list')
    expect(useGraphStore.getState().selectedId).toBe('db-tx')
    // mapOpen은 false가 아니다 — 돌아왔을 때 다시 열려 있어야 한다(아래 회귀 테스트).
    expect(useResumeStore.getState().mapOpen).toBe(true)
  })

  it('closes on Escape and on the close button', () => {
    const { unmount } = render(<ConceptMapModal project={project} nodes={nodes} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useResumeStore.getState().mapOpen).toBe(false)
    unmount()

    useResumeStore.setState({ mapOpen: true })
    render(<ConceptMapModal project={project} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(useResumeStore.getState().mapOpen).toBe(false)
  })

  it('closes on a backdrop click but not when the dialog itself is clicked', () => {
    render(<ConceptMapModal project={project} nodes={nodes} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(useResumeStore.getState().mapOpen).toBe(true)
    fireEvent.click(screen.getByText('정산 서비스').closest('.cmm-overlay') as Element)
    expect(useResumeStore.getState().mapOpen).toBe(false)
  })

  // 지도는 개념 이름만 다룬다. 서술문이 여기 올 이유가 없다.
  it('never renders the narrative', () => {
    const p: Project = { ...project, narrative: '비밀서술문' }
    const { container } = render(<ConceptMapModal project={p} nodes={nodes} />)
    expect(container.textContent).not.toContain('비밀서술문')
  })

  it('explains itself when the project has no matches yet', () => {
    render(<ConceptMapModal project={{ ...project, matches: [] }} nodes={nodes} />)
    expect(screen.getByText(/매칭된 개념이 없습니다/)).toBeTruthy()
    // 빈 원을 그려 놓으면 고장으로 보인다.
    expect(screen.queryByText('정산 서비스')).toBeNull()
  })

  it('renders nothing when mapOpen is false', () => {
    useResumeStore.setState({ mapOpen: false })
    const { container } = render(<ConceptMapModal project={project} nodes={nodes} />)
    expect(container.textContent).toBe('')
  })

  // Task 7 fix round 1, finding 3: srsKeysByNode가 아직 안 왔을 때(노트 fetch가 아직 진행
  // 중일 때) 모든 개념을 'unverified'로 그리면 "아직 안 읽었다"를 "다 모른다"로 오독시킨다
  // (brief). 이 테스트가 없으면 loading·icon·title 세 분기를 다 지워도 9/9가 초록이었다
  // — 아래에서 그 상태로 검증한다. noteRef가 있는 노드가 하나라도 있으면 useNotePool이
  // fetch를 걸고, 그 fetch가 영원히 pending이면 loading이 계속 true다.
  it('shows a loading state (not a mastery grade) while the note pool fetch is still pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => { /* 영원히 대기 */ })))
    const nodesWithNoteRef = nodes.map((n) => (
      n.id === 'db-tx' ? { ...n, noteRef: '/notes/04-database/tx.md#트랜잭션' } : n
    ))
    render(<ConceptMapModal project={project} nodes={nodesWithNoteRef} />)

    const conceptButtons = screen.getAllByRole('button')
      .filter((b) => b.className.includes('cmm-concept'))
    expect(conceptButtons.length).toBeGreaterThan(0)
    for (const b of conceptButtons) {
      expect(b.getAttribute('data-tier')).toBe('loading')
      expect(b.getAttribute('data-tier')).not.toBe('unverified')
      // title이 아니라 aria-label로 접근 가능해야 한다(스크린리더가 hover 없이도 듣는다).
      expect(b.getAttribute('aria-label')).toMatch(/확인 중/)
    }
  })
})

// 이게 이 태스크의 핵심 회귀 테스트다. 노트를 보고 돌아오면 지도가 다시 열려 있어야
// 한다 — 위치가 컴포넌트 로컬 상태면 이 테스트가 깨진다. 스탠드얼론 ConceptMapModal을
// unmount/remount하는 것만으로는 이 회귀를 잡을 수 없다: 그 렌더는 항상 프로젝트를
// prop으로 직접 받으므로, "ResumeView가 activeProjectId로 프로젝트를 다시 찾아
// 넘겨준다"는 실제 배선을 전혀 거치지 않는다. 그래서 여기서는 ConceptMapModal을 직접
// 마운트하지 않고 ResumeView를 통해서만 마운트한다 — DrillView의 "이 개념 보기 이후
// 재마운트" 테스트와 같은 패턴이다.
describe('ConceptMapModal — 내 이력을 떠났다 돌아와도 지도가 열려 있다 (real composition)', () => {
  // Task 7 fix round 1, finding 2: 이전 버전은 beforeEach가 이미 세팅해 둔
  // mapOpen:true/activeProjectId로 시작해 지도가 열려 있는지만 확인했다 — '개념 지도'
  // 버튼의 onClick 핸들러 자체는 한 번도 눌리지 않아, 그 핸들러가 통째로 no-op이 돼도
  // (setMapOpen(true)/setActiveProject를 잃어도) 이 테스트는 몰랐다. 여기서는 닫힌
  // 상태로 시작해 그 버튼을 실제로 눌러서 연다 — 진입점과 회귀를 한 테스트가 함께 덮는다.
  it('opens via the 개념 지도 button, and stays open across the unmount/remount that openNote causes when leaving and returning to 내 이력', () => {
    useResumeStore.setState({ mapOpen: false })
    useGraphStore.setState({ activeProjectId: null })

    const first = render(<ResumeView />)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '개념 지도' }))
    // ResumeView가 실제로 activeProjectId + mapOpen을 보고 지도를 그렸는지부터 확인한다
    // (스탠드얼론 렌더가 아니라 이 조립 자체가 배선돼 있음을 증명).
    expect(screen.getByRole('dialog')).toBeTruthy()

    // ResumeView는 실제 graph.json(data.nodes)을 ConceptMapModal에 넘긴다 — 이 fixture의
    // '트랜잭션'이 아니라 실제 그래프에서 db-tx의 진짜 라벨("Transaction & Isolation")로
    // 클릭해야 한다.
    fireEvent.click(screen.getByRole('button', { name: /Transaction/ }))
    expect(useGraphStore.getState().viewMode).toBe('list')
    expect(useGraphStore.getState().selectedId).toBe('db-tx')

    // App이 viewMode !== 'resume'이면 ResumeView 전체를 조건부로 unmount한다 — 그 사실을
    // 실제로 흉내낸다.
    first.unmount()

    // 사용자가 노트를 보고 '내 이력' 탭으로 돌아온다.
    useGraphStore.setState({ viewMode: 'resume' })
    render(<ResumeView />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.querySelector('.cmm-project')?.textContent).toBe('정산 서비스')
  })
})
