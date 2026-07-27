import type { Flow } from '../types'

// 흐름 데이터 무결성: 참조되는 stage/node가 실제로 존재하는지. 빈 배열 = 정상.
export function validateFlow(flow: Flow): string[] {
  const errs: string[] = []
  const stageIds = new Set(flow.stages.map((s) => s.id))
  const nodeIds = new Set(flow.nodes.map((n) => n.id))
  for (const n of flow.nodes) {
    if (!stageIds.has(n.stage)) errs.push(`node ${n.id} → unknown stage ${n.stage}`)
  }
  flow.steps.forEach((st, i) => {
    for (const a of st.activeNodes) if (!nodeIds.has(a)) errs.push(`step ${i} activeNode ${a} missing`)
    for (const e of st.edges) {
      if (!nodeIds.has(e.from)) errs.push(`step ${i} edge.from ${e.from} missing`)
      if (!nodeIds.has(e.to)) errs.push(`step ${i} edge.to ${e.to} missing`)
    }
  })
  return errs
}
