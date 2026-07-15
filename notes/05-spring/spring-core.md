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

**Q3(꼬리질문). "그럼 순환참조는 왜 생성자 주입에서만 문제가 되나요?"**
> 필드/setter 주입은 빈을 일단 빈 껍데기로 먼저 만들고 나중에 의존성을 채우기 때문에 순환이 있어도 어찌어찌 완성됩니다. 반면 생성자 주입은 객체 생성 시점에 의존성이 다 갖춰져야 하므로, A→B→A 순환이면 누구도 먼저 완성될 수 없어 즉시 예외가 터집니다. 아래 6번에서 자세히 다룹니다.

## 6. 심화 — 순환 참조(Circular Dependency)
**비유**: A가 완성되려면 B가 필요하고, B가 완성되려면 A가 필요함 — 서로 "네가 먼저 준비되면 나도 준비할게"라며 기다리는 교착 상태.

```
OrderService(생성자) 필요 → UserService
UserService(생성자) 필요 → OrderService
→ 누구도 먼저 완성될 수 없음 (BeanCurrentlyInCreationException)
```

- **생성자 주입 = 조기 발견 장치**: 빈 생성 = 의존성 100% 조립 완료를 의미하므로, 순환이 있으면 컨테이너 기동 시점에 바로 실패합니다. (Spring Boot 2.6+부터 `spring.main.allow-circular-references=false`가 기본값이라, 필드 주입이어도 순환참조는 기본적으로 막힙니다.)
- **필드/setter 주입은 왜 "되는 것처럼" 보였나**: 빈 껍데기(아직 필드 미주입 상태)를 캐시에 먼저 등록해두고, 그 껍데기를 서로 주입한 뒤 나중에 필드를 채우는 3단계 캐시(singleton cache) 덕분에 순환이 "봉합"됐던 것 — 근본적으로 설계 문제가 있다는 신호를 늦게(런타임 NPE 등으로) 발견하게 만드는 것뿐, 해결이 아님.

### 해결 방법 비교
| 방법 | 내용 | 평가 |
|------|------|------|
| **설계 재검토(정답)** | 공통 로직을 제3의 클래스로 추출하거나, 이벤트(ApplicationEventPublisher)로 결합을 끊음 | 🟢 근본 해결 — 애초에 양방향 의존이 설계 냄새 |
| `@Lazy` | 한쪽 의존성을 지연 프록시로 주입 → 실제 호출 시점에 진짜 빈을 조회 | 🟡 임시방편, 순환 자체는 남아있음 |
| 필드/setter 주입 우회 | 순환을 "숨김" | 🔴 비권장 — 문제를 감추기만 함 |

```java
@Service
public class OrderService {
    private final UserService userService;
    public OrderService(@Lazy UserService userService) { // 지연 프록시 주입
        this.userService = userService;
    }
}
```

- 🔴 **실무 함정**: `@Lazy`로 기동은 되지만, 이건 "양방향 의존이 있다"는 설계 경고를 무시하고 넘어가는 것 — 리뷰에서 반드시 짚어야 함.

## 7. 심화 — Spring Boot Auto-configuration
**비유**: 밀키트 — 필요한 재료(라이브러리)가 클래스패스에 있으면 스프링 부트가 알아서 레시피(설정 빈)를 완성해줌.

- **starter**: 관련 라이브러리 + auto-configuration을 묶어놓은 의존성 패키지 (`spring-boot-starter-web` → 내장 톰캣, Jackson, MVC 설정 등을 한 번에).
- **@Conditional 계열**: 클래스패스나 빈 존재 여부에 따라 자동 설정 적용 여부를 결정.
  - `@ConditionalOnClass`: 특정 클래스가 클래스패스에 있을 때만 설정 활성화
  - `@ConditionalOnMissingBean`: 사용자가 직접 빈을 등록하지 않았을 때만 기본값 제공 (사용자 커스텀이 항상 우선)
  - `@ConditionalOnProperty`: application.yml 설정값에 따라 활성화
