# 내 이력 → 개념 지도: 코어 엔진 (2026-08-05)

스펙 `docs/superpowers/specs/2026-08-05-resume-concept-map-design.md` 의 A안 중
**도메인·로직 레이어만**. UI는 다음 플랜.

## 무엇이 들어왔나

| 파일 | 역할 |
|---|---|
| `src/lib/vault.ts` | PBKDF2-SHA256 200k → AES-GCM 256. 키는 `extractable=false`, 메모리 전용. salt는 비밀이 아니므로 암호문과 함께 저장 — 새 기기가 패스프레이즈로 재파생할 수 있어야 "어디서든 재개"가 성립한다. |
| `src/lib/mask.ts` | 마스킹 후보 자동 추출 + 사전 적용. 그래프 122노드의 label·keywords 전체가 **절대 마스킹 금지 목록**(그걸 가리면 추출 신호가 사라진다). |
| `src/lib/conceptMatch.ts` | 로컬 매칭(칩·키워드) + LLM 결과 병합. |
| `src/lib/mastery.ts` | 개념별 숙련도 5단계. `studiedIds`(자기 체크)는 **일부러 보지 않는다** — SRS·퀴즈 실적만. |
| `src/lib/radial.ts` | 프로젝트 중심 방사형 배치. 도메인당 표시 상한 6. |
| `src/lib/extractPayload.ts` | 전송 payload 빌더 + 평문 잔존 검사. |
| `src/lib/extract.ts` | Edge Function 클라이언트. |
| `src/store/resumeStore.ts` | 금고 상태(none/locked/unlocked), 잠금 중 변형 차단, 직렬화된 persist. |
| `supabase/schema/resume_vault.sql` | RLS 테이블 + `save_resume_vault` (baseline 낙관적 동시성). |
| `supabase/functions/extract/` | 개념 추출. `question_cache`를 **읽지도 쓰지도 않는다**(전체 사용자 공유 캐시). |

## 설계상 반드시 지켜야 하는 것

- **평문은 절대 네트워크로 나가지 않는다.** `requestExtract(project, nodes)` 는
  payload를 **인자로 받지 않고 직접 만든다.** 받도록 두면 호출자가 검사를 통과한
  값을 스프레드로 덮어써서 검사되지 않은 내용을 보낼 수 있다(실제로 그랬다).
  전송 직전 `assertNoPlaintext` 재스캔이 유일한 권위다 — 타입 브랜드도, 객체가
  새것이라는 사실도 아니다(빌더는 배열을 참조로 담는다).
- **`requestExtract` 는 reject할 수 있다.** 마스킹 실패는 Outcome이 아니라 예외다.
  호출자에게 `try/catch` 가 필요하다 — `Promise<ExtractOutcome>` 서명에는 안 보인다.
- 평문 검사는 `!supabase` 확인보다 **앞에** 있다. 뒤에 두면 마스킹 실패가
  "로그인 필요"로 둔갑해 사용자가 로그인만 반복한다.
- 파생 키·평문을 `localStorage`/`sessionStorage`에 쓰지 않는다. 저장되는 것은
  salt + 암호문뿐이다.

## 배포 전 사람이 해야 할 일

`supabase/schema/resume_vault.sql` 을 SQL Editor에서 실행하고 3가지를 확인한다.

1. 테이블·RPC 생성.
2. 낡은 `p_baseline` → `NULL` 반환(충돌 감지).
3. **정상 왕복**: `updated_at` 을 읽어 그대로 `p_baseline` 으로 되돌려 넣고
   non-NULL 이 나오는지. PostgREST가 직렬화한 타임스탬프가 저장된 `timestamptz` 와
   같지 않으면 **모든 저장이 영구 충돌**이며, 이 코드의 어떤 테스트도 잡지 못한다.

## 다음에 안 밟을 함정

**검증 명령이 실제로 무엇을 검사하는지 확인하라.** `npx tsc --noEmit` 은 이
프로젝트에서 **파일 0개**를 검사하고 항상 성공한다(루트 `tsconfig.json` 이
`{"files": [], "references": [...]}`). `npx vite build` 도 타입 게이트가 아니다
(esbuild가 타입을 검사 없이 지운다). **실제 게이트는 `npm run build` 하나뿐이다.**
이 플랜은 13개 태스크 전부에 `--noEmit` 을 지시했고, 그래서 타입 오류 4건이
끝까지 살아남아 브랜치 빌드가 깨진 상태로 "전부 통과"로 보고됐다.

**"이건 우회 불가"를 주석에 쓰기 전에 우회를 시도해 보라.** 이 작업에서 같은
형태의 결함이 9건 나왔다 — 마스킹 allowlist 우회, JSON 이스케이프 스캔 우회,
잠긴 상태에서의 조용한 변형, LLM id 상한, 근거 문장 범위, payload 단일 경로,
타입 브랜드, "객체를 재사용하지 않는다"는 주장, throw를 쓰는 이유. 전부
**속성을 문장이 단언하고 코드는 강제하지 않음**이었다. 뚫리는 방어는 고치지 말고
없애라. 남겨두면 다음 사람이 그것을 믿는다.

## 알려진 한계

- 2글자 한글 키워드는 조사 허용목록으로 매칭한다. `-하다` 동사형은 아직 미스
  (`복제했다`·`인증했다`·`롤백했다`).
- `assertNoPlaintext` 와 `functions.invoke` 가 각각 `JSON.stringify` 하므로,
  비멱등 getter를 심은 `Project` 는 검사를 통과하고 다른 값을 보낼 수 있다.
  적대적 로컬 데이터가 전제이며 Edge Function의 `Array.isArray` 가드가 걸러낸다.
- `graph.json` 에 cloud/IaC/testing/build-tool 노드가 없어, 프로젝트 기반 면접
  (spec B)의 `qa`·`ops` 단계는 면접할 대상이 없다. 별도 콘텐츠 작업이 선행되어야 한다.
- `hw-cpu` 의 `파이프라인` 키워드는 CI/CD 서술문에 오탐으로 걸린다. 판단 보류.
