import { LuHouse, LuMap, LuList, LuBrain, LuRoute, LuBookText, LuBriefcase } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { useGraphStore, type ViewMode } from '../store/graphStore'
import './NavRail.css'

// Replaces the old floating bottom pill (ViewToggle), which overlapped the
// note body's last lines. As a grid track it can't cover content, and vertical
// stacking leaves room for destinations to be added later.
const DESTINATIONS: readonly { mode: ViewMode; label: string; Icon: IconType }[] = [
  { mode: 'home', label: '홈', Icon: LuHouse },
  { mode: 'graph', label: '지도', Icon: LuMap },
  { mode: 'list', label: '목록', Icon: LuList },
  { mode: 'quiz', label: '퀴즈', Icon: LuBrain },
  { mode: 'path', label: '코스', Icon: LuRoute },
  { mode: 'resume', label: '내 이력', Icon: LuBriefcase },
  { mode: 'guide', label: '가이드', Icon: LuBookText },
]

export function NavRail() {
  const viewMode = useGraphStore((s) => s.viewMode)
  const setViewMode = useGraphStore((s) => s.setViewMode)

  return (
    <nav className="rail" role="tablist" aria-label="보기 방식">
      <span className="rail-brand" aria-hidden="true">CS</span>
      {DESTINATIONS.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          role="tab"
          aria-selected={viewMode === mode}
          data-active={viewMode === mode}
          title={label}
          onClick={() => setViewMode(mode)}
        >
          <Icon size={19} />
          <span className="rail-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}
