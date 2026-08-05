import { describe, it, expect } from 'vitest'
import { parseHash, formatHash, DEFAULT_ROUTE, type RouteVocab } from './route'

const vocab: RouteVocab = {
  nodeIds: new Set(['dsa-bigo', 'jvm-gc']),
  trackIds: new Set(['curated:junior-backend', 'domain:network']),
}

describe('parseHash', () => {
  it('maps the top-level views', () => {
    for (const v of ['home', 'graph', 'list', 'quiz', 'path', 'guide', 'resume'] as const) {
      expect(parseHash(`#/${v}`, vocab).view).toBe(v)
    }
  })

  it('treats empty and root hashes as home', () => {
    expect(parseHash('', vocab)).toEqual(DEFAULT_ROUTE)
    expect(parseHash('#', vocab)).toEqual(DEFAULT_ROUTE)
    expect(parseHash('#/', vocab)).toEqual(DEFAULT_ROUTE)
  })

  it('falls back to home for an unknown view', () => {
    expect(parseHash('#/nope/dsa-bigo', vocab)).toEqual(DEFAULT_ROUTE)
  })

  it('reads a known node id in graph and list views', () => {
    expect(parseHash('#/list/dsa-bigo', vocab).nodeId).toBe('dsa-bigo')
    expect(parseHash('#/graph/jvm-gc', vocab).nodeId).toBe('jvm-gc')
  })

  it('drops an unknown node id instead of selecting nothing-ness', () => {
    expect(parseHash('#/list/ghost', vocab).nodeId).toBeNull()
    expect(parseHash('#/list/ghost', vocab).view).toBe('list')
  })

  it('reads a track id containing a colon', () => {
    expect(parseHash('#/path/curated:junior-backend', vocab).trackId).toBe('curated:junior-backend')
    expect(parseHash('#/path/domain:network', vocab).trackId).toBe('domain:network')
  })

  it('drops an unknown track id', () => {
    expect(parseHash('#/path/curated:ghost', vocab).trackId).toBeNull()
  })

  it('defaults the quiz sub-mode to flash', () => {
    expect(parseHash('#/quiz', vocab).quizMode).toBe('flash')
    expect(parseHash('#/quiz/ghost', vocab).quizMode).toBe('flash')
    expect(parseHash('#/quiz/drill', vocab).quizMode).toBe('drill')
  })

  it('ignores trailing slashes and empty segments', () => {
    expect(parseHash('#/list//dsa-bigo/', vocab).nodeId).toBe('dsa-bigo')
    expect(parseHash('#/path/', vocab).view).toBe('path')
  })

  it('ignores a node id in views that do not carry one', () => {
    const r = parseHash('#/home/dsa-bigo', vocab)
    expect(r.view).toBe('home')
    expect(r.nodeId).toBeNull()
  })

  it('never throws', () => {
    for (const junk of ['#////', '#/%%%', '#/list/#/list', '#/quiz/drill/extra']) {
      expect(() => parseHash(junk, vocab)).not.toThrow()
    }
  })
})

describe('formatHash', () => {
  it('omits the argument segment when there is nothing selected', () => {
    expect(formatHash({ ...DEFAULT_ROUTE, view: 'list' })).toBe('#/list')
    expect(formatHash({ ...DEFAULT_ROUTE, view: 'path' })).toBe('#/path')
    expect(formatHash(DEFAULT_ROUTE)).toBe('#/home')
    expect(formatHash({ ...DEFAULT_ROUTE, view: 'guide' })).toBe('#/guide')
  })

  it('always spells out the quiz sub-mode', () => {
    expect(formatHash({ ...DEFAULT_ROUTE, view: 'quiz' })).toBe('#/quiz/flash')
    expect(formatHash({ ...DEFAULT_ROUTE, view: 'quiz', quizMode: 'review' })).toBe('#/quiz/review')
  })

  it('round-trips every shape through parseHash', () => {
    const hashes = [
      '#/home', '#/guide', '#/graph', '#/graph/jvm-gc', '#/list', '#/list/dsa-bigo',
      '#/path', '#/path/curated:junior-backend', '#/quiz/flash', '#/quiz/graph',
    ]
    for (const h of hashes) {
      expect(formatHash(parseHash(h, vocab))).toBe(h)
    }
  })

  it('normalizing is a fixed point', () => {
    for (const junk of ['', '#', '#/list/ghost', '#/quiz', '#/nope', '#/path/']) {
      const once = formatHash(parseHash(junk, vocab))
      const twice = formatHash(parseHash(once, vocab))
      expect(twice).toBe(once)
    }
  })
})

describe('resume route', () => {
  it('parses #/resume', () => {
    expect(parseHash('#/resume', vocab)).toEqual({
      view: 'resume', nodeId: null, trackId: null, projectId: null, quizMode: 'flash',
    })
  })

  // 프로젝트 id는 금고 안에서 생성된 uuid다. 라우트 어휘(VOCAB)로 검증할 수 없다 —
  // 잠긴 상태에서는 id 목록 자체를 모르기 때문이다. 그래서 형식만 본다.
  it('parses a project segment when it looks like an id', () => {
    expect(parseHash('#/resume/7f3c2a91-0000-4000-8000-000000000001', vocab).projectId)
      .toBe('7f3c2a91-0000-4000-8000-000000000001')
  })

  it('drops a project segment that is not id-shaped', () => {
    expect(parseHash('#/resume/../etc/passwd', vocab).projectId).toBeNull()
    expect(parseHash('#/resume/<script>', vocab).projectId).toBeNull()
  })

  it('round-trips', () => {
    for (const h of ['#/resume', '#/resume/7f3c2a91-0000-4000-8000-000000000001']) {
      expect(formatHash(parseHash(h, vocab))).toBe(h)
    }
  })

  it('does not put a project id on other views', () => {
    expect(formatHash({ view: 'home', nodeId: null, trackId: null, projectId: 'x', quizMode: 'flash' }))
      .toBe('#/home')
  })
})
