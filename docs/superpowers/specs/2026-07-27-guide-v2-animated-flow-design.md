# 설계 스펙 — 설계 가이드 v2 (살아 움직이는 플로우 플레이어)

> 작성일: 2026-07-27 · 상태: 승인됨(브레인스토밍)
> 선행: 설계 가이드 v1(SHIPPED, `docs/superpowers/specs/2026-07-24-conversational-interview-cache-guide-design.md` §9, `GuideView.tsx` + 정적 SVG 6개).

## 0. 한 줄 목표
가이드 페이지를 **처음 보는 사람도 술술 읽히는 서사 + 살아 움직이는(단계 재생) 플로우 다이어그램**으로 개편한다. 다크모드 제목 버그를 고치고, 정적 SVG를 재사용 애니메이션 플레이어로 대체하되 **점진적으로**(한 번에 다 하지 않는다).

## 1. 왜 이렇게 (사용자 피드백)
v1 가이드에 대한 실사용 피드백 3가지:
1. **문체가 기계 친화적** — 스펙 요약처럼 건조. 처음 보는 사람에게 안 읽힘.
2. **다크모드에서 제목이 안 보임** — 전역 `h1/h2` 색 규칙이 `.guide`의 상속 색을 눌러, 제목이 다크 테마 변수를 타지 않음(다크 배경에 다크 글자).
3. **정적 SVG가 죽어 있음** — 사용자가 "live, actually flowing" 다이어그램을 원함. 참조 샘플: 스테이지 컬럼 + 노드 하이라이트 + 흐르는 점선 엣지 + 재생 컨트롤(재생/이전/다음/처음/속도/스텝 카운터)로 파이프라인을 **단계별 재생**하는 플레이어.

## 2. 확정된 결정 (브레인스토밍)
1. **재사용 플레이어 1개 + 흐름 데이터 여러 개**(A안). 플레이어 컴포넌트를 한 번 만들고, 흐름은 순수 데이터로 추가.
2. **흐름 3개 전부**: 한 턴의 생애 / 깊이 사다리 / 개념 사이 순회.
3. **플레이어 v1 인터랙션(핵심부터)**: ▶ 눌러 시작, 재생/일시정지, 이전/다음, 처음, 스텝 카운터(N/M), 활성 노드 하이라이트, **흐르는 점선 엣지**, 비활성 디밍. **속도 슬라이더·색상 범례는 후속**(Phase 3+).
4. **자동재생 아님** — 사용자가 ▶를 눌러야 시작(산만함 방지).
5. **문체 = 스토리 우선 + 기술 깊이는 접기**: 본문은 주니어에게 설명하듯 서사(비유·왜 문제였나·그래서 이렇게), 정확한 기술 디테일은 `<details class="deep">`로 접음(content-marathon deep-fold 패턴). 견고성은 "안전하게 지었다" 자랑 섹션으로 서사에 남기고 세부는 접기.
6. **"왜 graph DB 아닌가"는 텍스트/작은 비교로 유지**(플레이어 안 씀 — 의사결정 논증이라 애니메이션 부적합).
7. **점진 구현**: 페이즈로 나눠 Phase 1 먼저 배포, 반응 보고 2·3 진행.

## 3. 아키텍처 — 데이터 구동 재사용 플레이어
```
FlowPlayer(flow) — 순수 데이터로 구동
  flow.stages[] : 스테이지 컬럼(색상 헤더)   예: 브라우저 / Edge Fn / Postgres / Gemini
  flow.nodes[]  : 각 스테이지 안의 노드 카드(title, subtitle)
  flow.steps[]  : 각 스텝 = { title, activeNodes[], edges[{from,to}], note? }
      스텝 이동 → activeNodes 하이라이트 + edges 점선 흐름 애니메이션 + 나머지 노드/엣지 디밍
```
- 플레이어는 흐름 구조를 모름(범용). 흐름은 데이터 파일로 분리 → **점진 확장이 값쌈**(플레이어 불변, 흐름만 추가).
- 렌더: 스테이지를 CSS로 가로 배치(반응형: 좁으면 세로 스택). 노드는 각 스테이지 내 세로 스택. **엣지(확정 방식)**: 노드마다 `ref`를 달아 `getBoundingClientRect`로 컨테이너 기준 위치를 측정 → 절대배치 SVG 오버레이에 노드 중심을 잇는 곡선(cubic path)을 그림. 레이아웃 측정은 마운트 후 + `ResizeObserver`(컨테이너 리사이즈)로 재계산해 상태에 저장. **흐르는 효과 = 활성 엣지에 `stroke-dasharray` + `stroke-dashoffset` CSS 애니메이션**(비활성 엣지는 흐름 없음/디밍). (좌표를 흐름 데이터에 하드코딩하지 않음 — 반응형·유지보수 위해 측정 방식으로 확정.)
- 테마: 모든 색/배경은 기존 CSS 변수(`--text`, `--text-dim`, `--border`, `--bg-elev`, `--accent`) 사용 → 라이트/다크 자동.

