// 개념 지도 모달 — 프로젝트가 건드린 CS 개념을 도메인별로 방사형 배치해 보여준다.
//
// 렌더러를 그래프 탭(@xyflow/react)과 의도적으로 다르게 골랐다: layoutRadial이 이미
// 절대 좌표(x, y)를 계산해 주므로, 연결선은 <svg><line>으로 그리고 노드는 절대배치
// 요소로 찍으면 충분하다. React Flow는 실제 DOM 크기 측정이 있어야 레이아웃이
// 성립하는데 jsdom은 그 측정을 제공하지 않아 렌더 테스트가 번거로워진다 — 이 지도는
// 좌표를 이미 다 갖고 있으므로 그 비용을 낼 이유가 없다.
//
// 위치(mapOpen)는 store(resumeStore)에 있다. "이 개념 보기"를 누르면 openNote가
// viewMode를 'list'로 바꿔 App이 ResumeView 전체를 unmount한다 — 모달 열림이 컴포넌트
// 로컬 상태였다면 노트를 보고 돌아왔을 때 지도가 닫혀 있었을 것이다(퀴즈 탭의 카드
// 위치와 같은 부류의 결함). 그래서 개념 클릭 핸들러는 openNote(nodeId) 하나만 부르고
// mapOpen을 손대지 않는다 — 뷰가 바뀌어 안 보이는 것과 사용자가 닫은 것은 다른 사건이다.
import { useEffect, useMemo, type CSSProperties } from 'react'
import { useResumeStore } from '../store/resumeStore'
import { useGraphStore } from '../store/graphStore'
import { useSrsKeysByNode } from '../hooks/useSrsKeysByNode'
import { toDomainGroups } from '../lib/conceptGroups'
import { layoutRadial, type Placed } from '../lib/radial'
import { domainColor } from '../styles/theme'
import type { Tier } from '../lib/mastery'
import type { MatchVia, Project } from '../lib/resumeTypes'
import type { GraphNode } from '../graph/types'
import './ConceptMapModal.css'

interface ConceptMapModalProps {
  project: Project
  nodes: GraphNode[]
}

const TIER_ICON: Record<Tier, string> = { solid: '●', shaky: '◐', unverified: '○' }
const VIA_LABEL: Record<MatchVia, string> = {
  chip: '기술스택 칩에서 매칭', keyword: '서술문 키워드에서 매칭', llm: 'AI가 추론한 연관 개념',
}

export function ConceptMapModal({ project, nodes }: ConceptMapModalProps) {
  const mapOpen = useResumeStore((s) => s.mapOpen)
  const setMapOpen = useResumeStore((s) => s.setMapOpen)
  const srs = useGraphStore((s) => s.srs)
  const quizStats = useGraphStore((s) => s.quizStats)
  const openNote = useGraphStore((s) => s.openNote)
  const { srsKeysByNode, loading } = useSrsKeysByNode(nodes)

  // Task 6 리뷰의 판정: domainOfNode는 toDomainGroups에 넘기는 것과 같은 nodes 배열에서
  // 유도해야 한다. 다른(또는 낡은) 노드 집합에서 만든 domainOfNode는 tierOf의 도메인
  // 퀴즈통계 체크가 엉뚱한 도메인을 보게 만들어 shaky를 solid로 오판할 수 있다.
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const groups = useMemo(() => {
    const domainOfNode = (id: string): string => byId.get(id)?.domain ?? ''
    return toDomainGroups(project.matches, nodes, { srsKeysByNode, srs, quizStats, domainOfNode })
  }, [project.matches, nodes, srsKeysByNode, srs, quizStats, byId])
  const placed = useMemo(() => layoutRadial(project.name, groups), [project.name, groups])

  // Escape로 닫는다. mapOpen이 아닐 때는 리스너를 걸어둘 이유가 없다.
  useEffect(() => {
    if (!mapOpen) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setMapOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mapOpen, setMapOpen])

  if (!mapOpen) return null

  // 도메인 노드 하나에 이어지는 개념 노드들의 소속을 안다 — Placed에는 그 관계가 직접
  // 담겨 있지 않지만, layoutRadial이 만드는 순서(프로젝트 → 도메인 → 그 도메인의 개념들
  // → 다음 도메인 …)가 결정적이므로 순회하면서 "현재 도메인"을 갱신하면 재구성할 수 있다.
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  let currentDomain = { x: 0, y: 0 }
  for (const p of placed) {
    if (p.kind === 'domain') {
      lines.push({ x1: 0, y1: 0, x2: p.x, y2: p.y })
      currentDomain = { x: p.x, y: p.y }
    } else if (p.kind === 'concept') {
      lines.push({ x1: currentDomain.x, y1: currentDomain.y, x2: p.x, y2: p.y })
    }
  }

  const noMatches = groups.length === 0

  return (
    <div className="cmm-overlay" onClick={() => setMapOpen(false)}>
      <div
        className="cmm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="개념 지도"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmm-head">
          <h2 className="cmm-title">개념 지도</h2>
          <button type="button" className="cmm-close" onClick={() => setMapOpen(false)}>닫기</button>
        </div>

        {noMatches ? (
          <p className="cmm-empty">매칭된 개념이 없습니다. 프로젝트를 편집해 기술스택·서술문을 채워보세요.</p>
        ) : (
          <div className="cmm-canvas">
            <svg className="cmm-lines" viewBox="-450 -450 900 900" aria-hidden="true">
              {lines.map((l, i) => (
                <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
              ))}
            </svg>
            {placed.map((p) => renderPlaced(p, loading, openNote))}
          </div>
        )}
      </div>
    </div>
  )
}

function renderPlaced(p: Placed, loading: boolean, openNote: (id: string) => void) {
  const style = {
    left: `calc(50% + ${p.x}px)`, top: `calc(50% + ${p.y}px)`, transform: 'translate(-50%, -50%)',
  }

  if (p.kind === 'project') {
    return (
      <div key={p.id} className="cmm-project" style={style}>{p.label}</div>
    )
  }

  if (p.kind === 'domain') {
    return (
      <div key={p.id} className="cmm-domain" style={{ ...style, '--c': domainColor(p.id) } as CSSProperties}>
        <span>{p.label}</span>
        {p.hiddenCount ? <span className="cmm-badge">{`+${p.hiddenCount}`}</span> : null}
      </div>
    )
  }

  // concept
  const tier = p.tier ?? 'unverified'
  const via = p.via ?? 'chip'
  const icon = loading ? '…' : TIER_ICON[tier]
  const title = loading ? '학습 기록 확인 중' : VIA_LABEL[via]
  return (
    <button
      key={p.id}
      type="button"
      className="cmm-concept"
      style={style}
      data-tier={loading ? 'loading' : tier}
      data-via={via}
      title={title}
      onClick={() => openNote(p.id)}
    >
      <span className="cmm-concept-icon" aria-hidden="true">{icon}</span>
      {p.label}
    </button>
  )
}
