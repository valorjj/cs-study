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

## 9. TLAB (Thread-Local Allocation Buffer) — Heap 할당 성능

**비유**: 공용 창고(Heap)에 물건 하나 넣을 때마다 창고 관리자와 자물쇠 다툼을 하면 느림. 그래서 각 직원에게 **창고 안에 개인 전용 칸(TLAB)**을 미리 배정 → 대부분의 물건은 그 칸에 **락 없이** 넣음.

- Heap(정확히는 Eden)은 **모든 스레드가 공유**하는 영역이라, 객체를 `new` 할 때마다 포인터 증가(bump-the-pointer) 위치를 잠그면 스레드 경쟁이 심해짐.
- JVM은 스레드마다 Eden 내에 작은 **전용 버퍼(TLAB)**를 미리 할당 → 대부분의 `new`는 **CAS/락 없이 TLAB 안에서 포인터만 증가**시켜 끝남.
- TLAB이 꽉 차면: ① 새 TLAB을 다시 할당받거나 ② (남은 공간이 애매하면) 공유 Eden 영역에서 직접 slow-path 할당(락 필요).
- 큰 배열처럼 애초에 TLAB보다 큰 객체는 TLAB을 거치지 않고 바로 공유 Eden(또는 Old, "대형 객체 직행")에 할당될 수 있음.

```
Eden (공유)
┌───────────────────────────────────────────┐
│ [Thread-A TLAB] [Thread-B TLAB] [free ...] │
│  new Obj1 ─┐      new Obj3 ─┐              │
│  new Obj2 ◄┘      new Obj4 ◄┘              │
└───────────────────────────────────────────┘
```
> TLAB은 **에스케이프 분석(T3) 실패로 Heap에 할당될 수밖에 없는 객체**들이 그나마 빠르게 할당되도록 하는 장치. 즉 "스칼라 치환/스택 할당"이 1차 방어선, TLAB은 2차(Heap 할당이 어차피 필요할 때 빠르게).

## 10. 꼬리 질문 (Follow-up)
**Q. "그럼 Metaspace도 OutOfMemoryError가 나나요?"**
> 난다. 기본값은 사실상 무제한(native 메모리 한계까지 자동 확장)이라 PermGen 때처럼 쉽게 안 나지만, `-XX:MaxMetaspaceSize`로 상한을 걸었거나, **클래스로더 누수**(동적 프록시/리플렉션/플러그인 시스템에서 클래스로더를 계속 새로 만들고 안 버리는 경우)로 클래스 메타데이터가 무한 누적되면 `OutOfMemoryError: Metaspace`가 발생한다. 원인은 대개 "클래스가 언로드되지 않는다" = 그 클래스를 로드한 **클래스로더 자체가 GC되지 않는다"는 뜻.

**Q. "TLAB이 꽉 차면 무슨 일이 일어나나요?"**
> 남은 공간이 충분히 크면 그 스레드에게 새 TLAB을 재할당하고, 애매하게 작으면 그 요청만 공유 Eden에서 직접 락을 잡고 slow-path로 할당한다. TLAB 크기는 JVM이 스레드별 할당 속도 통계를 보고 **동적으로 조정**한다(너무 작으면 slow-path가 잦아지고, 너무 크면 스레드 수가 많을 때 Eden이 금방 참).

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

**꼬리 Q1-1. "참조 카운팅 방식과 비교하면 도달성 방식의 장점이 뭔가요?"**
> 참조 카운팅은 카운트만 보므로 서로를 참조하는 순환 구조는 카운트가 0이 안 돼 영영 못 치웁니다. 도달성(mark-sweep 계열)은 GC Root에서 실제로 닿는지를 보므로 순환이라도 Root에서 끊기면 통째로 수거됩니다. 대신 도달성은 전체 그래프를 훑어야 해 순간 비용(STW)이 크다는 트레이드오프가 있습니다.

**꼬리 Q1-2. "GC Root에는 구체적으로 어떤 것들이 있나요?"**
> 실행 중인 스레드의 스택 프레임 안 지역변수·파라미터, 클래스의 static 필드, JNI로 네이티브 코드가 붙잡고 있는 참조, 그리고 실행 중인 스레드 객체 자체 등입니다. 요지는 "지금 코드가 실제로 접근할 수 있는 시작점"이라는 것.

