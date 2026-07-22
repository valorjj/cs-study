import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { IconType } from 'react-icons'
import { LuArrowRight, LuCheck, LuCircleCheck, LuTarget, LuZap, LuPuzzle, LuShield, LuNetwork } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { CURATED_TRACKS } from '../graph/tracks'
import { buildDomainTracks, trackProgress, nextStepIndex, type Track } from '../lib/tracks'
import { domainColor } from '../styles/theme'
import { NodeIcon } from './NodeIcon'
import type { GraphNode, GraphEdge } from '../graph/types'
import './PathView.css'

// Vector icons for the hand-curated courses (keyed by Track.icon).
const CURATED_ICON: Record<string, IconType> = { target: LuTarget, zap: LuZap, puzzle: LuPuzzle, shield: LuShield, network: LuNetwork }

// A course's icon: domain courses reuse the domain's node icon; curated courses
// map their icon key to a lucide glyph. Keeps the path list emoji-free.
function TrackIcon({ track, size }: { track: Track; size: number }) {
  if (track.id.startsWith('domain:')) {
    const d = track.id.slice('domain:'.length)
    return <NodeIcon id={d} domain={d} size={size} />
  }
  const Icon = CURATED_ICON[track.icon] ?? LuTarget
  return <Icon size={size} />
}

// Study-path view: choose a course (curated or per-domain) and work through its
// ordered concepts, checking each off (persisted) and jumping to its note.
export function PathView({ nodes, edges, nodesById }: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodesById: Map<string, GraphNode>
}) {
  const select = useGraphStore((s) => s.select)
  const setViewMode = useGraphStore((s) => s.setViewMode)
  const studiedIds = useGraphStore((s) => s.studiedIds)
  const toggleStudied = useGraphStore((s) => s.toggleStudied)
  const pathTrackId = useGraphStore((s) => s.pathTrackId)
  const clearPathTrack = useGraphStore((s) => s.clearPathTrack)

  const studied = useMemo(() => new Set(studiedIds), [studiedIds])
  const tracks = useMemo(() => [...CURATED_TRACKS, ...buildDomainTracks(nodes, edges)], [nodes, edges])
  const domainLabel = useMemo(
    () => new Map(nodes.filter((n) => n.level === 0).map((n) => [n.domain, n.label])),
    [nodes],
  )
  const [selectedId, setSelectedId] = useState(tracks[0]?.id ?? '')
  const [mobileDetail, setMobileDetail] = useState(false)

  // A quiz weak-domain chip (requestTrack) asked to open a specific course.
  useEffect(() => {
    if (!pathTrackId) return
    setSelectedId(pathTrackId)
    setMobileDetail(true)
    clearPathTrack()
  }, [pathTrackId, clearPathTrack])

  const curated = tracks.filter((t) => t.id.startsWith('curated:'))
  const domainTracks = tracks.filter((t) => t.id.startsWith('domain:'))
  const track = tracks.find((t) => t.id === selectedId) ?? tracks[0]
  const { done, total } = trackProgress(track, studied)
  const nextIdx = nextStepIndex(track, studied)
  const nextNode = nextIdx >= 0 ? nodesById.get(track.steps[nextIdx]) : undefined
  const pct = total ? Math.round((done / total) * 100) : 0

  const openNode = (id: string) => { select(id); setViewMode('list') }
  const pickTrack = (id: string) => { setSelectedId(id); setMobileDetail(true) }

  const renderTrack = (t: Track) => {
    const p = trackProgress(t, studied)
    return (
      <button key={t.id} className="path-track" data-active={t.id === selectedId} onClick={() => pickTrack(t.id)}>
        <span className="path-track-icon"><TrackIcon track={t} size={16} /></span>
        <span className="path-track-title">{t.title}</span>
        <span className="path-track-prog">{p.done}/{p.total}</span>
      </button>
    )
  }

  return (
    <div className="path" data-detail={mobileDetail}>
      <div className="path-tracks">
        <div className="path-group">추천 코스</div>
        {curated.map(renderTrack)}
        <div className="path-group">도메인별 코스</div>
        {domainTracks.map(renderTrack)}
      </div>

      <div className="path-main">
        <button className="path-back" onClick={() => setMobileDetail(false)}>← 코스 목록</button>
        <div className="path-head">
          <h2><span className="path-head-icon"><TrackIcon track={track} size={20} /></span> {track.title}</h2>
          <p className="path-desc">{track.description}</p>
          <div className="path-bar"><span style={{ width: `${pct}%` }} /></div>
          <div className="path-status">
            <span>{done} / {total} 완료</span>
            {nextNode ? (
              <button className="path-continue" onClick={() => openNode(nextNode.id)}>
                이어서: {nextNode.label} <LuArrowRight size={14} />
              </button>
            ) : <span className="path-done"><LuCircleCheck size={15} /> 완료</span>}
          </div>
        </div>

        <ol className="path-steps">
          {track.steps.map((id, i) => {
            const n = nodesById.get(id)
            if (!n) return null
            const isDone = studied.has(id)
            return (
              <li key={id} className="path-step" data-next={i === nextIdx} data-done={isDone}
                style={{ ['--c']: domainColor(n.domain) } as CSSProperties}>
                <button className="path-check" data-done={isDone}
                  onClick={() => toggleStudied(id)} aria-label={`${n.label} 완료 토글`}>
                  {isDone && <LuCheck size={13} />}
                </button>
                <span className="path-num">{i + 1}</span>
                <button className="path-step-label" onClick={() => openNode(id)}>
                  <NodeIcon id={n.id} domain={n.domain} size={15} />
                  <span className="path-step-name">{n.label}</span>
                  <span className="path-step-domain">{domainLabel.get(n.domain) ?? n.domain}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
