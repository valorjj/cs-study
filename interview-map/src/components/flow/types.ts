export interface FlowStage { id: string; label: string; color: string }
export interface FlowNode { id: string; stage: string; title: string; subtitle?: string }
export interface FlowStep {
  title: string
  activeNodes: string[]
  edges: { from: string; to: string }[]
  note?: string
}
export interface Flow { stages: FlowStage[]; nodes: FlowNode[]; steps: FlowStep[] }
