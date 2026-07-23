// C: end-to-end 드릴다운 흐름 시연 (콘솔).
// 실제 notes 마크다운에서 드릴체인(기본Q + 꼬리질문들)을 파싱 → 채점기로 라우팅.
//   DRILL_DOWN(≥4) → 다음(더 어려운) 꼬리질문 제시
//   EASIER(≤2)     → 모범답안 코칭 후 같은 개념 재도전
//   PASS(3)        → 다음 카드로
// 채점은 검증된 3B. 사용자 답변은 시연용으로 스크립트에 박아 2가지 경로를 보여준다.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { score } from './score.mjs'

// repo 루트 기준 상대경로 (experiments/slm-scoring/ → ../../notes)
const here = dirname(fileURLToPath(import.meta.url))
const NOTE = resolve(here, '../../notes/02-os/os-core.md')

// --- quiz.ts extractDrillChains 의 최소 포팅 (기본Q + > 답 + 꼬리Q들 + > 답) ---
const Q_START = /^\*\*Q\d*(?:\([^)]*\))?\s*[.:]/
const FOLLOWUP_START = /^\*\*꼬리/
const clean = (inner, re) => inner.replace(re, '').trim().replace(/^["“”'](.*)["“”']$/s, '$1').trim()

function extractDrillChains(body) {
  const lines = body.split('\n')
  const fence = /^\s*(```|~~~)/
  let inFence = false
  const out = []
  const readQuote = (start) => {
    const acc = []; let j = start
    while (j < lines.length && lines[j].trimStart().startsWith('>')) { acc.push(lines[j].trimStart().replace(/^>\s?/, '')); j++ }
    return [acc.join('\n').trim(), j]
  }
  const isMain = (t) => Q_START.test(t) && t.endsWith('**') && t.length > 4
  const isFollow = (t) => FOLLOWUP_START.test(t) && t.endsWith('**') && t.length > 4
  let i = 0
  while (i < lines.length) {
    if (fence.test(lines[i])) { inFence = !inFence; i++; continue }
    if (inFence) { i++; continue }
    const t = lines[i].trim()
    if (!isMain(t)) { i++; continue }
    const question = clean(t.slice(2, -2), /^Q\d*(?:\([^)]*\))?\s*[.:]\s*/)
    let j = i + 1
    while (j < lines.length && lines[j].trim() === '') j++
    if (j >= lines.length || !lines[j].trimStart().startsWith('>')) { i += 1; continue }
    const [answer, afterAns] = readQuote(j)
    const followups = []
    let k = afterAns
    while (k < lines.length) {
      if (fence.test(lines[k])) { inFence = !inFence; k++; continue }
      if (inFence) { k++; continue }
      const tk = lines[k].trim()
      if (isMain(tk)) break
      if (!isFollow(tk)) { k++; continue }
      const fq = clean(tk.slice(2, -2), /^꼬리\s*Q?[\d-]*(?:\([^)]*\))?\s*[.:]\s*/)
      let m = k + 1
      while (m < lines.length && lines[m].trim() === '') m++
      if (m >= lines.length || !lines[m].trimStart().startsWith('>')) { k += 1; continue }
      const [fans, afterF] = readQuote(m)
      followups.push({ question: fq, answer: fans }); k = afterF
    }
    if (followups.length > 0) out.push({ question, answer, followups })
    i = k
  }
  return out
}

// --- 시연 세션: 한 스텝씩 질문 제시 → 답변 채점 → 라우팅 ---
const bar = (n) => '─'.repeat(n)
const trunc = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s)

async function runSession(name, chain, scriptedAnswers) {
  console.log(`\n${bar(70)}\n▶ 세션: ${name}\n${bar(70)}`)
  // 스텝 리스트: 기본Q(0) → 꼬리Q들(1..) 순으로 난이도 상승
  const steps = [{ q: chain.question, ref: chain.answer }, ...chain.followups.map(f => ({ q: f.question, ref: f.answer }))]
  let idx = 0
  for (let turn = 0; turn < scriptedAnswers.length && idx < steps.length; turn++) {
    const step = steps[idx]
    const ans = scriptedAnswers[turn]
    console.log(`\n[난이도 ${idx === 0 ? '기본' : `꼬리+${idx}`}] Q: ${step.q}`)
    console.log(`   사용자 답변: ${ans}`)
    const r = await score({ question: step.q, reference: step.ref, userAnswer: ans })
    console.log(`   → 채점: ${r.score}점 · ${r.next_action} · (${r.ms}ms)`)
    console.log(`     피드백: ${r.feedback}`)
    if (r.missing_keywords?.length) console.log(`     누락: ${r.missing_keywords.join(', ')}`)
    // 라우팅
    if (r.next_action === 'DRILL_DOWN') {
      if (idx + 1 < steps.length) { console.log(`     ↳ 잘함 → 더 어려운 꼬리질문으로 진행`); idx++ }
      else { console.log(`     ↳ 마지막 단계까지 통과 🎉 → 이 개념 마스터, 다음 카드로`); break }
    } else if (r.next_action === 'EASIER') {
      console.log(`     ↳ 이해 부족 → 모범답안 코칭 후 재도전:`)
      console.log(`        « ${trunc(step.ref, 90)} »`)
      // 같은 스텝 유지(재도전). 시연에선 다음 스크립트 답변으로 다시 시도.
    } else {
      console.log(`     ↳ 애매(PASS) → 같은 난이도 다음 카드로 (여기선 종료)`); break
    }
  }
}

// --- 실행 ---
const body = await readFile(NOTE, 'utf8')
const chains = extractDrillChains(body)
const chain = chains.find(c => c.question.includes('프로세스와 스레드')) ?? chains[0]
console.log(`파싱된 드릴체인: ${chains.length}개. 시연 대상: "${chain.question}" (꼬리 ${chain.followups.length}개)`)

// 경로1: 잘하는 사용자 — 기본 통과 → 꼬리질문들로 점점 파고듦
await runSession('실력자 (드릴다운 경로)', chain, [
  '프로세스는 독립된 메모리 공간을 갖는 실행 단위고, 스레드는 한 프로세스 안에서 코드·데이터·힙을 공유하고 스택만 따로 갖습니다. 스레드는 통신이 빠르지만 동기화 이슈가 있고 프로세스는 격리로 안정적이나 컨텍스트 스위칭이 무겁습니다.',
  '격리가 안정성·보안에 직결될 때입니다. 크롬이 탭마다 프로세스를 분리해 한 탭이 죽어도 브라우저 전체가 안 죽고, 파이썬은 GIL 때문에 multiprocessing으로 CPU 병렬을 얻습니다.',
  'JVM 스레드는 보통 OS 스레드에 1:1로 매핑돼서, JVM이 스레드를 만들면 실제 커널 스레드가 생성되고 스케줄링은 OS가 담당합니다.',
])

// 경로2: 못하는 사용자 — 기본에서 막힘 → EASIER 코칭
await runSession('입문자 (코칭 경로)', chain, [
  '둘 다 CPU에서 돌아가는 건데 스레드가 프로세스보다 최신이라 빠릅니다.',
])