- 동작 원리: `@SpringBootApplication`에 포함된 `@EnableAutoConfiguration`이 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`(구버전은 `spring.factories`)에 나열된 설정 클래스들을 조건부로 로드.

**follow-up Q**: *"DataSource를 직접 빈으로 등록했는데도 auto-configuration이 충돌 안 나는 이유는?"*
> `@ConditionalOnMissingBean` 덕분입니다. 사용자가 명시적으로 빈을 등록하면 auto-configuration은 그 존재를 감지하고 자신의 기본 설정을 양보(skip)합니다.

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

**Q(꼬리질문). "prototype 스코프 빈을 singleton 빈 안에 그냥 주입하면 문제가 없나요?"**
> singleton 빈은 딱 한 번만 조립되므로, prototype 빈을 생성자/필드로 주입하면 최초 1번만 새 인스턴스를 받고 그 뒤로는 계속 같은 인스턴스를 재사용하게 되어 "매번 새로 받는다"는 prototype 취지가 깨집니다. `ObjectProvider`나 `@Lookup` 메서드 주입으로 호출 시점마다 새로 조회해야 합니다.

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

**Q3(꼬리질문). "JDK 동적 프록시와 CGLIB 중 뭘 쓸지는 누가 정하나요?"**
> 대상 빈이 인터페이스를 구현했으면 기본적으로 JDK 동적 프록시, 없으면 CGLIB를 씁니다. 다만 Spring Boot는 2.0부터 `spring.aop.proxy-target-class=true`가 기본값이라, 인터페이스가 있어도 웬만하면 CGLIB(클래스 기반)를 우선 사용합니다. 아래 6번에서 자세히 다룹니다.

## 6. 심화 — JDK 동적 프록시 vs CGLIB
| 구분 | JDK 동적 프록시 | CGLIB |
|------|----------------|-------|
| 구현 방식 | 대상 **인터페이스를 구현**한 프록시 클래스를 런타임에 생성 (`java.lang.reflect.Proxy`) | 대상 **클래스를 상속**한 서브클래스를 런타임에 생성(바이트코드 조작) |
| 요구 조건 | 인터페이스 필수 | 인터페이스 없어도 됨 (구체 클래스면 충분) |
| Spring Boot 기본값 | `proxyTargetClass=false`일 때만 | **기본값**(`proxyTargetClass=true`, 2.0+) |
| 제약 | 인터페이스에 없는 메서드는 프록시 대상 아님 | `final` 클래스/메서드, `private` 메서드에 적용 불가 |

### 프록시가 final/private에 안 되는 이유 ⭐
- **CGLIB(상속 기반)**: 프록시가 대상 클래스를 **상속**해서 메서드를 오버라이드하는 방식이므로,
  - 🔴 클래스가 `final`이면 애초에 상속(서브클래스 생성)이 불가능 → 프록시 생성 자체가 실패.
  - 🔴 메서드가 `final`이면 오버라이드가 불가능 → 그 메서드만 프록시를 못 거침(부가기능 미적용).
  - 🔴 메서드가 `private`이면 하위 클래스에서 아예 보이지도 않음(오버라이드 대상이 아님) → 자연히 AOP 적용 불가.
- **JDK 동적 프록시(인터페이스 기반)**: 인터페이스에 선언된 메서드만 프록시가 구현하므로, `private`/`final` 여부와 무관하게 애초에 **인터페이스에 없는 메서드**는 대상이 아님.
- 실무 결론: 스프링 빈의 트랜잭션/로깅 메서드는 **`public`이어야** AOP가 확실히 걸립니다. `final` 클래스로 서비스 빈을 만들지 않는 것도 이 때문.

**follow-up Q**: *"롬복 `@Value`가 붙은 필드나 `final` 필드는 괜찮은데, 왜 서비스 클래스 자체를 `final`로 선언하면 안 되나요?"*
> 필드의 `final`은 프록시 생성과 무관합니다(값 불변성 문제일 뿐). 문제는 **클래스 선언 자체가 `final`인 경우** — CGLIB가 상속으로 프록시를 만들 수 없어 AOP(트랜잭션 포함)가 통째로 동작하지 않게 됩니다.

## 7. 심화 — Filter vs Interceptor vs AOP 실행 순서·용도 비교
횡단 관심사를 처리하는 3가지 방법이 실행되는 "층"이 다릅니다.

```
[서블릿 컨테이너 영역]              [스프링 컨텍스트 영역]           [빈 내부]
Client → Filter → DispatcherServlet → Interceptor(preHandle) → Controller
                                                                   ↓
                                                          Service (AOP 프록시 통과)
                                                                   ↓
