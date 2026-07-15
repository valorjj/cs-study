import { ReactFlow, Background, Controls, type Node, type Edge } from '@xyflow/react'
import { DomainNode } from './DomainNode'
import { ConceptNode } from './ConceptNode'

const nodeTypes = { domain: DomainNode, concept: ConceptNode }

export function GraphCanvas({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0b1220' }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView
        minZoom={0.2} maxZoom={2.5}>
        <Background color="#1e293b" gap={24} />
        <Controls />
      </ReactFlow>
    </div>
  )
}
