import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { remarkPlugins } from './markdownPlugins'

function toHast(md: string) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkPlugins as never)
    .use(remarkRehype)
  return processor.runSync(processor.parse(md))
}

function hasDelete(md: string): boolean {
  let found = false
  const walk = (n: any) => {
    if (n.tagName === 'del') found = true
    ;(n.children ?? []).forEach(walk)
  }
  walk(toHast(md))
  return found
}

describe('remarkPlugins', () => {
  it('범위 표기 틸드를 취소선으로 만들지 않는다', () => {
    expect(hasDelete('힙이 수십~수백 GB로 크고, 반대로 수 GB~수십 GB 힙에서는 G1.')).toBe(false)
    expect(hasDelete('포트는 0~65535, 단계는 3~4단계.')).toBe(false)
  })

  it('명시적 이중 틸드는 여전히 취소선이다', () => {
    expect(hasDelete('이건 ~~틀린 설명~~ 입니다.')).toBe(true)
  })
})
