# 설계 스펙 — 그래프 기반 적응형 면접 시뮬 (Network 파일럿)

> 작성일: 2026-07-24 · 상태: 승인됨(브레인스토밍)
> 선행: AI 채점 기능(SHIPPED, `docs/superpowers/specs/2026-07-23-ai-answer-scoring-design.md`), 지식 그래프(`interview-map/src/graph/graph.json`).

## 0. 한 줄 목표
실제 기술 면접처럼 **한 개념에서 시작해 점수·답변 품질에 따라 상호연결된 개념을 얕은→깊은으로 끝없이 파고드는** 적응형 면접 시뮬레이션. 첫 버전은 **Network 도메인**으로 파일럿.

## 1. 왜 이렇게 (핵심 통찰)
- 사용자가 원한 "graph 관계 기반 심층 면접"의 그래프는 **이미 `graph.json`에 있다**(122노드, hierarchy 109 + crosslink 60, level 0/1/2). **Neo4j 불필요** — 이 규모(최대 ~1,200노드)는 인메모리 BFS/DFS로 마이크로초. graph DB는 수백만 노드/서버측 분석/공유변경 영속화에서나 값을 함. (Neo4j는 이력서 목적이면 별도 학습 프로젝트로.)
- **진짜 병목은 질문 커버리지**(꼬리 체인 125개뿐). 실측 비교 결과: **Gemini flash 생성이 노트 근거로 authoring급 꼬리질문을 즉시·정확히** 생성(로컬 3b는 복사·드리프트로 생성엔 부적합, 채점 전용). → 질문은 Gemini 생성, 채점은 기존 파이프라인.

## 2. 확정된 결정 (브레인스토밍)
- **새 모드로 분리**: 기존 드릴다운(자가/AI채점) 유지, `🧭 그래프 면접` 새 모드 추가. 파일럿 = **Network 11노드**(network, net-http, net-osi, net-tcp, net-https, net-dns, net-handshake, net-flowcc, net-httpver, net-socket, net-realtime).
- **순회는 점수가 운전**: `score≥4 → 더 깊이(hierarchy 자식, 없으면 crosslink 점프) / ==3 → 옆(같은 층 형제) / ≤2 → 코칭 + miss+1`. 종료: **miss 2회** or 갈 곳 없음 or 사용자 중단. 시작 노드 = 가장 기본(**net-http, "GET/POST 차이"급**).
- **질문 = Gemini 생성**: 새 `generate` Edge Function이 노드 노트 근거로 `{question, reference}` 반환. 채점 기준(reference)은 **생성된 모범답안**(짧고 채점 붙이기 쉬움, 노트 근거라 위험 작음). 그다음 기존 `grade`로 채점.
- **세션 내 노드별 질문 캐시**(재방문·재도전 안정 + 비용 절약).
- **상한**: generate·grade 둘 다 기존 일일 상한에 카운트.
- **실시간 사용량 미터**: "최근 1분/1시간 AI 호출 수"를 라이브 표시. (정직한 범위: 우리 호출 로그 = 실제 Gemini 부하. Google의 잔여 할당량 실시간 조회는 불가 → 우리 카운트 + 설정 tier 상한 상수 + 429 표시.)
- **순회 로직은 클라이언트**(그래프가 이미 브라우저 메모리). Edge Function은 생성·채점만.

## 3. 아키텍처 (데이터 흐름)
```
[GraphInterviewView · Network 서브그래프(클라 메모리)]
  현재 노드 결정(시작=net-http, 이후 점수로 결정)
     │ (노드별 질문 캐시 miss면) POST /generate { nodeId, noteText }  +JWT
     ▼
  [generate Edge Function] JWT검증→상한 예약→Gemini(노트근거)→{question, reference}
     ▼
  질문 표시 → 사용자 서술형 답변 → POST /grade { question, reference, userAnswer } (기존)
     ▼
  score(1~5) → routeFromScore → 클라 순회:
     ≥4 deeper(child/crosslink) · 3 lateral(sibling) · ≤2 coach + miss++
  종료 시 "생존 경로"(방문 노드 순서 + 깊이) 표시
  [상단] 실시간 미터: 최근 1m/1h AI 호출 수 (grade_events 폴링)
```

## 4. 컴포넌트 / 파일

**새로 (서버, Deno/Supabase):**
- `supabase/functions/_shared/generate-prompt.ts` — 순수: 질문 생성 system 프롬프트 + `buildGenerateMessages(note, opts)` + `parseGenerated(raw) → {question, reference} | null`. 외부 import 0(Deno·Vitest 공용).
- `supabase/functions/generate/index.ts` — 핸들러: JWT검증 → 상한 예약(reserve_grade_slot 재사용) → chatComplete(생성 프롬프트) → parse → 실패 시 refund → `{question, reference}`. 이벤트 로깅(§ usage).
- `supabase/schema/grade_events.sql` — `grade_events(id bigserial pk, user_id uuid, kind text, created_at timestamptz default now())` + RLS(own-row select) + 인덱스(user_id, created_at). 쓰기 정책 없음 → **SECURITY DEFINER `log_grade_event(p_kind text)`** rpc로만 insert(reserve_grade_slot과 같은 패턴). generate·grade 성공 시 각각 호출.
  - (기존 `grade_usage` 일일 상한과 별개: usage는 일일 캡, events는 rate 미터용 타임스탬프 로그.)

**수정 (서버):**
- `supabase/functions/grade/index.ts` — 성공 시 `log_grade_event('grade')` 호출 추가(미터용).

