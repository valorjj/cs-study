export type NodeStatus = 'studied' | 'learning' | 'todo'
export type EdgeType = 'hierarchy' | 'crosslink'

export interface GraphNode {
  id: string
  label: string
  domain: string       // one of the 11 domain ids
  level: 0 | 1 | 2      // 0=domain, 1=major, 2=leaf
  icon: string
  summary: string
  keywords: string[]
  status: NodeStatus
  noteRef?: string
  position: { x: number; y: number }
}

export interface GraphEdge {
  source: string
  target: string
  type: EdgeType
  label?: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
