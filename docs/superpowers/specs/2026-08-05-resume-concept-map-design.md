# 내 이력 → 개념 지도 (spec A)

> 상태: 설계 승인 (2026-08-05)
> 후속: spec B = 이 개념 집합을 입력으로 받는 프로젝트 기반 하드 면접 (별도 스펙)

## 목표

사용자가 자신의 프로젝트 이력을 등록하면, 그 프로젝트에서 마주친 CS 개념을
그래프의 실재 노드로 매핑해 **프로젝트 중심 방사형 마인드맵**으로 보여준다.
각 개념은 사용자의 실제 학습 증거로 3단계 색을 입어, "내가 쓴 기술인데 확인해본
적 없는 개념"이 한 화면에 드러난다.

이력 원문은 사용자만 열 수 있게 클라이언트에서 암호화되어 저장되고, AI 호출에는
사용자가 확정한 마스킹을 적용한 텍스트만 나간다.

## 범위

포함: 프로젝트 등록·수정·삭제, E2E 암호화 금고, 마스킹 확정 게이트, 로컬 개념
매칭, LLM 암시 개념 추출(온디맨드), 숙련도 3단계 판정, 방사형 지도 모달,
`#/resume` 라우트, 게스트/로그인 동기화.

제외(다음 이터레이션): 면접 생성(spec B), 애니메이션·반응형 다듬기, 지도/보드
레이아웃 토글, PDF 이력서 파싱, 프로젝트 간 비교 뷰.

## 결정 사항과 근거

| 결정 | 선택 | 근거 |
|---|---|---|
| 작업 분해 | spec A(지도) → spec B(면접) | A가 B의 입력을 만든다. A로 추출 정확도를 먼저 검증한 뒤 B를 설계 |
| 이력 보관 | E2E 암호화 + 어디서든 재개 | 민감 데이터. 서버·백업·DB 접근자 누구도 못 읽어야 함 |
| 열쇠 관리 | 사용자 패스프레이즈 파생 키 | 서버가 키를 갖는 순간 E2E가 아니다 |
| 마스킹 | 자동 후보 → 사용자 체크 확정 | 자동 탐지만 믿으면 놓친 이름에 대해 거짓 안전감을 준다 |
| 입력 형식 | 서술문 + 기술스택 칩 + 라이프사이클 체크박스 | 칩은 매칭의 최강 신호, 체크박스는 spec B 출제 범위 |
| 개념 추출 | 하이브리드(로컬 우선, LLM 온디맨드) | 지도는 무료·오프라인으로 먼저 나오고, LLM은 암시 개념에만 씀 |
| 표시 대상 | 매칭 개념 전부 + 숙련도 색 | 프로젝트 전경이 보여야 마인드맵의 의미가 있다 |
| 레이아웃 | 프로젝트 중심 방사형 | 중앙=프로젝트 → 도메인 → 개념. 12~25개 규모에 맞는 밀도 |
| 진입점 | 최상위 뷰 `내 이력`, 프로젝트 복수 | 실제 이력서에 2~4개. spec B의 자연스러운 집 |
| 구현 순서 | 순수 코어 → 저장 → Edge Fn → 최소 UI → 다듬기 | 사용자 지시. 1단계는 컴포넌트 0개로 완결 검증 |

## 아키텍처

```
                      ┌──────────────── 브라우저 (평문은 여기서만) ────────────────┐
                      │                                                          │
narrative(원문) ──────┼─┬─→ matchLocal()   칩·키워드 → 노드 id   [무료·오프라인]  │
                      │ │                          ↓                             │
                      │ │                   layoutRadial() → 지도 즉시 렌더        │
                      │ │                          ↑                             │
                      │ │                     tierOf()  ← srs·quizStats          │
                      │ │                                                        │
                      │ └─→ findCandidates() → 사용자 확정 → applyMask()          │
                      │                              ↓                           │
                      │                      buildExtractPayload()               │
                      │                              ↓ 전문 미리보기 + 보내기       │
                      │                              │                           │
      sealJson(key,·) ─┼──→ 암호문 blob                │                           │
                      └──────────────┬───────────────┼───────────────────────────┘
                                     ↓               ↓
                        localStorage / Supabase   extract Edge Fn ──→ LLM
                          resume_vault (RLS)          ↓
                                                 node id[] → 화이트리스트 검증 → 지도 덧칠
```

