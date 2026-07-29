# AI 모의면접 — 리네이밍 + 전 도메인 확장

날짜: 2026-07-29
대상: `interview-map/` 의 '그래프 면접' 모드

## 배경

'그래프 면접' 탭은 개념 그래프를 점수로 순회하며 4단 사다리(rung)로 꼬리질문을 던지는
AI 대화형 모의면접이다. Network 도메인 파일럿으로 출시했고 의도대로 동작함을 확인했다.
두 가지 문제가 남았다.

1. **이름**: '그래프 면접'은 내부 구현(그래프 순회) 용어라서 사용자가 무엇을 얻는지 알 수 없다.
2. **범위**: Network 한 도메인에 고정되어 있다. 그래프에는 13개 도메인이 있고 `notes/` 도
   13개 전부 커버한다.

## 목표

- 탭 이름을 사용자 언어로 바꾼다 → **AI 모의면접**
- 시작 화면에서 13개 도메인 중 하나를 골라 시작할 수 있게 한다

## 비목표

- 질문 생성 지연 개선. 원인이 Edge Function 왕복인지 모델 추론시간인지 계측이 먼저다 → 다음 이터레이션.
- 크로스도메인 crosslink 순회 확장(브리지 1홉은 현행 유지).
- 파일명·심볼 리네이밍(`GraphInterviewView`, `graphWalk`, `gi-` CSS 접두사). 내부 구현은 실제로
  그래프 순회이므로 정확한 이름이고, 바꾸면 diff만 커진다.

## 설계

### 1. 리네이밍 (UI 문구만)

| 위치 | before | after |
|---|---|---|
| `QuizTab.tsx` 탭 라벨 | 그래프 면접 | AI 모의면접 |
| 탭 아이콘 | `LuNetwork` (그래프 은유) | 대화형 아이콘 |
| 시작 버튼 | 면접 시작 (Network) | 모의면접 시작 |
| 로그인 안내 | 로그인하면 그래프 면접을… | 로그인하면 AI 모의면접을… |
| 종료 요약 | 면접 종료 — | 모의면접 종료 — |

### 2. 도메인 선택

**`src/lib/domains.ts` (신규)**

```ts
export interface DomainOption { id: string; label: string; nodeCount: number }
export function listDomains(nodes: GraphNode[]): DomainOption[]
```

- level 0 노드에서 `{id, label}` 을 얻는다 (도메인 루트가 곧 도메인 정의)
- `nodeCount` = 해당 도메인의 level ≥ 1 노드 수 = 실제 면접 가능한 개념 수
- 정렬: `nodeCount` 내림차순, 동수면 `label` 오름차순 → 내용 많은 도메인이 위로
- 하드코딩 목록 없음. 노드를 추가하면 자동 반영된다.

**`graphWalk.pickStart`**

`net-http` 특수 케이스를 제거하고 "그 도메인의 첫 L1 노드, 없으면 첫 노드"로 단순화한다.
`graph.json` 의 노드 순서가 곧 학습 순서이므로 도메인마다 자연스러운 입구가 나오고,
network 는 여전히 `net-http` 로 시작해 파일럿 동작이 보존된다.
"자식이 가장 많은 L1" 규칙은 network 에서 `net-tcp` 를 골라 검증된 동작을 바꾸므로 채택하지 않는다.

**`GraphInterviewView`**

- `const START_DOMAIN = 'network'` → `const [domain, setDomain] = useState('network')`
- `sub` 메모가 `domain` 에 의존
- 시작 전 화면에 `<select>` 하나 (라벨 + 개념 수). 면접 중에는 감춘다.
- `isBridge` / 크로스도메인 안내 문구가 선택 도메인 기준으로 동작
  (하드코딩된 "Network → X" 문구도 선택 도메인 라벨로)

### 3. 함께 고치는 버그

`recordQuizResult('network', …)` 가 도메인 리터럴로 고정되어 있다. 브리지 노드(예: java 개념)에서
받은 점수가 network 통계에 적립된다. `domainOf(cur)` 로 고친다.

### 4. 자료 부족 도메인

design/security 는 level ≥ 1 노드가 4개뿐이라 면접이 짧게 끝난다. 별도 처리는 하지 않는다 —
질문 생성이 재료 부족을 판단하면 이미 `skip` → '다음 개념' 경로로 빠지고, 노드가 마르면
`nextNode` 가 `null` 을 반환해 정상 종료된다.

## 테스트

- `domains.test.ts` — 목록 유도(level 0 → 옵션), `nodeCount` 가 level ≥ 1만 세는지, 정렬 순서
- `graphWalk.test.ts` — `pickStart` 에 도메인별 케이스 추가: network → 첫 L1(`net-http`) 유지,
  다른 도메인도 그 도메인의 첫 L1 반환, L1 이 없으면 첫 노드
- 기존 216개 테스트 + `tsc --noEmit` + `npm run build` 통과
