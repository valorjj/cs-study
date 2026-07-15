import { useState } from 'react'
import { searchNodes } from '../lib/search'
import { useGraphStore } from '../store/graphStore'
import { domainColor } from '../styles/theme'
import type { GraphNode } from '../graph/types'
import { NodeIcon } from './NodeIcon'
import './SearchBar.css'

export function SearchBar({ nodes }: { nodes: GraphNode[] }) {
  const [q, setQ] = useState('')
  const requestFocus = useGraphStore((s) => s.requestFocus)
  const results = searchNodes(q, nodes)
  return (
    <div className="sb">
      <input className="sb-input" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="개념 검색 (예: GC, 이벤트 루프)" />
      {results.length > 0 && (
        <ul className="sb-results">
          {results.map((r: GraphNode) => (
            <li key={r.id}>
              <button onClick={() => { requestFocus(r.id); setQ('') }}
                style={{ borderLeftColor: domainColor(r.domain) }}>
                <span><NodeIcon id={r.id} domain={r.domain} size={15} /> {r.label}</span>
                <small>{r.domain}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