**Q2. "Heap을 왜 세대로 나누나요?"**
> weak generational hypothesis — 대부분 금방 죽으므로 Young을 자주 빠르게(Minor GC) 청소해 적은 비용으로 대부분 회수. 오래 산 것만 Old 승격.

**Q3. "Minor vs Major GC?"**
> Minor=Young, 자주·빠름·STW 짧음. Major(Full)=Old, 드물지만 느림·STW 길어 성능 주범.

**꼬리 Q3-1. "객체가 Young에서 Old로 승격되는 기준은 뭔가요?"**
> 기본은 나이(age) — Survivor 영역을 왕복하며 Minor GC를 넘길 때마다 age가 오르고 `-XX:MaxTenuringThreshold`를 넘으면 Old로 승격됩니다. 여기에 더해 Survivor가 꽉 차면 나이와 무관하게 조기 승격(premature promotion)이 일어나, 원래 금방 죽었을 객체가 Old를 오염시켜 Full GC를 앞당기기도 합니다.

**꼬리 Q3-2. "Full GC가 너무 잦다면 어디부터 의심하나요?"**
> ① 메모리 누수 — 회수해도 Old 사용량이 안 줄고 계속 참(컬렉션에 무한 축적, 캐시 미해제). ② 힙/Young이 작아 승격이 폭주. ③ 코드·라이브러리의 `System.gc()` 호출. ④ (Full GC로 잡히는 경우) Metaspace 부족. GC 로그에서 "회수 후에도 Old 사용량이 안 떨어지는지"를 먼저 봅니다.

**Q4. "STW가 뭐고 왜?"**
> 그래프 정확 스캔 위해 앱 스레드 전부 정지. 길면 지연·타임아웃 → G1/ZGC가 STW 최소화로 발전.

**꼬리 Q4-1. "STW가 길어지면 서비스에 어떤 증상으로 나타나나요?"**
> 순간적으로 모든 요청 처리가 멈추므로 p99/p999 지연이 튀고, 임계 시간을 넘으면 요청 타임아웃·커넥션 풀 고갈이 옵니다. 헬스체크까지 STW에 걸려 실패하면 로드밸런서가 정상 인스턴스를 죽었다고 판단해 빼버리는 2차 장애로 번지기도 합니다.

**꼬리 Q4-2. "그 STW를 실제로 어떻게 진단하나요?"**
> GC 로그(`-Xlog:gc*`, 구버전은 `-XX:+PrintGCDetails`)로 각 pause의 원인·시간을 보고, `jstat -gcutil`로 세대별 사용률과 GC 횟수·누적 시간을 추적합니다. APM의 pause 지표와 애플리케이션 지연 그래프의 스파이크 시점을 맞춰보면 "지연이 GC 때문인지"를 분리할 수 있습니다.

**Q5. "G1 특징?"**
> Heap을 Region으로 쪼개 쓰레기 많은 Region부터 회수. STW 목표 시간 내 예측 관리. Java 9+ 기본, 대용량 힙 적합.

**꼬리 Q5-1. "G1으로 부족해서 ZGC/Shenandoah를 고르는 기준은 뭔가요?"**
> 힙이 수십~수백 GB로 크고 pause를 한 자릿수 ms로 눌러야 하는 초저지연 서비스면 ZGC/Shenandoah가 유리합니다(대부분의 작업을 앱과 동시에 수행해 STW가 힙 크기에 거의 비례하지 않음). 반대로 수 GB~수십 GB 힙에서 "목표 pause 안에서 알아서 관리"로 충분하면 G1이 기본값으로 무난합니다. 공짜는 아니고 동시 수행 overhead로 처리량(throughput)은 다소 손해 봅니다.

## 8. Reference Types — "도달 가능"에도 등급이 있다 ⭐

