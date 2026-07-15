import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'
import type { GraphNode } from '../graph/types'
import { domainColor } from '../styles/theme'
import './nodes.css'

export function ConceptNode({ data }: NodeProps) {
  const node = (data as { node: GraphNode }).node
  const color = domainColor(node.domain)
  return (
    <div className={`km-node km-concept km-${node.status}`} style={{ '--c': color } as CSSProperties}>
      <Handle type="target" position={Position.Top} className="km-handle" />
      <span className="km-icon">{node.icon}</span>
      <span className="km-label">{node.label}</span>
      <Handle type="source" position={Position.Bottom} className="km-handle" />
    </div>
  )
}