Client ← Filter ← DispatcherServlet ← Interceptor(postHandle/afterCompletion) ← 응답
```

| 구분 | 실행 위치 | 스프링 컨텍스트 접근 | 대표 용도 |
|------|-----------|----------------------|-----------|
| **Filter** | 서블릿 컨테이너 (DispatcherServlet 앞뒤) | 원칙적으로 불가(스프링 빈 아님) | 인코딩 설정, CORS, XSS 방어, 요청/응답 원본 조작 |
| **Interceptor** | 스프링 MVC (HandlerMapping ~ Controller 사이) | 가능(스프링 빈) | 인증/인가, 공통 로깅, `ModelAndView` 조작 |
| **AOP** | 메서드 호출 레벨 (빈 내부, HTTP 요청과 무관하게도 동작) | 가능(스프링 빈) | 트랜잭션, 비즈니스 로직 로깅, 캐싱 — 가장 세밀한 단위 |

- 🟡 Filter는 스프링이 아니라 **서블릿 스펙** 기능이라 스프링 컨텍스트 밖에서도 동작 — 프레임워크 교체와 무관하게 필요한 저수준 처리에 적합.
- 🟡 Interceptor는 `HandlerInterceptor` 구현 + `WebMvcConfigurer.addInterceptors()`로 등록, Controller 진입 전/후/완료 후 3단계 훅 제공.
- 🟡 AOP는 웹 요청이 아닌 곳(배치, 스케줄러 등)에서도 걸 수 있어 가장 범용적.

**follow-up Q**: *"인증 체크는 Filter, Interceptor, AOP 중 어디서 하는 게 맞나요?"*
> 일반적으로 **Interceptor**를 씁니다. 스프링 빈이라 인증 관련 서비스(예: 토큰 검증 서비스)를 DI 받기 쉽고, `HandlerMethod` 정보(어떤 컨트롤러/메서드인지)에 접근할 수 있어 `@PreAuthorize`류와 결합하기도 좋습니다. Filter는 스프링 빈 접근이 번거로워 인코딩·CORS처럼 스프링과 무관한 저수준 처리에 더 적합합니다.

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

**Q3(꼬리질문). "조회 API에 `readOnly=true`를 붙이면 실제로 뭐가 빨라지나요?"**
> 단순 힌트가 아닙니다. 아래 6번에서 다루는 것처럼 JPA의 dirty checking 비용을 없애고, DB 드라이버에 읽기 전용임을 알려 리소스를 아낍니다.

## 6. 심화 — readOnly / timeout / rollbackFor·noRollbackFor
### readOnly = true 최적화 ⭐
- **JPA/Hibernate 관점**: 영속성 컨텍스트를 읽기 전용으로 열어 **flush 시 dirty checking(변경 감지) 스냅샷 비교를 생략** → 조회만 하는 트랜잭션에서 CPU/메모리 낭비를 줄임.
- **DB 드라이버 관점**: JDBC 드라이버·DB에 "이 트랜잭션은 쓰기가 없다"는 힌트를 줘서 내부적으로 락 관련 오버헤드를 줄이거나, 일부 인프라(예: read replica 라우팅)에서 읽기 전용 트랜잭션을 판별하는 신호로 활용 가능.
- 🔴 **주의**: `readOnly=true`인 트랜잭션 안에서 실제로 INSERT/UPDATE를 하면 DB에 따라 예외가 나거나(엄격 모드), 조용히 무시될 수 있음 — "진짜 조회만 하는 메서드"에만 붙여야 함.

### timeout ⭐
```java
@Transactional(timeout = 3) // 3초 안에 커밋 못 하면 강제 롤백
public void slowBatchJob() { ... }
```
- 트랜잭션 시작 후 지정한 시간(초) 안에 끝나지 않으면 `TransactionTimedOutException`으로 강제 롤백.
- 배치·외부 API 호출이 섞인 트랜잭션에서 DB 커넥션을 무한정 붙잡는 것을 방지.

### rollbackFor / noRollbackFor ⭐
```java
@Transactional(rollbackFor = BusinessException.class,       // 이 checked 예외는 롤백
               noRollbackFor = InsufficientStockWarning.class) // 이 예외는 롤백 안 함
