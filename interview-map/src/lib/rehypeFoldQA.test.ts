import { describe, it, expect } from 'vitest'
import { rehypeFoldQA } from './rehypeFoldQA'

const el = (tagName: string, children: unknown[] = []) => ({ type: 'element', tagName, properties: {}, children })
const txt = (value: string) => ({ type: 'text', value })

describe('rehypeFoldQA', () => {
  it('folds a bold-Q paragraph + following blockquote into <details>', () => {
    const tree = {
      type: 'root',
      children: [
        el('p', [el('strong', [txt('Q1. "프로세스와 스레드 차이?"')])]),
        el('blockquote', [el('p', [txt('답변 골격…')])]),
      ],
    }
    rehypeFoldQA()(tree)
    expect(tree.children).toHaveLength(1)
    const details = tree.children[0] as { tagName: string; children: { tagName: string }[] }
    expect(details.tagName).toBe('details')
    expect(details.children[0].tagName).toBe('summary')
    expect(details.children[1].tagName).toBe('blockquote')
  })

  it('leaves a blockquote NOT preceded by a question untouched', () => {
    const tree = {
      type: 'root',
      children: [
        el('p', [txt('일반 설명 문단.')]),
        el('blockquote', [txt('로딩은 lazy…')]),
      ],
    }
    rehypeFoldQA()(tree)
    expect(tree.children).toHaveLength(2)
    expect((tree.children[1] as { tagName: string }).tagName).toBe('blockquote')
  })

  it('does not fold a question with no following blockquote', () => {
    const tree = { type: 'root', children: [el('p', [el('strong', [txt('Q. 답 없는 질문?')])])] }
    rehypeFoldQA()(tree)
    expect((tree.children[0] as { tagName: string }).tagName).toBe('p')
  })

  it('folds across a whitespace text node between question and blockquote', () => {
    // remark-rehype emits a "\n" text node between sibling blocks
    const tree = {
      type: 'root',
      children: [
        el('p', [el('strong', [txt('Q1. 질문?')])]),
        txt('\n'),
        el('blockquote', [el('p', [txt('답변')])]),
      ],
    }
    rehypeFoldQA()(tree)
    expect(tree.children).toHaveLength(1)
    expect((tree.children[0] as { tagName: string }).tagName).toBe('details')
  })

  it('folds multiple Q&A pairs and matches Q. / Q2. / Q: forms', () => {
    const tree = {
      type: 'root',
      children: [
        el('p', [txt('Q. 첫 질문?')]),
        el('blockquote', [txt('답1')]),
        el('p', [txt('Q2. 둘째 질문?')]),
        el('blockquote', [txt('답2')]),
      ],
    }
    rehypeFoldQA()(tree)
    expect(tree.children).toHaveLength(2)
    expect(tree.children.every((c) => (c as { tagName: string }).tagName === 'details')).toBe(true)
  })
})
