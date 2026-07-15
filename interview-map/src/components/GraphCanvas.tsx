import {
  ReactFlow, ReactFlowProvider, Background, Controls, useViewport,
  type Node, type Edge,
} from '@xyflow/react'
import { useMemo } from 'react'
import { DomainNode } from './DomainNode'
import { ConceptNode } from './ConceptNode'
import { visibleLevels } from '../hooks/useSemanticZoom'
import type { GraphNode } from '../graph/types'

const nodeTypes = { domain: DomainNode, concept: ConceptNode }

function Inner({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const { zoom } = useViewport()
  const levelKey = visibleLevels(zoom).join(',')
  const visibleNodes = useMemo(() => {
    const lv = levelKey.split(',').map(Number)
    return nodes.filter((n) => lv.includes((n.data as { node: GraphNode }).node.level))
  }, [nodes, levelKey])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const visibleEdges = useMemo(
    () => edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [edges, visibleIds],
  )
  return (
    <ReactFlow nodes={visibleNodes} edges={visibleEdges} nodeTypes={nodeTypes} fitView
      minZoom={0.2} maxZoom={2.5}>
      <Background color="#1e293b" gap={24} />
      <Controls />
    </ReactFlow>
  )
}

export function GraphCanvas({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0b1220' }}>
      <ReactFlowProvider>
        <Inner nodes={nodes} edges={edges} />
      </ReactFlowProvider>
    </div>
  )
}
