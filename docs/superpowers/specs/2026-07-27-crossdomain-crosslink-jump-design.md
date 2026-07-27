# 설계 스펙 — 크로스도메인 crosslink 점프 (순회 인터뷰 확장)

> 작성일: 2026-07-27 · 상태: 승인됨(브레인스토밍)
> 선행: 그래프 면접 Network 파일럿(SHIPPED, `2026-07-24-graph-interview-network-pilot*`), 대화형 심층 면접(`2026-07-24-conversational-interview-cache-guide-design.md`).

## 0. 한 줄 목표
Network 도메인 안에만 갇혀 있던 순회를, **인접 1홉 크로스도메인 "연결 질문"**으로 확장한다. 여러 번 미뤄온 "다 연결된 크로스도메인 탐색"의 통제된 첫 시연.

## 1. 왜 (문제)
`graphWalk.networkSubgraph`는 "양끝이 모두 Network 도메인인 엣지"만 남긴다(`graphWalk.ts:8-13`). 그런데 Network 노드에 닿는 crosslink는 전부 **타 도메인**(HTTP↔Spring MVC, TLS↔JWT…)이라 필터에서 통째로 제거된다 → `crosslinksOf() = []` → `nextNode`의 score≥4 분기(`children → crosslink → sibling`)에서 crosslink가 **한 번도 안 탐**. 즉 코드에 크로스도메인 분기가 있어도 죽어 있다.

## 2. 확정된 결정 (브레인스토밍)
1. **범위 = 인접 1홉**: Network 노드에서 crosslink로 바로 이웃한 타 도메인 노드까지만. 거기서 그 도메인 안으로 더 번지지 않는다.
2. **질문 = 연결(브리지) 질문**: 홈(Network) 노드의 노트를 근거로 "이 개념이 {타 도메인 개념}과 어떻게 연결되나"를 묻는다. 타 도메인 노트 불필요(summary만) → 환각 방지·항상 근거 있음.
3. **브리지 노드 = 단일 질문, 사다리 없음**: 깊이 사다리(L1~L4) 안 돌린다. 연결 질문 하나 → 채점 → 복귀.
4. **UI = 도메인 뱃지 + 전환 문구 + breadcrumb 색 구분**.
5. **crosslink 발동 조건 = score≥4 유지**: "한 개념을 통달(reached 4)해야 인접 개념으로 건너간다"는 리듬. 파일럿답게 통제된 빈도로 시연(추후 완화 가능).

## 3. 아키텍처

### 3.1 1홉 강제 = 서브그래프 구성으로 공짜 구현
핵심 통찰: **브리지 노드의 다른 엣지를 로드하지 않으면 1홉이 자동 강제된다.**

새 순수 함수 `subgraphWithBridges(nodes, edges, domain='network'): SubGraph`:
- `home` = domain 노드 전부.
- `internalEdges` = 양끝이 모두 home인 엣지(기존 networkSubgraph 동작).
- `bridgeEdges` = `type==='crosslink'`이고 **정확히 한쪽 끝만** home인 엣지.
- `bridgeNodes` = bridgeEdges의 home 아닌 쪽 노드(타 도메인). 노드 객체는 원본 그대로 담되, **그 노드의 다른 엣지는 넣지 않는다.**
- 반환: `{ nodes: [...home, ...bridgeNodes(중복 제거)], edges: [...internalEdges, ...bridgeEdges] }`.

결과로 브리지 노드에서:
- `crosslinksOf(bridge)` = 자신에 닿는 bridgeEdge의 반대편 = **이미 방문한 home 노드** → `fresh()=null`.
- `childrenOf/parentsOf/siblingsOf(bridge)` = 서브그래프에 해당 hierarchy 엣지 없음 → `[]`.
- 따라서 `nextNode`의 primary가 전부 `null` → `backtrack()` → home(Network) 경로의 미방문 이웃으로 복귀. **1홉 강제됨.**

`nextNode`/`backtrack`/`isOver`/`pickStart`/`ladderSignal`은 **로직 변경 없음**. crosslink가 이제 비어있지 않으므로 기존 score≥4 분기가 실제로 동작할 뿐.

**"브리지 노드" 식별**: 새 플래그 없이 `node.domain !== 'network'`(정확히는 순회 시작 도메인 ≠ 노드 도메인)로 판별. 서브그래프가 이미 도메인 정보를 노드에 담고 있다(`GraphNode.domain`).

### 3.2 브리지 질문 생성 = generate 확장
`generate` Edge Function에 **브리지 모드** 추가(별도 함수 아님 — 캐시·상한·인젝션·refund 보일러플레이트 재사용).

요청 body 확장:
```
{ nodeId, rung, noteText, bridge?: { toId: string; toLabel: string; toSummary?: string } }
```
- `bridge`가 없으면 기존 계단 질문(하위호환 100%).
- `bridge`가 있으면:
  - 프롬프트를 `buildBridgeMessages(homeNote, toLabel, toSummary)`로 교체. 홈 노트를 `<<<NOTE>>>…<<<END>>>`로 감싸 근거로 쓰고(인젝션 중화 `neutralizeDelimiters`), 타깃은 라벨/요약만 제공. 질문 1개 + 모범답안 반환(`parseGenerated` 재사용, 스키마 동일).
  - **캐시 키**: `node_id = ${nodeId}~${toId}`, `rung = 0`(브리지 sentinel), `note_hash = noteHash(noteText)`(홈 노트, 서버 유도). → 같은 연결쌍+같은 노트면 전체 공유 캐시 히트.
  - 상한/미터/refund 경로는 기존과 동일.

