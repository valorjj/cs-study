import '@xyflow/react/dist/style.css'
import { useMemo } from 'react'
import graphData from './graph/graph.json'
import type { GraphData } from './graph/types'
import { toFlowNodes, toFlowEdges, buildAdjacency } from './lib/graphUtils'
import { layoutNodes } from './lib/layout'
import { buildTree } from './lib/tree'
import { AppShell } from './components/AppShell'
import { GraphCanvas } from './components/GraphCanvas'
import { NotePanel } from './components/NotePanel'
import { DocsView } from './components/DocsView'
import { QuizTab } from './components/QuizTab'
import { HomeView } from './components/HomeView'
import { PathView } from './components/PathView'
import { GuideView } from './components/GuideView'
import { ResumeView } from './components/ResumeView'
import { SearchBar } from './components/SearchBar'
import { useGraphStore, type ViewMode } from './store/graphStore'
import { useThemeEffect, useViewModeEffect } from './hooks/useTheme'
import { useCloudSync } from './hooks/useCloudSync'
import { useUrlSync } from './hooks/useUrlSync'

const data = graphData as GraphData

// Search only means something where there is a graph or a list to search.
// Elsewhere the top bar shows the destination's name so it is never empty.
const TITLES: Record<ViewMode, string> = {
  home: '홈', graph: '개념 지도', list: '개념 목록', quiz: '퀴즈',
  path: '학습 코스', resume: '내 이력', guide: '가이드',
}

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

  const searchable = viewMode === 'graph' || viewMode === 'list'
  const lead = searchable
    ? <SearchBar nodes={data.nodes} />
    : <span className="shell-title">{TITLES[viewMode]}</span>

  return (
    <AppShell lead={lead}>
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
    </AppShell>
  )
}
