# CLAUDE.md

이 저장소는 **CS / 알고리즘 학습 + 한국 IT 백엔드 인터뷰 준비**용 공개 저장소입니다.
주니어 개발자도 참고할 수 있도록 공개(public)로 운영합니다.

- 알고리즘 일정: `STUDY_PLAN.md`
- CS 개념 노트: `notes/`
- 지식 그래프 앱: `interview-map/` (semantic-zoom으로 개념 간 연결을 탐색하는 웹앱)

> **`interview-map/` 타입 검증은 `npm run build` 로만 한다.**
> `npx tsc --noEmit` 은 파일 0개를 검사하고 항상 성공한다 (루트 `tsconfig.json` 이
> `{"files": [], "references": [...]}`). `npx vite build` 도 게이트가 아니다
> (esbuild가 타입을 검사 없이 지운다). `npm run build` = `tsc -b && vite build`.

> ⚠️ 이 repo는 **공개**입니다. 회사 기밀·개인 이력·프로젝트 상세는 절대 커밋하지 마세요.
> (그런 내용은 별도 private repo에서 관리)

---

## 학습 방식 (Teaching Pattern) — 모든 모듈/문제 공통

매 학습 단위마다 다음 순서를 따릅니다:

```
1. 비유부터    — 일상/웹개발 비유로 개념 도입 (e.g., 스택 = 접시 쌓기)
2. 문제/개념 정의
3. 핵심 아이디어 + 다이어그램 (ASCII art OK)
4. Solution / 코드 (Java 11)
5. 핵심 포인트 (왜 이렇게? 자주 하는 실수)
6. 패턴 정리표 (비교/선택 기준)
7. 다음 단계 제안 ("X로 갈까요? 아니면 Y?")
```

**한 번에 하나씩**. 문제/개념을 한꺼번에 쏟지 말 것. 사용자 응답을 기다린 후 다음 단계.

인터뷰 모듈은 추가로:
- "예상 질문 3~5개" + "답변 구조 템플릿" 포함
- 학습 목표를 "X 질문에 5분간 답할 수 있게" 형태로 명시

---

## Language rule

Korean is for **what the reader sees**. English is for everything else.

| Korean | English |
|--------|---------|
| `notes/**/*.md` — the app renders these | chat answers, commit messages |
| UI strings in components (버튼·라벨) | `docs/**` specs and worklogs |
| `GuideView` copy | code comments, test names |

---

## 코드 작성 규칙 (Java 11)

### 입출력 표준 (BOJ 기준)
```java
BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
StringBuilder sb = new StringBuilder();
StringTokenizer st = new StringTokenizer(br.readLine());
// ...
System.out.print(sb);
```
- `Scanner` 절대 사용 금지 (느림)
- 출력은 항상 `StringBuilder` 모아서 한 번에
- 큰 입력에서는 `split(" ")` 보다 `StringTokenizer` 사용

### 컬렉션 선택
| 필요 | 사용 |
|------|------|
| Stack | `Deque<T> stack = new ArrayDeque<>()` (절대 `Stack` 클래스 X) |
| Queue | `Deque<T> q = new ArrayDeque<>()` |
| Deque | 동일 |
| Map | `Map<K,V> = new HashMap<>()` (인터페이스로 받기) |
| Set | `Set<E> = new HashSet<>()` |
| 정수 인덱스 매핑 | **배열 우선**, HashMap은 임의 키일 때만 |

### 자주 하는 실수 (코드 리뷰 시 반드시 체크)
- `switch` case에 `break` 빠짐 (fall-through)
- `String.split("")` (빈 문자열로 split → 글자 단위)
- `try-catch`로 분기 (느림 — `Character.isDigit` 등 사용)
- `pollFirst()` 결과를 `int` 로 받기 (NPE 위험 — `Integer`로 받고 null 체크)
- 매 반복마다 `br.readLine()` 호출 (입력 형식 먼저 확인)

---

## 파일/폴더 규칙

