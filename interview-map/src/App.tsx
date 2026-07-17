import '@xyflow/react/dist/style.css'
import { useMemo } from 'react'
import graphData from './graph/graph.json'
import type { GraphData } from './graph/types'
import { toFlowNodes, toFlowEdges, buildAdjacency } from './lib/graphUtils'
import { layoutNodes } from './lib/layout'
import { buildTree } from './lib/tree'
import { GraphCanvas } from './components/GraphCanvas'
import { NotePanel } from './components/NotePanel'
import { DocsView } from './components/DocsView'
import { QuizView } from './components/QuizView'
import { PathView } from './components/PathView'
import { SearchBar } from './components/SearchBar'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { ViewToggle } from './components/ViewToggle'
import { useGraphStore } from './store/graphStore'
import { useThemeEffect, useViewModeEffect, useProgressEffect } from './hooks/useTheme'

const data = graphData as GraphData

export default function App() {
  useThemeEffect()
  useViewModeEffect()
  useProgressEffect()
  const viewMode = useGraphStore((s) => s.viewMode)
  const nodes = useMemo(() => toFlowNodes(layoutNodes(data.nodes, data.edges)), [])
  const edges = useMemo(() => toFlowEdges(data.edges), [])
  const nodesById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [])
  const neighbors = useMemo(() => buildAdjacency(data.edges), [])
  const tree = useMemo(() => buildTree(data.nodes, data.edges), [])

  return (
    <>
      {viewMode === 'graph' && (
        <>
          <GraphCanvas nodes={nodes} edges={edges} />
          <NotePanel nodesById={nodesById} neighbors={neighbors} />
        </>
      )}
      {viewMode === 'list' && (
        <DocsView tree={tree} edges={data.edges} nodesById={nodesById} neighbors={neighbors} />
      )}
      {viewMode === 'quiz' && <QuizView nodes={data.nodes} />}
      {viewMode === 'path' && <PathView nodes={data.nodes} edges={data.edges} nodesById={nodesById} />}
      {(viewMode === 'graph' || viewMode === 'list') && <SearchBar nodes={data.nodes} />}
      <ThemeSwitcher />
      <ViewToggle />
    </>
  )
}
