import { LuMap, LuList } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import './ViewToggle.css'

export function ViewToggle() {
  const viewMode = useGraphStore((s) => s.viewMode)
  const setViewMode = useGraphStore((s) => s.setViewMode)
  return (
    <div className="vt" role="tablist" aria-label="보기 방식">
      <button
        role="tab"
        aria-selected={viewMode === 'graph'}
        data-active={viewMode === 'graph'}
        onClick={() => setViewMode('graph')}
      >
        <LuMap size={15} /> 지도
      </button>
      <button
        role="tab"
        aria-selected={viewMode === 'list'}
        data-active={viewMode === 'list'}
        onClick={() => setViewMode('list')}
      >
        <LuList size={15} /> 목록
      </button>
    </div>
  )
}
