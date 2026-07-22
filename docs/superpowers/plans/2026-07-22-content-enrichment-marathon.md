# 콘텐츠 보강 마라톤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** interview-map 노트를 깊고 포괄적인 면접 콘텐츠로 보강하고(기본 접힘 심화 블록 + 개념별 노드 분리 + 면접 Q&A 확장), 이를 지원하는 심화 접기 UI를 추가한다.

**Architecture:** Phase 0은 `<details class="deep">` 심화 접기 스타일(코드, CSS 중심). Phase 1+는 `notes/` 마크다운 보강 + `graph.json`/`NodeIcon` 노드 분리로, 1 노드 = 1 H1(`#`) 섹션 규칙을 따른다. 노트는 런타임 fetch라 보강이 목록/퀴즈/드릴다운/SRS/경로에 자동 반영된다.

**Tech Stack:** React + TypeScript + Vite, react-markdown(+remarkGfm/rehypeRaw/rehypeFoldQA/rehypeSlug), `notes/` 마크다운, `scripts/sync-notes.mjs`.

## Global Constraints

- 작업 디렉토리: npm/build/vitest는 `interview-map/`에서. `notes/`는 저장소 루트.
- **`notes/`만 편집**. `interview-map/public/notes/`는 생성물 — 편집 후 `node interview-map/scripts/sync-notes.mjs`(또는 dev/build 재시작)로 갱신.
- 1 그래프 노드 = 1 H1(`#`) 섹션(`parseSections`가 H1로 분리, 첫 H1=title 드롭). 노드 `noteRef` 앵커 slug은 github-slugger 규칙으로 H1 텍스트와 일치해야 함.
- 심화 접기 관습: `<details class="deep"><summary>심화: …</summary>…</details>`. 핵심·요약은 항상 보이고 깊은 내부만 접음.
- 콘텐츠: 한국어 설명 + 영어 코드(Java 11, `Scanner` 금지·`StringBuilder`·`ArrayDeque` 등 CLAUDE.md 규칙). 사실 검증된 내용만, BOJ 외 URL 생성 금지.
- 면접 Q&A 형식(드릴다운/플래시 파서 호환): 메인 `**Q<n>. "..."**` + 다음 줄 `>` 답변; 꼬리질문 `**꼬리 Q<n>-<m>. "..."**` + `>` 답변.
- 공개 repo — 비밀·개인정보 커밋 금지. 커밋 이메일 `30681841+valorjj@users.noreply.github.com`.
- 커밋 트레일러:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Hknbru5nWNsFfmV3iJpBGh`
- 브랜치 `feat/content-enrichment`(스펙 커밋 존재). 도메인/Phase 묶음 단위로 main에 `--ff-only` 병합.
- 노드 아이콘: 렌더는 `NodeIcon`의 `BY_ID[id] ?? BY_DOMAIN[domain] ?? LuCircle`. 새 노드는 `BY_ID`에 매핑 추가(없으면 도메인 폴백). graph.json의 `icon` 필드는 렌더에 미사용(레거시)이나 일관성 위해 lucide 이름 문자열로 채움.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `interview-map/src/components/NotePanel.css` | `.np-note details.deep` 심화 아코디언 스타일(Phase 0) |
| `notes/01-java-jvm/collections.md` (신규) | `collections` 허브(List/Map/Set 개요 + 언제 무엇) |
| `notes/01-java-jvm/collections-list.md` (신규) | `java-list` (ArrayList vs LinkedList) |
| `notes/01-java-jvm/collections-set.md` (신규) | `java-set` (HashSet/LinkedHashSet/TreeSet) |
| `notes/01-java-jvm/collections-queue.md` (신규) | `java-queue` (ArrayDeque/PriorityQueue) |
| `notes/01-java-jvm/hashmap-internals.md` (수정) | `java-hashmap`(HashMap) + `java-treemap`(RB트리) 앵커로 재구성 |
| `interview-map/src/graph/graph.json` (수정) | 노드/엣지 분리 추가 |
| `interview-map/src/components/NodeIcon.tsx` (수정) | 새 노드 아이콘 매핑 |
| `docs/superpowers/plans/…progress` | 진행 원장(체크리스트) |

---

## Phase 0 — 심화 접기 기능

### Task 0.1: `.deep` 심화 아코디언 스타일

**Files:**
- Modify: `interview-map/src/components/NotePanel.css` (기존 `.np-note details` 블록 근처, 52–68행 영역)

**Interfaces:**
- Consumes: 기존 `.np-note details`/`summary` 스타일(base 아코디언), 테마 토큰 `--bg-elev`/`--border`/`--accent`/`--text-strong`.
- Produces: `<details class="deep">`가 "심화" 뱃지 + accent 좌측 강조로 구분되는 스타일. base details 스타일과 rehypeFoldQA의 `.qa-fold`는 그대로.

- [ ] **Step 1: 심화 스타일 추가**

`interview-map/src/components/NotePanel.css`의 `.np-note details blockquote { … }`(68행) 바로 다음에 추가:

```css
/* 저자 표시 심화 블록: 기본 접힘, "심화" 뱃지로 구분 */
.np-note details.deep { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
.np-note details.deep > summary { padding-left: 14px; }
.np-note details.deep > summary::before {
  content: '심화'; display: inline-block; margin-right: 8px; padding: 1px 7px;
  border-radius: 999px; font-size: 11px; font-weight: 700; line-height: 1.5;
  background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
}
.np-note details.deep[open] { background: color-mix(in srgb, var(--bg-elev) 85%, var(--accent)); }
```

- [ ] **Step 2: build 확인**

Run: `cd interview-map && npx tsc -b && npm run build`
Expected: 에러 없음(CSS-only, dist 생성).

- [ ] **Step 3: 실브라우저 확인 (Playwright)**

`notes/`의 아무 노트에 임시로 `<details class="deep"><summary>심화: 테스트</summary>\n\n내부 설명\n\n</details>`를 넣고 `node interview-map/scripts/sync-notes.mjs` 후 dev에서 확인 — 심화 뱃지 표시, 기본 접힘, 클릭 시 펼침, Q&A(`.qa-fold`)와 공존, 콘솔 에러 0. 확인 후 임시 블록 제거.
(실브라우저 방식: Playwright import `/Users/jeongjin/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js`, `const { chromium } = pkg`.)

- [ ] **Step 4: 커밋**

```bash
git add interview-map/src/components/NotePanel.css
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "feat(notes): styled '심화' deep-fold accordion (<details class=deep>)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hknbru5nWNsFfmV3iJpBGh"
```

---

## Phase 1 — Java Collections 분리 + 보강

현재 `collections` 노드(1개, → `hashmap-internals.md` 무앵커 → T1만 표시, 사실상 HashMap)를 6개 노드로 분리. `hashmap-internals.md`는 이미 T1(why/when)·T2(hash function)·T3(collision)·T4(RB tree)·T5(Q&A)·핵심질문 H1 섹션을 가짐.

**공통 그래프 편집 방법(각 Task에서 반복):**
- `graph.json` 노드 객체 필드: `id`, `label`, `domain:"java"`, `level:1`, `icon`(lucide 이름), `summary`, `keywords`(배열), `status:"learning"`, `noteRef:"notes/…#<slug>"`, `position:{x,y}`(레이아웃은 dagre가 재계산하므로 근사값 `{x:-260,y:260}` 등 기존 java 노드 근처면 됨).
- 엣지: `{"source":"<parent>","target":"<id>","type":"hierarchy"}` + 필요한 `{"…","type":"crosslink","label":"…"}`.
- `NodeIcon.tsx` `BY_ID`에 `'<id>': <LuIcon>` 추가(아래 각 Task 지정).
- slug 확인: H1 텍스트를 github-slugger로 변환한 값이 `noteRef` 앵커와 일치해야 함. 한글 H1은 slug에 한글이 유지됨(기존 dsa 앵커 `a6-이진탐색트리와-균형-트리` 참고). 영문/숫자 H1 권장.

### Task 1.1: `java-hashmap` + `java-treemap` — 기존 콘텐츠 앵커 연결 + 심화 접기 적용

**Files:**
- Modify: `notes/01-java-jvm/hashmap-internals.md` (H1 재구성 + 심화 블록화)
- Modify: `interview-map/src/graph/graph.json`, `interview-map/src/components/NodeIcon.tsx`

**Interfaces:**
- Produces: 노드 `java-hashmap`(→ `#`HashMap 섹션), `java-treemap`(→ `#`TreeMap/RB 섹션).

- [ ] **Step 1: 노트 재구성** — `hashmap-internals.md`를 다음 H1 구조로 정리:
  - `# HashMap` — T1(why/when)+T2(hash function)+T3(collision)을 하나의 H1로 병합. 기본 보임 = 개념·언제쓰나·hashCode→spread→bucket 다이어그램·비교표·자주하는실수. **심화 접기**로: `<details class="deep"><summary>심화: 충돌 해결 — chaining vs open addressing, treeify 8/6</summary>…</details>`, `<details class="deep"><summary>심화: resize·load factor·capacity 2^n</summary>…</details>` (기존 T2/T3 상세를 이 안으로).
  - `# TreeMap · Red-Black Tree` — 기존 T4. 기본 = 정렬맵 언제쓰나·O(log n)·비교표(HashMap vs TreeMap). 심화: `<details class="deep"><summary>심화: RB트리 5불변식·회전·height O(log n) 증명</summary>…</details>`.
  - `# HashMap · TreeMap 예상 면접 질문` — T5 + 핵심질문 통합, 메인 Q 5개+ 꼬리(형식 준수).
  - 첫 H1 title 유지(`# HashMap Deep Dive — 면접 답변 정리본`).
- [ ] **Step 2: graph.json/NodeIcon** — 노드 추가:
  - `java-hashmap`(label "HashMap", noteRef `notes/01-java-jvm/hashmap-internals.md#hashmap`, `BY_ID['java-hashmap']=LuHash` 이미 존재하는 아이콘 재사용 가능 — 없으면 추가), keywords `["HashMap","해시","treeify"]`.
  - `java-treemap`(label "TreeMap · RB트리", noteRef `…#treemap-red-black-tree`, `BY_ID['java-treemap']=LuListTree`), keywords `["TreeMap","RB트리","정렬맵"]`.
  - 엣지: `collections→java-hashmap`(hierarchy), `collections→java-treemap`(hierarchy), 크로스링크 `dsa-hash→java-hashmap`(label "HashMap 구현"), `dsa-bst→java-treemap`(label "RB트리").
  - slug 정확값은 실제 H1 텍스트로 확정(영문 H1이면 `hashmap`, `treemap-red-black-tree`).
- [ ] **Step 3: sync + 검증** — `node interview-map/scripts/sync-notes.mjs`; dev에서 java-hashmap/java-treemap 노드 렌더(섹션·목차·심화 접기), 드릴다운/플래시가 새 Q&A 인식, 그래프에 노드/엣지/아이콘 표시, `npx vitest run`(102 유지), 콘솔 0.
- [ ] **Step 4: 커밋** (메시지: `feat(notes): split HashMap/TreeMap into own nodes + deep-fold internals`)

### Task 1.2: `java-list` — ArrayList vs LinkedList (신규 저술)

**Files:** Create `notes/01-java-jvm/collections-list.md`; Modify `graph.json`, `NodeIcon.tsx`.

- [ ] **Step 1: 저술** — `collections-list.md`, H1 `# ArrayList vs LinkedList`, 리치 템플릿:
  - 학습 목표: "ArrayList/LinkedList를 언제 쓰는지 Big-O로 답할 수 있게".
  - 비유(배열=번호표 좌석 / 연결=보물찾기 쪽지), 정의, 다이어그램(메모리 배치), 핵심(임의접근 O(1) vs O(n), 삽입/삭제, 캐시 지역성).
  - 심화 접기: `<details class="deep"><summary>심화: ArrayList 성장(1.5x)·System.arraycopy·capacity</summary>…</details>`, `<details class="deep"><summary>심화: LinkedList가 실무에서 거의 안 쓰이는 이유(캐시 미스)</summary>…</details>`.
  - 비교표(임의접근/앞삽입/끝삽입/메모리/캐시), 자주하는 실수(`LinkedList`를 큐로 쓰기→`ArrayDeque`), 코드.
  - 면접 Q 5개+꼬리: (1)"ArrayList와 LinkedList 차이?" (2)"중간 삽입이 많으면 LinkedList가 유리한가?"(실무 함정) (3)"ArrayList의 초기 capacity/성장?" (4)"ArrayList remove의 비용?" (5)"배열 vs ArrayList?" — 각 꼬리 1–2개.
- [ ] **Step 2: graph.json/NodeIcon** — `java-list`(label "ArrayList·LinkedList", noteRef `…/collections-list.md#arraylist-vs-linkedlist`, `BY_ID['java-list']=LuList`), keywords `["ArrayList","LinkedList","List"]`; 엣지 `collections→java-list`(hierarchy), 크로스링크 `dsa-array→java-list`(label "구현").
- [ ] **Step 3: sync + 검증** (Task 1.1 Step 3 동일 절차).
- [ ] **Step 4: 커밋** (`feat(notes): java-list — ArrayList vs LinkedList`)

### Task 1.3: `java-set` — Set 구현체 (신규 저술)

**Files:** Create `notes/01-java-jvm/collections-set.md`; Modify `graph.json`, `NodeIcon.tsx`.

- [ ] **Step 1: 저술** — H1 `# Set 구현체 (HashSet · LinkedHashSet · TreeSet)`:
  - 학습목표, 비유, 정의, 다이어그램, 핵심(HashSet=HashMap 기반, 순서없음 / LinkedHashSet=삽입순 / TreeSet=정렬·NavigableSet).
  - 심화 접기: `<details class="deep"><summary>심화: HashSet은 내부적으로 HashMap<E,Object>(PRESENT)</summary>…</details>`, `<details class="deep"><summary>심화: TreeSet의 Comparator·NavigableSet(floor/ceiling)</summary>…</details>`.
  - 비교표(순서/정렬/성능/null 허용), 자주하는 실수(가변 객체를 Set 키로), 코드.
  - 면접 Q 5개+꼬리: (1)"HashSet은 어떻게 중복을 막나?" (2)"HashSet vs TreeSet 성능?" (3)"LinkedHashSet은 왜?" (4)"Set 원소로 가변 객체를 넣으면?" (5)"TreeSet에서 범위 조회?".
- [ ] **Step 2: graph.json/NodeIcon** — `java-set`(noteRef `…/collections-set.md#set-...`, slug은 H1 실제값, `BY_ID['java-set']=LuBoxes`), keywords `["HashSet","TreeSet","Set"]`; 엣지 `collections→java-set`.
- [ ] **Step 3/4:** sync+검증, 커밋 (`feat(notes): java-set — Set implementations`).

### Task 1.4: `java-queue` — Queue/Deque (신규 저술)

**Files:** Create `notes/01-java-jvm/collections-queue.md`; Modify `graph.json`, `NodeIcon.tsx`.

- [ ] **Step 1: 저술** — H1 `# Queue · Deque (ArrayDeque · PriorityQueue)`:
  - 핵심(Queue/Deque 인터페이스, ArrayDeque가 stack/queue 표준, PriorityQueue=힙).
  - 심화 접기: `<details class="deep"><summary>심화: 왜 Stack 클래스를 쓰지 말고 ArrayDeque?</summary>…</details>`(Vector 동기화·레거시), `<details class="deep"><summary>심화: PriorityQueue는 binary heap, offer/poll O(log n)</summary>…</details>`.
  - 비교표(Stack/ArrayDeque/LinkedList/PriorityQueue), 자주하는 실수(`Stack`/`LinkedList` 큐 사용), 코드(`Deque<Integer> st = new ArrayDeque<>()`).
  - 면접 Q 5개+꼬리: (1)"자바에서 스택을 어떻게 구현?" (2)"Stack 클래스 왜 지양?" (3)"PriorityQueue 내부?" (4)"Deque란?" (5)"ArrayDeque vs LinkedList as queue?".
- [ ] **Step 2: graph.json/NodeIcon** — `java-queue`(noteRef `…/collections-queue.md#queue-...`, `BY_ID['java-queue']=LuArrowRightLeft` 또는 `LuLayers`), keywords `["Queue","Deque","ArrayDeque","PriorityQueue"]`; 엣지 `collections→java-queue`, 크로스링크 `dsa-heap→java-queue`(label "PriorityQueue").
- [ ] **Step 3/4:** sync+검증, 커밋 (`feat(notes): java-queue — Queue/Deque`).

### Task 1.5: `collections` 허브 재작성 + 그래프 정리

**Files:** Create `notes/01-java-jvm/collections.md`; Modify `graph.json`(collections noteRef 변경), `hashmap-internals.md`(불필요 시 그대로).

- [ ] **Step 1: 저술** — `collections.md`, H1 `# 자바 컬렉션 개요 (List · Map · Set · Queue)`:
  - 컬렉션 프레임워크 계층도(Collection/Map 분기) 다이어그램, "언제 무엇" 결정표(요구→자료구조), 각 자매 노드로의 안내(요약 1줄씩).
  - 심화 접기: `<details class="deep"><summary>심화: fail-fast와 ConcurrentModificationException</summary>…</details>`, `<details class="deep"><summary>심화: Collections.unmodifiable*·동기화 래퍼·동시성 컬렉션 개요</summary>…</details>`.
  - 면접 Q 3개+꼬리: (1)"컬렉션 프레임워크 구조?" (2)"List/Set/Map 언제?" (3)"fail-fast란?".
- [ ] **Step 2: graph.json** — `collections` 노드 `noteRef`를 `notes/01-java-jvm/collections.md#자바-컬렉션-개요-list--map--set--queue`(H1 slug 실제값)로 변경. label "Collections 개요" 유지 가능. `BY_ID['collections']=LuLibrary` 유지.
- [ ] **Step 3: 정합성 검증** — `collections`→(java-list, java-hashmap, java-treemap, java-set, java-queue) 5개 hierarchy 엣지 존재; 모든 새 노드가 렌더·아이콘·앵커 정상; 그래프 유효(고아/중복 엣지 없음).
- [ ] **Step 4: sync + build + Playwright 스팟체크 + 커밋** (`feat(notes): collections hub overview + wire sub-nodes`).

### Task 1.6: Phase 1 묶음 검증 + main 병합

- [ ] **Step 1:** `cd interview-map && npx vitest run`(102 유지) + `npm run build`(클린).
- [ ] **Step 2:** Playwright — 경로/목록/지도에서 java-* 노드 렌더, 심화 접기 동작, 드릴다운에 HashMap/TreeMap 등 새 체인 등장, 콘솔 0.
- [ ] **Step 3:** 최종 리뷰 후 `git checkout main && git merge --ff-only feat/content-enrichment && git push origin main`(브랜치는 마라톤 지속을 위해 유지 또는 재생성).

---

## Phase 2+ — 콘텐츠 마라톤 (노드 1개 = 태스크 1개)

**반복 태스크 템플릿 (모든 마라톤 노드에 적용):**

각 노드에 대해:
1. 해당 도메인 파일에서 노드의 H1 섹션을 **리치 섹션 템플릿**(스펙)에 맞춰 보강: 학습목표→비유→정의(1줄)→다이어그램→핵심(항상보임)+`<details class="deep">`심화→트레이드오프/비교표→자주하는실수→코드(해당시)→면접 Q 5개+꼬리.
2. 이 도메인에서 **분리가 필요한 뭉친 노드가 있으면** 먼저 분리(그래프 편집 방법은 Phase 1 공통 절차 재사용), 없으면 심화만.
3. `node interview-map/scripts/sync-notes.mjs`.
4. 검증: 해당 노드 렌더(섹션·목차·심화 접기), 드릴/플래시가 새 Q&A 인식(형식 준수), 그래프 변경 시 유효·아이콘, `npx vitest run`(102 유지), 콘솔 0.
5. 노드 단위 커밋. 도메인 묶음 완료 시 build+Playwright 스팟체크 → 리뷰 → main ff-only 병합.

**착수 시 도메인 스코핑(도메인 차례가 오면 먼저 수행):** 그 도메인의 현재 노드/H1 목록을 조사해 (a) 분리할 뭉친 노드, (b) 심화가 얕은 노드를 정하고, 해당 도메인 하위 태스크 목록을 진행 원장에 추가한다. (스펙 결정: 이후 도메인 분리 목록은 차례에 확정.)

**정렬된 백로그(면접 빈도순):**
- [ ] Phase 1: Java Collections (java-list/hashmap/treemap/set/queue/collections) — 위 상세
- [ ] Phase 2: Java/JVM 심화 — `jvm-gc`, `jvm-memory`, `concurrency`, `jvm-jit`, `collections`(잔여), `generics-stream`
- [ ] Phase 3: OS — `os-process`, `os-scheduling`, `os-memory`, `os-sync`, `os-deadlock`, `os-io` 외
- [ ] Phase 4: Network — `net-tcp`, `net-http`, `net-osi`, `net-https`, `net-dns`, `net-handshake` 외
- [ ] Phase 5: Database — `db-index`, `db-tx`, `db-isolation`, `db-mvcc`, `db-lock`, `db-btree`, `db-normalization`, `db-nosql` 외
- [ ] Phase 6: Spring — `spring-ioc`, `spring-aop`, `spring-tx`, `spring-proxy`, `spring-bean`, `spring-mvc`, `spring-tx-propagation` 외
- [ ] Phase 7: DSA 심화 — `dsa-bigo`, `dsa-array`, `dsa-hash`, `dsa-tree`, `dsa-bst`, `dsa-heap`, `dsa-sort`, `dsa-compare-sort`
- [ ] Phase 8: JavaScript — `js-eventloop`, `js-closure`, `js-prototype`, `js-this`, `js-types`, `js-modules`, `js-microtask`
- [ ] Phase 9: React — `react-vdom`, `react-render`, `react-hooks`, `react-state`, `react-reconciliation`, `react-useeffect`
- [ ] Phase 10: System Design — `sd-lb`, `sd-cache`, `sd-dbscale`, `sd-mq`, `sd-cap`, `sd-cache-strategy`, `sd-replication`
- [ ] Phase 11: DevOps — `devops-docker`, `devops-k8s`, `devops-cicd`, `devops-observability`, `devops-k8s-objects`, `devops-probe`
- [ ] Phase 12: Hardware — `hw-cpu`, `hw-cache`, `hw-locality`, `hw-storage`, `hw-coherence`

(노드 id 목록은 착수 시 `graph.json`으로 재확인 — 위는 현재 스냅샷.)

---

## Self-Review

**Spec coverage:**
- 심화 접기 기능(a) → Phase 0. ✅
- 진행 노드 단위(b) → 코드 변경 없음(스펙 결정), 분리로 촘촘. ✅
- 리치 섹션 템플릿 → Phase 2+ 템플릿 + Phase 1 각 노드 상세. ✅
- 하이브리드 분리(collections) → Phase 1(java-list/hashmap/treemap/set/queue + 허브). ✅
- 면접 빈도순 → 백로그. ✅
- 도메인 경계(DSA 이론 vs Java 구현) → Phase 1 크로스링크, DSA는 Phase 7 심화. ✅
- 이후 도메인 분리 목록 차례 확정 → "착수 시 도메인 스코핑". ✅

**Placeholder scan:** Phase 0·Phase 1은 파일·CSS·노드필드·Q목록까지 구체. Phase 2+는 의도된 반복 템플릿+백로그(스펙이 "차례에 확정"으로 규정) — placeholder 아님.

**Type/naming consistency:** 노드 id(`java-list`/`java-hashmap`/`java-treemap`/`java-set`/`java-queue`), 파일 경로, `noteRef` 앵커 규칙, 커밋 이메일/트레일러, sync 명령이 모든 태스크에서 일관. slug 실제값은 H1 텍스트로 착수 시 확정(영문 H1 권장).