**비유**: 회사 창고 물건에 "절대 못 버림" / "웬만하면 안 버림, 급하면 버림" / "필요없어지면 바로 버려도 됨" / "버릴 때 알림만 해줘" 라는 4단계 꼬리표를 붙이는 것.

일반적인 참조(`Object o = new Object()`)는 전부 **Strong Reference** — GC Root에서 도달 가능하면 절대 수거 안 됨. 그 외 3종류는 `java.lang.ref` 패키지가 제공.

```
강도:  Strong  >  Soft  >  Weak  >  Phantom
       (안 지움)  (메모리   (다음 GC   (참조 불가,
                  부족시     때 무조건   수거 "완료
                  지움)      지움)      알림"용)
```

| 종류 | GC 동작 | 대표 용도 |
|------|---------|-----------|
| **Strong** | 도달 가능하면 절대 수거 안 됨 | 일반 변수/필드 (기본값) |
| **Soft (`SoftReference`)** | 도달 가능해도 **메모리 부족할 때만** 수거 (평소엔 살려둠) | 메모리 캐시 (이미지 캐시 등) |
| **Weak (`WeakReference`)** | **다음 GC 사이클에 무조건** 수거 (메모리 여유와 무관) | `WeakHashMap`, 캐시 키, 리스너 콜백 |
| **Phantom (`PhantomReference`)** | `get()`이 항상 `null` — 참조 자체로는 객체를 못 씀. `finalize()`보다 안전하게 "이 객체가 실제로 메모리에서 회수됐다"를 `ReferenceQueue`로 통지받기 위함 | 네이티브 리소스 정리(`Cleaner`), off-heap 메모리 해제 |

### WeakHashMap 동작 예시
```java
Map<Key, Value> cache = new WeakHashMap<>();
Key k = new Key("session-123");
cache.put(k, new Value());
k = null;                 // 강한 참조 끊김 → 다음 GC 때 엔트리 자동 제거
```
- `WeakHashMap`은 **key**를 WeakReference로 감싼다. key에 대한 strong reference가 사라지면, 사용자가 `remove()`를 호출하지 않아도 다음 GC 때 엔트리가 알아서 사라짐.
- 세션 캐시, 리스너 등록 테이블처럼 **"key가 살아있는 동안만 값도 필요"** 한 경우에 적합. 단, value 쪽이 key를 다시 강하게 참조하면(예: value가 key를 필드로 들고 있음) 여전히 도달 가능해져서 안 지워짐 — 자주 하는 실수.

## 9. Memory Leak 패턴 in Java (GC가 있어도 새는 이유) ⭐

> 자바에 GC가 있어도 **"도달 가능한데 실제로는 안 쓰는" 객체**는 절대 수거되지 않는다. 이게 자바 메모리 누수의 정의.

| 패턴 | 왜 새는가 | 진단/해결 |
|------|-----------|-----------|
| **static 컬렉션에 계속 add** | static 필드 = Method Area(Metaspace)에서 Root처럼 항상 도달 가능 → 넣기만 하고 안 지우면 Heap에 영원히 쌓임 | heap dump에서 해당 컬렉션 인스턴스의 retained size 확인. 캐시라면 `WeakHashMap`/`Caffeine`(TTL·maxSize) 사용 |
| **리스너/콜백 미해제** | Observer 패턴에서 등록만 하고 `removeListener()` 안 하면, 리스너를 들고 있는 발행자(subject)가 살아있는 한 리스너(및 그 리스너가 참조하는 화면/객체 전체)가 계속 도달 가능 | 등록 시 `WeakReference`로 감싸거나, 생명주기 종료 시점(`onDestroy`, `@PreDestroy`)에 명시적 해제 |
| **ThreadLocal 미정리** | 스레드풀 환경에서 `ThreadLocal.set()`만 하고 `remove()` 안 하면, 스레드는 재사용되므로(끝나지 않으므로) `Thread` → `ThreadLocalMap` → 값 체인이 스레드 생명 동안 계속 살아있음. 스레드가 아예 안 죽는 서버 앱에서 특히 치명적 | `finally { threadLocal.remove(); }` 필수. Spring 필터/인터셉터에서 요청 끝에 정리하는 게 관례 |
| **커넥션/스트림 미반납** | `Connection`, `InputStream` 등 try-with-resources 없이 열기만 하고 안 닫으면 커넥션 풀 고갈(Heap 누수는 아니지만 리소스 누수) + 그 객체가 물고 있는 버퍼가 Heap에 잔류 | `try-with-resources` 강제, 커넥션 풀 모니터링(active/idle count) |
| **내부 클래스의 암묵적 외부 참조** | non-static 내부 클래스/익명 클래스는 외부 인스턴스에 대한 숨은 strong reference를 가짐 → 내부 객체가 오래 살면 외부 객체 전체가 못 죽음 | 꼭 필요하지 않으면 `static` 내부 클래스로 선언 |