public void placeOrder() { ... }
```
- `rollbackFor`: 기본 규칙(unchecked만 롤백)을 확장해 **checked 예외도 롤백 대상**에 추가.
- `noRollbackFor`: 반대로 특정 예외(보통 "경고성"으로 처리하고 싶은 unchecked 예외)를 **롤백 대상에서 제외** — 예외는 던지되 지금까지의 변경은 커밋하고 싶을 때.

## 7. 심화 — REQUIRES_NEW 실전 사용 예
**시나리오**: 주문 처리 중 감사 로그(audit log)는 주문이 실패해도 반드시 남아야 함.
```java
@Service
public class OrderService {
    private final AuditLogService auditLogService; // 다른 빈 — self-invocation 회피(S3 참고)

    public void placeOrder(Order order) {
        try {
            // ... 주문 처리(REQUIRED 트랜잭션)
        } finally {
            auditLogService.record(order); // 주문 롤백과 무관하게 커밋되어야 함
        }
    }
}

@Service
public class AuditLogService {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Order order) { ... } // 항상 새 트랜잭션 → 독립적으로 커밋
}
```
- `REQUIRES_NEW`는 기존 트랜잭션을 **일시 중단**하고 완전히 새로운(독립적인) 트랜잭션을 커넥션 풀에서 새로 받아 실행 → 바깥 트랜잭션이 롤백돼도 이 안의 커밋은 유지됨.
- 🔴 **주의**: 반드시 다른 빈으로 분리해야 함(같은 클래스 내부 호출이면 self-invocation으로 프록시를 안 거쳐 전파 옵션 자체가 무시됨).
- 🔴 **비용**: 커넥션을 하나 더 사용 → DB 커넥션 풀 고갈, 두 트랜잭션 간 락 대기로 인한 데드락 가능성을 고려해야 함(남발 금지).

## 8. 심화 — JPA N+1 문제와 해결 (3년차 단골 질문)
**비유**: 게시글 목록 10개를 한 번의 쿼리로 가져왔는데, 화면에서 작성자 이름을 찍으려고 각 게시글마다 "작성자 조회" 쿼리가 **추가로 10번** 더 나감. 총 1(목록) + N(연관 엔티티) = **N+1 쿼리**.

```
SELECT * FROM post;                     -- 1번
SELECT * FROM member WHERE id = ?;      -- N번 (post마다 반복)
```

- **원인**: 연관관계가 **지연 로딩(LAZY)** 이면, `post.getMember().getName()`처럼 실제로 접근하는 순간 각각 별도 쿼리가 나감. `@OneToMany`/`@ManyToOne` 기본 전략 차이는 있지만, 결국 "연관 엔티티를 각자 따로 조회"하는 게 근본 원인.

### 해결책 비교
| 방법 | 원리 | 장점 | 단점 |
|------|------|------|------|
| **fetch join** (`JOIN FETCH`) | JPQL에서 연관 엔티티를 **한 번의 SQL JOIN**으로 즉시 로딩 | 쿼리 1번으로 해결, 명시적 | 컬렉션 fetch join은 페이징 불가(메모리에서 페이징 처리 위험), 여러 컬렉션 동시 fetch join 시 카테시안 곱 폭발 |
| **@EntityGraph** | 특정 시점에만 연관관계를 EAGER처럼 즉시 로딩 (JPQL 없이 애노테이션으로 지정) | 리포지토리 메서드 단위로 유연하게 적용, fetch join과 유사 효과 | 여전히 컬렉션 다중 조인 시 카테시안 곱 문제는 동일 |
| **batch size** (`@BatchSize` / `hibernate.default_batch_fetch_size`) | 지연 로딩은 유지하되, 필요할 때 **N개를 한 번에 IN 절로 묶어서** 조회 (1+N → 1+⌈N/batchSize⌉) | 페이징과 함께 써도 안전, 컬렉션 여러 개 있어도 안전 | 여전히 쿼리가 여러 번 나감(다만 batch 단위로 줄어듦) |

```java
// fetch join
@Query("select p from Post p join fetch p.member")
List<Post> findAllWithMember();