**새로 (클라이언트):**
- `src/lib/graphWalk.ts` — 순수 순회 엔진: `pickStart(subgraph)`, `nextNode(state, score, subgraph) → nodeId | null`(≥4 child→crosslink / 3 sibling / ≤2 same+miss), `WalkState`(visited[], misses, path[]). Vitest 테스트.
- `src/lib/generate.ts` — `generateQuestion(nodeId, noteText) → {question, reference} | error`(generate Edge Function 호출, gradeAnswer와 같은 에러 taxonomy).
- `src/lib/usageMeter.ts` — `recentUsage() → {perMin, perHour}`(grade_events를 시간창으로 count, PostgREST RLS). 폴링용.
- `src/components/GraphInterviewView.tsx` — 새 모드 UI: 현재 질문 카드(생성 로딩→질문→답변 textarea→채점하기), 점수/코칭, 경로 브레드크럼, 종료 요약, 상단 사용량 미터.
- `src/components/GraphInterviewView.css`.

**수정 (클라이언트):**
- `src/components/QuizTab.tsx` — 4번째 모드 탭 `🧭 그래프 면접` 추가.
- `src/hooks/useNotePool.ts` 재사용(노드→노트 텍스트).

## 5. 순회 알고리즘 (상세)
- **서브그래프**: Network 도메인 노드 + 그 사이 hierarchy/crosslink 엣지(+ crosslink 상대가 타 도메인이어도 파일럿은 **Network 내부만** 우선; 타 도메인 점프는 후속).
- **시작**: `net-http`(가장 기본·단골). 
- **nextNode(현재, score)**:
  - `≥4`: 미방문 **hierarchy 자식** 우선 → 없으면 미방문 **crosslink 이웃** → 없으면 미방문 형제 → 없으면 종료.
  - `==3`: 미방문 **같은 부모의 형제** → 없으면 자식 → 없으면 종료.
  - `≤2`: 코칭 표시, `misses++`. 재도전(같은 노드) 또는 사용자가 "다음"이면 부모/형제로. `misses>=2` 종료.
- **방문 집합**으로 순환 방지. **경로 배열**로 브레드크럼·생존 깊이.
- 종료: misses≥2 or nextNode=null or 사용자 중단.

## 6. 질문 생성 (grounded)
- generate system: "노트 근거로만, 지어내지 말 것. 이 노드 개념의 면접 질문 1개 + 짧은 모범답안(2~3문장) JSON." (§인젝션: 입력이 우리 노트라 위험 낮음. 단 노트 텍스트를 데이터 구분선으로 감쌈.)
- 반환 `{question, reference}`. reference가 곧 grade의 채점 기준.
- **캐시**: `Map<nodeId, {question, reference}>` 세션 메모리. 재방문·재도전 시 재호출 안 함(비용·일관성).
- 리스크(수용): 생성 모범답안이 노트보다 얕/부정확할 수 있음 → 파일럿에서 품질 관찰, 필요 시 후속에 노트 원문 fallback/간판 authoring.

## 7. 실시간 사용량 미터
- generate·grade 성공마다 `grade_events` 1행(kind, created_at).
- 클라 `usageMeter`가 `select count where created_at > now()-'1 minute'` / `'1 hour'`(RLS own-row) 폴링(예: 10초).
- UI: `이번 분 N · 이번 시간 M` + 설정 상한(`VITE_GEMINI_RPM`/`RPH` 상수, 없으면 숫자만). 429(Gemini limit) 수신 시 배너.
- 정직한 한계 명시: "내 호출 기준(= Gemini 부하). Google 잔여 할당량 실시간 조회는 불가."

## 8. 에러 처리
- generate 실패(LLM/parse) → 슬롯 환불 + "질문 생성 실패, 다시" 배너, 그 노드 건너뛰거나 재시도.
- grade 실패 → 기존 처리(환불 + 배너).
- 상한 초과(429 우리쪽) → "오늘 AI 한도 소진" + 자가 모드 안내.
- Gemini 429(rate) → 미터에 표시 + 잠시 후 재시도 안내.
- 미로그인/게스트 → 그래프 면접 모드 비활성(기존 게이팅과 동일).
- 노트 없는 노드 → 그 노드 스킵(순회에서 제외).

## 9. 테스트
- `graphWalk.test.ts`(Vitest): nextNode 분기(≥4 자식/crosslink, 3 형제, ≤2 miss+종료), 방문 순환 방지, 종료 조건. 순수 로직이라 결정적.
- `generate.ts`/`usageMeter.ts`: fetch mock 분기.
- `generate-prompt.ts`: parseGenerated(정상/깨진 JSON), 노트 구분선 포함.
- 로컬 스택 e2e: generate(Gemini/Ollama)→질문, grade→점수, 순회 몇 스텝, grade_events 카운트 증가, 미터 폴링. (supabase start + functions serve)
- 실브라우저(Playwright, 로컬 세션 주입): 그래프 면접 모드 진입→질문→답변→채점→다음 노드→경로 브레드크럼→미터 표시→콘솔 0.

## 10. 스코프 밖 (파일럿 후)
- 타 도메인으로 crosslink 점프(파일럿은 Network 내부만).
- 지도(React Flow) 위 걸어온 경로 하이라이트 시각화.
- 간판 질문 authoring / 노트 원문 fallback.
- 전 도메인 확장.
- 로컬 3b 생성(품질 부족 — Gemini 전용, 로컬은 채점만).

## 11. 배포 시 수동 단계
- prod에 `grade_events.sql` 적용(대시보드).
- generate 함수 배포(`supabase functions deploy generate`) — 기존 LLM secrets 재사용(Gemini).
- (선택) `VITE_GEMINI_RPM`/`RPH` Vercel 환경변수.
