import { describe, it, expect } from 'vitest'
import { extractQuizItems, seededShuffle, hashSeed, weakDomains, extractDrillChains } from './quiz'

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

describe('weakDomains', () => {
  const stats = {
    os: { correct: 2, seen: 5 },       // 0.40  weak
    network: { correct: 3, seen: 5 },  // 0.60  weak
    java: { correct: 5, seen: 5 },     // 1.00  not weak
    db: { correct: 1, seen: 2 },       // 0.50  but seen<3 → excluded
    react: { correct: 4, seen: 5 },    // 0.80  not < 0.8 → excluded
  }
  it('returns domains with seen>=minSeen and rate<maxRate, weakest first', () => {
    expect(weakDomains(stats).map((w) => w.domain)).toEqual(['os', 'network'])
  })
  it('respects the limit', () => {
    expect(weakDomains(stats, { limit: 1 }).map((w) => w.domain)).toEqual(['os'])
  })
  it('computes rate and is empty when nothing qualifies', () => {
    expect(weakDomains({ x: { correct: 3, seen: 3 } })).toEqual([])
    expect(weakDomains({ y: { correct: 0, seen: 4 } })[0].rate).toBe(0)
  })
})

describe('extractDrillChains', () => {
  it('captures a main Q with its ordered follow-up chain', () => {
    const body = [
      '**Q1. "프로세스와 스레드 차이?"**',
      '> 프로세스는 독립 메모리, 스레드는 공유.',
      '',
      '**꼬리 Q1-1. "멀티프로세스를 택하는 경우는?"**',
      '> 격리가 안정성으로 직결될 때.',
      '',
      '**꼬리 Q1-2. "JVM 스레드와 OS 스레드 관계는?"**',
      '> 1:1 매핑이 일반적.',
    ].join('\n')
    const chains = extractDrillChains(body)
    expect(chains).toHaveLength(1)
    expect(chains[0].question).toBe('프로세스와 스레드 차이?')
    expect(chains[0].answer).toBe('프로세스는 독립 메모리, 스레드는 공유.')
    expect(chains[0].followups).toEqual([
      { question: '멀티프로세스를 택하는 경우는?', answer: '격리가 안정성으로 직결될 때.' },
      { question: 'JVM 스레드와 OS 스레드 관계는?', answer: '1:1 매핑이 일반적.' },
    ])
  })

  it('excludes a main Q that has no follow-ups', () => {
    const body = [
      '**Q1. "꼬리 없는 질문?"**',
      '> 답만 있음.',
      '',
      '**Q2. "꼬리 있는 질문?"**',
      '> 메인 답.',
      '',
      '**꼬리 Q2-1. "따라오는 질문?"**',
      '> 따라오는 답.',
    ].join('\n')
    const chains = extractDrillChains(body)
    expect(chains).toHaveLength(1)
    expect(chains[0].question).toBe('꼬리 있는 질문?')
    expect(chains[0].followups).toHaveLength(1)
  })

  it('ignores Q/follow-up markers inside code fences', () => {
    const body = [
      '```',
      '**Q1. "코드 안 질문"**',
      '> 무시됨',
      '**꼬리 Q1-1. "코드 안 꼬리"**',
      '> 무시됨',
      '```',
      '**Q2. "진짜 질문?"**',
      '> 진짜 답.',
      '',
      '**꼬리 Q2-1. "진짜 꼬리?"**',
      '> 진짜 꼬리 답.',
    ].join('\n')
    const chains = extractDrillChains(body)
    expect(chains).toHaveLength(1)
    expect(chains[0].question).toBe('진짜 질문?')
    expect(chains[0].followups).toHaveLength(1)
  })

  it('parses multiple chains and stops each at the next main Q', () => {
    const body = [
      '**Q1. "첫 질문?"**',
      '> 첫 답.',
      '**꼬리 Q1-1. "첫 꼬리?"**',
      '> 첫 꼬리 답.',
      '**Q2. "둘째 질문?"**',
      '> 둘째 답.',
      '**꼬리 Q2-1. "둘째 꼬리?"**',
      '> 둘째 꼬리 답.',
    ].join('\n')
    const chains = extractDrillChains(body)
    expect(chains.map((c) => c.question)).toEqual(['첫 질문?', '둘째 질문?'])
    expect(chains[0].followups).toHaveLength(1)
    expect(chains[1].followups[0].question).toBe('둘째 꼬리?')
  })

  it('returns [] when there are no follow-ups anywhere', () => {
    const body = ['**Q1. "질문?"**', '> 답.'].join('\n')
    expect(extractDrillChains(body)).toEqual([])
  })
})
