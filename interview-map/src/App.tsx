import '@xyflow/react/dist/style.css'
import { useMemo } from 'react'
import graphData from './graph/graph.json'
import type { GraphData } from './graph/types'
import { toFlowNodes, toFlowEdges, buildAdjacency } from './lib/graphUtils'
import { layoutNodes } from './lib/layout'
import { GraphCanvas } from './components/GraphCanvas'
import { NotePanel } from './components/NotePanel'
import { SearchBar } from './components/SearchBar'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { useThemeEffect } from './hooks/useTheme'

const data = graphData as GraphData

export default function App() {
  useThemeEffect()
  const nodes = useMemo(() => toFlowNodes(layoutNodes(data.nodes, data.edges)), [])
  const edges = useMemo(() => toFlowEdges(data.edges), [])
  const nodesById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [])
  const neighbors = useMemo(() => buildAdjacency(data.edges), [])
  return (
    <>
      <GraphCanvas nodes={nodes} edges={edges} />
      <NotePanel nodesById={nodesById} neighbors={neighbors} />
      <SearchBar nodes={data.nodes} />
      <ThemeSwitcher />
    </>
  )
}
