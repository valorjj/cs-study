# 설계 스펙 — 서술형 답변 AI 채점 → 드릴다운 라우팅

> 작성일: 2026-07-23 · 상태: 승인됨(브레인스토밍)
> 선행: SLM 채점 스파이크(`docs/worklog/2026-07-23-slm-scoring-spike.md`, `experiments/slm-scoring/`) 검증 완료.
> 이 문서는 스파이크에서 검증된 채점 엔진을 **배포 가능한 실제 기능**으로 만드는 설계다.

## 0. 한 줄 목표
인터뷰 드릴다운에서 사용자가 **서술형 답변을 타이핑하면 LLM이 채점**하고, 그 `score`로 **꼬리질문을 더 깊게 파거나 / 코칭 후 재도전**시키는 기능. 배포 기본은 클라우드 LLM, 로컬 개발은 Ollama(스위처블).

## 1. 확정된 핵심 결정 (브레인스토밍)
- **추론 위치:** 스위처블 클라이언트 하나, **배포 기본 = 클라우드(Gemini Flash), 로컬 개발/자가호스팅 = Ollama.** `score.mjs`가 이미 OpenAI 호환이라 base URL/key/model 3개만 다름. 로컬 전용은 "남에게 서빙" 목표와 충돌(홈 IP·업타임·발열)이라 배제.
- **UX 배치:** 기존 `DrillView`에 `자가채점 ↔ 🤖 AI 채점` 토글 추가. 새 탭/QuizView 아님 — 드릴 체인 인프라(scope/deck/생존깊이) 재사용.
- **EASIER(score≤2) 동작:** 모범답안 + missing_keywords 코칭 표시 + **같은 질문 재도전**. 재도전은 새 채점 호출이므로 일일 상한을 1 소모한다. 재채점이 ≥3이면 체인을 계속 진행하고, 그래도 ≤2면 여기서 인터뷰 종료(생존 깊이 확정)하고 "다음 개념"으로. 쉬운 형제 질문 생성은 하지 않음(콘텐츠 없음, YAGNI).
- **게이팅:** AI 채점은 **로그인 필수**, **유저당 일일 N회**(기본 30, ENV로 조정). 게스트는 자가채점만.
- **원칙 유지:** LLM은 채점(judge)만, 라우팅은 클라이언트 코드가 `score`로 결정.

## 2. 아키텍처 (데이터 흐름)
```
[DrillView · AI 채점 모드]
   답변 타이핑 → "채점하기"
        │  POST { question, reference, userAnswer, nodeId }  (+ Supabase JWT)
        ▼
[Supabase Edge Function: grade]   ← 프로덕션 하네스
   1. JWT 검증 (로그인 필수, 없으면 401)
   2. 일일 상한 체크·증가 (grade_usage 테이블, 서버측 — 성공 시에만 증가)
   3. 인젝션 방어 하네스로 프롬프트 조립 (구분선 <<<ANSWER>>>…<<<END>>> + 규칙 + 앵커 3개)
   4. LLM 호출 (OpenAI 호환) — 배포=Gemini Flash / 로컬=Ollama, ENV 스위치
   5. JSON 파싱·검증 → { score(1~5), missing_keywords[], feedback }
        ▼
[클라이언트]
   routeFromScore(score):  score≥4 → DRILL_DOWN · ==3 → PASS · ≤2 → EASIER
   ≥3 → 다음 꼬리질문 단계 진행 / ≤2 → 코칭(모범답안+missing) + 재도전
   score≥3 = 정답 취급 → recordQuizResult(domain, true)로 약점통계 반영 (기존 DrillView와 동일)
```

## 3. 컴포넌트 / 파일

### 새로 짓는 것
- **`interview-map/src/lib/scoring.ts`** — 순수·테스트 가능.
  - 타입: `ScoreResult { score:number; missing_keywords:string[]; feedback:string }`, `GradeRequest { question; reference; userAnswer; nodeId }`, `RouteAction = 'DRILL_DOWN'|'PASS'|'EASIER'`.
  - `routeFromScore(score): RouteAction` — `score.mjs`의 로직 그대로(≥4 DRILL_DOWN / ≤2 EASIER / else PASS).
  - `gradeAnswer(req): Promise<GradeOutcome>` — Edge Function 호출 클라이언트(fetch, Supabase JWT 첨부). 성공/429(상한)/파싱실패/네트워크에러를 판별 가능한 `GradeOutcome` 유니언으로 반환.
