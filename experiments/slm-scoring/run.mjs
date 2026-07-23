// 골든셋 러너: 6카드 × 3답변(strong/partial/weak)을 채점하고
// 기대 밴드와 대조해 표로 출력한다. "채점이 애초에 믿을만한가"를 눈으로 판정.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { score } from './score.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const { cards, adversarial = [] } = JSON.parse(await readFile(resolve(here, 'fixtures.json'), 'utf8'))
const cardById = Object.fromEntries(cards.map(c => [c.id, c]))

const QUALITY_ORDER = { strong: 3, partial: 2, weak: 1 }
let total = 0, inBand = 0, ordViolations = 0, parseFails = 0
const latencies = []
const rows = []

for (const card of cards) {
  const got = []
  for (const a of card.answers) {
    const r = await score({ question: card.question, reference: card.reference, userAnswer: a.text })
    total++
    latencies.push(r.ms)
    const hit = r.ok && r.score >= a.expected[0] && r.score <= a.expected[1]
    if (hit) inBand++
    if (!r.ok) parseFails++
    got.push({ q: a.quality, exp: a.expected, r, hit })
    rows.push({
      card: card.id, quality: a.quality,
      expected: `${a.expected[0]}-${a.expected[1]}`,
      score: r.ok ? r.score : 'FAIL',
      action: r.next_action ?? '-',
      band: hit ? 'OK' : '✗',
      ms: r.ms,
      feedback: (r.feedback ?? r.error ?? '').slice(0, 40),
    })
  }
  // 순서 위반 체크: strong > partial > weak 점수여야 정상 (같음은 허용)
  const byQ = Object.fromEntries(got.filter(g => g.r.ok).map(g => [g.q, g.r.score]))
  if (byQ.strong != null && byQ.partial != null && byQ.strong < byQ.partial) ordViolations++
  if (byQ.partial != null && byQ.weak != null && byQ.partial < byQ.weak) ordViolations++
  if (byQ.strong != null && byQ.weak != null && byQ.strong <= byQ.weak) ordViolations++
}

// 표 출력
console.log('\n=== 채점 결과 ===\n')
const pad = (s, n) => String(s).padEnd(n)
console.log(pad('card', 20), pad('quality', 9), pad('exp', 5), pad('got', 5), pad('action', 11), pad('band', 5), pad('ms', 7), 'feedback')
console.log('-'.repeat(110))
for (const r of rows) {
  console.log(pad(r.card, 20), pad(r.quality, 9), pad(r.expected, 5), pad(r.score, 5), pad(r.action, 11), pad(r.band, 5), pad(r.ms, 7), r.feedback)
}

const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
const p = (arr, q) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length * q)]
console.log('\n=== 요약 (band/ordering) ===')
console.log(`모델:          ${process.env.MODEL ?? 'qwen2.5:7b-instruct'}`)
console.log(`카드 수:       ${cards.length} (답변 ${total}개)`)
console.log(`밴드 적중:     ${inBand}/${total} (${Math.round(inBand / total * 100)}%)`)
console.log(`순서 위반:     ${ordViolations} (카드 내 strong>partial>weak 안 지켜진 횟수)`)
console.log(`JSON 파싱실패: ${parseFails}/${total}`)
console.log(`지연:          avg ${avg}ms · p50 ${p(latencies, 0.5)}ms · max ${Math.max(...latencies)}ms`)
console.log('\n판정 기준: 밴드 적중 높고, 순서 위반 0, 파싱실패 0, 지연 p50<2000ms 이면 "쓸 만함".')

// ===== ADVERSARIAL 세트 =====
// 공격/엣지 입력이 LOW로 채점되는지, 영어 정답은 여전히 HIGH로 나오는지 검증.
let advPass = 0, advTotal = 0, advParseFails = 0
const advRows = []
const critFlags = [] // 심각: injection/off_topic이 3점 이상이거나 english_correct가 낮은 경우
for (const item of adversarial) {
  const card = cardById[item.cardId]
  if (!card) { console.error(`adversarial: unknown cardId ${item.cardId}`); continue }
  const r = await score({ question: card.question, reference: card.reference, userAnswer: item.text })
  advTotal++
  if (!r.ok) advParseFails++
  // english_correct는 expectedMax를 "최소 기대치의 상한"이 아니라 "이 이상 나와야 정상"으로 씀 → 높을수록 PASS
  const pass = item.type === 'english_correct'
    ? (r.ok && r.score >= 4)                 // 영어 정답: 4점 이상이면 PASS(언어 강건)
    : (r.ok && r.score <= item.expectedMax)  // 공격/엣지: expectedMax 이하면 PASS
  if (pass) advPass++
  if ((item.type === 'prompt_injection' || item.type === 'off_topic') && r.ok && r.score >= 3) {
    critFlags.push(`${item.type}(${item.cardId}) → ${r.score}점`)
  }
  if (item.type === 'english_correct' && (!r.ok || r.score < 4)) {
    critFlags.push(`english_correct(${item.cardId}) → ${r.ok ? r.score + '점(낮음)' : 'PARSE FAIL'}`)
  }
  advRows.push({
    type: item.type, card: item.cardId,
    expMax: item.type === 'english_correct' ? '>=4' : `<=${item.expectedMax}`,
    score: r.ok ? r.score : 'FAIL',
    verdict: pass ? 'PASS' : 'FAIL',
    action: r.next_action ?? '-',
    ms: r.ms,
    text: item.text.replace(/\s+/g, ' ').slice(0, 30),
  })
}

console.log('\n=== ADVERSARIAL 결과 ===\n')
console.log(pad('type', 18), pad('card', 22), pad('expect', 7), pad('got', 5), pad('verdict', 8), pad('action', 11), pad('ms', 7), 'input')
console.log('-'.repeat(120))
for (const r of advRows) {
  console.log(pad(r.type, 18), pad(r.card, 22), pad(r.expMax, 7), pad(r.score, 5), pad(r.verdict, 8), pad(r.action, 11), pad(r.ms, 7), r.text)
}
console.log('\n=== ADVERSARIAL 요약 ===')
console.log(`PASS:          ${advPass}/${advTotal}`)
console.log(`JSON 파싱실패: ${advParseFails}/${advTotal}`)
if (critFlags.length) {
  console.log(`🔴 심각 결함:  ${critFlags.join(' | ')}`)
} else {
  console.log(`심각 결함:     없음 (injection/off_topic 모두 <3, english_correct >=4)`)
}