## 데이터 모델

### 금고 (`src/lib/vault.ts`)

```ts
deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey>
  // PBKDF2-SHA256, 200,000회 → AES-GCM 256

sealJson(key: CryptoKey, obj: unknown): Promise<SealedBlob>   // { iv, ct } base64
openJson<T>(key: CryptoKey, blob: SealedBlob): Promise<T>     // 실패 시 throw
```

- 저장되는 것은 암호문뿐. `salt`는 비밀이 아니므로 blob과 함께 저장하고, 새 기기는
  `salt + 패스프레이즈`로 같은 키를 재파생한다 — 이것이 "어디서든 재개"의 근거.
- 패스프레이즈 검증 로직은 불필요하다. AES-GCM 인증 태그가 틀린 키를 복호화에서 거부한다.
- 파생 키는 **메모리에만** 둔다. 새로고침 시 재입력. `sessionStorage` 캐시는 XSS가
  키를 읽을 수 있어 E2E 주장을 약화시키므로 옵션조차 두지 않는다.
- WebCrypto(PBKDF2 + AES-GCM)가 vitest jsdom 환경에서 동작함을 확인했다.

### 평문 구조

프로젝트 2~4개 규모이므로 전체를 **하나의 blob**에 담는다(행 분리 불필요).

```ts
type Stage = 'architecture' | 'mvp' | 'feature' | 'cicd'
           | 'traffic' | 'tx' | 'qa' | 'ops'

interface Match {
  nodeId: string
  via: 'chip' | 'keyword' | 'llm'
  evidence: string           // 매칭 근거 (칩 이름, 매칭 토큰, LLM 사유)
}

interface Project {
  id: string
  name: string
  period: string
  role: string
  stack: string[]                    // 칩. 노드 keywords로 자동완성
  lifecycle: Stage[]
  narrative: string                  // 자유 서술 원문
  maskDict: Record<string, string>   // "우리회사" → "[COMPANY_1]"
  matches: Match[]
  updatedAt: string
}

interface VaultPayload { version: 1; projects: Project[] }
```

### 저장 위치

| 모드 | 위치 | 내용 |
|---|---|---|
| 게스트 | `localStorage` | 암호문 blob + salt (로컬도 평문 저장 안 함) |
| 로그인 | Supabase `resume_vault` | `user_id` PK, `salt`, `blob`, `updated_at`, RLS `auth.uid() = user_id` |

**게스트도 패스프레이즈를 설정한다.** 로그인 여부와 무관하게 저장은 항상 암호문이며,
로그인은 "여러 기기에서 같은 blob을 본다"는 것만 추가한다.

금고 상태는 셋뿐이다:

| 상태 | 의미 | 화면 |
|---|---|---|
| `none` | 아직 금고가 없음 (salt 없음) | 패스프레이즈 최초 설정 + 분실 시 복구 불가 고지 |
| `locked` | blob은 있고 키는 없음 | 패스프레이즈 입력 |
| `unlocked` | 메모리에 키 보유 | 프로젝트 목록 |

blob은 서버 입장에서 불투명하다 → **금고를 열지 않아도 동기화가 된다.** 새 기기는
blob을 먼저 내려받고, 패스프레이즈는 실제로 열어볼 때만 필요하다.

## 마스킹

`src/lib/mask.ts` — 순수 함수.

```ts
findCandidates(text: string, neverMask: Set<string>): Candidate[]
applyMask(text: string, dict: Record<string, string>): string
```

- **never-mask 허용목록은 122개 노드의 `keywords` 전체로 만든다.** `Redis`가
  `[SYSTEM_1]`로 가려지면 추출 신호 자체가 사라진다.
- 후보 신호: `(주)`·`㈜`·`~주식회사`·`~팀` 패턴, 사번/이메일/URL/전화번호 패턴,
  기술 사전에 없으면서 2회 이상 반복되는 고유명사성 토큰, CamelCase 사내 코드명.
