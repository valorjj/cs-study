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
import { QuizTab } from './components/QuizTab'
import { HomeView } from './components/HomeView'
import { PathView } from './components/PathView'
import { GuideView } from './components/GuideView'
import { ResumeView } from './components/ResumeView'
import { SearchBar } from './components/SearchBar'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { AuthButton } from './components/AuthButton'
import { ViewToggle } from './components/ViewToggle'
import { useGraphStore } from './store/graphStore'
import { useThemeEffect, useViewModeEffect } from './hooks/useTheme'
import { useCloudSync } from './hooks/useCloudSync'
import { useUrlSync } from './hooks/useUrlSync'

const data = graphData as GraphData

export default function App() {
  useThemeEffect()
  // Must run before useViewModeEffect: within one component effects fire in
  // hook-call order, and useViewModeEffect's write effect would otherwise
  // persist the store's pre-hydration default before useUrlSync reads it back.
  useUrlSync()
  useViewModeEffect()
  useCloudSync()
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
      {viewMode === 'home' && <HomeView nodes={data.nodes} />}
      {viewMode === 'quiz' && <QuizTab nodes={data.nodes} />}
      {viewMode === 'path' && <PathView nodes={data.nodes} nodesById={nodesById} />}
      {viewMode === 'guide' && <GuideView />}
      {viewMode === 'resume' && <ResumeView />}
      {(viewMode === 'graph' || viewMode === 'list') && <SearchBar nodes={data.nodes} />}
      <AuthButton />
      <ThemeSwitcher />
      <ViewToggle />
    </>
  )
}
