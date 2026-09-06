import { describe, it, expect } from 'vitest'
import type { Element } from 'hast'
import { mermaidSourceOf } from './markdownComponents'

// Builds the hast shape react-markdown hands the `pre` override for a fenced
// block: <pre><code class="language-x">…</code></pre>.
function pre(lang: string | null, source: string): Element {
  return {
    type: 'element',
    tagName: 'pre',
    properties: {},
    children: [{
      type: 'element',
      tagName: 'code',
      properties: lang ? { className: [`language-${lang}`] } : {},
      children: [{ type: 'text', value: source }],
    }],
  }
}

describe('mermaidSourceOf', () => {
  it('extracts the source of a ```mermaid fence', () => {
    expect(mermaidSourceOf(pre('mermaid', 'flowchart TB\n  A --> B'))).toBe('flowchart TB\n  A --> B')
  })

  it('ignores fences in other languages', () => {
    expect(mermaidSourceOf(pre('java', 'class A {}'))).toBeNull()
    expect(mermaidSourceOf(pre('bash', 'jps -l'))).toBeNull()
  })

  it('ignores an untagged fence — the notes are full of plain-text blocks', () => {
    expect(mermaidSourceOf(pre(null, 'Eden | S0 | S1'))).toBeNull()
  })

  it('strips only the trailing newlines the fence adds', () => {
    expect(mermaidSourceOf(pre('mermaid', 'flowchart TB\n  A --> B\n\n')))
      .toBe('flowchart TB\n  A --> B')
  })

  it('keeps blank lines inside the diagram', () => {
    expect(mermaidSourceOf(pre('mermaid', 'flowchart TB\n\n  A --> B')))
      .toBe('flowchart TB\n\n  A --> B')
  })

  it('survives a <pre> with no element child', () => {
    expect(mermaidSourceOf(undefined)).toBeNull()
    expect(mermaidSourceOf({
      type: 'element', tagName: 'pre', properties: {},
      children: [{ type: 'text', value: 'bare' }],
    })).toBeNull()
  })

  it('does not treat a language-mermaid class on a non-code child as a fence', () => {
    expect(mermaidSourceOf({
      type: 'element', tagName: 'pre', properties: {},
      children: [{
        type: 'element', tagName: 'span',
        properties: { className: ['language-mermaid'] },
        children: [{ type: 'text', value: 'flowchart TB' }],
      }],
    })).toBeNull()
  })
})
