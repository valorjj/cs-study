// mastery.tierOf는 노드별 SRS 카드 키를 요구한다. 그 관계는 그래프가 아니라 노트
// 본문에 있다(노트 섹션 → 플래시카드 → srsKey). useNotePool이 이미 그 매핑을
// 만들어 주므로 여기서는 nodeId로 묶기만 한다.
import { useMemo } from 'react'
import { useNotePool } from './useNotePool'
import { extractQuizItems } from '../lib/quiz'
import type { GraphNode } from '../graph/types'

export function useSrsKeysByNode(nodes: GraphNode[]): {
  loading: boolean
  srsKeysByNode: Map<string, string[]>
} {
  const { loading, buildItems } = useNotePool(nodes)
  const srsKeysByNode = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const it of buildItems(extractQuizItems)) {
      if (!it.nodeId || !it.srsKey) continue
      const list = out.get(it.nodeId) ?? []
      list.push(it.srsKey)
      out.set(it.nodeId, list)
    }
    return out
  }, [buildItems])
  return { loading, srsKeysByNode }
}
