# 스프링(Spring) 핵심 — 면접 답변 정리본

> 한국 IT 백엔드 면접용 Spring 종합 정리. 3년차 실무 함정(프록시·self-invocation 등)까지.
> 진행 형식: 비유 → 다이어그램 → 표 → 핵심 포인트 → 예상 면접 질문.

## 목차
- [S1. IoC and DI](#s1-ioc-and-di) — 제어의 역전, 의존성 주입, 생성자 주입
- [S2. Bean Scope and Lifecycle](#s2-bean-scope-and-lifecycle) — 싱글톤, 스코프, 생명주기
- [S3. AOP and Proxy](#s3-aop-and-proxy) — 관점 지향, 프록시 동작
- [S4. Transaction Management](#s4-transaction-management) — @Transactional 전파·함정 (↔ DB 트랜잭션)
- [S5. Spring MVC Request Flow](#s5-spring-mvc-request-flow) — DispatcherServlet 요청 흐름

---

# S1. IoC and DI

**학습 목표**: *"IoC/DI가 뭐고 왜 좋은가요? 생성자 주입을 왜 권장?"* 에 답할 수 있다.

## 1. 비유 — 레스토랑
직접 장 보고 요리하는 대신(내가 제어), **식자재를 배달**받아 요리만 함(제어권을 넘김). 필요한 재료(의존성)를 **외부가 넣어줌** = DI. "무엇을 어떻게 만들지"를 스프링 컨테이너에 맡기는 게 IoC.

## 2. 개념 정의
> **IoC(제어의 역전)** = 객체 생성·생명주기 제어를 개발자가 아닌 **컨테이너**가 가져감.
> **DI(의존성 주입)** = 필요한 의존 객체를 직접 `new` 하지 않고 **외부에서 주입**. IoC의 구현 방법.

## 3. 주입 방식 비교 ⭐
| 방식 | 예 | 특징 |
|------|-----|------|
| **생성자 주입(권장)** | `private final Repo repo;` + 생성자 | 불변·필수 보장, 순환참조 컴파일/기동 시 발견, 테스트 쉬움 |
| 필드 주입 | `@Autowired Repo repo;` | 간결하나 테스트·불변 어려움, 지양 |
| Setter 주입 | `@Autowired setter` | 선택적 의존성에 |

```java
@Service
public class OrderService {
    private final OrderRepository repo;      // final → 불변
    public OrderService(OrderRepository repo) {  // 생성자 주입
        this.repo = repo;
    }
}
```

## 4. 핵심 포인트 (자주 하는 실수)
- 🟡 **생성자 주입 권장 이유**: ① `final`로 불변 ② 필수 의존성 누락을 기동 시 발견 ③ 순환참조 조기 발견 ④ 프레임워크 없이 테스트 가능.
- 🟡 생성자 1개면 `@Autowired` 생략 가능(스프링이 자동).
- 🔴 "DI 컨테이너 = 스프링만" — ❌ DI는 패턴, 스프링은 그 구현체 중 하나.

## 5. 예상 면접 질문
**Q1. "IoC와 DI를 설명해주세요."**
> IoC는 객체의 생성·생명주기 제어권을 컨테이너가 갖는 것이고, DI는 그 구현으로 의존 객체를 직접 생성하지 않고 외부에서 주입받는 것입니다. 결합도가 낮아지고 테스트·교체가 쉬워집니다.

**Q2. "생성자 주입을 왜 권장하나요?"**
> final로 불변을 보장하고, 필수 의존성 누락과 순환참조를 기동 시점에 발견할 수 있으며, 스프링 없이도 객체를 생성해 테스트하기 쉽기 때문입니다.

---

# S2. Bean Scope and Lifecycle

**학습 목표**: *"빈은 싱글톤인데 스레드 안전한가요? 스코프 종류는?"* 에 답할 수 있다.

## 1. 비유 — 공유 사무기기
빈(bean) = 컨테이너가 관리하는 객체. 기본 **싱글톤** = 사무실에 복합기 한 대를 모두 공유. 편하지만 **상태를 저장하면 충돌**(여러 명이 동시에 사용).

## 2. 스코프
| 스코프 | 설명 |
|--------|------|
| **singleton(기본)** | 컨테이너당 1개 인스턴스 공유 |
| prototype | 요청마다 새 인스턴스 |
| request/session | 웹 요청/세션 단위(웹 스코프) |

## 3. 싱글톤과 스레드 안전 ⭐
- 스프링 빈은 기본 싱글톤 → **여러 스레드가 동시에 같은 인스턴스** 사용.
- 따라서 **빈에 가변 상태(mutable field)를 두면 위험**(race condition). 필드는 상태 없이(stateless) 두거나 지역변수 사용.
- 이건 JVM 동시성(JMM)·OS 동기화와 같은 문제 — 공유 객체의 가변 상태.

## 4. 생명주기
```
인스턴스화 → 의존성 주입 → @PostConstruct(초기화 콜백)
  → (사용) → @PreDestroy(소멸 콜백) → 소멸
```

## 5. 예상 면접 질문
**Q. "스프링 빈은 싱글톤인데 멀티스레드에서 안전한가요?"**
> 기본 싱글톤이라 여러 스레드가 같은 인스턴스를 공유합니다. 그래서 빈에 가변 상태를 두면 race condition이 생깁니다. 보통 서비스 빈은 무상태로 설계하고, 상태는 지역변수나 파라미터로 다뤄 안전하게 만듭니다.

---

# S3. AOP and Proxy

**학습 목표**: *"AOP가 뭐고 어떻게 동작하나요(프록시)?"* 에 답할 수 있다.

## 1. 비유 — 건물 공용 설비
층마다(각 메서드) 반복되는 것: 전기·소방(로깅·트랜잭션·보안). 각 층에 따로 설치 대신 **공용으로 한 번** 정의해 관통 적용 = **횡단 관심사(cross-cutting concern)** 분리.

## 2. 개념
> **AOP(관점 지향)** = 로깅·트랜잭션·보안처럼 여러 곳에 흩어지는 **공통 기능을 분리**해 핵심 로직과 떼어내는 것.
- 용어: Aspect(관점), Advice(무엇을), Pointcut(어디에), JoinPoint(적용 지점).

## 3. 동작 원리 — 프록시 ⭐
스프링 AOP는 **프록시 기반**: 대상 빈을 감싼 **프록시 객체**를 만들어, 메서드 호출 전후에 부가기능(트랜잭션 등) 삽입.
```
호출자 → [프록시] → (트랜잭션 시작) → 실제 빈 메서드 → (커밋/롤백) → 반환
```
- 인터페이스 있으면 **JDK 동적 프록시**, 없으면 **CGLIB**(상속 기반).

## 4. 핵심 포인트 — self-invocation 함정 ⭐⭐
- 🔴 **같은 클래스 내부에서 자기 메서드 호출 시 프록시를 안 거침** → `@Transactional`·AOP 미적용!
```java
public void a() { this.b(); }        // ❌ b()의 @Transactional 무시됨(내부 호출)
@Transactional public void b() {...}
```
  이유: 내부 호출은 프록시가 아니라 실제 객체(`this`)를 직접 호출. 해결: 다른 빈으로 분리하거나 self-injection.
- 🔴 `private` 메서드엔 AOP 적용 안 됨(프록시가 오버라이드 못 함).

## 5. 예상 면접 질문
**Q1. "스프링 AOP는 어떻게 동작하나요?"**
> 대상 빈을 감싼 프록시 객체를 만들어 메서드 호출 전후에 트랜잭션·로깅 같은 부가기능을 끼워 넣습니다. 인터페이스가 있으면 JDK 동적 프록시, 없으면 CGLIB로 만듭니다.

**Q2. "@Transactional이 안 먹는 경우를 겪어봤나요?"**
> 같은 클래스 안에서 내부 메서드를 직접 호출하면 프록시를 거치지 않아 트랜잭션이 적용되지 않습니다(self-invocation). 메서드를 다른 빈으로 분리하거나 self-injection으로 해결합니다. private 메서드도 적용되지 않습니다.

---

# S4. Transaction Management

**학습 목표**: *"@Transactional 전파 레벨, 롤백 규칙?"* 에 답할 수 있다. (DB 트랜잭션과 직결)

## 1. 비유
DB 트랜잭션(D2)을 스프링이 **선언적으로**(`@Transactional` 한 줄) 감싸주는 것. 개발자는 begin/commit/rollback을 직접 안 씀 → AOP 프록시가 대신.

## 2. 전파(Propagation) ⭐
"이미 트랜잭션이 있을 때 어떻게?"
| 전파 | 동작 |
|------|------|
| **REQUIRED(기본)** | 있으면 참여, 없으면 새로 시작 |
| REQUIRES_NEW | 항상 새 트랜잭션(기존은 잠시 중단) |
| NESTED | 중첩(savepoint), 부분 롤백 |
| SUPPORTS | 있으면 참여, 없으면 없이 실행 |

## 3. 롤백 규칙 ⭐
- 🔴 스프링 기본: **unchecked(RuntimeException)·Error만 롤백**. **checked exception은 롤백 안 함**(기본).
  - checked도 롤백하려면 `@Transactional(rollbackFor = Exception.class)`.
- 🟡 `readOnly = true`로 조회 전용 최적화 가능.

## 4. DB 트랜잭션과의 연결 ⭐ (cross-link)
- `@Transactional`은 결국 **DB 트랜잭션(D2 ACID·격리수준)** 을 감싼 것. 격리수준도 `@Transactional(isolation=...)`로 지정.
- self-invocation(S3)으로 프록시 안 거치면 트랜잭션 자체가 안 걸림 — AOP와 한 몸.

## 5. 예상 면접 질문
**Q1. "@Transactional의 전파 레벨을 설명해주세요."**
> 기본 REQUIRED는 기존 트랜잭션이 있으면 참여하고 없으면 새로 만듭니다. REQUIRES_NEW는 항상 독립 트랜잭션을 열고, NESTED는 savepoint로 부분 롤백을 지원합니다.

**Q2. "체크 예외가 발생했는데 롤백이 안 됐습니다. 왜죠?"**
> 스프링은 기본적으로 unchecked 예외와 Error만 롤백하고 checked 예외는 커밋합니다. checked 예외도 롤백하려면 `rollbackFor`를 지정해야 합니다.

---

# S5. Spring MVC Request Flow

**학습 목표**: *"요청이 들어오면 스프링 MVC가 어떻게 처리하나요?"* 에 답할 수 있다.

## 1. 비유 — 우편 분류소
모든 우편(요청)이 중앙 분류소(**DispatcherServlet**)로 먼저 옴 → 담당 부서(Controller)로 분배 → 처리 후 응답 포장.

## 2. 요청 처리 흐름 ⭐
```
Client
  → DispatcherServlet (Front Controller: 모든 요청 진입점)
  → HandlerMapping (URL→어느 Controller?)
  → HandlerAdapter → Controller 메서드 실행
  → (Service → Repository → DB)
  → 반환: @ResponseBody면 HttpMessageConverter로 JSON 직렬화
           (View면 ViewResolver → 렌더)
  → 응답
```

## 3. 핵심 포인트
- 🟡 **DispatcherServlet = Front Controller 패턴**: 공통 처리(인터셉터, 예외처리)를 한 곳에서.
- 🟡 REST API는 `@RestController`(= `@Controller` + `@ResponseBody`) → 객체를 JSON으로 직렬화.
- 🟡 `@ExceptionHandler`/`@ControllerAdvice`로 전역 예외 처리.
- 🟡 이 흐름은 결국 HTTP 요청(Network N3) 위에서 동작.

## 4. 예상 면접 질문
**Q. "스프링 MVC의 요청 처리 흐름을 설명해주세요."**
> 모든 요청이 Front Controller인 DispatcherServlet으로 들어오면, HandlerMapping이 URL에 맞는 컨트롤러를 찾고 HandlerAdapter가 실행합니다. 컨트롤러가 서비스·리포지토리를 거쳐 결과를 반환하면, REST는 HttpMessageConverter로 JSON 직렬화, 뷰는 ViewResolver로 렌더해 응답합니다.

---
