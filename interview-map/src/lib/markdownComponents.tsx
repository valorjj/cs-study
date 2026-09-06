import type { Element, ElementContent } from 'hast'
import type { Components } from 'react-markdown'
import { Mermaid } from '../components/Mermaid'

/** Concatenated text of a hast element's direct children. */
function textOf(node: Element): string {
  return node.children
    .map((c: ElementContent) => (c.type === 'text' ? c.value : ''))
    .join('')
}

/** The ```mermaid fence, if this <pre> wraps one. */
export function mermaidSourceOf(node: Element | undefined): string | null {
  const code = node?.children.find((c): c is Element => c.type === 'element')
  if (!code || code.tagName !== 'code') return null
  const className = code.properties?.className
  const classes = Array.isArray(className) ? className.map(String) : []
  if (!classes.includes('language-mermaid')) return null
  return textOf(code).replace(/\n+$/, '')
}

/**
 * Element overrides shared by every markdown surface (note bodies, quiz and
 * review answers).
 *
 * Two jobs:
 *  - route ```mermaid fences to the diagram renderer. The swap happens at <pre>
 *    rather than <code> because a <figure> nested inside a <pre> is invalid and
 *    would inherit `white-space: pre`.
 *  - mark blocks that legitimately exceed the reading measure (`--measure`) so
 *    the .prose grid lets them use the gutters. See prose.css.
 */
export const markdownComponents: Components = {
  pre(props) {
    const { node, children, ...rest } = props
    const chart = mermaidSourceOf(node)
    if (chart) return <Mermaid chart={chart} />
    return <pre className="prose-wide" {...rest}>{children}</pre>
  },
  // A wide table scrolls inside its own box instead of pushing the page sideways.
  table(props) {
    const { node: _node, children, ...rest } = props
    return (
      <div className="prose-table-scroll prose-wide">
        <table {...rest}>{children}</table>
      </div>
    )
  },
}