`buildBridgeMessages`(순수, `_shared/generate-prompt.ts`):
- system: 기존 면접관 톤 + "두 개념의 **연결**을 묻는 질문 1개"를 명시. "[노트]에 있는 홈 개념을 근거로, 지정된 상대 개념과의 관계/차이/상호작용을 묻는다. 노트에 없는 상대 개념의 세부 사실은 지어내지 말고 관계 수준에서 묻는다." skip 규칙 동일.
- user: `상대 개념: ${toLabel} — ${toSummary ?? ''}` + `[노트]` 홈 노트 블록.

### 3.3 순회 통합 (`GraphInterviewView`)
- 현재 노드의 domain이 시작 도메인('network')과 다르면 = 브리지 노드:
  - 깊이 사다리를 시작하지 않는다. `generate`를 `bridge` 페이로드로 1회 호출(homeNote = **직전 home 노드**의 노트; toLabel/toSummary = 현재 브리지 노드의 label/summary; toId = 현재 노드 id).
  - 답변 → `grade`(기존) → 채점 표시/코칭.
  - 그 노드를 즉시 node-done 처리(사다리 상태 안 씀). **excursion이므로 miss로 세지 않는다**(weak=false 취급) — 크로스도메인 방문은 "실패"가 아니라 "곁가지".
  - `nextNode(subgraph, state, score)` 호출 → 브리지 노드엔 미방문 이웃 없음 → backtrack → Network 복귀.
- home 노드는 기존 대화형 사다리 그대로.
- "직전 home 노드"는 `state.path`에서 가장 최근의 domain==='network' 노드. 브리지 질문의 근거 노트로 사용.

### 3.4 UI
- **브리지 질문 카드**: 타 도메인 뱃지(`🔗 {toLabel}` + 도메인 색) + 전환 문구 한 줄("지금 **Network → {도메인}**으로 건너갑니다. 두 개념의 연결을 봅니다."). 복귀 스텝에서도 "다시 Network로" 한 줄.
- **breadcrumb**: 방문 경로 각 노드를 도메인 색으로 구분(브리지 노드는 타 도메인 색이라 시각적으로 튐).
- 색은 기존 도메인 색상 맵 재사용(그래프 노드가 이미 도메인별 색을 씀). 없으면 CSS 변수 팔레트.

## 4. 컴포넌트 / 파일
**수정 (클라):**
- `src/lib/graphWalk.ts` — `subgraphWithBridges` 추가(기존 `networkSubgraph`는 유지하거나 이 함수가 대체; 뷰가 새 함수를 쓰도록 전환). 나머지 순수 함수 불변.
- `src/components/GraphInterviewView.tsx` — 브리지 노드 분기(사다리 skip + bridge generate 호출 + node-done non-miss), 도메인 뱃지·전환 문구·breadcrumb 색.
- `src/lib/`(질문 호출 래퍼가 있으면 거기) — `generate` 호출에 `bridge` 옵션 전달.

**수정 (Edge Function):**
- `supabase/functions/_shared/generate-prompt.ts` — `buildBridgeMessages` 추가(+ 필요한 system 상수). `parseGenerated` 재사용.
- `supabase/functions/generate/index.ts` — body에 `bridge` 파싱, 있으면 브리지 프롬프트 + 브리지 캐시 키. 없으면 기존 경로.

**변경 없음:** `graph.json`(crosslink·domain 이미 존재), `grade`·상한·미터 인프라, `ladder.ts`(홈 노드용 그대로).

## 5. 데이터 무결성 / 하위호환
- `generate` 요청에 `bridge` 없으면 기존과 100% 동일 → 기존 캐시(`rung 1~4`) 오염 없음. 브리지는 `rung=0` 별도 네임스페이스.
- 캐시 테이블 스키마 변경 없음(`(node_id, rung, note_hash)` 그대로 사용).

## 6. 테스트
- `graphWalk.test.ts`: `subgraphWithBridges`가 (a) Network 내부 엣지 유지, (b) 한쪽만 Network인 crosslink + 그 타 도메인 노드 포함, (c) 타 도메인 노드의 다른 엣지 **미포함**, (d) 브리지 노드에서 `nextNode`가 backtrack으로 home 복귀(1홉 leaf)임을 검증. 소형 인메모리 그래프 fixture.
- `generate-prompt.test.ts`: `buildBridgeMessages`가 홈 노트+상대 라벨/요약을 담고, `<<<NOTE>>>` 구분선·중화 적용, system이 "연결 질문"을 지시. skip 파싱 동일.
- `generate/index.test.ts`(있으면): bridge body → 브리지 캐시 키(`from~to`, rung 0) 사용, non-bridge → 기존 경로(회귀). 401/rate_limit/parse 기존 커버 유지.
- (선택) `GraphInterviewView` 단위: 브리지 노드일 때 사다리 컨트롤 대신 단일 질문 + 도메인 뱃지 렌더.
- 실브라우저: net-http에서 시작해 한 개념 통달(reached 4) → 크로스도메인 브리지 질문 등장(뱃지+전환 문구) → 답변·채점 → Network 복귀. 콘솔 0. (prod e2e는 임시 유저 생성·삭제, service_role 미출력 규칙 준수.)

## 7. 스코프 밖
- 2홉 이상 크로스도메인 확장(브리지 노드에서 또 다른 도메인으로).
- 브리지 노드의 깊이 사다리(단일 질문만).
- 타 도메인 내부 자유 순회(범위 B/C).
- 지도(React Flow) 위 실시간 경로 하이라이트.
- score==3에서도 crosslink 발동(발동 조건 완화) — 반응 보고 후속.

## 8. 배포
- 클라 + `generate` Edge Function 재배포 필요(브리지 모드). 스키마/마이그레이션 없음.
- `supabase functions deploy generate`는 반드시 `interview-map`에서(레포 루트서 하면 entrypoint 경로 오류). 배포 후 실브라우저 e2e.
