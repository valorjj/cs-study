export interface RawQuizItem {
  question: string
  answer: string
}

// Q marker: "Q.", "Q3.", "Q3(경험).", "Q5(꼬리질문):" — optional number, optional
// parenthesised label, then '.' or ':'.
const Q_START = /^\*\*Q\d*(?:\([^)]*\))?\s*[.:]/

// Text between the ** ** of a question line → clean display text: drop the
// Q marker (incl. any "(label)") and any wrapping quotes.
function cleanQuestion(inner: string): string {
  let t = inner.replace(/^Q\d*(?:\([^)]*\))?\s*[.:]\s*/, '').trim()
  t = t.replace(/^["“”'](.*)["“”']$/s, '$1').trim()
  return t
}

// Parse inline interview Q&A from a section body: a **Q...** (bold) line
// followed by a `>` blockquote answer (mirrors rehypeFoldQA's pairing at the
// markdown level). Fence-aware. Only the first blockquote after the Q is the
// answer — a trailing "🔎 꼬리 질문" blockquote is left out to keep it short.
export function extractQuizItems(body: string): RawQuizItem[] {
  const lines = body.split('\n')
  const fence = /^\s*(```|~~~)/
  let inFence = false
  const out: RawQuizItem[] = []
  for (let i = 0; i < lines.length; i++) {
    if (fence.test(lines[i])) { inFence = !inFence; continue }
    if (inFence) continue
    const t = lines[i].trim()
    if (!(Q_START.test(t) && t.endsWith('**') && t.length > 4)) continue
    const question = cleanQuestion(t.slice(2, -2))
    let j = i + 1
    while (j < lines.length && lines[j].trim() === '') j++
    if (j >= lines.length || !lines[j].trimStart().startsWith('>')) continue
    const ans: string[] = []
    while (j < lines.length && lines[j].trimStart().startsWith('>')) {
      ans.push(lines[j].trimStart().replace(/^>\s?/, ''))
      j++
    }
    out.push({ question, answer: ans.join('\n').trim() })
    i = j - 1
  }
  return out
}

// Follow-up marker: "**꼬리 Q1-1. ...**", "**꼬리 Q2-1: ...**".
const FOLLOWUP_START = /^\*\*꼬리/

// Clean a follow-up question line: drop the "꼬리 Q1-1." marker and wrapping quotes.
function cleanFollowup(inner: string): string {
  let t = inner.replace(/^꼬리\s*Q?[\d-]*(?:\([^)]*\))?\s*[.:]\s*/, '').trim()
  t = t.replace(/^["“”'](.*)["“”']$/s, '$1').trim()
  return t
}

export interface DrillFollowup {
  question: string
  answer: string
}

export interface DrillChain {
  question: string
  answer: string
  followups: DrillFollowup[]
}

// Parse main-Q + follow-up chains from a section body. A chain is a **Q...** line
// with its `>` answer, followed by consecutive **꼬리...** lines (each with its own
// `>` answer), up to the next main **Q...** or the section end. Main Qs with no
// follow-ups are excluded (the flashcard mode covers those). Fence-aware.
export function extractDrillChains(body: string): DrillChain[] {
  const lines = body.split('\n')
  const fence = /^\s*(```|~~~)/
  let inFence = false
  const out: DrillChain[] = []

  // Read a `>` blockquote starting at index `start`; returns [text, nextIndex].
  const readQuote = (start: number): [string, number] => {
    const acc: string[] = []
    let j = start
    while (j < lines.length && lines[j].trimStart().startsWith('>')) {
      acc.push(lines[j].trimStart().replace(/^>\s?/, ''))
      j++
    }
    return [acc.join('\n').trim(), j]
  }

  const isMain = (t: string) => Q_START.test(t) && t.endsWith('**') && t.length > 4
  const isFollow = (t: string) => FOLLOWUP_START.test(t) && t.endsWith('**') && t.length > 4

  let i = 0
  while (i < lines.length) {
    if (fence.test(lines[i])) { inFence = !inFence; i++; continue }
    if (inFence) { i++; continue }
    const t = lines[i].trim()
    if (!isMain(t)) { i++; continue }

    const question = cleanQuestion(t.slice(2, -2))
    let j = i + 1
    while (j < lines.length && lines[j].trim() === '') j++
    if (j >= lines.length || !lines[j].trimStart().startsWith('>')) { i += 1; continue }
    const [answer, afterAns] = readQuote(j)

    const followups: DrillFollowup[] = []
    let k = afterAns
    while (k < lines.length) {
      if (fence.test(lines[k])) { inFence = !inFence; k++; continue }
      if (inFence) { k++; continue }
      const tk = lines[k].trim()
      if (isMain(tk)) break // next main Q ends this chain
      if (!isFollow(tk)) { k++; continue }
      const fq = cleanFollowup(tk.slice(2, -2))
      let m = k + 1
      while (m < lines.length && lines[m].trim() === '') m++
      if (m >= lines.length || !lines[m].trimStart().startsWith('>')) { k += 1; continue }
      const [fans, afterF] = readQuote(m)
      followups.push({ question: fq, answer: fans })
      k = afterF
    }

    if (followups.length > 0) out.push({ question, answer, followups })
    i = k
  }
  return out
}

// FNV-1a hash → 32-bit seed for seededShuffle (e.g. hashSeed("2026-07-16:all")).
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Deterministic Fisher-Yates shuffle. Same seed → same order; input untouched.
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice()
  const rand = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

import type { QuizSettings } from './quizSettings'

export interface OrderCtx {
  seed: number                            // daily/random 셔플 시드
  srsLapses: (srsKey: string) => number   // 카드별 이전 오답 횟수 (weak용)
  weakRank: (domain: string) => number    // 약점 도메인 순위 (낮을수록 약함)
}

// Flashcard deck ordering by user setting. Pure; input array is never mutated.
//   daily/random → seeded Fisher-Yates (caller varies the seed)
//   sequential   → note order (input order) unchanged
//   weak         → previously-wrong cards first, then weakest domain first
export function orderDeck<T extends { srsKey: string; domain: string }>(
  scoped: T[], order: QuizSettings['order'], ctx: OrderCtx,
): T[] {
  if (order === 'sequential') return scoped.slice()
  if (order === 'weak') {
    return scoped
      .map((item, i) => ({ item, i }))
      .sort((a, b) => {
        const aw = ctx.srsLapses(a.item.srsKey) > 0 ? 0 : 1
        const bw = ctx.srsLapses(b.item.srsKey) > 0 ? 0 : 1
        if (aw !== bw) return aw - bw
        const ar = ctx.weakRank(a.item.domain)
        const br = ctx.weakRank(b.item.domain)
        if (ar !== br) return ar - br
        return a.i - b.i // stable
      })
      .map((x) => x.item)
  }
  return seededShuffle(scoped, ctx.seed) // daily & random
}

export interface WeakDomain {
  domain: string
  correct: number
  seen: number
  rate: number
}

// Domains answered >= minSeen times with accuracy below maxRate, weakest (lowest
// rate) first, capped at limit. Ties broken by more attempts (seen) first.
export function weakDomains(
  stats: Record<string, { correct: number; seen: number }>,
  opts?: { minSeen?: number; maxRate?: number; limit?: number },
): WeakDomain[] {
  const { minSeen = 3, maxRate = 0.8, limit = 3 } = opts ?? {}
  return Object.entries(stats)
    .map(([domain, s]) => ({ domain, correct: s.correct, seen: s.seen, rate: s.seen ? s.correct / s.seen : 0 }))
    .filter((w) => w.seen >= minSeen && w.rate < maxRate)
    .sort((a, b) => a.rate - b.rate || b.seen - a.seen)
    .slice(0, limit)
}
