# 콘텐츠 보강 마라톤 + 심화 접기 — 설계 (Design Spec)

**날짜:** 2026-07-22
**상태:** 승인됨 (구현 계획 대기)

## 목표 (Goal)

interview-map의 학습 노트를 **깊고 포괄적인 면접 대비 콘텐츠**로 끌어올린다. 풀스택 개발자처럼 CS 경험이 얕은 사용자가, 기본 흐름은 빠르게 훑고 **깊은 내부는 필요할 때 펼쳐 보도록**(기본 접힘) 한다. 여러 개념이 한 노드에 뭉친 구조(예: Java `collections`)를 **개념별 노드로 분리**하고, 각 노드의 예상 면접 질문을 늘려 드릴다운/SRS 콘텐츠도 함께 풍부하게 만든다.

## 배경 / 근거 (Context)

- **아키텍처:** 그래프 노드 1개 = 도메인 `*-core.md`의 `## 앵커 섹션` 1개. `NoteView`가 그 한 섹션만 렌더하고, `### 소제목`이 목차(outline) 칩이 된다. (`collections`만 예외 — 앵커 없는 standalone `hashmap-internals.md`를 통째로, 실제 내용은 전부 HashMap.)
- **진행:** 노드 단위 `studiedIds`(읽음 표시) + 도메인 롤업 `N/M`이 이미 존재. Q&A는 `rehypeFoldQA`로 이미 `<details>` 접힘.
- **런타임 소비:** 노트는 런타임 fetch(`useNotePool`, `NoteView`) → 콘텐츠를 보강하면 목록/퀴즈(플래시)/드릴다운/SRS/경로가 자동으로 풍부해진다.
- **콘텐츠 소스 규칙:** `notes/`(git 추적)만 편집. `interview-map/public/notes/`는 `scripts/sync-notes.mjs`가 생성(predev/prebuild). 편집 후 `node scripts/sync-notes.mjs` 또는 dev/build 재시작.
- **현재 규모:** 90 노드 / 11 도메인 / 13개 md 파일(도메인 core 11 + hashmap-internals + generics-stream).

## 확정된 결정 (Decisions)

1. **깊이 = 하이브리드.** 진짜 별개 개념은 그래프 노드로 분리하고, 각 노드 안은 "기본 설명 + 접히는 심화 블록"으로 깊이를 더한다.
2. **접기 = 저자 표시 심화 블록만.** 마크다운에 `<details>` 관습으로 깊은 내부만 명시적으로 접는다(핵심·요약은 항상 보임). 모든 소제목 자동 접기(X), 전체 자동화(X).
3. **진행 = 노드 단위 유지.** 새 데이터 모델 없음(`studiedIds` 그대로). 하이브리드 분리로 진행이 자연히 촘촘해짐. 도메인 롤업은 노드 수 따라 자동.
4. **순서 = 면접 빈도순.** Java Collections 분리군 → Java/JVM 심화 → OS → Network → DB → Spring → JS/React/시스템디자인/DevOps/HW.
5. **구조 = 단일 스펙 + 단계형 플랜.** Phase 0 = 접기 기능(코드), Phase 1~N = 콘텐츠 보강(노드 1개 = 태스크 1개). 진행 원장으로 추적.

## Phase 0 — 심화 접기 기능 (코드)

### 접기 관습 (Authoring convention)
심화 내용은 노트에서 다음 형태로 작성한다:

```html
<details class="deep">
<summary>심화: HashMap 충돌 해결과 treeify</summary>

... 깊은 내부 설명 (마크다운) ...

</details>
```

- `class="deep"`가 붙은 `<details>`는 "심화" 아코디언으로 스타일링(기본 접힘).
- 기존 `rehypeFoldQA`가 만드는 Q&A `<details>`와 공존(별개 스타일). `rehypeRaw`가 이미 활성화돼 있어 raw `<details>`가 렌더된다.

