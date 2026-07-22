# 디자인 패턴 · 객체지향 설계 — 면접 답변 정리본

> 한국 IT 백엔드 면접용 OOP 설계 원칙(SOLID) + GoF 디자인 패턴 정리.
> 진행 형식: 비유 → 문제 상황 → 패턴/원칙 → 코드(Java) → Spring 실무 연결 → 예상 면접 질문.
> 핵심 관점: **패턴 이름 암기가 아니라 "어떤 문제를, 왜, 어떤 트레이드오프로 푸는가".** 면접관은 "그 패턴을 언제 안 쓰나요?"까지 파고든다.

## 목차
- [DP1. SOLID 원칙](#dp1-solid-원칙) — SRP·OCP·LISKOV·ISP·DIP, 의존성 역전과 DI
- [DP2. 생성 패턴 (Creational)](#dp2-생성-패턴-creational) — Singleton·Factory·Builder, 스레드 안전성
- [DP3. 구조 패턴 (Structural)](#dp3-구조-패턴-structural) — Adapter·Decorator·Proxy·Facade
- [DP4. 행위 패턴 (Behavioral)](#dp4-행위-패턴-behavioral) — Strategy·Observer·Template Method

---

# DP1. SOLID 원칙

**학습 목표**: *"SOLID가 뭔가요?"* / *"OCP를 코드 예시로 설명해보세요"* / *"DIP와 DI(의존성 주입)는 무슨 관계인가요?"* / *"이 원칙을 지키면 뭐가 좋아지나요?"* 에 코드를 들며 5분 답할 수 있다.

## 1. 비유 — 잘 정리된 공구함
좋은 공구함은 ① 드라이버 칸엔 드라이버만(**한 칸=한 역할**, SRP), ② 새 공구가 생겨도 기존 칸을 부수지 않고 칸을 추가(**확장엔 열림·수정엔 닫힘**, OCP), ③ "십자 드라이버 자리에 일자 드라이버를 꽂아도 드라이버로서 동작"(**하위 타입은 상위 타입을 대체 가능**, LSP), ④ 목수는 목공 공구만, 전기공은 전기 공구만 들고 다님(**필요한 것만**, ISP), ⑤ 벽에 콘센트(추상) 규격만 맞으면 어느 회사 플러그든 꽂힘(**구체가 아닌 추상에 의존**, DIP).

## 2. 다섯 원칙 정의 ⭐

| 원칙 | 한 줄 정의 | 위반 시 증상 |
|------|-----------|-------------|
| **S**RP (단일 책임) | 클래스는 **변경 이유가 하나**뿐이어야 한다 | 한 클래스 고치면 무관한 기능이 깨짐 |
| **O**CP (개방-폐쇄) | 확장엔 열려 있고 **수정엔 닫혀** 있어야 | 기능 추가마다 기존 코드에 `if/switch` 증식 |
| **L**SP (리스코프 치환) | 하위 타입은 상위 타입을 **깨뜨리지 않고 대체** 가능 | 자식이 부모 계약을 어겨 다형성이 오작동 |
| **I**SP (인터페이스 분리) | 안 쓰는 메서드에 의존하지 않게 **인터페이스를 잘게** | 거대 인터페이스 때문에 불필요한 구현 강제 |
| **D**IP (의존성 역전) | 고수준·저수준 모두 **추상에 의존**, 구체에 의존 X | 저수준 구현이 바뀌면 고수준까지 재컴파일/수정 |

## 3. OCP + DIP — 코드로 보는 핵심 ⭐
가장 자주 묻는 OCP를 결제 예시로. **나쁜 코드(OCP 위반)**:
```java
class PaymentService {
    void pay(String type, int amount) {
        if (type.equals("card")) { /* 카드 결제 */ }
        else if (type.equals("kakao")) { /* 카카오페이 */ }
        // 결제 수단 추가할 때마다 이 메서드를 "수정"해야 함 → OCP 위반
    }
}
```
**좋은 코드(OCP·DIP 준수)** — 추상(인터페이스)에 의존:
```java
interface PaymentMethod { void pay(int amount); }          // 추상

class CardPayment  implements PaymentMethod { public void pay(int a){/*...*/} }
class KakaoPayment implements PaymentMethod { public void pay(int a){/*...*/} }

class PaymentService {
    private final PaymentMethod method;                     // 구체가 아닌 추상에 의존(DIP)
    PaymentService(PaymentMethod method) { this.method = method; }
    void pay(int amount) { method.pay(amount); }            // 새 수단 추가해도 이 코드는 "수정" 안 함(OCP)
}
```
- 새 결제 수단은 `PaymentMethod`를 **구현(확장)** 하기만 하면 됨 → `PaymentService`는 건드리지 않음(OCP).
- `PaymentService`가 `CardPayment`가 아니라 `PaymentMethod`(추상)에 의존 → 의존성 방향이 "구체→추상"으로 역전(DIP).
- 이 구조가 곧 **전략 패턴**(DP4)이자 **Spring DI**의 본질.

## 4. DIP와 의존성 주입(DI)의 관계 ⭐
- **DIP**(원칙): "구체가 아닌 추상에 의존하라"는 **설계 지침**.
- **DI**(기법): 그 의존 객체를 **외부에서 주입**받는 **구현 방법**(생성자 주입 등). Spring IoC 컨테이너가 이 주입을 대신 해줌.
- 관계: DI는 DIP를 실현하는 대표 수단. 위 예시에서 `PaymentService`가 `new CardPayment()`를 직접 하지 않고 생성자로 주입받는 것이 DI이고, 그 덕에 추상에만 의존하는 DIP가 성립. (→ `spring-ioc` 크로스링크)

<details class="deep">
<summary>심화: LSP 위반의 고전 예 — 정사각형/직사각형, 그리고 "계약"</summary>

- **정사각형-직사각형 문제**: `Square extends Rectangle`으로 만들면, `Rectangle`의 "너비와 높이를 독립적으로 설정 가능"이라는 암묵 계약을 정사각형이 깬다(너비 바꾸면 높이도 바뀜). `setWidth(5); setHeight(4);` 후 넓이가 20이길 기대하는 코드가 정사각형에선 16이 되어 오작동 → 상속했지만 **치환 불가능** = LSP 위반.
- 교훈: 상속은 "is-a"만으로 부족하고 **행위 계약(behavioral contract)** 까지 지켜야 한다. 사전조건을 강화하거나(더 까다롭게) 사후조건을 약화하면(덜 보장) LSP 위반.
- 실무 신호: 자식 클래스에서 부모 메서드를 오버라이드해 `throw new UnsupportedOperationException()`을 하고 있다면 LSP·ISP를 의심(예: 불변 컬렉션이 `add()`에서 예외 던지는 것).

</details>

## 5. 핵심 포인트 (자주 하는 실수)
- 🔴 "SOLID를 다 지키면 무조건 좋은 코드" ❌ — 과하면 **과잉 추상화**(인터페이스·클래스 폭발)로 오히려 복잡해짐. 변경이 잦은 축을 식별해 **필요한 곳에** 적용하는 판단이 핵심.
- 🔴 "DIP = DI" ❌ — DIP는 원칙, DI는 그걸 구현하는 기법. DI 없이도(수동 팩토리 등) DIP를 지킬 수 있음.
- 🟡 SRP의 "책임"은 기능 개수가 아니라 **변경 이유**의 개수 — "이 클래스를 바꾸게 만드는 액터(요구 주체)가 몇인가"로 판단.
- 🟡 OCP는 "모든 걸 미리 추상화하라"가 아니라 "**변경이 예상되는 지점**을 추상화하라". YAGNI와 균형.

## 6. 예상 면접 질문 + 답변 골격
**Q1. "SOLID 원칙을 설명해주세요."**
> 객체지향 설계 5원칙입니다. SRP는 클래스의 변경 이유가 하나여야 한다, OCP는 확장엔 열고 수정엔 닫아야 한다, LSP는 하위 타입이 상위 타입을 계약을 깨지 않고 대체 가능해야 한다, ISP는 인터페이스를 잘게 나눠 안 쓰는 메서드에 의존하지 않게 한다, DIP는 구체가 아닌 추상에 의존하라는 것입니다. 공통 목표는 변경에 강하고 확장하기 쉬운 구조입니다.

**꼬리 Q1-1. "OCP를 실제 코드로 어떻게 달성하나요?"**
> 변경이 예상되는 지점을 인터페이스로 추상화하고, 기존 코드가 그 추상에만 의존하게 합니다. 예를 들어 결제 수단마다 if 분기를 늘리는 대신 `PaymentMethod` 인터페이스를 두면, 새 수단은 이 인터페이스를 구현(확장)하기만 하고 결제 서비스 코드는 수정하지 않습니다. 이게 전략 패턴이자 Spring DI의 본질이기도 합니다.

**Q2. "DIP와 의존성 주입(DI)은 무슨 관계인가요?"**
> DIP는 "추상에 의존하라"는 설계 원칙이고, DI는 그 의존 객체를 외부에서 주입받아 DIP를 실현하는 기법입니다. Spring의 IoC 컨테이너가 구현체를 대신 주입해주므로, 우리 코드는 구체 클래스를 `new` 하지 않고 인터페이스에만 의존할 수 있습니다. 즉 DI는 DIP를 편하게 지키게 해주는 수단입니다.

**Q3(TRADE-OFF). "SOLID를 지나치게 적용하면 어떤 문제가 있나요?"**
> 인터페이스와 클래스가 과도하게 늘어나 오히려 코드를 따라가기 어려워지는 과잉 추상화가 생깁니다. 변경이 거의 없는 부분까지 추상화하면 YAGNI에 어긋나고요. 그래서 저는 "변경·확장이 실제로 예상되는 축"을 먼저 식별하고 그 지점에만 원칙을 적용합니다. 설계 원칙은 목적이 아니라 유지보수성을 위한 수단이라는 관점이 중요하다고 봅니다.

---

# DP2. 생성 패턴 (Creational)

**학습 목표**: *"싱글톤을 스레드 안전하게 구현하는 법은?"* / *"Factory Method와 Abstract Factory 차이는?"* / *"Builder는 왜 쓰나요?"* / *"Spring 빈은 왜 싱글톤인가요?"* 에 코드를 들며 답할 수 있다.

## 1. 비유 — 물건을 만드는 방식의 규칙
객체를 `new`로 직접 만들면 "누가·어떻게 만드는지"가 사용처에 박제된다. 생성 패턴은 **"만드는 책임을 분리"** 한다 — 회사에 물건이 딱 하나만 있어야 하면 총무부가 관리(Singleton), 주문서 종류에 따라 다른 물건을 찍어내면 공장에 맡기고(Factory), 옵션이 많은 물건은 주문 양식을 단계별로 채운다(Builder).

## 2. Singleton — 인스턴스를 하나만 ⭐
> **Singleton** = 특정 클래스의 인스턴스가 **JVM에 단 하나만** 존재하도록 보장하고 전역 접근점을 제공.

**스레드 안전성이 핵심 질문.** 나이브한 lazy 초기화는 멀티스레드에서 인스턴스가 2개 생길 수 있다.

```java
// (1) 권장: enum — 가장 간단하고 안전(직렬화·리플렉션 공격에도 안전)
enum Config { INSTANCE; /* 필드·메서드 */ }

// (2) 권장: 정적 홀더(lazy holder) — 클래스 로딩 시점 보장으로 lazy + thread-safe
class Config {
    private Config() {}
    private static class Holder { static final Config INSTANCE = new Config(); }
    static Config get() { return Holder.INSTANCE; }   // Holder 클래스가 처음 참조될 때 로딩(lazy)
}

// (3) DCL(Double-Checked Locking) — volatile 필수(안 붙이면 부분 초기화 객체 노출 위험)
class Config {
    private static volatile Config instance;          // ← volatile 없으면 깨짐(JMM 재정렬)
    static Config get() {
        if (instance == null) {                        // 1차 체크(락 없이)
            synchronized (Config.class) {
                if (instance == null) instance = new Config();  // 2차 체크
            }
        }
        return instance;
    }
}
```

<details class="deep">
<summary>심화: DCL에 volatile이 왜 반드시 필요한가 (부분 초기화 문제)</summary>

- `instance = new Config()`는 원자적이지 않고 ① 메모리 할당 → ② 생성자 실행 → ③ 참조 대입, 세 단계다. JMM은 이 순서를 **재정렬**할 수 있어, ③(참조 대입)이 ②(생성자 완료)보다 먼저 보일 수 있다.
- 그러면 다른 스레드가 1차 `if (instance == null)`에서 "null 아님"으로 통과하고, **아직 생성자가 안 끝난 반쯤 초기화된 객체**를 받아 쓴다 → 버그.
- `volatile`은 이 재정렬을 막고 가시성을 보장해 "생성 완료된 객체만 보인다"를 강제한다. (→ `concurrency`·JMM 크로스링크. MESI/메모리 배리어가 하드웨어 토대.)
- 그래서 실무에선 DCL보다 **enum이나 정적 홀더**를 선호 — 언어가 안전성을 보장하고 코드가 단순하기 때문.

</details>

## 3. Factory Method vs Abstract Factory
| | Factory Method | Abstract Factory |
|--|----------------|-------------------|
| 목적 | **하나의 제품**을 만드는 메서드를 서브클래스가 결정 | **관련된 제품군(family)** 여러 개를 함께 생성 |
| 구조 | 상속 기반(서브클래스가 오버라이드) | 조합 기반(팩토리 객체를 주입) |
| 예 | `Dialog.createButton()`을 WinDialog/MacDialog가 오버라이드 | `GuiFactory`가 Button+Checkbox+Menu를 세트로 |

- 공통 목적: **객체 생성을 캡슐화**해 사용처가 구체 클래스를 몰라도 되게(new 제거) → OCP·DIP 실현.

## 4. Builder — 복잡한 객체를 단계적으로
> **Builder** = 생성자 인자가 많거나(특히 선택적 인자) 불변 객체를 만들 때, **단계별 메서드 체이닝**으로 가독성 있게 조립.

```java
User user = User.builder()
    .name("kim")
    .email("kim@x.com")     // 선택 인자
    .age(30)                // 순서 무관, 이름으로 명확
    .build();               // 마지막에 불변 객체 완성
```
- **점층적 생성자(telescoping constructor)** 안티패턴 해결: `new User("kim", null, 30, null, ...)` 처럼 인자가 뭘 의미하는지 모를 위험 제거.
- Java `record`·Lombok `@Builder`·`StringBuilder`가 실무 예. 불변성과 궁합이 좋음.

## 5. Spring과의 연결 — 빈은 왜 싱글톤인가 ⭐
- **Spring 빈의 기본 스코프는 싱글톤**: 컨테이너가 빈마다 인스턴스를 하나만 만들어 공유한다. 무상태(stateless) 서비스라 공유해도 안전하고, 매 요청마다 객체를 만들지 않아 메모리·GC 부담이 준다.
- 단, 이건 GoF 싱글톤(전역 정적 접근)과 **다르다**: Spring 싱글톤은 "**컨테이너 관리 범위 내에서 하나**"이며 DI로 주입받는다 → 테스트하기 쉽고 결합도가 낮음. GoF 싱글톤은 전역 상태라 테스트·교체가 어려운 안티패턴 취급을 받기도 한다.
- 주의: 싱글톤 빈에 **가변 상태(인스턴스 필드)** 를 두면 여러 스레드가 공유해 동시성 버그 → 빈은 무상태로 설계.

## 6. 핵심 포인트 (자주 하는 실수)
- 🔴 "싱글톤은 그냥 static 하나 두면 끝" ❌ — 멀티스레드 lazy 초기화는 인스턴스 중복·부분 초기화 위험. enum/정적 홀더가 안전.
- 🔴 "Spring 빈 싱글톤 = GoF 싱글톤" ❌ — Spring은 컨테이너 관리 + DI라 결합도·테스트성이 다름. 전역 정적 접근이 아님.
- 🟡 싱글톤 빈에 가변 필드 금지(스레드 공유). 요청별 상태는 파라미터·ThreadLocal·request 스코프로.
- 🟡 Builder는 인자가 적고 필수뿐이면 과함 — 선택 인자가 많거나 불변 객체일 때 진가.

## 7. 예상 면접 질문 + 답변 골격
**Q1. "싱글톤을 스레드 안전하게 구현하려면?"**
> 가장 간단하고 안전한 건 enum 싱글톤입니다. 직렬화·리플렉션 공격에도 안전하고요. lazy 초기화가 필요하면 정적 홀더 방식이 좋습니다. 내부 static 클래스가 처음 참조될 때 로딩되며 JVM이 클래스 초기화의 원자성을 보장하기 때문입니다. Double-Checked Locking을 쓴다면 인스턴스 필드에 반드시 volatile을 붙여야 하는데, 안 붙이면 객체 생성의 재정렬로 반쯤 초기화된 객체가 노출될 수 있습니다.

**Q2. "Spring 빈이 싱글톤인 이유와, GoF 싱글톤과의 차이는?"**
> Spring은 무상태 서비스 빈을 매 요청마다 새로 만들 이유가 없어 컨테이너가 하나만 만들어 공유합니다. 메모리와 GC에 유리하죠. GoF 싱글톤과 다른 점은, Spring 싱글톤은 전역 정적 접근이 아니라 컨테이너가 관리하고 DI로 주입되는 하나라는 것입니다. 그래서 목(mock)으로 교체해 테스트하기 쉽고 결합도가 낮습니다. 대신 싱글톤 빈에 가변 상태를 두면 스레드 공유로 동시성 버그가 나므로 무상태로 설계해야 합니다.

**Q3. "Factory Method와 Abstract Factory 차이는?"**
> Factory Method는 하나의 제품 생성을 서브클래스가 오버라이드로 결정하는 상속 기반이고, Abstract Factory는 서로 관련된 제품군 여러 개를 한 팩토리가 세트로 생성하는 조합 기반입니다. 공통점은 객체 생성을 캡슐화해 사용처가 구체 클래스를 몰라도 되게 만들어 OCP·DIP를 지키는 것입니다.

---

# DP3. 구조 패턴 (Structural)

**학습 목표**: *"Decorator와 Proxy 차이는?"* / *"Adapter는 언제 쓰나요?"* / *"Spring AOP가 어떤 패턴인가요?"* 에 코드·실무 예를 들며 답할 수 있다.

## 1. 비유 — 이미 있는 것을 조립·포장하기
구조 패턴은 "객체들을 어떻게 조합·연결하느냐"의 문제. 규격이 안 맞는 플러그엔 **어댑터**를 끼우고(Adapter), 선물은 포장지로 **한 겹씩 덧씌우며 기능 추가**(Decorator), 실제 사람 대신 **비서가 대리**로 받고 거를 것 거름(Proxy), 복잡한 내부 부서 대신 **안내데스크 하나**로 창구 통일(Facade).

## 2. 핵심 패턴 요약 ⭐
| 패턴 | 목적 | 대표 예 |
|------|------|---------|
| **Adapter** | 호환 안 되는 인터페이스를 **변환**해 연결 | 레거시 API를 새 인터페이스에 맞춤, `InputStreamReader` |
| **Decorator** | 객체에 **기능을 동적으로 덧씌움**(상속 대신 합성) | `BufferedInputStream(new FileInputStream(..))` |
| **Proxy** | 실제 객체 접근을 **대리·제어**(지연 로딩, 권한, 캐싱, 로깅) | Spring AOP, JPA lazy 로딩, RPC 스텁 |
| **Facade** | 복잡한 서브시스템을 **단순한 상위 인터페이스**로 감쌈 | 복잡한 라이브러리를 감싼 Service 계층 |

## 3. Decorator vs Proxy — 자주 혼동 ⭐
둘 다 "같은 인터페이스로 감싼다"는 구조가 같아 헷갈린다. **차이는 의도(intent)**:
```
Decorator: 원본에 "기능을 추가"가 목적 (여러 겹 중첩 가능)
  new BufferedInputStream(new GZIPInputStream(new FileInputStream(f)))
  → 파일 읽기 + 압축해제 + 버퍼링을 한 겹씩 덧씌움

Proxy: 원본 접근을 "제어·대리"가 목적 (보통 한 겹, 원본 생성/호출 통제)
  UserService proxy = AOP가 감싼 프록시  → 호출 전후에 트랜잭션 시작/커밋, 로깅
```
- **Decorator**는 "무엇을 더할까"(기능 확장), **Proxy**는 "접근을 어떻게 통제할까"(대리). 구조는 닮았지만 목적이 다르다.

## 4. 실무 직결 — Decorator(자바 IO) & Proxy(Spring AOP) ⭐
- **Decorator = 자바 IO 스트림**: `new BufferedReader(new InputStreamReader(new FileInputStream(f)))` — 각 데코레이터가 앞 스트림을 감싸 기능(버퍼링·문자변환)을 더한다. 상속으로 조합 폭발을 피하고 런타임에 조립.
- **Proxy = Spring AOP / 트랜잭션**: `@Transactional`이 붙은 빈은 Spring이 **프록시 객체**로 감싸, 실제 메서드 호출 전에 트랜잭션을 시작하고 후에 커밋/롤백한다. `spring-aop`·`spring-proxy`가 이 패턴. JPA의 지연 로딩 프록시도 동일 원리(실제 접근 시점까지 DB 조회를 미룸). (→ `spring-aop`, `spring-proxy` 크로스링크)

<details class="deep">
<summary>심화: Spring 프록시의 두 방식 — JDK 동적 프록시 vs CGLIB, 그리고 self-invocation 함정</summary>

- **JDK 동적 프록시**: 대상이 **인터페이스를 구현**했을 때, 그 인터페이스 기반으로 런타임 프록시 생성(리플렉션). 인터페이스 없으면 못 만듦.
- **CGLIB**: 대상 **클래스를 상속**해 프록시 생성(바이트코드 조작). 인터페이스 없어도 됨. `final` 클래스·메서드는 오버라이드 불가라 프록시 못 함. Spring Boot는 기본 CGLIB.
- **self-invocation 함정(면접 단골)**: 같은 클래스 안에서 `this.otherMethod()`로 `@Transactional` 메서드를 호출하면 **프록시를 거치지 않아 트랜잭션이 안 걸린다**. 프록시는 외부에서 들어오는 호출만 가로채기 때문. 해결: 자기 자신을 빈으로 주입받아 호출하거나, 메서드를 별도 빈으로 분리.

</details>

## 5. 핵심 포인트 (자주 하는 실수)
- 🔴 "Decorator와 Proxy는 같다" ❌ — 구조는 닮았지만 목적이 다름(기능 추가 vs 접근 제어).
- 🔴 "상속으로 기능 조합하면 된다" ❌ — 기능 N개 조합에 클래스가 조합 폭발(2^N). Decorator는 합성으로 런타임 조립.
- 🟡 Facade는 기존 서브시스템을 숨길 뿐 기능을 못 쓰게 막지 않음 — 필요하면 내부에 직접 접근도 가능.
- 🟡 Adapter는 "변환", Facade는 "단순화" — 둘 다 감싸지만 목적이 다름.

## 6. 예상 면접 질문 + 답변 골격
**Q1. "Decorator와 Proxy 패턴의 차이는?"**
> 둘 다 같은 인터페이스로 원본을 감싸는 구조라 닮았지만 의도가 다릅니다. Decorator는 객체에 기능을 동적으로 덧씌우는 게 목적이라 여러 겹 중첩하고, 자바 IO의 BufferedInputStream이 대표 예입니다. Proxy는 원본 접근을 대리·제어하는 게 목적이라 지연 로딩·권한·트랜잭션 같은 걸 끼웁니다. Spring AOP의 @Transactional 프록시가 대표 예입니다.

**Q2. "Spring AOP는 어떤 디자인 패턴으로 동작하나요?"**
> Proxy 패턴입니다. @Transactional이나 @Async가 붙은 빈을 Spring이 프록시로 감싸서, 실제 메서드 호출 전후에 부가 기능(트랜잭션 시작/커밋, 로깅)을 끼웁니다. 인터페이스가 있으면 JDK 동적 프록시, 없으면 CGLIB로 클래스를 상속해 만듭니다. 주의할 점은 같은 클래스 내부에서 자기 메서드를 호출하면 프록시를 안 거쳐 AOP가 적용되지 않는 self-invocation 문제입니다.

**Q3. "Adapter 패턴은 언제 쓰나요?"**
> 이미 존재하는데 인터페이스가 우리 코드와 안 맞는 클래스를 연결할 때 씁니다. 레거시 라이브러리나 외부 API를 우리 인터페이스에 맞춰 변환하는 경우죠. 예를 들어 자바의 InputStreamReader는 바이트 스트림을 문자 스트림으로 변환하는 어댑터입니다. 원본을 수정하지 않고 중간 변환 계층만 추가해 OCP를 지킬 수 있습니다.

---

# DP4. 행위 패턴 (Behavioral)

**학습 목표**: *"전략 패턴을 코드로 설명해보세요"* / *"Observer 패턴은 어디에 쓰이나요?"* / *"Template Method와 전략 패턴 차이는?"* 에 답할 수 있다.

## 1. 비유 — 역할과 협력을 정하는 규칙
행위 패턴은 "객체들이 어떻게 상호작용·책임 분배하느냐". 상황에 따라 이동 수단(알고리즘)을 갈아끼우고(Strategy), 유튜버가 새 영상 올리면 구독자에게 자동 알림(Observer), 요리 레시피의 "재료 준비→조리→플레이팅" 뼈대는 고정하고 세부만 각자 채움(Template Method).

## 2. 핵심 패턴 요약 ⭐
| 패턴 | 목적 | 대표 예 |
|------|------|---------|
| **Strategy** | 알고리즘을 **런타임에 교체** 가능하게 캡슐화 | 정렬 비교자, 결제/할인 정책, `Comparator` |
| **Observer** | 상태 변화 시 **구독자들에게 자동 통지**(1:N) | 이벤트 리스너, 발행-구독, Spring `ApplicationEvent` |
| **Template Method** | 알고리즘 **뼈대는 상위**, 세부 단계는 **하위**가 구현 | 프레임워크 훅, `AbstractList`, Spring `JdbcTemplate` |

## 3. Strategy — OCP의 교과서 ⭐
> **Strategy** = 동일 목적의 여러 알고리즘을 각각 캡슐화하고 **런타임에 갈아끼울** 수 있게 하는 패턴. DP1의 OCP 예시(PaymentMethod)가 바로 전략 패턴이다.

```java
interface DiscountPolicy { int discount(int price); }
class RateDiscount   implements DiscountPolicy { public int discount(int p){ return p*9/10; } }
class FixedDiscount  implements DiscountPolicy { public int discount(int p){ return p-1000; } }

class Order {
    private DiscountPolicy policy;                        // 전략을 필드로
    void setPolicy(DiscountPolicy p){ this.policy = p; }  // 런타임 교체 가능
    int finalPrice(int price){ return policy.discount(price); }
}
```
- `if (type==RATE) ... else if (type==FIXED)`를 다형성으로 대체 → 새 정책 추가 시 기존 코드 수정 없음(OCP).
- 자바 `Comparator`, `Runnable`, 람다가 사실상 전략 패턴을 언어 차원에서 지원하는 것.

## 4. Observer & Template Method (실무 연결)
- **Observer**: 주체(Subject)가 옵저버 목록을 들고, 상태 변화 시 등록된 옵저버들의 콜백을 호출. **Spring `ApplicationEventPublisher`/`@EventListener`**, 자바 GUI 리스너, Reactor/RxJava의 발행-구독이 이 패턴. 발행자와 구독자를 **decoupling**(→ SD4 메시지 큐와 같은 결의 느슨한 결합).
- **Template Method**: 상위 클래스가 알고리즘 **골격**을 정의하고 변하는 단계만 추상 메서드로 남겨 하위가 구현. **프레임워크의 핵심 원리**("Don't call us, we'll call you" = IoC). `JdbcTemplate`은 커넥션 열기·닫기·예외 변환의 뼈대를 고정하고, 개발자는 쿼리와 매핑만 채운다.

<details class="deep">
<summary>심화: Strategy(합성) vs Template Method(상속) — 언제 무엇을</summary>

- **Template Method는 상속** 기반: 알고리즘 골격을 부모가 쥐고 하위가 훅만 구현. 컴파일 타임에 관계 고정, 런타임 교체 불가. 상속의 강결합(부모 변경이 자식에 파급) 부담.
- **Strategy는 합성** 기반: 알고리즘을 객체로 주입 → 런타임에 갈아끼움, 결합도 낮음. "상속보다 합성을 선호하라"(GoF 원칙)에 부합.
- 판단: 변형 지점이 **하나의 고정된 절차 안의 몇 단계**면 Template Method, 알고리즘 **전체를 통째로 교체·조합**하고 런타임 유연성이 필요하면 Strategy. 실무·현대 설계는 유연성·테스트성 때문에 Strategy(+DI)를 더 선호.
- 참고: 전략을 DI로 주입하면 Spring이 여러 구현체를 `List<DiscountPolicy>`나 `Map<String, DiscountPolicy>`로 주입해줘 런타임 선택이 자연스럽다.

</details>

## 5. 핵심 포인트 (자주 하는 실수)
- 🔴 "Strategy와 Template Method는 같다" ❌ — Strategy는 합성(런타임 교체), Template Method는 상속(골격 고정). 유연성·결합도가 다름.
- 🟡 Observer는 옵저버가 많거나 콜백이 무거우면 통지 비용·순서·예외 전파를 고려 — 비동기 이벤트로 풀기도(→ 메시지 큐).
- 🟡 전략을 enum이나 if로 고르면 다시 OCP 위반 — 전략 자체는 DI/맵으로 주입해 선택.
- 🟢 대부분의 GoF 행위 패턴은 "다형성 + 합성"으로 조건 분기(if/switch)를 제거하는 것이 공통 뼈대.

## 6. 예상 면접 질문 + 답변 골격
**Q1. "전략 패턴을 코드로 설명해보세요."**
> 같은 목적의 여러 알고리즘을 인터페이스로 추상화하고 런타임에 갈아끼우는 패턴입니다. 예를 들어 할인 정책을 DiscountPolicy 인터페이스로 두고 정률·정액 구현을 만들면, 주문 객체는 이 인터페이스에만 의존해 정책을 필드로 주입받습니다. if 분기로 정책을 고르는 대신 다형성으로 대체하니 새 정책을 추가해도 기존 코드를 수정하지 않습니다. OCP를 지키는 전형이고, 자바의 Comparator나 람다가 언어 차원의 전략 패턴입니다.

**Q2. "Template Method가 프레임워크에서 왜 중요한가요?"**
> 프레임워크가 알고리즘의 골격(호출 순서·자원 관리)을 쥐고 개발자는 변하는 부분만 채우는 구조가 Template Method이기 때문입니다. "Don't call us, we'll call you"라는 IoC의 본질이죠. Spring JdbcTemplate이 커넥션 열기·닫기·예외 변환을 고정하고 우리는 쿼리와 결과 매핑만 구현하는 게 대표 예입니다. 반복되는 뼈대를 프레임워크가 책임지고 실수를 줄여줍니다.

**Q3. "Observer 패턴은 어디에 쓰이나요?"**
> 한 객체의 상태 변화를 여러 구독자에게 자동 통지해야 할 때 씁니다. GUI 이벤트 리스너, Spring의 ApplicationEvent와 @EventListener, Reactor/RxJava의 발행-구독이 모두 이 패턴입니다. 발행자와 구독자를 느슨하게 결합해, 구독자를 추가해도 발행자 코드를 바꾸지 않습니다. 구독자가 많거나 처리가 무거우면 비동기 이벤트나 메시지 큐로 확장하는 것도 같은 맥락입니다.

---

# 핵심 질문 (Quiz)

> 답변을 먼저 떠올린 뒤 펼쳐서 확인하세요.

<details>
<summary>Q1. SOLID 5원칙을 한 줄씩 설명하면?</summary>

- **S**RP(단일 책임): 클래스의 변경 이유는 하나여야 함(책임=변경 이유의 수).
- **O**CP(개방-폐쇄): 확장엔 열고 수정엔 닫음 — 기능 추가 시 기존 코드 수정 X(추상화).
- **L**SP(리스코프 치환): 하위 타입이 상위 타입의 계약을 깨지 않고 대체 가능.
- **I**SP(인터페이스 분리): 인터페이스를 잘게 나눠 안 쓰는 메서드에 의존하지 않게.
- **D**IP(의존성 역전): 고수준·저수준 모두 추상에 의존, 구체에 의존 X.

</details>

<details>
<summary>Q2. DIP와 DI(의존성 주입)의 관계는?</summary>

- **DIP**: "구체가 아닌 추상에 의존하라"는 설계 **원칙**.
- **DI**: 의존 객체를 외부에서 **주입**받아 DIP를 실현하는 **기법**(생성자 주입 등). Spring IoC가 대신 주입.
- DI 없이도(수동 팩토리) DIP는 지킬 수 있음 — DI는 DIP를 편하게 지키는 대표 수단.

</details>

<details>
<summary>Q3. 싱글톤을 스레드 안전하게 구현하는 방법과 DCL의 volatile 이유는?</summary>

- **enum 싱글톤**: 가장 간단·안전(직렬화·리플렉션 공격에도 안전).
- **정적 홀더**: 내부 static 클래스가 처음 참조될 때 로딩 → lazy + thread-safe(JVM이 클래스 초기화 원자성 보장).
- **DCL**: `instance` 필드에 반드시 `volatile`. 없으면 `new`의 (할당→생성자→참조대입) 재정렬로 **반쯤 초기화된 객체**가 다른 스레드에 노출됨.
- 실무는 DCL보다 enum/정적 홀더 선호.

</details>

<details>
<summary>Q4. Spring 빈 싱글톤과 GoF 싱글톤의 차이는?</summary>

- Spring 싱글톤: 컨테이너 관리 범위 내 하나 + **DI로 주입** → 테스트·교체 쉬움, 결합도 낮음.
- GoF 싱글톤: 전역 정적 접근점 → 전역 상태라 테스트·교체 어려운 안티패턴 취급도.
- 공통 주의: 싱글톤에 **가변 상태(인스턴스 필드)** 금지 — 스레드 공유로 동시성 버그. 빈은 무상태로.

</details>

<details>
<summary>Q5. Decorator와 Proxy 패턴의 차이는?</summary>

- 구조는 닮음(같은 인터페이스로 원본을 감쌈). **의도가 다름**.
- **Decorator**: 기능을 동적으로 **덧씌움**(여러 겹 중첩). 예: `BufferedInputStream(new FileInputStream(..))`.
- **Proxy**: 원본 접근을 **대리·제어**(지연 로딩·권한·트랜잭션). 예: Spring AOP `@Transactional` 프록시, JPA lazy 로딩.

</details>

<details>
<summary>Q6. Spring AOP 프록시의 두 방식과 self-invocation 함정은?</summary>

- **JDK 동적 프록시**: 인터페이스 기반(인터페이스 필수). **CGLIB**: 클래스 상속 기반(인터페이스 불필요, `final` 불가). Spring Boot 기본 CGLIB.
- **self-invocation**: 같은 클래스 내에서 `this.method()`로 `@Transactional` 메서드 호출 시 **프록시를 안 거쳐 트랜잭션 미적용**. 프록시는 외부 진입 호출만 가로챔.
- 해결: 자기 빈을 주입받아 호출하거나 메서드를 별도 빈으로 분리.

</details>

<details>
<summary>Q7. 전략 패턴(Strategy)과 Template Method의 차이는?</summary>

- **Strategy**: 합성 기반 — 알고리즘을 객체로 주입해 **런타임 교체**, 결합도 낮음. 예: `Comparator`, 할인 정책.
- **Template Method**: 상속 기반 — 알고리즘 **골격을 부모가 고정**, 하위는 변하는 단계만 구현. 컴파일 타임 고정. 예: `JdbcTemplate`(IoC "Don't call us, we'll call you").
- 통째로 교체·런타임 유연성 → Strategy, 고정 절차의 몇 단계만 변형 → Template Method. 현대 설계는 유연성 때문에 Strategy(+DI) 선호.

</details>

<details>
<summary>Q8. Observer 패턴은 무엇이고 어디에 쓰이나?</summary>

- 주체(Subject)의 상태 변화 시 등록된 구독자(Observer)들에게 **자동 통지**(1:N).
- 발행자-구독자를 **decoupling** — 구독자 추가해도 발행자 코드 불변.
- 예: GUI 이벤트 리스너, Spring `ApplicationEvent`/`@EventListener`, Reactor/RxJava 발행-구독.
- 구독자가 많거나 처리가 무거우면 비동기 이벤트·메시지 큐로 확장(같은 느슨한 결합 원리).

</details>
