# JVM 구조 & 메모리 & GC — 면접 답변 정리본

> 한국 IT 3년차 백엔드 면접용 Java/JVM 종합 정리 (Track B ⭐⭐⭐ "가장 자주").
> 진행 형식: 비유 → 다이어그램 → 코드 → 패턴 정리표 → 예상 면접 질문.

## 목차
- [T1. JVM 큰 그림 + 메모리 구조](#t1-jvm-큰-그림--메모리-구조) — 3파트 구조, Runtime Data Areas
- [T1.5 Class Loader](#t15-class-loader) — 로딩 단계, 부모 위임 모델
- [T2. Garbage Collection](#t2-garbage-collection) — 도달성, 세대, STW, GC 종류
- [T3. JIT 컴파일러](#t3-jit) — Hot spot, C1/C2/Tiered, 최적화
- [T4. 동시성 기초](#t4-동시성-기초-java-memory-model) — volatile/synchronized/happens-before

---

# T1. JVM 큰 그림 + 메모리 구조

**학습 목표**: *"JVM이 어떻게 동작하나요? 구조 설명해주세요"* 와 *"객체는 어디에, 지역변수는 어디에 저장되나요?"* 에 다이어그램 그리며 5분 답할 수 있다.

## 1. 비유 — 회사 사무실

| JVM 구역 | 사무실 비유 | 특징 |
|----------|-------------|------|
| **Heap** | 공용 창고 | 모두 공유. 객체(물건)가 쌓임. 청소부(GC)가 안 쓰는 것 치움 |
| **JVM Stack** | 직원 개인 책상 | 메서드 호출마다 서류 더미 쌓고, 끝나면 치움. **스레드마다 1개** |
| **Method Area (Metaspace)** | 회사 규정집·설계도 보관소 | 클래스 정보, static, 상수. 모두 공유 |
| **PC Register** | "지금 몇 번째 줄 작업 중" 포스트잇 | 스레드마다 현재 실행 위치 |
| **Native Method Stack** | 외부 업체(C/C++) 호출용 별도 책상 | JNI native 호출 |

핵심 직관: **공유되는 것(Heap, Method Area)** vs **스레드마다 따로인 것(Stack, PC, Native Stack)**. 이 경계가 동시성·GC의 출발점.

## 2. 개념 정의 (1줄)
> **JVM** = `.class` 바이트코드를 어떤 OS에서도 똑같이 실행하는 가상 머신. "Write Once, Run Anywhere"의 실체.
> 구성 3파트: **Class Loader → Runtime Data Areas → Execution Engine**.

## 3. 다이어그램 — JVM 전체 흐름
```
   .java  --javac-->  .class (바이트코드)
                          │
             ┌────────────▼─────────────┐
             │      1. Class Loader      │  로딩→링크(검증/준비/해석)→초기화
             └────────────┬─────────────┘
                          │ 클래스 정보 적재
   ┌──────────────────────▼──────────────────────────┐
   │           2. Runtime Data Areas (메모리)          │
   │                                                   │
   │  ┌─────── 공유 (모든 스레드) ───────┐              │
   │  │  Heap          Method Area       │              │
   │  │  (객체/인스턴스) (Metaspace:       │              │
   │  │   ← GC 대상     클래스메타/static) │              │
   │  └──────────────────────────────────┘              │
   │  ┌─── 스레드별 (Thread 마다 1세트) ───┐             │
   │  │  JVM Stack   PC Register   Native Stack │        │
   │  │  (스택프레임)  (실행위치)    (JNI)        │        │
   │  └────────────────────────────────────────┘        │
   └──────────────────────┬────────────────────────────┘
                          │
             ┌────────────▼─────────────┐
             │    3. Execution Engine    │
             │  Interpreter + JIT + GC   │
             └───────────────────────────┘
```

## 4. Runtime Data Areas 상세 (= "메모리 구조")

### ① Heap (공유) — 면접 핵심 ⭐
- **모든 객체(`new`)와 배열**이 사는 곳. GC의 주 무대.
- 세대(Generation)로 나뉨: **Young(Eden + Survivor 0/1) + Old**.
  - 대부분 객체는 금방 죽는다(weak generational hypothesis) → Young에서 빠르게 수거.
- `OutOfMemoryError: Java heap space`가 나는 곳.

### ② Method Area / Metaspace (공유)
- 클래스 메타데이터(필드/메서드 정보), **static 변수**, runtime constant pool.
- Java 7까지 = PermGen(Heap 내부, 크기 고정 → `OOM: PermGen`).
- **Java 8+ = Metaspace (native 메모리로 이동)** → 기본적으로 자동 확장. PermGen OOM 사라짐.

### ③ JVM Stack (스레드별)
- 메서드 호출 = **스택 프레임(Stack Frame)** 하나 push. 리턴하면 pop.
- 프레임 안: **지역 변수(local variable)**, 연산 스택(operand stack), 프레임 데이터.
- 재귀 너무 깊으면 `StackOverflowError`.

### ④ PC Register (스레드별)
- 현재 실행 중인 JVM 명령 주소. 스레드가 context switch 후 돌아와도 이어서 실행 가능.

### ⑤ Native Method Stack (스레드별)
- `native` 키워드 메서드(C/C++, JNI) 호출용 별도 스택.

## 5. 코드로 보는 "무엇이 어디에?"
```java
public class Order {
    static int totalCount = 0;      // Method Area (Metaspace) - static
    int price;                      // Heap - Order 객체의 필드

    void process() {                // process() 호출 → JVM Stack에 프레임 1개
        int tax = price / 10;       // Stack - 지역변수 (값 자체)
        Coupon c = new Coupon();    // 참조 c = Stack, new Coupon() 객체 = Heap
    }
}
```
```
Stack (이 스레드)          Heap (공유)
┌─────────────┐          ┌──────────────┐
│ process()   │          │ Order{price} │◄── 어딘가의 참조
│  tax = 5    │          │ Coupon{...}  │◄── c
│  c ─────────┼─────────►└──────────────┘
└─────────────┘
```
> 규칙: **참조 변수는 Stack, 실제 객체는 Heap**. primitive 지역변수는 값 자체가 Stack.

## 6. 핵심 포인트 (자주 하는 실수)
- 🔴 "객체는 Stack에 저장" — ❌ 객체는 **항상 Heap**. Stack엔 참조(주소)만.
- 🔴 "static은 Heap" — ❌ Java 8+에선 **Metaspace(native)**. (엄밀히 static이 가리키는 객체는 Heap)
- 🔴 "PermGen과 Metaspace 같다" — Java 8에서 **PermGen 제거 → Metaspace(native 메모리)로 대체**.
- 🟡 Stack은 스레드마다, Heap은 공유 → **그래서 Heap이 동시성 문제·GC의 대상**.
- 🟡 `StackOverflowError`(스택, 재귀) vs `OutOfMemoryError`(힙/메타스페이스) 구분.

## 7. 패턴 정리표 — 메모리 영역
| 영역 | 공유? | 저장 대상 | 에러 |
|------|-------|-----------|------|
| Heap | 공유 | 객체, 배열, 인스턴스 필드 | `OOM: Java heap space` |
| Method Area (Metaspace) | 공유 | 클래스 메타, static, 상수풀 | `OOM: Metaspace` |
| JVM Stack | 스레드별 | 스택프레임(지역변수, operand) | `StackOverflowError` |
| PC Register | 스레드별 | 현재 실행 명령 주소 | - |
| Native Method Stack | 스레드별 | JNI native 호출 | - |

## 8. 예상 면접 질문 + 답변 골격
**Q1. "JVM 구조를 설명해주세요."**
> ① Class Loader(로딩→링크→초기화) → ② Runtime Data Areas(Heap·Method Area는 공유, Stack·PC·Native는 스레드별) → ③ Execution Engine(Interpreter + JIT + GC). "한 번 컴파일된 바이트코드를 어느 OS서든 실행".

**Q2. "객체와 지역변수는 각각 어디에 저장되나요?"**
> ① `new` 객체는 **Heap** → ② 참조 변수·primitive 지역변수는 **Stack**(스레드별 프레임) → ③ static은 **Metaspace**. Stack의 참조가 Heap의 객체를 가리킴.

**Q3. "PermGen과 Metaspace 차이는?"**
> ① Java 7까지 클래스 메타는 PermGen(Heap 내부, 고정 크기) → 클래스 많으면 `OOM: PermGen` → ② Java 8부터 **Metaspace로 native 메모리 이동**, 자동 확장 → PermGen OOM 사라짐.

**Q4. "Stack과 Heap의 차이는?"**
> ① Stack=스레드별, 메서드 프레임(지역변수), LIFO, 빠름, 자동 회수(pop) → ② Heap=전 스레드 공유, 객체, GC가 회수 → ③ 그래서 동시성 이슈·GC 대상은 Heap.

**Q5. "StackOverflowError와 OutOfMemoryError 차이?"**
> ① SOE=Stack 초과(주로 무한/과도 재귀) → ② OOM=Heap(객체 과다) 또는 Metaspace(클래스 과다). 원인 영역이 다름.

---

# T1.5 Class Loader

**학습 목표**: *"클래스 로딩 과정을 설명해주세요"* 와 *"부모 위임 모델이 뭐죠?"* 에 5분 답할 수 있다.

## 1. 비유 — 신입사원 온보딩
| 온보딩 단계 | 비유 | 실제 |
|------------|------|------|
| 이력서 접수 | 서류를 캐비닛에 넣음 | **Loading** (`.class` → Method Area) |
| 서류 검증 | 위조 서류 아닌지 확인 | **Verification** |
| 책상 배정 | 기본 자리만 세팅(짐 X) | **Preparation** (static 기본값) |
| 부서 연결 | 협업 팀 연결 | **Resolution** (심볼릭→실제 참조) |
| 근무 시작 | 짐 풀고 업무 개시 | **Initialization** (static 실제값 + `static{}`) |

> 로딩은 **lazy(필요할 때)**, 초기화는 **처음 능동적으로 쓸 때 딱 한 번**.

## 2. 3단계 구조
```
 .class
   │
 1.Loading         바이트를 읽어 Method Area에 Class 객체 생성
   │
 2.Linking
   ① Verification  바이트코드 검증 (타입/스택 위반 등)
   ② Preparation   static 필드 "기본값"으로 메모리 확보 (0/null/false)
   ③ Resolution    심볼릭 참조("java/lang/String") → 실제 참조
   │
 3.Initialization  static 실제값 대입 + static{} 실행
```

## 3. 코드로 보는 Preparation vs Initialization
```java
public class Config {
    static int count = 10;   // Preparation: count=0 → Initialization: count=10
    static String name;      // Preparation: name=null (초기화값 없음)
    static { System.out.println("init!"); }  // Initialization 때 실행
}
```
> Preparation 시점엔 `count`가 **10이 아니라 0**. 실제값 10은 Initialization에서 대입.

## 4. 부모 위임 모델 (Parent Delegation) ⭐
```
   Bootstrap ClassLoader   (C++ 구현) — java.base: String, Object 등 핵심 API
        │
   Platform(Extension) ClassLoader — 확장 라이브러리
        │
   Application(System) ClassLoader — 우리 앱 classpath
```
동작: 요청 오면 **부모에게 먼저 위임 → 부모가 못 찾을 때만 자신이 로딩**.
- **왜?** 핵심 API(`String`) 위조 방지(**보안**) + 클래스 중복 로딩 방지(**유일성**).
- **클래스 동일성 = FQCN + 로더** 조합. 로더 다르면 같은 이름도 다른 클래스로 취급.

## 5. 핵심 포인트 (자주 하는 실수)
- 🔴 "JVM 시작 시 클래스 전부 로딩" — ❌ **lazy 로딩** (첫 `new`/static 접근 시).
- 🔴 "Preparation에서 static 초기값 대입" — ❌ 그땐 **기본값(0/null)**, 실제값은 Initialization.
- 🟡 static final 컴파일 타임 상수 참조는 클래스 초기화를 **유발하지 않음**.

## 6. 정리표 — 로딩 단계
| 단계 | 하는 일 | 대표 에러 |
|------|---------|-----------|
| Loading | `.class` → Class 객체 | `ClassNotFoundException` / `NoClassDefFoundError` |
| Verification | 바이트코드 검증 | `VerifyError` |
| Preparation | static 기본값 메모리 확보 | - |
| Resolution | 심볼릭→실제 참조 | `NoSuchMethodError` |
| Initialization | static 실제값 + `static{}` | `ExceptionInInitializerError` |

## 7. 예상 면접 질문 + 답변 골격
**Q1. "클래스 로딩 과정?"**
> Loading → Linking(Verification/Preparation/Resolution) → Initialization. lazy하게 로딩.

**Q2. "부모 위임 모델이 뭐고 왜?"**
> Bootstrap→Platform→Application 계층. 부모에게 먼저 위임, 부모가 못 찾을 때만 자신이 로딩. 핵심 API 위조 방지(보안)+중복 로딩 방지(유일성).

**Q3. "ClassNotFoundException vs NoClassDefFoundError?"**
> 전자=런타임에 이름으로 찾다가 없음(Exception, 복구 시도 가능). 후자=컴파일 땐 있었는데 실행 시점에 사라짐(Error, 클래스패스 문제).

---

# T2. Garbage Collection

**학습 목표**: *"GC가 어떤 객체를 수거하나요?"* / *"STW가 뭐죠?"* / *"G1 특징은?"* 에 다이어그램 그리며 5분 답할 수 있다.

## 1. 비유 — 카페 테이블 정리
손님(객체)이 나가면(참조 끊기면) 알바(GC)가 테이블(Heap)을 치움. "손님 나갔나?"는 입구(GC Root)에서 연결되는지로 판단. 대부분 손님은 커피 한 잔 하고 금방 나감(단명) → 입구 근처(Young)를 자주 청소.

## 2. 핵심 원리 두 가지
### ① 도달성 (Reachability) — "누가 쓰레기인가"
```
[GC Roots]                 Heap
 ├ 스택 지역변수 ─► ObjectA ─► ObjectB   (도달 가능 = live)
 ├ static 필드 ──► ObjectC
 └ ...             ObjectD ─► ObjectE    (Root에서 도달 불가 = 쓰레기)
                   (D↔E 서로 참조해도 Root 미연결이면 둘 다 수거)
```
- 참조 카운팅 아님 → **도달성 기반**. 그래서 **순환 참조도 정상 수거**.
- GC Root: 스택 지역변수, static 필드, JNI 참조 등.

### ② 세대 가설 (Weak Generational Hypothesis)
> "대부분 객체는 생성되자마자 곧 죽는다." → Heap을 세대로 분할.
```
┌──────────── Heap ─────────────────────┐
│  Young Generation        Old Generation │
│  ┌──────┬────┬────┐    ┌─────────────┐ │
│  │ Eden │ S0 │ S1 │    │ Old(Tenured)│ │
│  └──────┴────┴────┘    └─────────────┘ │
│   새 객체   Survivor      오래 살아남은   │
└─────────────────────────────────────────┘
```

## 3. 객체의 일생 — Minor GC → 승격 → Major GC
```
1. new → Eden 생성
2. Eden 꽉 참 → [Minor GC]: 생존자만 S0로 복사, Eden 비움
3. 다음 Minor GC → S1로 복사(S0↔S1 왕복), age++
4. age 임계치(기본 15) 초과 → Old로 [승격]
5. Old 꽉 참 → [Major/Full GC] (느림, STW 김)
```
- **Minor GC**: Young 청소. 자주·빠름·STW 짧음.
- **Major GC**: Old 청소. 드물지만 느림·STW 김 → 성능 문제 주범.
- Survivor가 2개인 이유: 생존자를 한쪽으로 몰아 복사 → **단편화 방지**(항상 하나는 비어있음).

## 4. STW (Stop-The-World)
GC가 도달성을 정확히 계산하려면 객체 그래프가 멈춰야 함 → **모든 앱 스레드 정지**. STW 동안 앱 응답 불가(지연·타임아웃). GC 발전사 = **STW 줄이기의 역사**.

## 5. GC 종류 비교표 ⭐
| GC | 특징 | STW | 적합 |
|----|------|-----|------|
| **Serial** | 단일 스레드 | 김 | 작은 앱, 단일 CPU |
| **Parallel** (Java 8 기본) | 멀티 스레드(처리량 위주) | 중간 | 배치, 처리량 |
| **CMS** (deprecated) | Old를 앱과 동시 청소 | 짧음 | 저지연(→G1로 대체) |
| **G1** (Java 9+ 기본) ⭐ | Heap을 Region으로 쪼개 쓰레기 많은 곳부터 | 예측·짧음 | 대용량 힙, 범용 |
| **ZGC / Shenandoah** | 대부분 concurrent | <1ms | 초저지연·초대용량 |

- **G1**: Young/Old를 물리 분할 안 하고 Heap을 다수 **Region**으로 분할, 쓰레기 많은 Region부터(**Garbage First**). STW 목표 시간 내 예측 관리.
- **ZGC**: 거의 모든 작업 concurrent → STW가 힙 크기와 무관하게 극소.

## 6. 핵심 포인트 (자주 하는 실수)
- 🔴 `System.gc()`는 **"요청"일 뿐** 실행 보장 없음 → 실무 호출 금지(Full GC 강제 위험).
- 🔴 "GC 있으니 누수 없다" ❌ — **도달 가능한데 안 쓰는 객체**(static 컬렉션에 계속 add 등)는 수거 안 됨 → 누수 발생.
- 🟡 `finalize()` 쓰지 말 것(deprecated) → 정리는 `try-with-resources`.
- 🟡 Minor GC도 STW 있음(짧을 뿐). "Minor는 STW 없다"는 틀림.

## 7. 예상 면접 질문 + 답변 골격
**Q1. "GC가 어떤 객체를 수거하나요?"**
> 도달성 기반. GC Root(스택 지역변수·static)에서 참조 사슬로 도달 가능하면 live, 못 하면 쓰레기. 순환 참조도 Root 미도달이면 수거.

**Q2. "Heap을 왜 세대로 나누나요?"**
> weak generational hypothesis — 대부분 금방 죽으므로 Young을 자주 빠르게(Minor GC) 청소해 적은 비용으로 대부분 회수. 오래 산 것만 Old 승격.

**Q3. "Minor vs Major GC?"**
> Minor=Young, 자주·빠름·STW 짧음. Major(Full)=Old, 드물지만 느림·STW 길어 성능 주범.

**Q4. "STW가 뭐고 왜?"**
> 그래프 정확 스캔 위해 앱 스레드 전부 정지. 길면 지연·타임아웃 → G1/ZGC가 STW 최소화로 발전.

**Q5. "G1 특징?"**
> Heap을 Region으로 쪼개 쓰레기 많은 Region부터 회수. STW 목표 시간 내 예측 관리. Java 9+ 기본, 대용량 힙 적합.

---

# T3. JIT

**학습 목표**: *"JIT가 뭐죠?"* / *"인터프리터 있는데 왜 JIT?"* / *"warm-up이 왜 필요?"* 에 5분 답할 수 있다.

## 1. 비유 — 통역사의 요령
처음엔 한 문장씩 즉석 통역(Interpreter). "이 문장 100번째네?" → 미리 번역 카드로 만듦(JIT). 카드 만드는 비용이 있으니 **자주 나오는 문장만** 카드화. = 번역 비용 vs 재사용 이득 트레이드오프.

## 2. 정의
> **JIT** = 런타임에 자주 실행되는 바이트코드를 **기계어로 컴파일해 code cache에 저장**, 이후 호출은 인터프리터 없이 기계어 직행. 미리(AOT)도 매번(순수 인터프리터)도 아닌 **딱 필요한 시점** 컴파일.

## 3. Hot Spot 감지
```
┌ 메서드 호출 카운터
└ 백엣지 카운터(루프 횟수)
      │ 임계치 초과 → hot spot
      ▼ 백그라운드 스레드가 컴파일 (앱은 인터프리터로 계속 실행)
   code cache에 기계어 저장 → 다음 호출부터 기계어
```
- 실행 중 루프를 컴파일본으로 갈아타는 **OSR(On-Stack Replacement)** 도 존재.

## 4. C1 / C2 / Tiered ⭐
| | C1 (Client) | C2 (Server) |
|--|-------------|-------------|
| 목표 | 빠른 컴파일(가벼운 최적화) | 고강도 최적화(느린 컴파일) |
| 언제 | 초반·적당히 뜨거움 | 아주 뜨거움 |

**Tiered Compilation (Java 8+ 기본)**: 인터프리터(L0) → C1(L1~3, 프로파일 수집) → C2(L4, 최고 강도). 시작 지연↓ + 정점 성능↑.

## 5. 대표 최적화
| 기법 | 내용 |
|------|------|
| 메서드 인라이닝 | 작은 메서드를 호출부에 삽입(호출 오버헤드 제거, 가장 강력) |
| 탈최적화(Deopt) | 최적화 가정이 틀리면 인터프리터로 되돌림 |
| 에스케이프 분석 | 탈출 안 하는 객체는 Heap 대신 스택 할당/제거 |
| 루프 언롤링/죽은 코드 제거 | 반복 펼치기, 안 쓰는 분기 삭제 |
> ⭐ 에스케이프 분석 → "객체는 무조건 Heap"(T1)의 예외. 탈출 안 하면 스택/레지스터 처리로 GC 부담↓.

## 6. 핵심 포인트 (자주 하는 실수)
- 🔴 "자바는 인터프리터라 느리다" ❌ — warm-up 후엔 C++ 근접. 초반만 느림.
- 🔴 "javac가 최적화" ❌ — javac는 바이트코드 변환만, **진짜 최적화는 런타임 JIT**.
- 🟡 **Warm-up**: 시작 직후엔 인터프리터라 느림 → JMH 벤치마크가 warm-up 구간 제외, 서버 배포 직후 첫 요청이 느린 이유.
- 🟡 code cache 꽉 차면 JIT 중단(`-XX:ReservedCodeCacheSize`).

## 7. 정리표 — Interpreter vs JIT vs AOT
| | Interpreter | JIT | AOT |
|--|-------------|-----|-----|
| 컴파일 시점 | 안 함 | 런타임(hot spot) | 실행 전 |
| 시작 속도 | 빠름 | 빠름 | 느림 |
| 정점 성능 | 느림 | 빠름 | 빠름 |
| 최적화 정보 | - | 런타임 프로파일(최다) | 정적 분석만 |
| 플랫폼 | 독립 | 독립 | 종속 |

## 8. 예상 면접 질문 + 답변 골격
**Q1. "JIT가 뭔가요?"**
> 런타임에 hot spot 바이트코드를 기계어로 컴파일해 code cache에 저장, 이후 기계어 직행. 인터프리터로 즉시 시작 + 뜨거운 코드만 컴파일해 시작·정점 성능 둘 다 확보.

**Q2. "인터프리터 있는데 왜 JIT?"**
> 인터프리터는 반복 실행이 느림. JIT가 캐싱하면 수십 배 빨라지고 런타임 프로파일 기반이라 정적 컴파일러보다 공격적 최적화 가능.

**Q3. "C1/C2/Tiered?"**
> C1=빠른 컴파일, C2=고강도 최적화. Tiered는 인터프리터→C1→C2 단계 상승. Java 8+ 기본.

**Q4. "warm-up이 왜 필요?"**
> 시작 직후엔 JIT 컴파일 전이라 인터프리터로 돎, 실행이 쌓여 hot spot 컴파일되면 빨라짐. 배포 직후 첫 요청이 느리고 벤치마크가 warm-up 제외하는 이유.

---

# T4. 동시성 기초 (Java Memory Model)

**학습 목표**: *"volatile vs synchronized?"* / *"happens-before가 뭐죠?"* / *"count++ 스레드 안전하게?"* 에 5분 답할 수 있다. (출발점: Stack=스레드별, Heap=공유 → 공유하니 문제 발생)

## 1. 비유 — 화이트보드와 각자 수첩
공용 화이트보드(main memory=Heap) + 직원별 수첩(CPU 캐시). 화이트보드를 수첩에 베껴 작업 → A가 고쳐도 B 수첩엔 옛값(가시성 문제). 둘이 동시에 +1하면 갱신 유실(원자성 문제).

## 2. 세 가지 문제
- **① 가시성**: `flag=true` 썼는데 다른 스레드가 캐시의 옛 `false`만 봄 → 무한 루프.
- **② 원자성**: `count++`는 read→+1→write 3단계, 겹치면 갱신 유실.
- **③ 재배치**: 컴파일러/CPU가 명령 순서 변경 → 다른 스레드가 중간 상태 목격.

## 3. volatile (가시성 + 순서)
```java
private volatile boolean flag = false;
```
- 읽기/쓰기 시 **항상 main memory 직행**(가시성) + 앞뒤 재배치 방지(메모리 배리어).
- ⚠️ **원자성 없음**: `count++`는 volatile 붙여도 깨짐.

## 4. synchronized (원자성 + 가시성)
```java
public synchronized void increment() { count++; }
synchronized (lock) { count++; }
```
- 상호 배제 → **원자성**. 락 해제 시 flush/획득 시 로드 → **가시성**.
- 모든 객체가 가진 **모니터 락**을 진입 시 획득/나갈 때 해제. 범위는 최소화(경쟁 시 성능↓).

## 5. happens-before ⭐
JMM의 순서 보장 규칙. A happens-before B면 A 결과를 B가 반드시 봄.
| 규칙 | 내용 |
|------|------|
| 프로그램 순서 | 한 스레드 내 코드 순서 |
| 모니터 락 | unlock → 다음 lock |
| volatile | 쓰기 → 이후 읽기 |
| Thread.start/join | start 전 작업이 새 스레드에/스레드 작업이 join 후 보임 |
> volatile·synchronized의 가시성 보장 근거 = happens-before 성립.

## 6. 핵심 포인트 (자주 하는 실수)
- 🔴 "volatile이면 스레드 안전" ❌ — 원자성 없음. 카운터엔 synchronized/AtomicInteger.
- 🔴 헷갈리지 말 것: **volatile=가시성/순서, synchronized=원자성+가시성**.
- 🟡 카운터는 `AtomicInteger.incrementAndGet()`(CAS, 논블로킹)이 효율적.
- 🟡 락 범위 넓으면 성능↓·데드락 위험.

## 7. 정리표
| | volatile | synchronized | Atomic(CAS) |
|--|----------|--------------|-------------|
| 가시성 | ✅ | ✅ | ✅ |
| 원자성 | ❌ | ✅ | ✅(단일 변수) |
| 순서 | ✅ | ✅ | ✅ |
| 블로킹 | 무 | 유(락 대기) | 무(재시도) |
| 용도 | 상태 플래그 | 복합 연산·임계영역 | 카운터·단일 변수 |

## 8. 예상 면접 질문 + 답변 골격
**Q1. "volatile vs synchronized?"**
> volatile=가시성/순서만(원자성 X)→상태 플래그. synchronized=상호 배제로 원자성+가시성→복합 연산. 후자는 락 비용 있음.

**Q2. "멀티스레드에서 값이 왜 안 보이나요?"**
> 각 스레드가 값을 CPU 캐시에 복사해 써서, main memory 반영 전이면 옛값을 봄. volatile/synchronized로 happens-before를 성립시켜 해결.

**Q3. "happens-before?"**
> JMM 순서 보장 규칙. A hb B면 A 결과를 B가 반드시 봄. unlock→lock, volatile 쓰기→읽기, start/join 등이 근거.

**Q4. "count++ 스레드 안전하게?"**
> read-modify-write 3단계라 volatile 불가. synchronized로 감싸거나 AtomicInteger.incrementAndGet()(CAS, 논블로킹).

---