### 렌더링 / 스타일
- `NoteView`/`NotePanel.css`에 `.np-note details.deep` 아코디언 스타일 추가: 테마 토큰(`--bg-elev`/`--border`/`--accent`) 기반, `summary`에 "심화" 뱃지 + 펼침 아이콘(react-icons, chevron), 기본 접힘, 접근성(summary 포커스).
- rehype가 필요하면(마크다운 저자가 클래스를 못 붙이는 경우 대비) `summary` 텍스트가 `심화:`로 시작하는 `<details>`에 `deep` 클래스를 부여하는 소형 rehype 플러그인을 추가할 수 있으나, **1차는 저자가 직접 `class="deep"`를 붙이는 방식**으로 한다(YAGNI).

### 진행 (b)
- 코드 변경 없음. 노드 단위 `studiedIds` + 도메인 롤업 유지. 분리로 분모가 늘어 진행이 촘촘해진다.

### Phase 0 검증
- build(`tsc -b && vite build`) 클린.
- Playwright: `class="deep"` 심화 블록이 기본 접힘 → 클릭 시 펼침, Q&A 접기와 공존, 6개 테마에서 대비 OK(코드블록 가독성 수정과 동일 토큰), 콘솔 에러 0.

## 콘텐츠 품질 기준 (리치 섹션 템플릿)

모든 노드 페이지가 맞출 기준(깊은 내부는 심화 블록으로 접음):

```
학습 목표 (한 줄: "X를 5분간 답할 수 있게")
1. 비유              — 일상/웹개발 비유
2. 개념 정의 (1줄)
3. 다이어그램        — ASCII
4. 핵심 동작/원리     — 기본 설명(항상 보임)
     └ <details class="deep"> 내부 동작·자료구조·불변식·왜 이렇게 (접힘)
5. 트레이드오프 / 비교표
6. 자주 하는 실수
7. 코드 (Java 11, 해당 시 — Scanner 금지 등 CLAUDE.md 규칙)
8. 예상 면접 질문      — 메인 Q 5개+ 각 꼬리질문 체인
     └ 답변은 > 블록 / <details>. 드릴다운 파서 형식 준수:
       **Q<n>. "..."** + > 답, 이후 **꼬리 Q<n>-<m>. "..."** + > 답
```

- **깊이 예시:** HashMap 4번 = `hashCode→spread→bucket` 기본 + 심화(충돌: separate chaining vs open addressing, treeify 임계값 8/6, resize·load factor, 왜 RB트리). TreeMap 심화 = RB트리 5불변식·회전·O(log n).
- 한국어 설명 + 영어 코드. 사실 검증된 내용만, BOJ 외 URL 생성 금지.

## 노드 분리 (구조 변경)

### 분리 메커니즘
노드 추가 시:
1. `notes/<domain>/<file>.md`에 새 `## <제목>` 섹션 작성(리치 템플릿).
2. `interview-map/src/graph/graph.json`에 노드 추가: `id`, `label`, `domain`, `level`, `noteRef: "notes/.../file.md#<slug>"`, `summary`, `keywords`, `icon`.
3. 엣지 추가: 부모-자식(트리) + 필요한 크로스링크.
4. `src/components/NodeIcon.tsx` `BY_ID`에 아이콘 매핑 추가(없으면 도메인/기본 아이콘 폴백).
5. `node scripts/sync-notes.mjs`로 public 복제 갱신.

### 도메인 경계(중복 방지)
- **DSA** = 추상 자료구조 이론(해시 충돌 이론, BST/AVL/RB 균형, 배열 vs 연결 Big-O). 이미 잘 분리됨(bigo/array/hash/tree/bst/heap/sort) → 주로 **내용 심화**.
- **Java Collections** = Java API 구현·면접 포인트(fail-fast, ConcurrentModificationException, ArrayDeque 권장 등).

### 우선 분리 확정 (Phase 1 — Java Collections)
현재 `collections` 단일 노드(→ hashmap-internals.md)를 다음으로 분리:

| 새 노드 id | label | 내용 초점 |
|---|---|---|
| `java-list` | ArrayList vs LinkedList | 성장 비용, 임의접근 vs 삽입/삭제, 언제 무엇 |
| `java-hashmap` | HashMap | 내부(충돌·treeify 8/6·resize·load factor) — 기존 hashmap-internals 활용 |
| `java-treemap` | TreeMap / RB트리 | 정렬 맵, RB트리 불변식·O(log n) |
| `java-set` | Set 구현체 | HashSet/LinkedHashSet/TreeSet 차이 |
| `java-queue` | Queue/Deque | ArrayDeque/PriorityQueue, Stack 피하기 |

