# 면접 드릴다운 모드 — 설계 (Design Spec)

**날짜:** 2026-07-21
**상태:** 승인됨 (구현 계획 대기)

## 목표 (Goal)

퀴즈 탭에 "드릴다운" 모드를 추가한다. 메인 질문 → 꼬리질문(follow-up) 체인을 실제 면접관처럼 한 단계씩 진행하며, 사용자가 "몇 단계까지 버텼는지(생존 깊이)"로 자신의 약점을 직관적으로 확인하게 한다. 이미 작성된 꼬리질문 콘텐츠(현재 OS·DevOps·System Design·DSA의 35개 체인)를 살리는 것이 핵심.

## 배경 / 근거 (Context)

- 콘텐츠 현황: 90개 개념, 11개 도메인, 336개 메인 Q&A, **꼬리질문 35개 체인**.
- 꼬리질문은 **4개 도메인에만** 존재: OS(11), DevOps(10), System Design(7), DSA(7). 나머지 7개 도메인은 0개.
- 기존 퀴즈(`QuizView`)는 날짜 시드 셔플 플래시카드이며, `extractQuizItems`가 **꼬리질문을 의도적으로 제외**한다("짧게 하려고"). 즉 가장 면접다운 자산이 현재 UI에서 안 보인다.
- 학습 철학: 반복 · 약점 집중 · 시간 최소화 · **면접관의 꼬리질문 드릴다운**. 이 기능은 그중 드릴다운을 직접 실현한다.

## 확정된 결정 (Decisions)

1. **체인 진행 = 학습 우선(continue):** "몰랐음"을 눌러도 답을 보여주고 다음 꼬리질문으로 끝까지 진행한다. 생존 깊이 = **처음 "몰랐음"이 나온 단계**(끝까지 "알았음"이면 만점).
2. **배치 = 퀴즈 탭 안 모드 전환:** 퀴즈 탭 상단에 `플래시카드 | 드릴다운` 토글. 탭 개수(지도/목록/퀴즈/경로) 유지.
3. **커버리지 전략 = 엔진 먼저, 콘텐츠는 다음:** 드릴다운 엔진을 지금 제대로 구현하고, 꼬리질문 없는 도메인은 "준비 중" 안내로 우아하게 처리. 도메인별 꼬리질문 확충은 별도 후속 작업.
4. **신규 저장소 없음:** 각 단계 자기평가는 기존 `recordQuizResult(domain, correct)`에 누적 → 기존 🎯 약점 보강 칩 + 클라우드 동기화 그대로 재사용. 개념 단위 영속 생존깊이는 도입하지 않는다(YAGNI, 향후 "약점 대시보드" 때 고려).

## 상호작용 흐름 (Interaction Flow)

```
[메인 Q]  단계 1/3
  → "답 보기" → 답 + 실무 프레이밍 노출
  → 자기평가 [몰랐음] [알았음]        ← recordQuizResult(domain, correct)
[꼬리 Q1-1]  단계 2/3
  → "답 보기" → 자기평가
[꼬리 Q1-2]  단계 3/3
  → "답 보기" → 자기평가
[체인 종료] → "🛡 생존 깊이 2/3" 요약 + [이 개념 보기] [다음 개념 →]
```

- 한 카드 = 하나의 메인 Q + 그 꼬리 체인. `단계 k/n` 표시.
- 각 단계: 질문 표시 → "답 보기" → 답 노출 → `[몰랐음][알았음]` → 다음 단계.
- 마지막 단계 후 요약: **생존 깊이 = 처음 몰랐던 단계 인덱스(1-base), 끝까지 알았으면 n/n**. 세션 내에서만 표시(비영속).
- `[이 개념 보기]` = 기존 퀴즈처럼 `select(nodeId); setViewMode('list')`. `[다음 개념 →]` = 덱의 다음 체인.

## 범위 / 빈 상태 (Scope / Empty State)

- 스코프 칩 = `전체 랜덤` + **꼬리질문이 있는 도메인만 동적 노출**(현재 OS·DevOps·시스템디자인·DSA). 콘텐츠가 늘면 칩이 자동으로 증가.
- 덱 순서: `seededShuffle(chains, hashSeed(\`${today}:${scope}:drill\`))` — 날짜 시드 결정적 덱(플래시카드와 동일 방식, 접미사만 다름).
- 빈 범위(체인 0개): "이 범위는 꼬리질문 준비 중이에요" + 4개 도메인 바로가기 칩.

## 아키텍처 / 파일 구조 (Architecture)