- **한국어 자동 탐지는 근본적으로 약하다.** 한글 회사명·사내 코드명은 대문자 같은
  표기 신호가 없어 "정산허브" 류를 규칙으로 잡을 수 없다. 따라서 안전을 탐지에 걸지
  않는다. 사전은 편의이고, **실제 보증은 전송 전 전문 미리보기 + 명시적 보내기 버튼**이다.
- 토큰은 `[COMPANY_1]`, `[SYSTEM_2]`, `[PERSON_1]` 형태. 역매핑은 서버로 절대 가지 않는다.

## 개념 추출

### 로컬 (`src/lib/conceptMatch.ts`)

```ts
matchLocal(input: { stack: string[]; narrative: string }, nodes: GraphNode[]): Match[]
mergeLlm(local: Match[], llmIds: string[], nodes: GraphNode[]): Match[]
```

- 정규화: 소문자화, 공백·하이픈 제거 (`Spring Boot` == `springboot`).
- 칩 → 노드 `keywords` 매칭, 서술문 토큰 → `keywords` + `label` 매칭.
- level 0 도메인 노드는 개념이 아니라 **그룹 헤더**로만 쓴다.
- `mergeLlm`은 LLM이 준 id를 실재 노드 집합으로 화이트리스트 검증하고, 통과한 것만
  `via: 'llm'`로 추가한다. 버린 개수는 콘솔에 남긴다.

### LLM (`extract` Edge Function)

프롬프트는 "이 122개 중 뭐가 나왔냐"를 묻지 **않는다** — 그건 로컬 매칭이 공짜로
하는 일이다. 호출 1회의 값은 다음 질문에서 나온다:

> 서술문에 이름은 나오지 않았지만, 시니어 면접관이라면 반드시 파고들 개념은 무엇인가

예: *"재시도가 일일 크론과 겹쳐 중복 결제"* → `sd-distributed-tx`(Outbox·보상
트랜잭션), `db-isolation`, `sd-resilience`. 로컬 매칭이 절대 못 잡고, 실제 면접에서
무너지는 지점이다.

- 입력: `{ maskedNarrative, stack, lifecycle, catalog }` — `maskedNarrative`는
  `applyMask()`를 통과한 텍스트이며, 원문 `narrative`는 어떤 필드로도 나가지 않는다.
  `stack` 칩은 기술 용어이므로 마스킹 대상이 아니다. `catalog`(id/label/keywords)는
  공개 데이터이므로 클라이언트가 보내도 무해하다 — graph.json을 함수에 복제하지 않는다.
- 출력: `{ nodeIds: string[], reasons: Record<string, string> }`.
- 서술문은 사용자 입력이므로 기존 `_shared/sanitize.ts` + 구분자 패턴으로 감싼다.
- **`question_cache`에 쓰지 않는다.** 그 테이블은 전체 사용자 공유 캐시이므로
  (`functions/generate/index.ts`의 조회는 user_id 조건이 없다) 프로젝트 상세가 남의
  화면에 노출된다.
- `reserve_grade_slot` / `refund_grade_slot`은 `generate`와 동일하게 사용해 일일 상한을
  우회하지 않는다. `log_grade_event(p_kind: 'extract')`.

## 숙련도 판정

`src/lib/mastery.ts`

```ts
tierOf(nodeId, evidence): 'solid' | 'shaky' | 'unverified'
```

증거의 신뢰 순서:

| 순위 | 신호 | 의미 |
|---|---|---|
| 1 | `srs[key].reps` / `lapses` | 실제로 답해봤음 — 유일한 직접 증거 |
| 2 | `quizStats[domain]` 정답률 | 도메인 수준 간접 증거 |
| 3 | `studiedIds` 체크박스 | 자기 신고. 가장 약함 |

한 노드에는 Q&A 카드가 여러 개 달릴 수 있으므로(`srsKey`는 질문 단위) 판정은 그
노드에 속한 **카드 집합**을 기준으로 하며, 아래 순서로 첫 번째 일치를 택한다:

1. 카드 집합에 srs 기록이 하나도 없음 → **unverified**
2. 카드 집합의 `lapses` 합 > 0 → **shaky**
3. 도메인 정답률 < 0.8 (`seen >= 3`) → **shaky**
4. 카드 집합의 최대 `reps` < 2 → **shaky** (한 번 맞춘 것으로는 solid라 하지 않는다)
5. 그 외 → **solid**