// @EntityGraph
@EntityGraph(attributePaths = "member")
List<Post> findAll();

// batch size
@BatchSize(size = 100)
@ManyToOne(fetch = FetchType.LAZY)
private Member member;
```

- 🟡 **실무 선택 기준**: 페이징이 필요한 목록 조회라면 fetch join(컬렉션) 대신 **batch size**를 우선 고려, 단건 상세 조회처럼 페이징이 없으면 fetch join이 간단하고 확실.
- 🔴 컬렉션(`@OneToMany`)을 fetch join하면서 페이징(`Pageable`)을 같이 쓰면 Hibernate가 **메모리에서 페이징**을 수행 — 전체 데이터를 다 끌고 온 뒤 자르는 것이라 위험(경고 로그 발생).

**follow-up Q**: *"fetch join과 EntityGraph 둘 다 쓸 수 있는 상황이면 뭘 선택하나요?"*
> 저는 리포지토리 메서드가 이미 JPQL(`@Query`)을 쓰고 있으면 그 안에서 fetch join을 바로 추가하고, 메서드 시그니처만으로 충분한 단순 조회(`findById`, `findAll` 등 Spring Data 기본 메서드)에는 JPQL을 새로 안 짜도 되는 `@EntityGraph`를 씁니다.

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

**Q(꼬리질문). "이 흐름에서 Filter와 Interceptor는 각각 어디에 끼워지나요?"**
> Filter는 DispatcherServlet **앞뒤**(서블릿 컨테이너 단계)에서 실행되고, Interceptor는 DispatcherServlet이 HandlerMapping으로 컨트롤러를 찾은 **다음, 실제 실행 전후**에 끼어듭니다. 자세한 실행 순서·용도 비교는 S3의 7번(Filter vs Interceptor vs AOP)에 정리했습니다.

## 5. 심화 — 이 흐름과 Filter/Interceptor/AOP의 관계 (cross-link)
- 요청이 DispatcherServlet에 도달하기 **전**에 이미 Filter 체인을 거쳐온 상태입니다(서블릿 컨테이너 레벨).
- Controller 진입 **직전/직후**에는 Interceptor의 `preHandle`/`postHandle`이 개입합니다(스프링 MVC 레벨).
- Controller가 호출하는 Service 메서드 레벨에서는 AOP(트랜잭션 등)가 개입합니다(빈 내부 레벨).
- 세 가지 모두 "공통 로직을 어디서 가로챌 것인가"의 답이며, 실행 위치·용도 비교표는 **S3 §7**을 참고.

---