- **`interview-map/supabase/functions/grade/index.ts`** — Deno TS Edge Function. `score.mjs`의 SYSTEM 프롬프트/앵커/`buildUser`/파싱을 이식. **인젝션 방어 하네스가 여기 프로덕션에 반영됨**(현재 프로토타입에만 존재). 순수한 프롬프트 조립 로직은 별도 함수로 분리해 유닛 테스트 가능하게.
- **`interview-map/supabase/functions/_shared/llm.ts`** — OpenAI 호환 채팅 클라이언트. ENV `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`로 Gemini↔Ollama 스위치. `temperature:0`, JSON 응답 강제.
- **Supabase 스키마:** `public.grade_usage (user_id uuid, day date, count int, primary key(user_id, day))` + RLS(own-row read). 카운트 증가는 Edge Function이 service-role 키로 수행(클라 조작 불가).

### 고치는 것
- **`interview-map/src/components/DrillView.tsx`** — `자가채점 ↔ 🤖 AI 채점` 토글 상태 추가. AI 모드에서 "답 보기 / 몰랐음 / 알았음" 대신: 답변 `textarea` + "채점하기" 버튼 + 채점 결과 카드(score 배지·feedback·missing) + 라우팅 처리(≥3 진행 / ≤2 코칭+재도전). 자가채점 모드는 현행 그대로.
- **`interview-map/src/components/DrillView.css`** — 채점 입력·결과·코칭 UI 스타일.

## 4. 에러 처리 / 엣지 케이스
- **미로그인:** AI 토글 비활성 + 툴팁("로그인 필요"). 게스트는 자가채점만.
- **일일 상한 초과:** Edge Function `429` → "오늘 채점 N회를 다 썼어요. 내일 다시 / 자가채점으로 전환" 안내. 카운트는 **채점 성공 시에만** 증가(실패는 무료).
- **LLM 다운/타임아웃/JSON 파싱 실패:** 채점 실패 배너 + 자가채점 폴백 버튼.
- **인젝션 시도:** 하네스가 `score=1` 처리(스파이크 적대적 10/10 검증).
- **LLM ENV 미설정(로컬):** AI 채점 기능을 게스트처럼 **숨김**. 앱은 절대 죽지 않음(기존 Supabase-less 가드와 동일 철학).

## 5. 테스트 전략
- **`scoring.test.ts` (Vitest):** `routeFromScore` 경계(2→EASIER, 3→PASS, 4→DRILL_DOWN), `gradeAnswer` fetch mock(성공 / 429 / 파싱실패 / 네트워크에러 분기). 기존 102개 테스트 유지.
- **Edge Function:** 프롬프트 조립 순수 함수 유닛 테스트(LLM 호출 mock). 인젝션 앵커 회귀 케이스 최소 1개.
- **실브라우저(Playwright):** AI 토글 → 답변 입력 → (로컬 Ollama로) 채점 → 라우팅 동작 → 콘솔 에러 0.

## 6. 스코프 제외 (YAGNI / 별도 트랙)
- how-it-works 애니메이션 다이어그램(draw.io 흐름 애니 SVG) — **별도 산출물**, 이 스펙 밖.
- 쉬운 형제 질문 생성, 벡터/유사카드, 파인튜닝, 골든셋 확장.
- SRS 연동 — DrillView는 원래 SRS를 쓰지 않음. 일관성 위해 약점통계(quizStats)만 반영.
- 전체 앱 일일 총량 캡(글로벌) — 유저당 캡으로 충분, 필요 시 후속.

## 7. 배포 시 수동 단계(사람이 직접)
- Supabase 대시보드: `grade_usage` 테이블 + RLS 생성(SQL은 구현 시 제공).
- Supabase Edge Function secret: `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`(배포=Gemini), `DAILY_GRADE_CAP`.
- `supabase functions deploy grade`.
- 로컬 개발: `interview-map/.env.local`에 로컬 Ollama용 값 + `supabase functions serve`.

## 8. 열린 튜닝 여지(스파이크에서 이월)
- 3b partial 경계 채점이 다소 흔들림(밴드 89%) — 골든셋 확장/앵커 추가로 개선 여지(후속).
- 배포 클라우드 모델(Gemini Flash)로 골든셋 재검증은 구현 후 별도 확인.