**진단 흐름**: ① `jstat -gcutil`로 Old 영역이 Full GC 후에도 계속 우상향하는지 확인(전형적 누수 신호) → ② `jmap -histo:live`로 인스턴스 개수 급증 클래스 찾기 → ③ heap dump 떠서 해당 객체의 **GC Root까지 참조 경로(dominator tree)** 추적 → ④ 그 Root가 static/ThreadLocal/리스너 목록 중 무엇인지 확인.

## 10. GC 튜닝 — 힙 크기 & 컬렉터 선택 ⭐

### 힙 크기 플래그
```
-Xms2g          # 초기 힙 크기
-Xmx2g          # 최대 힙 크기 (Xms=Xmx로 동일하게 두면 런타임 중 힙 리사이징 비용 제거 → 실무 권장)
-Xmn512m        # Young 영역 크기 (명시 안 하면 -XX:NewRatio로 비율 결정)
-XX:MaxMetaspaceSize=256m   # Metaspace 상한 (안 걸면 사실상 무제한 → 누수 시 서버 전체 메모리 잠식)
```
- `-Xms`≠`-Xmx`면 힙이 부족할 때마다 OS에 메모리 요청→확장(리사이징 STW·페이지폴트) 비용 발생 → 컨테이너 환경에선 **둘을 같게** 고정하는 게 일반적.
- Young(`-Xmn`)을 너무 작게 두면 Minor GC가 잦아지고, 너무 크게 두면 Minor GC 1회당 스캔 비용·STW가 늘어남 → 트레이드오프.

### 처리량(Throughput) vs 지연(Latency) — 컬렉터 선택 기준
```
처리량 최우선                              지연 최우선
(배치, 야간 정산, 총 작업량이 중요)   ◄──────────►  (API 서버, 실시간 응답)
   Parallel GC                    G1 GC              ZGC / Shenandoah
```
| 상황 | 추천 컬렉터 | 이유 |
|------|-------------|------|
| 배치/대량 데이터 처리, STW 좀 길어도 총 처리량이 중요 | **Parallel GC** | STW 중엔 멀티스레드로 최대한 빨리 끝내고 앱에 CPU를 몰아줌 |
| 일반 API 서버, 힙 수 GB~수십 GB, "적당히 낮은" 지연 필요 | **G1 GC** (Java 9+ 기본) | Region 단위로 STW 목표시간(`-XX:MaxGCPauseMillis`) 맞춰 예측 가능한 지연 |
| 초저지연 요구(트레이딩, 실시간 매칭), 힙이 매우 큼(수백 GB) | **ZGC / Shenandoah** | 마킹·압축까지 대부분 concurrent → STW가 힙 크기와 사실상 무관하게 수 ms 이하 |

**G1 vs ZGC 실무 선택 기준**: "STW 몇 ms까지 허용 가능한가?" G1은 수십~수백 ms 목표에 최적화(그 정도면 충분한 서비스가 대다수). ZGC는 "STW가 SLA를 위협하는 초저지연·초대용량" 특수 케이스에만 도입 — 오버헤드(색깔 포인터·로드 배리어로 인한 처리량 손실, JDK 버전 제약)가 있어 무조건 최신·최고가 아님.

## 11. JVM 관측 도구 — jps/jstat/jmap/jstack & Heap Dump 분석 ⭐

