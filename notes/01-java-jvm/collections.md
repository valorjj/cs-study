# 자바 컬렉션 프레임워크 — 개요

> List·Map·Set·Queue 큰 그림과 "언제 무엇을 고르나" 결정표. 세부는 각 자매 개념 노드에서.

# 자바 컬렉션 개요 (List · Map · Set · Queue)

**학습 목표**: *"자바 컬렉션 프레임워크 구조를 설명하고, 상황에 맞는 자료구조를 고를 수 있나요?"* 에 계층도와 결정표로 5분간 답할 수 있다. (동시성·fail-fast 세부는 아래 **심화**.)

## 1. 비유 — 창고의 보관 방식

```
List  = 번호 붙은 선반(순서·중복 O)      → 순서가 의미 있는 목록
Set   = 회원 명단(중복 X)                → "있냐 없냐"만 중요
Map   = 사물함(열쇠 → 물건)              → 키로 값 꺼내기
Queue = 줄서기/우선 진료                 → 처리 순서 관리
```

## 2. 계층 구조 (한눈에)

```
Iterable
 └ Collection
    ├ List   → ArrayList, LinkedList              (순서 O, 중복 O)
    ├ Set    → HashSet, LinkedHashSet, TreeSet    (중복 X)
    └ Queue  → ArrayDeque, PriorityQueue          (처리 순서)
Map (Collection 아님, 별도 최상위)
    → HashMap, LinkedHashMap, TreeMap, ConcurrentHashMap   (키→값)
```

## 3. "언제 무엇" 결정표

| 요구 | 고르기 | 개념 노드 |
|------|--------|----------|
| 순서 있는 목록, 인덱스 접근 | `ArrayList` | ArrayList · LinkedList |
| 앞뒤 대량 조작(반복자 기반) | `LinkedList` | ArrayList · LinkedList |
| 키로 빠른 조회 | `HashMap` | HashMap |
| 정렬·범위 조회 | `TreeMap` / `TreeSet` | TreeMap · RB트리 |
| 중복 제거 | `HashSet` | Set 구현체 |
| 삽입 순서 유지 dedup | `LinkedHashSet` | Set 구현체 |
| 스택/큐 | `ArrayDeque` | Queue · Deque |
| 우선순위 | `PriorityQueue` | Queue · Deque |
| 스레드 안전 맵 | `ConcurrentHashMap` | HashMap |

## 4. 핵심 원칙 (자주 하는 실수)
- 🔴 인터페이스로 받기: `List<T> list = new ArrayList<>()` (구현 교체 자유).
- 🔴 스택/큐에 `Stack`/`LinkedList` — `ArrayDeque` 권장.
- 🔴 컬렉션 키·원소는 **불변 + hashCode/equals 일관** (가변이면 "못 찾음" 버그).
- 🟡 크기를 알면 초기 capacity 지정(`new ArrayList<>(n)`, `new HashMap<>(n)`) — 재해싱·복사 절약.

<details class="deep">
<summary>심화: fail-fast와 ConcurrentModificationException</summary>

- 대부분의 컬렉션 iterator는 **fail-fast**: 순회 중 구조 변경(add/remove)을 감지하면 `ConcurrentModificationException`을 던진다.
- 구현 방식: 컬렉션의 `modCount`(구조 변경 횟수)를 iterator가 기대값과 비교. 어긋나면 예외.
- 안전하게 순회 중 삭제하려면 **`Iterator.remove()`** 또는 `removeIf(...)`, 혹은 인덱스 역순 for.
- fail-fast는 "버그를 빨리 드러내는" 안전장치일 뿐, 동시성 보장이 아니다(예외가 항상 보장되는 것도 아님).

```java
// ❌ ConcurrentModificationException
for (String s : list) if (cond(s)) list.remove(s);
// ✅
list.removeIf(s -> cond(s));
```

</details>

<details class="deep">
<summary>심화: 불변·동기화 래퍼·동시성 컬렉션</summary>

- **불변/뷰**: `List.of(...)`, `Collections.unmodifiableList(list)` — 변경 시 예외. 방어적 노출에 사용.
- **동기화 래퍼**: `Collections.synchronizedList(...)` — 메서드 단위 락(복합 연산은 여전히 수동 동기화 필요, 순회는 외부 synchronized).
- **동시성 컬렉션**: `ConcurrentHashMap`(버킷 단위 CAS/락), `CopyOnWriteArrayList`(읽기 多·쓰기 少), `ConcurrentLinkedQueue`. 고성능 멀티스레드는 이쪽.

</details>

## 5. 예상 면접 질문 + 답변 골격

**Q1. "자바 컬렉션 프레임워크 구조를 설명해보세요."**
> ① 최상위 Iterable→Collection 아래 List/Set/Queue, 그리고 별도로 Map → ② 각 인터페이스에 용도별 구현체(ArrayList/HashMap/HashSet/ArrayDeque…) → ③ 인터페이스로 받아 구현 교체가 자유롭다.

**꼬리 Q1-1. "Map은 왜 Collection이 아닌가요?"**
> Map은 단일 원소의 모음이 아니라 키-값 쌍의 매핑이라 Collection 계약(단일 요소 순회)과 맞지 않아 별도 최상위로 둡니다. 대신 keySet/values/entrySet 뷰로 Collection처럼 다룰 수 있습니다.

**Q2. "List/Set/Map을 각각 언제 쓰나요?"**
> ① 순서·중복 허용 목록은 List → ② 중복 없는 집합·존재 확인은 Set → ③ 키로 값 조회는 Map. 정렬·범위가 필요하면 Tree 계열.

**Q3. "순회 중 삭제하면 왜 예외가 나나요? (fail-fast)"**
> modCount로 구조 변경을 감지하는 fail-fast 때문입니다. Iterator.remove()나 removeIf로 안전하게 제거해야 합니다.