| 파일 | 역할 |
|---|---|
| `src/lib/quiz.ts` | `extractDrillChains(body)` 추가 — 메인 Q + 꼬리 체인 파싱. 꼬리 없는 메인 Q는 **제외**. 펜스(```) 무시. **순수함수** |
| `src/lib/quiz.test.ts` | `extractDrillChains` 테스트: 체인 파싱 / 무체인 제외 / 코드펜스 무시 / 다중 체인 / 꼬리 순서 유지 |
| `src/hooks/useNotePool.ts` | **신규** — 노트 markdown fetch + 노드(도메인/앵커) 매핑 공유 훅. 현재 `QuizView`의 `useEffect` 안에 있는 fetch/매핑 로직을 추출. `buildItems(extract)`로 임의 추출기를 받아 `{...item, domain, nodeId, nodeLabel}` 배열을 반환 |
| `src/components/DrillView.tsx` + `.css` | **신규** — 드릴다운 UI(체인 단계 진행, 자기평가, 생존깊이 요약, 링크, 빈 상태) |
| `src/components/QuizTab.tsx` | **신규** — `플래시카드 \| 드릴다운` 모드 토글 래퍼. `mode` 로컬 state, 활성 뷰 렌더 |
| `src/components/QuizView.tsx` | `useNotePool` 사용하도록 리팩터(동작 불변, 재검증) |
| `src/App.tsx` | `viewMode === 'quiz'`일 때 `<QuizView>` → `<QuizTab>` |

### 파서 계약 (extractDrillChains)

입력: 섹션 body(markdown 문자열)
출력:
```ts
interface DrillFollowup { question: string; answer: string }
interface DrillChain { question: string; answer: string; followups: DrillFollowup[] }
function extractDrillChains(body: string): DrillChain[]
```
규칙:
- 메인 Q 마커: 기존 `Q_START = /^\*\*Q\d*(?:\([^)]*\))?\s*[.:]/` 재사용.
- 꼬리 마커: 신규 `/^\*\*꼬리/` (예: `**꼬리 Q1-1. "..."**`).
- 메인 Q + 첫 `>` 블록쿼트 답 → 이후 연속된 `**꼬리...**` + 각 `>` 답을 순서대로 `followups`에 수집. 다음 메인 `**Q...**` 또는 섹션 끝에서 종료.
- `followups.length === 0`인 메인 Q는 결과에서 **제외**(그 경우는 플래시카드 모드가 담당).
- 코드펜스(``` / ~~~) 안의 라인은 무시(기존 `extractQuizItems`와 동일 fence 처리).
- 질문 텍스트 정리는 기존 `cleanQuestion` 로직 재사용(마커/따옴표 제거).

### useNotePool 계약

```ts
function useNotePool(nodes: GraphNode[]): {
  loading: boolean
  buildItems: <T>(extract: (body: string) => T[]) => Array<T & { domain: string; nodeId: string; nodeLabel: string }>
}
```
- 마운트 시 concept 노드의 noteRef 파일들을 fetch해 state에 저장.
- `buildItems(extract)`는 저장된 (path, md)에 대해 섹션을 파싱하고 각 추출 결과에 소유 노드의 domain/nodeId/nodeLabel을 붙인다(현재 QuizView 로직과 동일 규칙).
- QuizView는 `buildItems(extractQuizItems)`, DrillView는 `buildItems(extractDrillChains)`를 사용.

## 데이터 흐름 (Data Flow)

1. `App` → `viewMode==='quiz'`이면 `<QuizTab nodes>`.
2. `QuizTab`: `mode` 토글, `flash`→`<QuizView>`, `drill`→`<DrillView>`.
3. `DrillView`: `useNotePool(nodes).buildItems(extractDrillChains)` → 체인들. `seededShuffle` → 덱.
4. 사용자 단계 진행 → 각 자기평가에서 `recordQuizResult(domain, correct)`.
5. 체인 종료 → 생존깊이 요약 → 다음 체인.

## 에러 / 엣지 (Error / Edge Cases)

- 노트 fetch 실패: 해당 파일 스킵(기존 `.catch(() => '')` 패턴).
- 스코프에 체인 0개: 빈 상태 안내.
- 덱 끝: `index`를 `(i+1) % deck.length`로 순환(기존 퀴즈 동일).
- 게스트/로그인 무관하게 동작(약점 기록은 기존 경로로 자동 분리 저장).

## 테스트 (Testing)

- **단위(Vitest, TDD):** `extractDrillChains` — 체인/무체인제외/펜스/다중/순서.
- **실브라우저(Playwright):** 모드 토글, 체인 단계 진행(답 보기→평가→다음 단계), 생존깊이 요약, 자기평가가 🎯 약점 보강 칩에 반영, 빈 상태, 콘솔 에러 0.
- **회귀:** QuizView(플래시카드) 리팩터 후 기존 동작 유지 확인.

## 범위 밖 (Out of Scope)

- 개념 단위 영속 생존깊이 / 새 클라우드 컬럼.
- 도메인별 꼬리질문 콘텐츠 확충(후속 작업).
- SRS 간격 반복 스케줄링(별도 기능).
- 약점 대시보드(별도 기능).