`unverified`의 라벨은 "구멍"이 아니라 **"확인 필요"**로 표기한다.

`studiedIds`를 "모른다"의 근거로 쓰지 않는 이유: 체크가 없다는 건 대개 "누른 적
없다"이지 "모른다"가 아니다. 그대로 두면 지도가 온통 빨강이 되고, 빨강이 다 빨강이면
정보량이 0이다. "구멍"은 단정이고 "확인 필요"는 사실이며, 후자가 원래 요구사항
("충분히 모를 수 있는 개념")에 정확히 대응한다.

**비동기 의존성:** 노드→srsKey 매핑은 노트 마크다운을 읽어야 나온다
(`useNotePool`, `srsKeyOf(path, slug, question)`). 따라서 지도는 즉시 중립색으로
그리고, 노트 풀이 도착하면 색을 입힌다. 퀴즈 탭이 이미 내는 비용이다.

## 방사형 레이아웃

`src/lib/radial.ts` — 결정적. 난수 없음.

```ts
layoutRadial(groups: DomainGroup[], opts: { perDomainCap: number }): Placed[]
```

- ring 0 = 프로젝트, ring 1 = 도메인, ring 2 = 개념.
- 각도는 도메인의 개념 수에 **비례 배분**한다 → 겹침이 구조적으로 발생하지 않는다.
  충돌 회피 로직이 아니라 배분 계산이므로 테스트가 단순하다.
- 매칭 개념이 25개를 넘으면 방사형은 읽을 수 없다(Spring+JPA+Redis+Kafka 칩만으로도
  20개 초과 가능). 그래서 **`perDomainCap = 6`** 으로 도메인당 표시 개수를 자르고,
  잘린 것은 도메인 노드에 `+N` 배지로 접는다. 전체 상한은 따로 두지 않는다 — 도메인당
  상한만으로 최대 밀도가 결정되고, 규칙이 하나면 테스트도 하나다.
- 자르기 정렬 순서: `unverified` → `shaky` → `solid`, 동급이면 `via`가
  `llm` → `chip` → `keyword` 순(암시 개념이 가장 값지다), 그다음 노드 id로 안정 정렬.

## 에러 처리와 동기화

### 동기화: 낙관적 동시성 (last-write-wins 아님)

기존 `useCloudSync`의 LWW를 그대로 쓰면 **조용한 데이터 손실**이 발생한다. 진행률
카운터는 늦게 쓴 쪽이 이겨도 손실이 사소하지만, 손으로 쓴 서술문은 다르다. 폰에서
수정한 뒤 오래된 blob을 든 노트북이 저장하면 지워지고, 암호문이라 병합도 불가능하며
사용자는 나중에야 안다.

→ 읽을 때 받은 `updated_at`을 baseline으로 들고, 쓰기 RPC가
`where updated_at = baseline`으로 조건부 갱신한다. 0행 갱신이면 다른 기기가 먼저 쓴
것이므로 **덮지 않고 알린다.** 조용한 손실보다 시끄러운 충돌이 낫다.

### 패스프레이즈 분실

**복구 불가다.** 복구 경로를 만드는 순간 누군가 키를 대신 갖는다는 뜻이고 E2E가
아니게 된다. 유일하게 정직한 대비는 **`평문 JSON 내보내기` 버튼**으로 백업 책임을
사용자에게 명시적으로 넘기는 것이다. 최초 패스프레이즈 설정 화면에 이 사실을 분명히
적는다.

### 실패 경로

| 상황 | 동작 |
|---|---|
| 패스프레이즈 오류 | AES-GCM 인증 태그 실패 → "패스프레이즈가 다릅니다". 시도 제한 없음(로컬 연산이라 무의미) |
| 금고 잠김 | 뷰가 잠금 화면. 평문이 DOM에 들어가지 않음 |
| 클라우드 도달 불가 | 로컬 blob으로 계속 작동. 다음 로드에서 재동기 |
| 게스트 → 로그인 | 로컬 blob 업로드. 클라우드에 이미 있으면 충돌 알림 후 사용자 선택 |
| LLM 한도/실패 | 배너만. 지도는 로컬 매칭으로 이미 그려져 있음 |
| LLM 환각 id | 화이트리스트 필터로 버리고 버린 개수를 콘솔에 남김 |

