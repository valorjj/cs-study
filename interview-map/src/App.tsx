import '@xyflow/react/dist/style.css'
import graphData from './graph/graph.json'
import type { GraphData } from './graph/types'
import { toFlowNodes, toFlowEdges } from './lib/graphUtils'
import { GraphCanvas } from './components/GraphCanvas'

const data = graphData as GraphData

export default function App() {
  const nodes = toFlowNodes(data.nodes)
  const edges = toFlowEdges(data.edges)
  return <GraphCanvas nodes={nodes} edges={edges} />
}
