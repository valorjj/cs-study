import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'
import type { GraphNode } from '../graph/types'
import { domainColor } from '../styles/theme'
import { LuCheck } from 'react-icons/lu'
import { NodeIcon } from './NodeIcon'
import './nodes.css'

export function ConceptNode({ data }: NodeProps) {
  const d = data as { node: GraphNode; hasChildren?: boolean; expanded?: boolean; studied?: boolean }
  const node = d.node
  const color = domainColor(node.domain)
  return (
    <div className="km-node km-concept" style={{ '--c': color } as CSSProperties}>
      <Handle type="target" position={Position.Top} className="km-handle" />
      {d.studied && <span className="km-check" aria-label="완료"><LuCheck size={12} strokeWidth={3} /></span>}
      <span className="km-icon"><NodeIcon id={node.id} domain={node.domain} size={20} /></span>
      <span className="km-label">{node.label}</span>
      {d.hasChildren && (
        <span
          className={`km-chevron${d.expanded ? ' is-open' : ''}`}
          aria-label={d.expanded ? '하위 개념 접기' : '하위 개념 펼치기'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="km-handle" />
    </div>
  )
}
