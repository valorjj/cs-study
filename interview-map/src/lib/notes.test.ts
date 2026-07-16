import { describe, it, expect } from 'vitest'
import { parseNoteRef, parseSections, extractOutline } from './notes'

describe('parseNoteRef', () => {
  it('splits path and anchor', () => {
    expect(parseNoteRef('notes/01-java-jvm/jvm-memory-gc.md#t2-garbage-collection'))
      .toEqual({ path: '/notes/01-java-jvm/jvm-memory-gc.md', anchor: 't2-garbage-collection' })
  })
  it('handles missing anchor', () => {
    expect(parseNoteRef('notes/01-java-jvm/hashmap-internals.md'))
      .toEqual({ path: '/notes/01-java-jvm/hashmap-internals.md', anchor: null })
  })
  it('normalizes an already-leading-slash path', () => {
    expect(parseNoteRef('/notes/a.md#x')).toEqual({ path: '/notes/a.md', anchor: 'x' })
  })
})

describe('parseSections', () => {
  const md = [
    '# 운영체제(OS) 핵심 — 면접 답변 정리본',
    '',
    '## 목차',
    '- [O1](#o1-process-and-thread)',
    '',
    '# O1. Process and Thread',
    '',
    '## 1. 비유',
    '내용 A',
    '',
    '# O2. CPU Scheduling',
    '본문 B',
  ].join('\n')

  it('uses the first H1 as the title', () => {
    expect(parseSections(md).title).toBe('운영체제(OS) 핵심 — 면접 답변 정리본')
  })

  it('extracts each subsequent H1 as a section (heading line excluded from body)', () => {
    const { sections } = parseSections(md)
    expect(sections.map((s) => s.heading)).toEqual(['O1. Process and Thread', 'O2. CPU Scheduling'])
    expect(sections[0].body).toBe('## 1. 비유\n내용 A')
    expect(sections[1].body).toBe('본문 B')
  })

  it('drops the 목차 preamble between title and first section', () => {
    const { sections } = parseSections(md)
    expect(sections.some((s) => s.body.includes('목차'))).toBe(false)
    expect(sections.some((s) => s.body.includes('o1-process-and-thread'))).toBe(false)
  })

  it('slugs headings to match noteRef anchors', () => {
    const { sections } = parseSections(md)
    expect(sections[0].slug).toBe('o1-process-and-thread')
  })

  it('does not treat H2 (##) lines as section boundaries', () => {
    const { sections } = parseSections('# T\n\n## H2 sub\nx\n\n# Real\ny')
    expect(sections.map((s) => s.heading)).toEqual(['Real'])
    expect(sections[0].body).toBe('y')
  })

  it('does not treat "# " comment lines inside code fences as sections', () => {
    const md = [
      '# 제목',
      '',
      '# DO1. Docker',
      '',
      '```dockerfile',
      '# 나쁜 예 — 주석',
      'COPY . .',
      '# 좋은 예',
      'RUN build',
      '```',
      '',
      '설명 문장',
    ].join('\n')
    const { sections } = parseSections(md)
    expect(sections.map((s) => s.heading)).toEqual(['DO1. Docker'])
    expect(sections[0].body).toContain('# 나쁜 예 — 주석')
    expect(sections[0].body).toContain('```dockerfile')
    expect(sections[0].body.match(/```/g)).toHaveLength(2) // fence stays balanced
  })
})

describe('extractOutline', () => {
  it('extracts H2 and H3 headings in order with matching slugs', () => {
    const body = '## 1. 비유\n텍스트\n\n### 세부\n더\n\n## 2. 개념 정의\n끝'
    expect(extractOutline(body)).toEqual([
      { depth: 2, text: '1. 비유', slug: '1-비유' },
      { depth: 3, text: '세부', slug: '세부' },
      { depth: 2, text: '2. 개념 정의', slug: '2-개념-정의' },
    ])
  })

  it('ignores ## lines inside code fences', () => {
    const body = '## real\n```py\n## not a heading\n```\n## also real'
    expect(extractOutline(body).map((o) => o.text)).toEqual(['real', 'also real'])
  })

  it('returns [] when there are no sub-headings (quiz case)', () => {
    expect(extractOutline('<details><summary>Q</summary>A</details>')).toEqual([])
  })

  it('dedupes duplicate heading text like rehype-slug does', () => {
    const body = '## 정리\n\n## 정리'
    expect(extractOutline(body).map((o) => o.slug)).toEqual(['정리', '정리-1'])
  })
})
