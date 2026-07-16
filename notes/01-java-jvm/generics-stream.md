# Java Generics & Stream 핵심 — 면접 답변 정리본

> 한국 IT 3년차 백엔드 면접용 Java Generics/Stream 종합 정리 (Track B ⭐⭐⭐ "자주 나옴").
> 진행 형식: 비유 → 정의 → 예제코드 → 비교표 → 핵심포인트 → 예상 면접 질문.

## 목차
- [G1. Generics (제네릭)](#g1-generics-제네릭) — 타입 안정성, 타입 소거, 와일드카드, PECS, 제네릭 메서드
- [G2. Stream API](#g2-stream-api) — 파이프라인, lazy/short-circuit, map/filter/reduce/collect, Optional, parallelStream

---

# G1. Generics (제네릭)

**학습 목표**: *"제네릭을 왜 쓰나요?"* / *"타입 소거 때문에 런타임에 무슨 제약이 생기나요?"* / *"`? extends`와 `? super`는 언제 쓰나요?"* 에 코드 예시 들며 5분 답할 수 있다.

## 1. 비유 — 내용물 라벨이 붙은 택배 상자

라벨 없는 상자(`List`)는 뭐든 넣을 수 있지만, 꺼낼 때마다 "이게 컵인가 접시인가" 열어서 확인(형변환)해야 하고 잘못 캐스팅하면 깨진다(`ClassCastException`). 상자 겉에 **"머그컵 전용"이라고 라벨(`List<Mug>`)**을 붙여두면, 넣을 때 컴파일러가 "머그컵 아니면 못 넣음"이라고 막아주고, 꺼낼 때도 형변환 없이 바로 머그컵으로 쓸 수 있다.

핵심 직관: **제네릭은 "런타임 `ClassCastException`을 컴파일 타임 에러로 앞당기는" 장치**. 안전성 검사를 실행 전으로 옮긴다.

## 2. 개념 정의 (1줄)
> **제네릭(Generics)** = 클래스·인터페이스·메서드가 다룰 타입을 **파라미터화**하여, 컴파일 타임에 타입 안정성을 보장하고 불필요한 형변환을 제거하는 기능.
> 대신 JVM 호환성을 위해 컴파일 후 타입 정보를 지우는 **타입 소거(type erasure)**로 구현된다.

## 3. 타입 안정성 — 형변환 제거 + 컴파일 타임 검증

```java
// 제네릭 이전 (raw type)
List list = new ArrayList();
list.add("hello");
list.add(42);                       // 컴파일 통과 (막지 못함)
String s = (String) list.get(1);    // 런타임 ClassCastException 💥

// 제네릭
List<String> list = new ArrayList<>();
list.add("hello");
list.add(42);                       // ❌ 컴파일 에러 — 실행 전에 잡힘
String s = list.get(0);             // 형변환 불필요
```
> 제네릭의 두 이득: ① **형변환 코드 제거**(가독성), ② **잘못된 타입 삽입을 컴파일 타임에 차단**(안정성).

## 4. 타입 소거 (Type Erasure) ⭐ — 제네릭의 정체이자 제약의 근원

> 제네릭은 **컴파일 타임에만 존재**한다. 컴파일이 끝나면 `List<String>`, `List<Integer>`는 모두 그냥 `List`가 되고, 타입 파라미터 `T`는 `Object`(또는 상한이 있으면 그 상한 타입)로 치환된다. 이걸 **타입 소거**라 한다.

```java
class Box<T> {                    class Box {              // 소거 후
    T value;                          Object value;
    T get() { return value; }         Object get() {...}
}                                 }

class Box<T extends Number> {     class Box {              // 상한이 있으면
    T value;                          Number value;        //  Object가 아닌 Number로
}                                 }
```

### 왜 소거하나? — 하위 호환성
Java 5에서 제네릭이 도입될 때, 기존 non-generic 코드(Java 1.4 라이브러리 등)와 **바이너리 호환**을 유지해야 했다. 그래서 "컴파일러만 타입을 검사하고, 바이트코드에는 타입을 안 남기는" 소거 방식을 택했다. (C#은 반대로 런타임에 타입을 유지하는 reification을 선택 → 대조 포인트.)

### 타입 소거의 결과 (= 런타임 제약) ⭐⭐
런타임에 `T`가 무엇인지 JVM은 **모른다**. 여기서 자주 나오는 면접 제약들이 파생된다.

| 못 하는 것 | 이유 | 대안 |
|-----------|------|------|
| `new T()` | 런타임에 T가 뭔지 몰라 생성 불가 | `Class<T>` 인자 받아 `clazz.newInstance()` / 팩토리 `Supplier<T>` |
| `new T[n]` | 배열은 런타임 타입 정보가 필요한데 T가 소거됨 | `(T[]) new Object[n]` + `@SuppressWarnings` |
| `T.class`, `instanceof T` | 런타임 타입 토큰 없음 | `Class<T>` 토큰 전달 |
| `static T field;` | static은 인스턴스 무관 공유인데 T는 인스턴스별 타입 | static 문맥에선 타입 파라미터 사용 불가 |
| `new List<String>[]` (제네릭 배열) | 배열 공변성 + 소거가 충돌해 타입 안전 깨짐 | `List<List<String>>` 같은 컬렉션 사용 |
| primitive 타입 파라미터 (`List<int>`) | 소거 시 `Object`가 되어야 하는데 primitive는 Object 아님 | 래퍼(`List<Integer>`) — 대신 오토박싱 비용 |

```java
class Factory<T> {
    // T create() { return new T(); }  // ❌ 컴파일 에러
    T create(Class<T> clazz) throws Exception {
        return clazz.getDeclaredConstructor().newInstance();  // ✅ 런타임 토큰으로 우회
    }
}
```

### 또 하나의 결과 — 오버로딩 충돌 & 브리지 메서드
```java
void print(List<String> l) {}
void print(List<Integer> l) {}   // ❌ 둘 다 소거 후 print(List) — "same erasure" 컴파일 에러
```
> 소거 후 시그니처가 같아지면 오버로딩이 성립하지 않는다. 또 상속 시 소거로 시그니처가 어긋나는 걸 메우려고 컴파일러가 **브리지 메서드(bridge method)**를 몰래 생성한다는 점도 알아두면 좋다.

## 5. 와일드카드 `? extends` / `? super` 와 PECS ⭐

### 먼저: 제네릭은 불공변(invariant)이다
```java
List<Object> objs = new ArrayList<String>();  // ❌ 컴파일 에러!
```
`String`이 `Object`의 하위 타입이어도 `List<String>`은 `List<Object>`의 하위 타입이 **아니다**(불공변). 만약 허용하면 `objs.add(42)` 로 String 리스트에 Integer를 넣어 안전성이 깨지기 때문. 이 경직성을 유연하게 푸는 게 **와일드카드**.

### `? extends T` (상한 경계) — 읽기 전용(Producer)
```java
double sum(List<? extends Number> list) {   // Number이거나 그 하위(Integer, Double...)
    double s = 0;
    for (Number n : list) s += n.doubleValue();  // ✅ 읽기 OK — 최소한 Number임이 보장
    // list.add(1);   // ❌ 쓰기 불가 — 실제 타입이 Integer인지 Double인지 몰라 아무것도 못 넣음
    return s;
}
```
- **읽을 때** 유용: 원소를 최소 `Number`로 꺼내 쓸 수 있다 → 리스트가 값을 **생산(produce)**한다.

### `? super T` (하한 경계) — 쓰기 전용(Consumer)
```java
void addNumbers(List<? super Integer> list) {  // Integer이거나 그 상위(Number, Object)
    list.add(1);            // ✅ 쓰기 OK — Integer는 어떤 상위 타입 리스트에도 들어감
    list.add(2);
    // Integer i = list.get(0);  // ❌ 꺼내면 Object로만 받음 — 실제 타입을 모름
    Object o = list.get(0);      // Object로만 안전
}
```
- **쓸 때** 유용: `Integer`(또는 그 하위)를 넣을 수 있다 → 리스트가 값을 **소비(consume)**한다.

### PECS 원칙 — Producer Extends, Consumer Super
> 데이터를 꺼내 쓰기만(생산자) 하면 `? extends T`, 데이터를 넣기만(소비자) 하면 `? super T`. `Collections.copy(dest, src)`가 교과서 예시.
```java
static <T> void copy(List<? super T> dest, List<? extends T> src) {
    //                     ↑ 소비자(넣음)         ↑ 생산자(꺼냄)
    for (int i = 0; i < src.size(); i++) dest.set(i, src.get(i));
}
```

## 6. 제네릭 메서드 (Generic Method)

메서드 단위로 타입 파라미터를 선언 → 클래스가 제네릭이 아니어도, 호출마다 다른 타입으로 쓸 수 있다.
```java
public static <T> T firstOrDefault(List<T> list, T def) {   // 리턴 타입 앞 <T>가 선언
    return list.isEmpty() ? def : list.get(0);
}
String s = firstOrDefault(names, "none");   // T=String 추론
Integer n = firstOrDefault(nums, 0);        // T=Integer 추론 (호출마다 다름)

// 다중 경계
static <T extends Comparable<T> & Serializable> T max(T a, T b) {
    return a.compareTo(b) >= 0 ? a : b;
}
```
> 타입 파라미터는 보통 **인자로부터 추론**된다. 명시하려면 `Util.<String>firstOrDefault(...)`.

## 7. 핵심 포인트 (자주 하는 실수)
- 🔴 "`List<String>`은 `List<Object>`의 하위 타입" ❌ — 제네릭은 **불공변**. (반면 배열은 공변 → `Object[] a = new String[]`는 되지만 런타임에 `ArrayStoreException` 위험)
- 🔴 "런타임에 `T`의 타입을 알 수 있다" ❌ — **타입 소거**로 지워짐. `new T()`·`T.class`·`instanceof T` 불가.
- 🔴 "`? extends`에 add 할 수 있다" ❌ — `? extends`는 읽기 전용(null만 add 가능), `? super`가 쓰기.
- 🟡 raw type(`List`)은 쓰지 말 것 — 제네릭 도입 전 호환용일 뿐, 타입 검사를 무력화.
- 🟡 `List<Object>`와 `List<?>`는 다름 — 전자는 "Object 리스트"(String 리스트 대입 불가), 후자는 "무슨 타입인지 모르는 리스트"(대입은 되지만 읽으면 Object, add 불가).

## 8. 예상 면접 질문 + 답변 골격
**Q1. "제네릭을 왜 쓰나요?"**
> ① 컴파일 타임에 타입 안정성 보장 — 잘못된 타입 삽입을 실행 전에 차단 → ② 형변환 코드 제거로 가독성↑ → ③ 즉 런타임 `ClassCastException`을 컴파일 에러로 앞당기는 것.

**Q2. "타입 소거 때문에 런타임에 무슨 제약이 생기나요?"**
> 컴파일 후 `T`가 `Object`(상한 있으면 그 상한)로 지워져 런타임엔 타입 정보가 없음 → ① `new T()`/`new T[]` 불가 → ② `T.class`·`instanceof T` 불가 → ③ 소거 후 시그니처가 같아지는 오버로딩 불가 → ④ static 문맥에서 타입 파라미터 사용 불가. 우회는 `Class<T>` 토큰이나 팩토리를 주입받는 것.

**Q3. "`List<Object>`에 `List<String>`을 넣을(대입할) 수 있나요?"**
> 못 한다. 제네릭은 불공변이라 `List<String>`은 `List<Object>`의 하위 타입이 아니다. 만약 됐다면 그 참조로 `add(Integer)`를 해서 String 리스트를 오염시킬 수 있어 타입 안전이 깨지기 때문. 여러 타입을 함께 다루려면 `List<?>`나 `List<? extends Object>` 같은 와일드카드를 쓴다.

**Q4. "`? extends`와 `? super`는 언제 쓰나요? (PECS)"**
> 데이터를 꺼내 읽기만 하는 생산자 파라미터엔 `? extends T`(최소 T로 읽기 보장, 쓰기 불가), 데이터를 넣기만 하는 소비자 파라미터엔 `? super T`(T를 안전히 넣기, 읽으면 Object). 외우는 말이 PECS — Producer Extends, Consumer Super. `Collections.copy(dest super, src extends)`가 대표 예.

**Q5. "제네릭 배열 생성(`new T[]`)이 왜 안 되나요?"**
> 배열은 런타임에 자기 원소 타입을 알고 있어야(ArrayStore 검사) 하는데, 제네릭은 소거로 그 타입이 사라지므로 안전한 배열을 만들 수 없다. 게다가 배열은 공변, 제네릭은 불공변이라 둘을 섞으면 타입 구멍이 생긴다. 그래서 `(T[]) new Object[n]`으로 우회하거나 아예 `List<T>`를 쓴다.

---

# G2. Stream API

**학습 목표**: *"스트림 파이프라인 구조를 설명해주세요"* / *"lazy evaluation이 뭐죠?"* / *"parallelStream은 언제 쓰면 안 되나요?"* 에 예시 들며 5분 답할 수 있다.

## 1. 비유 — 공장 컨베이어 벨트

원재료(데이터 소스)가 컨베이어(스트림)를 타고 흐르며, 중간중간 가공 기계(중간 연산: 자르기 `filter`, 모양 바꾸기 `map`)를 거쳐, 마지막에 포장 기계(종단 연산: `collect`, `sum`)에서 완제품이 나온다. 중요한 건 **포장 기계 스위치를 켜기 전엔 컨베이어가 안 움직인다**(lazy) — 그리고 "10개만 포장하면 끝"이면 11번째부터는 가공조차 안 한다(short-circuit).

핵심 직관: 스트림은 **"무엇을(what)" 선언하면 "어떻게(how)"는 런타임이 최적화**하는 선언형 파이프라인. 데이터를 저장하지 않고 흘려보낸다.

## 2. 개념 정의 (1줄)
> **Stream** = 컬렉션·배열 등의 데이터 소스를 대상으로 하는 **선언형 데이터 처리 파이프라인**. 원본을 변경하지 않고(비파괴), 요소를 한 번 흘려보내며(1회용), 필요할 때만 계산한다(lazy).
> 구조: **소스 → 0개 이상의 중간 연산(lazy) → 1개의 종단 연산(eager, 여기서 실제 실행)**.

## 3. 파이프라인 — 중간 연산 vs 종단 연산

```
List<String> names           소스(Source)
    .stream()                스트림 생성
    .filter(s -> s.length()>3)   중간 연산 ─┐  Stream<T> 반환
    .map(String::toUpperCase)    중간 연산 ─┤  (아직 아무것도 실행 안 됨: lazy)
    .sorted()                    중간 연산 ─┘
    .collect(toList());          종단 연산 ← 이 순간 전체 파이프라인이 "한 번" 흐름
```

| 구분 | 반환 | 실행 시점 | 예 |
|------|------|-----------|-----|
| **중간 연산** | `Stream<T>` (체이닝) | **지연(lazy)** — 등록만 | `filter`, `map`, `flatMap`, `sorted`, `distinct`, `limit`, `peek` |
| **종단 연산** | Stream 아님(값/컬렉션/void) | **즉시(eager)** — 여기서 전체 실행 | `collect`, `forEach`, `reduce`, `count`, `sum`, `findFirst`, `anyMatch` |

> 종단 연산이 없으면 스트림은 **아무 일도 하지 않는다**. (중간 연산만 있는 파이프라인은 no-op)

## 4. Lazy Evaluation & Short-circuit ⭐

### Lazy — 종단 연산 전엔 실행 안 됨 + 요소별 세로 순회
```java
Stream.of("a", "bb", "ccc")
    .filter(s -> { System.out.println("filter: " + s); return s.length() > 1; })
    .map(s -> { System.out.println("map: " + s); return s.toUpperCase(); })
    .findFirst();
// 출력:
// filter: a          ← "a"가 filter 통과 못함
// filter: bb         ← "bb" 통과
// map: bb            ← 바로 map으로 (전체 filter 후 전체 map이 아님!)
// → 결과 "BB" 찾자마자 종료 ("ccc"는 아예 처리 안 함)
```
> 스트림은 소스를 한 번에 다 거르고 다 매핑하는 게(가로) 아니라, **요소 하나가 파이프라인 끝까지 흐른 뒤 다음 요소**(세로/element-by-element)로 간다. 덕분에 필요한 만큼만 계산.

### Short-circuit — 조건 만족 시 즉시 중단
- `findFirst`, `findAny`, `anyMatch`, `allMatch`, `noneMatch`, `limit`은 **결과가 확정되면 나머지를 안 본다**.
- 그래서 `Stream.iterate(1, n->n+1)` 같은 **무한 스트림**도 `.limit(10)`이나 `findFirst`와 함께면 종료된다.

## 5. 주요 연산 — map / filter / reduce / collect

```java
// filter: 조건 통과만 남김 (Stream<T> → Stream<T>)
list.stream().filter(u -> u.getAge() >= 20)

// map: 각 요소를 1:1 변환 (Stream<T> → Stream<R>)
    .map(User::getName)

// reduce: 요소를 하나의 값으로 누적 접기
int total = nums.stream().reduce(0, Integer::sum);   // (초기값, 결합함수)

// collect: 가변 컨테이너로 수집 (가장 많이 씀)
Map<Dept, List<User>> byDept =
    users.stream().collect(Collectors.groupingBy(User::getDept));
String csv = names.stream().collect(Collectors.joining(", "));
```

- `flatMap`: 각 요소를 스트림으로 바꾼 뒤 **1개로 평탄화** (`Stream<List<T>>` → `Stream<T>`). 중첩 구조 펼칠 때.
- `reduce` vs `collect`: reduce는 **불변 값 누적**(합계 등), collect는 **가변 컨테이너 축적**(List/Map). 병렬에서 collect가 더 효율적(스레드별 컨테이너 병합).

## 6. Optional — null 대신 "값이 있을 수도"

```java
Optional<User> found = users.stream()
    .filter(u -> u.getId() == id)
    .findFirst();

// 안티패턴: found.get()  ← 비어있으면 NoSuchElementException (isPresent 후 get도 지양)
String name = found.map(User::getName)          // 있을 때만 변환
                   .orElse("Unknown");          // 없으면 기본값
found.ifPresent(u -> log.info(u.getName()));    // 있을 때만 실행
User u = found.orElseThrow(() -> new NotFoundException(id));  // 없으면 예외
```
> Optional은 **"결과가 없을 수 있음"을 타입으로 강제**해 NPE를 줄인다. 단 ① 필드/파라미터/컬렉션 원소로 쓰지 말 것(반환 타입 전용), ② `Optional.get()` 남발 금지 → `map/orElse/orElseThrow`로 흘려보내기.

## 7. parallelStream() — 이점과 함정 ⭐⭐

```java
long count = list.parallelStream().filter(...).count();  // ForkJoinPool로 분할 병렬 처리
```
내부적으로 데이터를 쪼개(spliterator) **공용 ForkJoinPool**의 여러 스레드가 나눠 처리 후 병합. CPU 코어를 활용해 대용량·CPU 바운드 작업을 가속.

### 언제 쓰면 안 되나 (함정)
- 🔴 **공유 가변 상태(shared mutable state)**: 람다 안에서 외부 리스트에 `add`, 카운터 `++` 등 → 데이터 레이스. 
  ```java
  List<Integer> result = new ArrayList<>();
  nums.parallelStream().forEach(result::add);  // 💥 ArrayList는 thread-unsafe → 유실/깨짐
  // → collect(toList())로 해결 (프레임워크가 안전하게 병합)
  ```
- 🔴 **순서에 의존**: `forEach`는 병렬 시 순서 보장 안 됨 → 순서 필요하면 `forEachOrdered`(하지만 병렬 이점 반감).
- 🔴 **박싱/작은 데이터**: 요소 적거나 연산이 가벼우면 **분할·스레드·병합 오버헤드가 이득을 초과**. `IntStream` 등 primitive 스트림 아니면 오토박싱 비용도 큼.
- 🔴 **I/O 바운드 / 블로킹 작업**: 공용 ForkJoinPool은 전체 앱이 공유 → 여기서 블로킹하면 **다른 병렬 작업까지 굶는다(pool starvation)**.
- 🔴 **reduce의 결합법칙 위반**: 병렬 reduce의 결합 함수는 **associative**해야 함(뺄셈 등 순서 의존 연산은 병렬에서 결과가 달라짐).

> 실무 판단: "데이터가 충분히 크고(수만~), 연산이 CPU 바운드이며, 각 작업이 독립적(공유 상태·순서·블로킹 없음)"일 때만. 대부분의 웹 요청 처리에선 **그냥 순차 stream**이 맞고, 병렬은 벤치마크로 이득을 확인한 뒤 쓴다.

## 8. 비교표 — for문 vs Stream
| | 전통 for문 | Stream |
|--|-----------|--------|
| 스타일 | 명령형(how) — 어떻게 순회할지 직접 | 선언형(what) — 무엇을 할지 선언 |
| 가독성 | 로직 길면 장황 | 파이프라인으로 의도가 드러남 |
| 가변 상태 | 인덱스/누적 변수 직접 관리 | 무상태 지향(부수효과 지양) |
| 중단(break) | `break`/`return` 자유 | short-circuit 연산으로만(`findFirst` 등) |
| 성능 | 오버헤드 없음, 최고 | 소규모/단순 루프는 살짝 느릴 수 있음 |
| 디버깅 | 브레이크포인트 쉬움 | 람다 내부 디버깅 상대적 불편(`peek` 활용) |
| 병렬화 | 직접 스레드 관리 | `.parallelStream()`으로 선언적 전환 |

> 결론: **복잡한 데이터 변환·집계·그룹핑은 Stream이 가독성 압승**, 단순 반복이나 성능이 극도로 중요한 핫루프는 for문. 취향이 아니라 상황으로 고른다.

## 9. 핵심 포인트 (자주 하는 실수)
- 🔴 스트림은 **1회용** — 종단 연산 후 재사용하면 `IllegalStateException: stream has already been operated upon`.
- 🔴 중간 연산만 쓰고 종단 연산 안 붙이면 **아무것도 실행 안 됨**(no-op). `peek`만 믿지 말 것.
- 🔴 `forEach` 안에서 외부 컬렉션 수정(부수효과) — 특히 병렬에서 위험. 수집은 `collect`.
- 🟡 `Optional.get()` 직접 호출 지양 → `orElse/orElseThrow/map`. Optional을 필드·파라미터로 쓰지 말 것.
- 🟡 primitive는 `IntStream/LongStream/DoubleStream` — `Stream<Integer>`는 오토박싱 비용.
- 🟡 무한 스트림(`iterate`/`generate`)엔 반드시 `limit` 등 short-circuit — 아니면 무한 루프.

## 10. 예상 면접 질문 + 답변 골격
**Q1. "스트림 파이프라인 구조를 설명해주세요."**
> 소스(컬렉션 등) → 0개 이상의 중간 연산(filter/map, Stream을 반환하며 lazy) → 1개의 종단 연산(collect/reduce, 여기서 실제 실행). 중간 연산은 등록만 되고, 종단 연산이 호출되는 순간 요소들이 한 번 흐른다. 원본 불변, 1회용.

**Q2. "lazy evaluation이 뭐고 왜 좋나요?"**
> 중간 연산은 즉시 실행되지 않고 종단 연산 때 한꺼번에 실행된다. 게다가 요소 하나가 파이프라인 끝까지 흐른 뒤 다음 요소로 가는 세로 순회라, `findFirst`·`limit` 같은 short-circuit과 만나면 필요한 만큼만 계산하고 나머지는 건너뛴다 → 불필요한 연산 절감, 무한 스트림도 처리 가능.

**Q3. "map과 flatMap의 차이는?"**
> map은 요소를 1:1로 변환(`Stream<T>`→`Stream<R>`). flatMap은 각 요소를 스트림으로 바꾼 뒤 하나의 스트림으로 평탄화(`Stream<List<T>>`→`Stream<T>`). 중첩 컬렉션을 펼치거나 요소당 0~N개로 확장할 때 flatMap.

**Q4. "parallelStream을 언제 쓰면 안 되나요?"**
> ① 람다에서 공유 가변 상태를 건드릴 때(데이터 레이스), ② 순서에 의존할 때, ③ 데이터가 작거나 연산이 가벼워 분할·병합 오버헤드가 이득을 넘을 때, ④ I/O·블로킹 작업일 때(공용 ForkJoinPool을 굶김), ⑤ reduce 결합 함수가 결합법칙을 안 지킬 때. 웹 요청 처리 대부분은 순차 stream이 맞고, 병렬은 대용량·CPU바운드·독립 작업에서 벤치마크로 확인 후 쓴다.

**Q5. "reduce와 collect의 차이는?"**
> reduce는 불변 값을 접어 하나로 누적(합계, 최댓값 등). collect는 가변 컨테이너(List/Map/String)에 축적하는 mutable reduction. 병렬 환경에선 스레드별 컨테이너를 만들어 병합하는 collect가 리스트/맵 생성에 더 효율적이고, reduce로 리스트를 만들면 매번 새 리스트를 생성해 비효율적이다.

**Q6. "Optional은 왜 쓰고 어떻게 써야 하나요?"**
> "값이 없을 수 있음"을 타입으로 명시해 NPE와 방어적 null 체크를 줄인다. `get()`이나 `isPresent()`+`get()` 조합은 안티패턴이고, `map`으로 변환하고 `orElse`/`orElseThrow`로 부재를 처리해 흘려보낸다. 메서드 반환 타입으로만 쓰고 필드·파라미터·컬렉션 원소로는 쓰지 않는다.

---

# 핵심 질문 (Quiz)

> 답변을 먼저 떠올린 뒤 펼쳐서 확인하세요.

<details>
<summary>Q1. 제네릭을 쓰는 이유와, 얻는 이점 두 가지는?</summary>

- 타입을 파라미터화해 **컴파일 타임에 타입 안정성**을 보장하는 기능
- 이점 ① 잘못된 타입 삽입을 실행 전에 컴파일 에러로 차단(안정성)
- 이점 ② 형변환 코드 제거로 가독성↑
- 한 줄: 런타임 `ClassCastException`을 컴파일 타임으로 앞당기는 장치

</details>

<details>
<summary>Q2. 타입 소거(type erasure)가 무엇이고, 왜 그렇게 구현했나?</summary>

- 컴파일이 끝나면 `List<String>`/`List<Integer>`가 모두 `List`가 되고, 타입 파라미터 `T`는 `Object`(상한 있으면 그 상한 타입)로 치환되는 것
- 제네릭 타입 정보는 **컴파일 타임에만 존재**하고 바이트코드엔 안 남음
- 이유: Java 5 도입 시 기존 non-generic 코드와의 **바이너리 하위 호환** 유지 (C#은 반대로 런타임 유지 = reification)

</details>

<details>
<summary>Q3. 타입 소거 때문에 런타임에 생기는 제약을 3개 이상 대라.</summary>

- `new T()` 불가 — 런타임에 T를 몰라 인스턴스 생성 불가 (`Class<T>`/팩토리로 우회)
- `new T[]` (제네릭 배열) 불가 — 배열은 런타임 원소 타입이 필요한데 소거됨
- `T.class` / `instanceof T` 불가 — 런타임 타입 토큰 없음
- 소거 후 시그니처가 같아지는 오버로딩 불가 (`print(List<String>)` vs `print(List<Integer>)`)
- static 문맥에서 클래스의 타입 파라미터 사용 불가

</details>

<details>
<summary>Q4. `List<Object> objs = new ArrayList<String>();` 이 컴파일되나? 왜?</summary>

- 컴파일 **에러**. 제네릭은 **불공변(invariant)** — `String`이 `Object`의 하위여도 `List<String>`은 `List<Object>`의 하위 타입이 아니다
- 허용됐다면 `objs.add(42)`로 String 리스트에 Integer를 넣어 타입 안전이 깨지기 때문
- (대조: 배열은 공변이라 `Object[] a = new String[3]`은 되지만, `a[0]=42`에서 런타임 `ArrayStoreException`)

</details>

<details>
<summary>Q5. `? extends T`와 `? super T`의 차이, 그리고 PECS 원칙은?</summary>

- `? extends T`: 상한 경계. 최소 T로 **읽기(꺼내기)**는 되지만, 실제 하위 타입을 몰라 **쓰기(add) 불가**(null 제외) → 생산자(Producer)
- `? super T`: 하한 경계. T(및 하위)를 안전히 **넣기(add)** 가능, 꺼내면 Object로만 → 소비자(Consumer)
- **PECS = Producer Extends, Consumer Super**: 꺼내 쓰면 extends, 넣기만 하면 super
- 예: `Collections.copy(List<? super T> dest, List<? extends T> src)`

</details>

<details>
<summary>Q6. 스트림 중간 연산과 종단 연산의 차이, 그리고 lazy evaluation이란?</summary>

- 중간 연산: `Stream<T>`를 반환하고 체이닝됨, **지연(lazy)** — 등록만 되고 실행 안 함 (`filter`, `map`, `sorted`, `limit`...)
- 종단 연산: Stream이 아닌 값/컬렉션/void 반환, **즉시(eager)** — 이 순간 전체 파이프라인이 한 번 실행 (`collect`, `reduce`, `forEach`, `findFirst`...)
- lazy evaluation: 종단 연산 전엔 아무것도 실행 안 되고, 실행 시엔 요소 하나가 파이프라인 끝까지 흐른 뒤 다음 요소로(세로 순회) → short-circuit(`findFirst`/`limit`)과 만나면 필요한 만큼만 계산

</details>

<details>
<summary>Q7. parallelStream을 쓰면 안 되는 상황을 설명하라.</summary>

- **공유 가변 상태**: 람다에서 외부 컬렉션 add·카운터 증가 → 데이터 레이스 (해결: `collect`)
- **순서 의존**: 병렬 `forEach`는 순서 보장 X
- **작은 데이터 / 가벼운 연산**: 분할·스레드·병합 오버헤드 > 이득, 박싱 비용도 큼
- **I/O·블로킹**: 공용 ForkJoinPool을 굶겨(pool starvation) 앱 전체 병렬 작업 저해
- **결합법칙 위반 reduce**: associative하지 않으면 병렬 결과가 달라짐
- 요약: 대용량 + CPU바운드 + 독립 작업일 때만, 벤치마크 후 사용

</details>

<details>
<summary>Q8. reduce와 collect의 차이, 그리고 Optional을 올바르게 쓰는 법은?</summary>

- **reduce**: 불변 값을 접어 하나로 누적(합계·최댓값 등). 병렬 시 결합 함수는 associative해야 함
- **collect**: 가변 컨테이너(List/Map/String)에 축적하는 mutable reduction. 병렬에서 스레드별 컨테이너 병합이라 리스트/맵 생성에 효율적
- **Optional 올바른 사용**: `map`으로 변환하고 `orElse`/`orElseThrow`로 부재 처리, `ifPresent`로 조건 실행. `get()`·`isPresent()+get()`은 안티패턴. 반환 타입 전용 — 필드/파라미터/컬렉션 원소로 쓰지 말 것

</details>
