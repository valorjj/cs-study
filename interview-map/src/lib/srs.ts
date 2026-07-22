import { hashSeed } from './quiz'

// Per-card spaced-repetition state (lite SM-2). `due` is a local 'YYYY-MM-DD'
// string so scheduling compares with plain string <=.
export interface SrsCard {
  ef: number        // ease factor (start 2.5, floor 1.3)
  interval: number  // days until next review
  reps: number      // consecutive successes (reset to 0 on a lapse)
  lapses: number    // times forgotten — a weakness signal
  due: string       // 'YYYY-MM-DD' — reviewable on/after this date
}

export type SrsState = Record<string, SrsCard>

const EF_START = 2.5
const EF_MIN = 1.3

// Stable card identity: file + section slug + a hash of the QUESTION text. The
// positional key (path#slug#index) shifts when a note is edited, which would
// misalign SRS state; hashing the question keeps a card's schedule across edits.
export function srsKeyOf(path: string, slug: string, question: string): string {
  return `${path}#${slug}#${hashSeed(question)}`
}

// Add n days to a local 'YYYY-MM-DD' string, returning the same format. Built
// from local date components so there is no timezone/UTC drift.
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

// Lite SM-2. grade: 0..5. Success is grade >= 3.
//   fail  → reps 0, interval 1 (tomorrow), lapses++
//   pass  → reps++, interval 1 → 6 → round(interval*ef)
//   ef    += 0.1 - (5-grade)*(0.08 + (5-grade)*0.02), floored at 1.3
export function review(prev: SrsCard | undefined, grade: number, today: string): SrsCard {
  const base: SrsCard = prev ?? { ef: EF_START, interval: 0, reps: 0, lapses: 0, due: today }
  let { ef, interval, reps, lapses } = base

  if (grade < 3) {
    reps = 0
    interval = 1
    lapses += 1
  } else {
    reps += 1
    if (reps === 1) interval = 1
    else if (reps === 2) interval = 6
    else interval = Math.round(interval * ef)
  }

  ef = Math.max(EF_MIN, ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)))

  return { ef, interval, reps, lapses, due: addDays(today, interval) }
}

export const NEW_CARD_DAILY_CAP = 15

// Split a pool into due reviews + new cards for today's review session.
// Due = has an srs record with due <= today (most overdue first).
// New = no srs record, weak-domain-first, capped at NEW_CARD_DAILY_CAP.
export function buildReviewDeck<T extends { srsKey: string; domain: string }>(
  pool: T[],
  srs: SrsState,
  today: string,
  weakDomainsOrder: string[],
  cap: number = NEW_CARD_DAILY_CAP,
): T[] {
  const due = pool
    .filter((c) => srs[c.srsKey] && srs[c.srsKey].due <= today)
    .sort((a, b) => (srs[a.srsKey].due < srs[b.srsKey].due ? -1 : srs[a.srsKey].due > srs[b.srsKey].due ? 1 : 0))

  const rank = (domain: string) => {
    const i = weakDomainsOrder.indexOf(domain)
    return i === -1 ? weakDomainsOrder.length : i
  }
  const fresh = pool
    .filter((c) => !srs[c.srsKey])
    .sort((a, b) => rank(a.domain) - rank(b.domain))
    .slice(0, cap)

  return [...due, ...fresh]
}

// How many cards today's review would show: due + capped new. Used for badges.
export function dueCount<T extends { srsKey: string; domain: string }>(
  pool: T[],
  srs: SrsState,
  today: string,
  cap: number = NEW_CARD_DAILY_CAP,
): number {
  const due = pool.filter((c) => srs[c.srsKey] && srs[c.srsKey].due <= today).length
  const fresh = pool.filter((c) => !srs[c.srsKey]).length
  return due + Math.min(fresh, cap)
}

// Review-mode difficulty button presets. grade values feed review(); 0..5 with
// 0 always a lapse and 5 an easy pass. cls maps to .review-g{n} colors.
export const GRADE_SETS: Record<2 | 3 | 5, { grade: number; label: string; cls: string }[]> = {
  2: [
    { grade: 0, label: '모름', cls: 'review-g0' },
    { grade: 5, label: '알았음', cls: 'review-g5' },
  ],
  3: [
    { grade: 0, label: '모름', cls: 'review-g0' },
    { grade: 3, label: '애매', cls: 'review-g3' },
    { grade: 5, label: '쉬움', cls: 'review-g5' },
  ],
  5: [
    { grade: 0, label: '전혀', cls: 'review-g0' },
    { grade: 2, label: '어렴풋', cls: 'review-g2' },
    { grade: 3, label: '애매', cls: 'review-g3' },
    { grade: 4, label: '대략', cls: 'review-g4' },
    { grade: 5, label: '완벽', cls: 'review-g5' },
  ],
}