```
jps -l                    # 실행 중인 JVM 프로세스 목록 + PID (ps aux | grep java 대체)
jstat -gcutil <pid> 1s    # GC 영역별 사용률(%)과 GC 횟수/누적시간 실시간 관찰
jmap -histo:live <pid>    # 살아있는 객체를 클래스별 개수·크기로 정렬 출력 (누수 후보 빠르게 확인)
jmap -dump:live,format=b,file=heap.hprof <pid>   # heap dump 생성
jstack <pid>              # 모든 스레드의 스택트레이스 스냅샷 (데드락/블로킹 지점 확인)
```

| 도구 | 용도 | 언제 쓰나 |
|------|------|-----------|
| `jps` | 프로세스 목록/PID 확인 | 다른 도구 쓰기 전 PID 찾을 때 |
| `jstat -gcutil` | Eden/Survivor/Old/Metaspace 사용률, GC 횟수·누적시간 | "GC가 너무 자주/오래 도나?" 실시간 감시 |
| `jmap -histo` | 클래스별 인스턴스 개수/크기 | "무슨 객체가 쌓이나?" 1차 스크리닝 |
| `jmap -dump` | 힙 전체 스냅샷(.hprof) | 정밀 분석용 원본 확보 |
| `jstack` | 스레드 덤프 | 데드락, 응답 없음(hang), CPU 100% 원인 스레드 특정 |

### Heap Dump + OOM 분석 흐름
```
1. OOM 발생 시 자동 덤프 뜨게 설정:
   -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/path/heap.hprof
2. .hprof 파일을 Eclipse MAT / VisualVM 등으로 로드
3. "Leak Suspects" 리포트 or Histogram에서 retained size 큰 클래스 확인
4. 해당 인스턴스 우클릭 → "Path to GC Roots" (excluding weak/soft refs)
   → 어떤 static/ThreadLocal/리스너가 물고 있는지 역추적
5. 원인 코드 수정 (9번 표의 패턴 중 하나로 좁혀짐이 보통)
```
> 🔴 자주 하는 실수: `jmap -dump`를 운영 서버에서 그냥 실행 — heap dump 생성 자체가 **STW를 유발**(전체 힙을 훑어야 함)하고 파일 크기 = 힙 크기라서, 대용량 힙이면 그 자체로 장애를 일으킬 수 있음. 가능하면 트래픽 빠진 시간대나 `-XX:+HeapDumpOnOutOfMemoryError`로 자동화.

## 12. 꼬리 질문 (Follow-up)
**Q. "ZGC는 어떻게 STW를 1ms 이하로 줄이나요?"**
> 마킹(reachability 계산)과 압축(재배치)을 **거의 전부 앱 스레드와 동시에(concurrent)** 수행한다. 핵심 기법은 **컬러드 포인터(colored pointer)**(참조 자체에 GC 상태 메타비트를 심어 별도 마킹 비트맵 없이 빠르게 판별)와 **로드 배리어(load barrier)**(객체를 읽을 때마다 그 참조가 최신 위치를 가리키는지 확인, 옮겨졌으면 그 자리에서 즉시 재조정) — 이 덕분에 "전부 멈추고 스캔"할 필요 없이, 참조를 실제로 읽는 시점에 개별적으로 교정한다. STW는 Root만 스캔하는 아주 짧은 구간(초기/재마킹)에만 남는다.

**Q. "GC 튜닝할 때 가장 먼저 뭘 보나요?"**
> `jstat -gcutil`로 Full GC 빈도·소요시간과 Old 영역 사용률 추이를 본다. Full GC가 잦고 Old가 GC 후에도 안 떨어지면 → 누수 의심(9번 패턴 확인). Full GC는 드문데 Minor GC STW가 누적돼서 지연 SLA를 못 맞추면 → Young 크기·컬렉터 종류(G1 목표시간, ZGC 전환) 조정 대상. "증상(처리량 저하 vs 지연 스파이크 vs 메모리 계속 증가)"을 먼저 구분하는 게 순서.

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

## 9. Escape Analysis 심화 — 스칼라 치환과 TLAB의 관계 ⭐

