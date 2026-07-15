// rehype plugin: fold inline interview Q&A into <details> so the answer is
// hidden until the reader chooses to reveal it (active recall).
//
// Notes format every inline question as a bold paragraph `**Q1. "…"**`
// immediately followed by a blockquote answer. We wrap exactly that pair —
// a <p> whose text starts with Q<digits>. / Q<digits>: directly followed by a
// <blockquote> — into <details><summary>question</summary>answer</details>.
// Blockquotes not preceded by such a question are left untouched, and the
// quiz section's explicit <details> never matches (its questions live in a
// <summary>, not a <p>).

interface HNode {
  type: string
  tagName?: string
  value?: string
  children?: HNode[]
  properties?: Record<string, unknown>
}

const Q_RE = /^Q\d*\s*[.:]/

function toText(node: HNode): string {
  if (node.type === 'text') return node.value ?? ''
  return (node.children ?? []).map(toText).join('')
}

function isQuestion(node: HNode): boolean {
  return node.type === 'element' && node.tagName === 'p' && Q_RE.test(toText(node).trim())
}

function isBlockquote(node: HNode): boolean {
  return node.type === 'element' && node.tagName === 'blockquote'
}

function isBlank(node: HNode): boolean {
  return node.type === 'text' && (node.value ?? '').trim() === ''
}

function transform(node: HNode): void {
  if (!node.children) return
  const out: HNode[] = []
  const children = node.children
  for (let i = 0; i < children.length; i++) {
    const cur = children[i]
    if (isQuestion(cur)) {
      // remark-rehype inserts whitespace-only text nodes between blocks; the
      // answer is the next non-blank sibling.
      let j = i + 1
      while (j < children.length && isBlank(children[j])) j++
      if (j < children.length && isBlockquote(children[j])) {
        out.push({
          type: 'element',
          tagName: 'details',
          properties: { className: ['qa-fold'] },
          children: [
            { type: 'element', tagName: 'summary', properties: {}, children: cur.children ?? [] },
            children[j],
          ],
        })
        i = j // consume through the blockquote answer (drop the blank between)
        continue
      }
    }
    transform(cur)
    out.push(cur)
  }
  node.children = out
}

export function rehypeFoldQA() {
  return (tree: unknown): void => { transform(tree as HNode) }
}