## 구현 순서

말씀대로 **코어 로직 먼저, UI 나중**. 1단계는 컴포넌트 0개로 완결 검증된다.

| 단계 | 내용 |
|---|---|
| 1. 순수 코어 | `vault.ts` · `mask.ts` · `conceptMatch.ts` · `mastery.ts` · `radial.ts` |
| 2. 저장·동기화 | `resumeStore.ts`(graphStore와 분리), `schema/resume_vault.sql`(RLS + baseline 조건부 upsert RPC), 동기화 훅 |
| 3. extract 함수 | `_shared/extract-prompt.ts`, `functions/extract/index.ts` |
| 4. 최소 UI | `ResumeView`(목록+등록폼), 잠금 화면, `ConceptMapModal`, `#/resume`·`#/resume/<id>` 라우트 |
| 5. 다듬기 | 애니메이션·반응형·마이크로 인터랙션 (별도 이터레이션) |

`resumeStore`를 `graphStore`에서 분리하는 이유: `graphStore`는 이미 선택·테마·뷰모드·
진행률·퀴즈통계·SRS·퀴즈설정·퀴즈위치를 들고 있어 관심사가 포화 상태다.

## 테스트 전략

### 반드시 있어야 하는 것

**① 미리보기와 실제 전송은 같은 코드 경로를 쓴다.** 미리보기가 `applyMask()`를 부르고
전송이 따로 문자열을 조립하면 언젠가 둘이 갈라지고, 그때 미리보기는 거짓 안전감만 주는
UI가 된다. `buildExtractPayload()` 하나를 두고 미리보기는 그 결과를 그대로 렌더한다.

**② 프라이버시 불변식 테스트 — 이 기능에서 가장 값진 테스트다.**

```
확정된 마스킹 사전의 모든 원문 문자열에 대해,
네트워크로 나가는 payload(JSON.stringify 전체)에 그 문자열이 존재하지 않는다
```

`supabase.functions.invoke`를 스텁으로 잡고 payload를 검사한다. 이 테스트 하나가
마스킹 로직의 어떤 리팩터링에도 유출을 막는다.

### 모듈별

| 모듈 | 테스트 |
|---|---|
| `vault` | 왕복 암복호화, 틀린 패스프레이즈 거부, 같은 salt+패스프레이즈 → 같은 키, ct 변조 시 실패 |
| `mask` | 모든 노드 keyword가 후보로 제안되지 않음(속성 테스트), 사전 적용 멱등성 |
| `conceptMatch` | 알려진 서술문 → 기대 노드 id, 정규화 케이스(`Spring Boot`/`springboot`) |
| `mastery` | 증거 우선순위 표를 그대로 테이블 테스트 |
| `radial` | 겹침 없음 불변식, 도메인당 cap + 약한 것 우선 정렬, 결정성(같은 입력 → 같은 출력) |
| `extract-prompt` | 빌더·파서 deno 테스트 (`generate-prompt.test.ts` 패턴) |
| 컴포넌트 | 잠금 게이트가 평문을 렌더하지 않음, 마스킹 확정 전에는 보내기 차단, 지도 등급 색 |

### 자동화되지 않는 불변식 (정직한 한계)

"`extract`가 `question_cache`에 쓰지 않는다"는 Edge Function 통합 테스트 기반이 없어
자동 검증이 어렵다. 이는 **리뷰 시점 불변식**으로 남는다. 테스트가 있는 척하는 것이
더 위험하므로 여기에 명시한다.

## spec B로 넘기는 것

`Project.lifecycle` 체크박스와 `Project.matches`(등급 포함)가 spec B의 입력이다.
`unverified`/`shaky` 개념과 사용자가 담당했다고 체크한 라이프사이클 단계의 교집합이
"그 회사가 물어볼 것"의 출제 범위가 된다. 일일 상한 30이 generate·grade·hint·extract에
공유된다는 제약도 spec B 설계에서 정면으로 다뤄야 한다.