**비유**: 회의실에서만 쓰고 버리는 메모는 굳이 회사 전체 문서 캐비닛(Heap)에 등록할 필요 없이, 그냥 회의실 화이트보드(스택/레지스터)에 적었다 지우면 됨. "이 메모가 회의실 밖으로 나갈 일이 있는가(탈출하는가)?"를 미리 분석하는 것이 escape analysis.

### 탈출 여부 3단계
```
NoEscape (탈출 없음)        → 스택 할당 후보 / 스칼라 치환 후보
ArgEscape (메서드 인자로만 전달) → 인라이닝되면 NoEscape로 승격 가능
GlobalEscape (필드 저장, 리턴, 다른 스레드 공유) → 반드시 Heap
```

### 스칼라 치환 (Scalar Replacement)
- Escape analysis가 "이 객체는 탈출하지 않는다"고 판단하면, JIT(C2)는 **객체를 통째로 만들지 않고** 그 필드들을 **개별 지역 변수(스칼라)로 분해**해 레지스터/스택에 둔다.
```java
void compute() {
    Point p = new Point(1, 2);   // 탈출 안 함 → 객체 생성 자체를 스킵
    int r = p.x + p.y;           // 컴파일러 내부적으로: int x=1, y=2; r = x+y;
}
```
- 결과: **Heap 할당 0**, GC가 추적할 객체 자체가 없음 → GC 압박 감소 + 캐시 지역성↑.
- 조건이 까다로움: 객체가 조건문 안에서 부분적으로 탈출하거나, 리플렉션/동기화(`synchronized(p)`) 대상이 되거나, JIT가 warm-up 전이면 스칼라 치환이 안 일어나고 평범하게 Heap(TLAB 경유)에 할당됨.

### TLAB과의 관계 — "1차/2차 방어선"
```
객체 생성
   │
   ▼ escape analysis
NoEscape? ──Yes──► 스칼라 치환 (Heap 할당 자체를 생략) — 1차 방어선
   │No
   ▼
반드시 Heap 할당 ──► TLAB에서 락 없이 빠르게 할당 — 2차 방어선(그나마 빠르게)
```
> 즉, escape analysis+스칼라 치환이 "애초에 Heap에 안 만들기"라면, TLAB(T1 §9)은 "Heap에 만들 수밖에 없을 때 최대한 빠르게 만들기"다. 둘은 경쟁 관계가 아니라 **직렬 방어선**.

## 10. 꼬리 질문 (Follow-up)
**Q. "escape analysis가 실패하는 대표적인 케이스는?"**
> ① 객체를 메서드 리턴값으로 돌려주거나 ② 필드/컬렉션/static에 저장하거나 ③ 다른 스레드와 공유되거나(멀티스레드 큐에 넣기 등) ④ 그 객체에 `synchronized` 락을 거는 경우(락 대상 객체는 정체성이 명확해야 하므로). 특히 팀에서 자주 놓치는 건 "작은 DTO를 만들어서 그냥 반환하는" 패턴 — 그 순간 무조건 GlobalEscape로 Heap 할당된다.

**Q. "그럼 개발자가 스칼라 치환을 유도하려면 뭘 신경 써야 하나요?"**
> 직접 강제할 수 있는 플래그는 없다(JIT의 자동 최적화). 다만 ① 객체를 불필요하게 넓은 스코프(필드, static, 컬렉션)에 담지 않고 메서드 로컬로 좁게 쓰기 ② 작은 값 객체를 남발하는 핫패스에서 불필요한 wrapping을 줄이기 ③ Java 21+의 **Record + 향후 Value Type(Project Valhalla)** 방향이 이런 걸 언어 차원에서 지원하려는 시도임을 알아두면 좋다(레코드 자체가 스칼라 치환을 더 잘 받게 설계됨). 실무 답으로는 "핫패스 로컬 객체는 스코프를 좁게 유지해 JIT가 최적화할 여지를 준다" 정도면 충분.

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

