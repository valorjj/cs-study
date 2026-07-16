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