```
cs-study/
├── CLAUDE.md                ← 이 파일
├── STUDY_PLAN.md            ← 12주 알고리즘 일정
├── 01-data-structures/      ← **IntelliJ source root** (알고리즘 풀이 코드)
│   ├── Template.java        ← 새 문제 시작 템플릿 (default package)
│   ├── stack_queue/         ← = package stack_queue
│   ├── hash/                ← = package hash
│   └── ...
├── notes/                   ← 인터뷰 개념 노트 (markdown)
│   ├── 01-java-jvm/
│   ├── 02-os/
│   ├── 03-network/
│   ├── 04-database/
│   ├── 05-spring/
│   ├── 06-system-design/
│   └── 07-devops/
└── interview-map/           ← 지식 그래프 웹앱 (Vite + React + React Flow)
```

### 명명 규칙
- 알고리즘 풀이: `BOJ_<번호>.java` (예: `BOJ_10866.java`)
- 인터뷰 노트: `<주제>.md` (예: `notes/01-java-jvm/hashmap-internals.md`)
- 폴더명은 **언더스코어** 사용 (Java 패키지 호환). 하이픈/숫자시작 금지

### 패키지 선언
- **`01-data-structures/` 하나만 IntelliJ source root**로 마킹 (카테고리 폴더 각각이 아니다)
- 따라서 각 카테고리 폴더가 곧 패키지 → `hash/BOJ_1620.java` 는 `package hash;`
- BOJ 제출용 코드는 패키지 선언 제거하고 `public class Main`으로 변환

### IntelliJ가 `.java` 를 인식하지 못할 때
`.idea/` 는 gitignore 대상이라 클론·재설정 시 날아간다. 확인 순서:

| 파일 | 있어야 하는 것 |
|------|----------------|
| `.idea/cs-study.iml` | `<module type="JAVA_MODULE">` (`WEB_MODULE` 이면 Java 인덱싱이 안 붙는다) |
| 동일 | `<sourceFolder url="file://$MODULE_DIR$/01-data-structures" />` |
| `.idea/misc.xml` | `<component name="ProjectRootManager" ... languageLevel="JDK_11" project-jdk-name="ms-17" project-jdk-type="JavaSDK">` |

- 로컬에 JDK 11은 없다 (`ms-17` = Microsoft OpenJDK 17). **SDK 17 + language level 11** 로 두면
  Java 11에 없는 API를 쓸 때 IDE가 잡아준다.
- 컴파일 출력은 `out/` (gitignore 됨)
- IntelliJ가 켜진 상태에서 `.idea/*` 를 직접 고쳤으면 `File → Reload Project from Disk`

---

## 코드 리뷰 흐름 (사용자가 풀이를 보여줄 때)

1. **Read** 로 파일 읽기
2. 버그 식별 — 🔴 critical / 🟡 improvement / 🟢 style 분류
3. 각 버그마다 **잘못된 코드 → 왜 잘못됐는지 → 올바른 코드** 순서
4. 마지막에 **수정본 전체** 제공 (`<details>` 안에)
5. 이번에 배운 것을 **체크리스트 표** 로 정리

---

## Git 워크플로우

- 원격: `git@github-valorjj:valorjj/cs-study.git` (SSH, valorjj identity alias)
- **공개 repo** — 커밋 이메일은 GitHub noreply(`30681841+valorjj@users.noreply.github.com`) 사용 (개인 이메일 노출 금지)
- 학습 단위 끝나면 commit → push
- Co-Authored-By 줄 포함

---

## 하지 말 것

- 한 번에 너무 많은 문제/모듈 쏟아붓기 (소화 불가)
- 코드만 던져주고 끝내기 (왜 그런지 설명 필수)
- "Run successfully" 같은 의미 없는 확인 (실제로 동작 검증한 게 아님)
- 사용자 코드의 모든 줄 무비판 칭찬 (버그가 있으면 명확히 지적)
- BOJ 외부 사이트 URL 임의 생성 (실재하지 않을 수 있음)
- 렌더링되는 페이지 콘텐츠(`notes/`, UI 문자열)를 영어로 쓰기 — 독자는 한국어 사용자
- **회사 기밀·개인 이력·프로젝트 상세를 이 공개 repo에 커밋**