- `collections` 노드는 **허브/개요**로 남겨 위 5개로 안내(요약 + 크로스링크). `hashmap-internals.md`의 HashMap 내용은 `java-hashmap`으로 재배치, 나머지는 새 섹션으로 작성.
- **이후 도메인의 분리 목록은 플랜에서 해당 차례에 확정한다**(지금 전부 나열 시 추정/placeholder가 되므로 스펙에 넣지 않음). 각 도메인 태스크 착수 시 "이 도메인에서 무엇을 분리/심화할지"를 먼저 정한다.

## 아키텍처 / 파일 (Architecture)

| 파일 | 변경 |
|---|---|
| `interview-map/src/components/NotePanel.css` | `.np-note details.deep` 심화 아코디언 스타일 |
| `interview-map/src/components/NoteView.tsx` | (필요 시) 심화 아이콘/접근성 보강 — 최소 |
| `notes/<domain>/*.md` | 콘텐츠 보강·심화 블록·Q&A 확장 (마라톤 본체) |
| `interview-map/src/graph/graph.json` | 노드/엣지 추가(분리) |
| `interview-map/src/components/NodeIcon.tsx` | 새 노드 아이콘 매핑 |
| `docs/superpowers/plans/…` | 진행 체크리스트(플랜) |

## 데이터 흐름 (Data Flow)
1. `notes/` 편집 → `sync-notes.mjs` → `public/notes/` 갱신.
2. 런타임: `NoteView`가 노드 `noteRef`의 `##` 섹션 fetch·렌더(심화 `<details>` 포함). `useNotePool`이 Q&A/드릴 체인 추출 → 플래시/드릴/SRS 반영.
3. 진행: 노드 `읽음 표시` → `studiedIds`(게스트 localStorage / 로그인 클라우드, 기존 경로). 도메인 롤업 자동.

## 에러 / 엣지 (Edge Cases)
- **앵커 slug 충돌/오타:** noteRef 앵커가 섹션 slug와 불일치하면 첫 섹션으로 폴백(기존 동작). 노드 추가 시 slug 일치 검증.
- **드릴 파서 형식 위반:** 새 Q&A가 형식(`**Q<n>. "..."**` + `>` + `**꼬리 …**`)을 어기면 드릴다운에 안 잡힘 → 태스크 검증에 포함.
- **크로스링크 중복/고아:** 새 엣지가 존재하는 노드만 참조하도록 검증(graph 유효성).
- **큰 파일:** 도메인 core 파일이 과대해지면 개념별 파일 분리 고려(플랜에서 판단, 기존 hashmap-internals 패턴).

## 테스트 (Testing)
- **Phase 0:** build 클린 + Playwright(심화 접힘/펼침, Q&A 공존, 콘솔0).
- **콘텐츠 노드마다:** (1) `node scripts/sync-notes.mjs` 후 dev에서 해당 노드 렌더 확인(섹션 파싱·목차·심화 접기), (2) 드릴다운/플래시가 새 Q&A 인식(형식 준수), (3) 그래프 변경 시 `graph.json` 유효·새 노드 아이콘/엣지 렌더, (4) 기존 단위 테스트 102개 유지, (5) 콘솔 에러 0.
- 도메인 묶음 완료 시 build + Playwright 스팟체크 → 리뷰 → main ff-only 병합.

## 범위 밖 (Out of Scope)
- 서브섹션(`###`) 단위 진행 체크·자동 스크롤 진행·새 클라우드 컬럼.
- 콘텐츠 자동 생성(LLM 대량 생성) — 사실 검증 위해 사람이 저술 품질로 작성.
- 그래프 레이아웃/시맨틱줌 로직 변경(노드 추가만, 렌더는 기존).
- 이후 도메인의 상세 분리 목록(플랜에서 차례로 확정).