## 4. 컴포넌트 / 파일
**새로 (클라):**
- `src/components/flow/types.ts` — `FlowStage{id,label,color}`, `FlowNode{id,stage,title,subtitle?}`, `FlowStep{title,activeNodes:string[],edges:{from:string;to:string}[],note?:string}`, `Flow{stages,nodes,steps}`.
- `src/components/flow/FlowPlayer.tsx` (+ `FlowPlayer.css`) — 범용 플레이어. props `{ flow: Flow }`. 상태: `stepIdx`(초기 0=재생전), `playing`. 컨트롤: ▶/⏸, ◀ 이전, 다음 ▶, ↻ 처음, 스텝 `N/M`. 재생 시 setInterval로 다음 스텝, 마지막서 정지. 활성/디밍/흐름 클래스 토글.
- `src/components/flow/flows/turnLifecycle.ts` — 한 턴의 생애 흐름 데이터.
- `src/components/flow/flows/depthLadder.ts` — 깊이 사다리 흐름 데이터.
- `src/components/flow/flows/traversal.ts` — 개념 사이 순회 흐름 데이터.
- `src/components/flow/flows/validate.ts` — (테스트용) `validateFlow(flow)`: 모든 `activeNodes`·`edges.from/to`가 `nodes`에 존재, 모든 `node.stage`가 `stages`에 존재. 순수.

**수정 (클라):**
- `src/components/GuideView.tsx` — 서사 카피(스토리 + `<details class="deep">`) + 섹션별 `<FlowPlayer flow={...}/>` 임베드. "왜 graph DB" 텍스트 유지.
- `src/components/GuideView.css` — **다크모드 수정**: `.guide h1, .guide h2 { color: var(--text); }`. deep-fold 스타일(이미 앱에 `details.deep` 패턴 있으면 재사용).

**폐기(점진적):**
- 정적 SVG(`src/assets/guide/*.svg`)는 해당 흐름이 플레이어로 교체될 때 그 섹션에서 제거. **Phase 1에선 한 턴 관련(아키텍처/시퀀스/캐시)만 교체, 사다리/순회 SVG는 유지**(회귀 방지). 최종적으로 남는 SVG는 없거나 "왜 graph DB" 보조용만.

## 5. 흐름 내용 (스텝 개요)
- **turnLifecycle** (스테이지: 브라우저 / Edge Fn / Postgres / Gemini): ① 개념 진입(브라우저) → ② 캐시 조회(question_cache) → ③ 히트면 즉시 질문 / 미스면 → ④ 상한 예약(grade_usage) → ⑤ Gemini 생성 → ⑥ 캐시 저장 + 이벤트 로깅 → ⑦ 질문 표시 → ⑧ 답변→채점(grade) → ⑨ (낮으면) 힌트 → ⑩ advanceLadder → 다음 노드. (스텝 수는 구현 시 8~10 사이 조정)
- **depthLadder** (스테이지: L1/L2/L3/L4 또는 단일 사다리 컬럼): 계단별 질문 → 채점 → ≥3 상승 / ≤2 힌트→재시도 → 종료(reached 기록).
- **traversal** (스테이지: 현재 노드 / 신호 / 다음 노드): 노드 완료 → ladderSignal(≥4 자식·crosslink / 1~3 형제 / 0 부모+miss) → 홉. 종료(miss 2 / 8노드).

## 6. 카피 구조 (서사 + 접기)
섹션 순서: 비유 → **한 턴의 생애(플레이어)** → 왜 graph DB 아닌가(텍스트) → **깊이 사다리(플레이어)** → **개념 사이 순회(플레이어)** → 견고·안전(자랑 서사 + 접기). 각 플레이어 위에 2~3문장 서사, 아래 `<details class="deep">`에 기술 디테일.

## 7. 점진 구현 (플랜 페이즈)
- **Phase 1 (먼저 배포)**: 다크모드 수정 + 카피 서사화(deep-fold) + `FlowPlayer` + `turnLifecycle` 흐름 + `validateFlow`. 사다리/순회 섹션은 기존 정적 SVG 유지.
- **Phase 2**: `depthLadder` 흐름 → 사다리 섹션 SVG 교체.
- **Phase 3**: `traversal` 흐름 → 순회 섹션 SVG 교체 + (선택) 속도 슬라이더·색상 범례.
- 각 페이즈 독립 배포. 이 스펙은 v2 전체를 담지만, 플랜은 Phase 1을 먼저 완주하고 2·3은 후속 플랜/실행으로.

## 8. 테스트
- `FlowPlayer.test.tsx`(jsdom+RTL): ▶ 전 stepIdx=0·미재생, 다음/이전 이동, 재생/일시정지 토글, 마지막 스텝서 정지, 활성 노드 집합이 스텝 따라 변함(활성 클래스 rendering).
- `flows/validate.test.ts`(순수): 각 흐름 데이터가 `validateFlow` 통과(모든 참조 노드/스테이지 존재). 깨진 흐름 → 실패 반환.
- `GuideView.test.tsx`: 플레이어 present(각 페이즈 해당 수), 섹션 헤딩, `<details class="deep">` 존재. (다크모드 색은 CSS라 단위테스트 대신 실브라우저 육안.)
- 실브라우저: ▶ 눌러 재생, 스텝 진행, 흐르는 엣지, 다크모드 제목 보임, 콘솔 0.

## 9. 스코프 밖
- 속도 슬라이더·색상 범례(Phase 3+ 선택).
- 실제 React Flow 지도 연동, 크로스도메인.
- 흐름 편집 UI(데이터는 코드로 작성).

## 10. 배포
클라 전용(정적 프런트). 백엔드/스키마 변경 없음 → Vercel 자동 재배포만. 각 페이즈 병합 시 배포.
