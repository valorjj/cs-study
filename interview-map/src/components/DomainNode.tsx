import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'
import type { GraphNode } from '../graph/types'
import { domainColor } from '../styles/theme'
import { NodeIcon } from './NodeIcon'
import './nodes.css'

export function DomainNode({ data }: NodeProps) {
  const d = data as { node: GraphNode; progress?: { done: number; total: number } }
  const node = d.node
  const color = domainColor(node.domain)
  return (
    <div className="km-node km-domain" style={{ '--c': color } as CSSProperties}>
      <Handle type="target" position={Position.Top} className="km-handle" />
      <span className="km-icon"><NodeIcon id={node.id} domain={node.domain} size={26} /></span>
      <span className="km-label">{node.label}</span>
      {d.progress && d.progress.done > 0 && (
        <span className="km-progress">{d.progress.done}/{d.progress.total}</span>
      )}
      <Handle type="source" position={Position.Bottom} className="km-handle" />
    </div>
  )
}
