import {
  ReactFlow, ReactFlowProvider, Background, Controls, useViewport, useReactFlow,
  type Node, type Edge, type NodeMouseHandler,
} from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'
import { DomainNode } from './DomainNode'
import { ConceptNode } from './ConceptNode'
import { ContextMenu, type MenuState } from './ContextMenu'
import { visibleLevels } from '../hooks/useSemanticZoom'
import { useGraphStore } from '../store/graphStore'
import { computeFocus } from '../lib/focus'
import { buildAdjacency } from '../lib/graphUtils'
import { tokensOf } from '../styles/themes'
import type { GraphNode } from '../graph/types'
import './controls.css'

const nodeTypes = { domain: DomainNode, concept: ConceptNode }

function Inner({ nodes, edges, adjacency }: {
  nodes: Node[]; edges: Edge[]; adjacency: Map<string, string[]>
}) {
  const { zoom } = useViewport()
  const { setCenter } = useReactFlow()
  const selectedId = useGraphStore((s) => s.selectedId)
  const select = useGraphStore((s) => s.select)
  const focusRequestId = useGraphStore((s) => s.focusRequestId)
  const clearFocusRequest = useGraphStore((s) => s.clearFocusRequest)
  const themeId = useGraphStore((s) => s.themeId)
  const grid = tokensOf(themeId).grid
  const { focused, isActive } = useMemo(
    () => computeFocus(selectedId, adjacency), [selectedId, adjacency])
  const [menu, setMenu] = useState<MenuState | null>(null)
  const nodesById = useMemo(
    () => new Map(nodes.map((n) => [n.id, (n.data as { node: GraphNode }).node])), [nodes])

  useEffect(() => {
    if (!focusRequestId) return
    const target = nodes.find((n) => n.id === focusRequestId)
    if (target) setCenter(target.position.x, target.position.y, { zoom: 1.5, duration: 600 })
    clearFocusRequest()
  }, [focusRequestId, nodes, setCenter, clearFocusRequest])

  const levelKey = visibleLevels(zoom).join(',')
  const visibleNodes = useMemo(() => {
    const lv = levelKey.split(',').map(Number)
    return nodes
      .filter((n) => lv.includes((n.data as { node: GraphNode }).node.level))
      .map((n) => ({
        ...n,
        style: { ...(n.style ?? {}), opacity: isActive && !focused.has(n.id) ? 0.15 : 1 },
      }))
  }, [nodes, levelKey, isActive, focused])

  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const visibleEdges = useMemo(() => edges
    .filter((e) => {
      if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) return false
      const isCross = (e.data as { type?: string } | undefined)?.type === 'crosslink'
      if (isCross) return isActive && focused.has(e.source) && focused.has(e.target)
      return true
    })
    .map((e) => {
      const onFocus = isActive && focused.has(e.source) && focused.has(e.target)
      const isCross = (e.data as { type?: string } | undefined)?.type === 'crosslink'
      return {
        ...e,
        label: onFocus && isCross ? (e.data as { label?: string }).label : undefined,
        style: { ...(e.style ?? {}), opacity: isActive && !onFocus ? 0.12 : 1 },
      }
    }), [edges, visibleIds, isActive, focused])

  const onNodeClick: NodeMouseHandler = (_, node) => { select(node.id); setMenu(null) }
  return (
    <>
      <ReactFlow nodes={visibleNodes} edges={visibleEdges} nodeTypes={nodeTypes} fitView
        minZoom={0.2} maxZoom={2.5} onNodeClick={onNodeClick}
        onPaneClick={() => { select(null); setMenu(null) }}
        onNodeContextMenu={(e, node) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, nodeId: node.id }) }}
        onPaneContextMenu={(e) => { e.preventDefault(); setMenu(null) }}>
        <Background color={grid} gap={24} />
        <Controls position="bottom-right" />
      </ReactFlow>
      <ContextMenu menu={menu} nodesById={nodesById} neighbors={adjacency} onClose={() => setMenu(null)} />
    </>
  )
}

export function GraphCanvas({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const adjacency = useMemo(() => {
    // reconstruct GraphEdge-shaped list from flow edges' source/target for adjacency
    return buildAdjacency(edges.map((e) => ({ source: e.source, target: e.target, type: 'hierarchy' as const })))
  }, [edges])
  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--bg)' }}>
      <ReactFlowProvider>
        <Inner nodes={nodes} edges={edges} adjacency={adjacency} />
      </ReactFlowProvider>
    </div>
  )
}