## 9. 꼬리 질문 (Follow-up)
**Q. "volatile은 재배치를 어떻게 막나요? synchronized와 메모리 배리어 차이는?"**
> volatile 쓰기는 그 뒤에 **StoreLoad 배리어**를 삽입해 "이 쓰기 이전의 모든 메모리 연산이 이 쓰기보다 먼저 보이도록" 강제하고, volatile 읽기는 그 이후 연산이 앞으로 재배치되지 못하게 막는다. synchronized는 락 획득 시 캐시를 무효화하고 최신 값을 다시 로드(acquire), 락 해제 시 변경분을 메인 메모리에 flush(release)하는 것으로 사실상 더 넓은 범위(임계 구역 전체)에 대해 같은 효과를 준다. 차이는 "범위"— volatile은 그 변수 하나의 읽기/쓰기 시점, synchronized는 임계 구역 전체 진입/이탈 시점.

**Q. "CAS(Compare-And-Swap)는 원자성을 어떻게 보장하나요? ABA 문제는?"**
> CAS는 CPU의 단일 명령어(`cmpxchg` 등)로 "현재 값이 기대값과 같으면 새 값으로 교체"를 **원자적으로** 수행해 락 없이 원자성을 얻는다(하드웨어가 그 명령 실행 중 다른 코어의 개입을 막아줌). 문제는 **ABA 문제** — 값이 A→B→A로 바뀌고 돌아오면 CAS는 "안 바뀌었다"고 착각해 통과시키지만 실제로는 중간에 변경이 있었을 수 있음(예: 스택 pop-push 재사용). 해결은 값에 **버전 번호를 같이 CAS**하는 `AtomicStampedReference`를 써서 "값은 같아도 버전이 다르면 실패"하게 만드는 것.

---

# 핵심 질문 (Quiz)

> 답변을 먼저 떠올린 뒤 펼쳐서 확인하세요.

<details>
<summary>Q1. JVM 구조를 설명해주세요.</summary>

- ① Class Loader(로딩→링크[검증/준비/해석]→초기화)
- ② Runtime Data Areas — Heap·Method Area(Metaspace)는 **공유**, JVM Stack·PC Register·Native Method Stack은 **스레드별**
- ③ Execution Engine(Interpreter + JIT + GC)
- 한 줄 요약: "한 번 컴파일된 바이트코드를 어느 OS서든 실행" = Write Once, Run Anywhere

</details>

<details>
<summary>Q2. 객체와 지역변수는 각각 어디에 저장되나요?</summary>

- `new` 객체(인스턴스 필드 포함) → **Heap**
- 참조 변수·primitive 지역변수(값 자체) → **Stack**(스레드별 프레임 안)
- `static` 필드 → **Metaspace**(Java 8+)
- Stack의 참조가 Heap의 실제 객체를 가리키는 구조 — "객체는 Stack에" 는 흔한 오답

</details>

<details>
<summary>Q3. 클래스 로딩 과정과 부모 위임 모델을 설명해주세요.</summary>

- 3단계: **Loading**(.class→Class 객체) → **Linking**(Verification 검증 / Preparation static 기본값 / Resolution 심볼릭→실제 참조) → **Initialization**(static 실제값 + `static{}`)
- 로딩은 **lazy**, 초기화는 처음 능동적으로 쓸 때 딱 한 번
- 부모 위임: Bootstrap → Platform → Application 계층, **부모에게 먼저 위임**하고 부모가 못 찾을 때만 자신이 로딩
- 이유: 핵심 API(`String` 등) 위조 방지(보안) + 중복 로딩 방지(유일성). 클래스 동일성 = FQCN + 로더 조합

</details>

<details>
<summary>Q4. GC는 어떤 객체를 수거하나요? Heap을 왜 세대로 나누나요?</summary>

- 수거 기준: **참조 카운팅이 아니라 도달성(Reachability)** — GC Root(스택 지역변수, static 필드, JNI 참조 등)에서 참조 사슬로 도달 불가능하면 쓰레기. 순환 참조끼리 서로 참조해도 Root 미도달이면 둘 다 수거됨
- 세대 분할 이유: **weak generational hypothesis**(대부분 객체는 생성 직후 곧 죽는다) → Young(Eden+Survivor)을 자주·빠르게 청소(Minor GC)하고, 오래 살아남은 것만 age 임계치 넘으면 Old로 승격
- Minor GC=Young, 자주·빠름 / Major(Full) GC=Old, 드물지만 느려서 성능 문제 주범

