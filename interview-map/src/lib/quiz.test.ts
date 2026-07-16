import { describe, it, expect } from 'vitest'
import { extractQuizItems, seededShuffle, hashSeed } from './quiz'

describe('extractQuizItems', () => {
  it('pairs a **Q...** line with its following blockquote answer', () => {
    const body = [
      '## 5. 예상 면접 질문',
      '**Q. "OSI에서 TCP와 IP는 몇 계층?"**',
      '> IP는 3계층, TCP는 4계층.',
      '',
      '> 🔎 꼬리 질문: 왜 나누나 → 계층 독립성.',
    ].join('\n')
    expect(extractQuizItems(body)).toEqual([
      { question: 'OSI에서 TCP와 IP는 몇 계층?', answer: 'IP는 3계층, TCP는 4계층.' },
    ])
  })

  it('strips the Q number/marker and surrounding quotes', () => {
    const body = '**Q3. TCP와 UDP 차이는?**\n> 신뢰성 여부.'
    expect(extractQuizItems(body)[0].question).toBe('TCP와 UDP 차이는?')
  })

  it('handles Q markers with a parenthesised label like Q3(경험).', () => {
    const body = '**Q3(경험). "필드 주입 문제 겪어봤나요?"**\n> 네, 순환참조를 겪었습니다.'
    expect(extractQuizItems(body)).toEqual([
      { question: '필드 주입 문제 겪어봤나요?', answer: '네, 순환참조를 겪었습니다.' },
    ])
  })

  it('captures multi-line blockquote answers', () => {
    const body = '**Q. 무엇?**\n> 첫 줄\n> 둘째 줄'
    expect(extractQuizItems(body)[0].answer).toBe('첫 줄\n둘째 줄')
  })

  it('ignores **Q lines inside code fences and returns [] when none', () => {
    expect(extractQuizItems('```\n**Q. fake?**\n> no\n```')).toEqual([])
    expect(extractQuizItems('그냥 본문 문단.')).toEqual([])
  })
})

describe('seededShuffle', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8]
  it('is deterministic for the same seed', () => {
    expect(seededShuffle(arr, 42)).toEqual(seededShuffle(arr, 42))
  })
  it('differs for different seeds', () => {
    expect(seededShuffle(arr, 1)).not.toEqual(seededShuffle(arr, 2))
  })
  it('is a permutation and does not mutate input', () => {
    const copy = arr.slice()
    const out = seededShuffle(arr, 7)
    expect(out.slice().sort((a, b) => a - b)).toEqual(arr)
    expect(arr).toEqual(copy)
  })
})

describe('hashSeed', () => {
  it('is deterministic and distinguishes strings', () => {
    expect(hashSeed('2026-07-16:all')).toBe(hashSeed('2026-07-16:all'))
    expect(hashSeed('2026-07-16:all')).not.toBe(hashSeed('2026-07-16:network'))
  })
})