</details>

<details>
<summary>Q5. STW(Stop-The-World)가 뭐고, G1 GC의 특징은 무엇인가요?</summary>

- STW: 도달성을 정확히 계산하려면 객체 그래프가 멈춰야 하므로 **모든 앱 스레드를 정지**시키는 구간. 길어지면 응답 지연·타임아웃 → GC 발전사 = STW를 줄이는 역사
- G1(Java 9+ 기본): Young/Old를 물리적으로 분할하지 않고 Heap을 다수의 **Region**으로 쪼갠 뒤, **쓰레기가 가장 많은 Region부터**(Garbage First) 회수. `-XX:MaxGCPauseMillis`로 목표 STW 시간 내 예측 가능한 관리
- ZGC/Shenandoah는 마킹·압축을 대부분 concurrent로 수행해 STW를 힙 크기와 무관하게 1ms 이하로 축소(초저지연·초대용량용, 오버헤드 트레이드오프 있음)

</details>

<details>
<summary>Q6. GC가 있는데도 자바에서 메모리 누수가 발생하는 이유는?</summary>

- GC는 "도달 불가능한" 객체만 수거 — **도달은 가능한데 실제로는 안 쓰는 객체**는 절대 수거 안 됨
- 대표 패턴:
  - static 컬렉션에 계속 add(Root처럼 항상 도달 가능 → 영원히 쌓임)
  - 리스너/콜백 등록만 하고 미해제(발행자가 살아있는 한 계속 도달 가능)
  - `ThreadLocal.set()`만 하고 `remove()` 미호출(스레드풀 환경에서 스레드가 재사용되며 계속 누적)
  - non-static 내부 클래스의 암묵적 외부 인스턴스 참조
- 진단 흐름: `jstat -gcutil`로 Full GC 후에도 Old가 안 떨어지는지 확인 → `jmap -histo:live`로 급증 클래스 특정 → heap dump에서 GC Root까지 경로(dominator tree) 역추적

</details>

<details>
<summary>Q7. JIT가 뭐고, 인터프리터가 있는데 왜 필요한가요?</summary>

- JIT: 런타임에 자주 실행되는(hot spot) 바이트코드를 **기계어로 컴파일**해 code cache에 저장, 이후 호출은 인터프리터 없이 기계어 직행. 미리(AOT)도 매번(순수 인터프리터)도 아닌 딱 필요한 시점 컴파일
- 필요 이유: 인터프리터만으로는 반복 실행이 느림. JIT 캐싱으로 정점 성능 확보 + **런타임 프로파일 기반**이라 정적 컴파일러보다 공격적 최적화 가능
- Tiered Compilation(Java 8+ 기본): 인터프리터 → C1(빠른 컴파일, 프로파일 수집) → C2(고강도 최적화) 단계 상승 — 시작 지연↓ + 정점 성능↑
- Warm-up: 배포 직후 첫 요청이 느린 이유 = 아직 JIT 컴파일 전이라 인터프리터로 실행 중이기 때문

</details>

<details>
<summary>Q8. volatile과 synchronized의 차이는? happens-before가 뭔가요?</summary>

| | volatile | synchronized |
|--|----------|---------------|
| 가시성 | O | O |
| 원자성 | X | O |
| 용도 | 상태 플래그 | 복합 연산·임계영역 |

- volatile: 읽기/쓰기가 항상 main memory 직행(가시성) + 재배치 방지. 단 `count++` 같은 read-modify-write는 원자성 없어서 깨짐
- synchronized: 상호 배제로 **원자성** 확보 + 락 해제 시 flush/획득 시 로드로 **가시성**도 함께 보장
- happens-before: JMM의 순서 보장 규칙 — A happens-before B면 A의 결과를 B가 반드시 봄. 근거: 프로그램 순서, 모니터 락(unlock→lock), volatile(쓰기→읽기), Thread.start/join. volatile·synchronized의 가시성 보장은 이 규칙에서 나옴

</details>

