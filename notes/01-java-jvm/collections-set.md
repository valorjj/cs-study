# Set 구현체 — 면접 답변 정리본

> HashSet / LinkedHashSet / TreeSet 차이를 내부 구조와 함께.

# Set 구현체 (HashSet · LinkedHashSet · TreeSet)

**학습 목표**: *"중복 없는 집합이 필요할 때 어떤 Set을 고르나요?"* 를 순서·정렬·성능 기준으로 5분간 답할 수 있다. (내부 구현은 아래 **심화**를 펼쳐 확인하세요.)

## 1. 비유 — 손님 명단 관리

```
HashSet       = 이름을 해시 사물함에 던져둠   → 중복만 막음, 순서 없음
LinkedHashSet = 명단에 도착 순서대로 줄 세움  → 입장 순서 유지
TreeSet       = 자동으로 가나다순 정렬        → 정렬·범위 조회 가능
```

## 2. 개념 정의 (1줄)
> **Set** = 중복을 허용하지 않는 컬렉션. 구현체는 "순서를 어떻게 다루느냐"로 갈린다: 없음(HashSet) / 삽입순(LinkedHashSet) / 정렬(TreeSet).

## 3. 다이어그램

```
HashSet        : 요소 → hashCode → bucket        (순서 개념 없음)      O(1) avg
LinkedHashSet  : HashSet + 이중 연결 리스트로 삽입 순서 기록           O(1) avg
TreeSet        : Red-Black Tree(키 정렬)          (항상 정렬 상태)      O(log n)
```

## 4. 핵심 비교표

| 구현체 | 내부 | 순서 | 시간복잡도 | null | 대표 용도 |
|--------|------|------|-----------|------|----------|
| HashSet | HashMap 기반 | 없음 | O(1) 평균 | 1개 허용 | 빠른 중복 체크 |
| LinkedHashSet | HashMap + 링크드 리스트 | 삽입 순서 | O(1) 평균 | 1개 허용 | 순서 유지 dedup |
| TreeSet | Red-Black Tree | 정렬 | O(log n) | 불가 | 정렬·범위·근사 조회 |

<details class="deep">
<summary>심화: HashSet은 내부적으로 HashMap&lt;E, Object&gt;</summary>

- `HashSet<E>`는 필드로 `HashMap<E, Object>`를 들고, 값 자리에 더미 상수 `PRESENT`를 넣는다.
- `add(e)` = `map.put(e, PRESENT) == null`. 즉 Set의 중복 방지·해싱은 전부 HashMap의 key 메커니즘(hashCode/equals, 충돌·treeify)을 그대로 활용. → HashMap 노드 참조.
- 따라서 Set에 넣는 원소도 **hashCode/equals 계약**을 지켜야 하고, **가변 객체를 넣고 값을 바꾸면** bucket 위치가 어긋나 "있는데 못 찾는" 버그가 난다.

```java
// HashSet 내부(개념)
private transient HashMap<E,Object> map;
private static final Object PRESENT = new Object();
public boolean add(E e) { return map.put(e, PRESENT) == null; }
```

</details>

<details class="deep">
<summary>심화: TreeSet의 Comparator와 NavigableSet(floor/ceiling/subSet)</summary>

- 정렬 기준은 원소의 `Comparable` 또는 **생성자에 주입한 `Comparator`**: `new TreeSet<>(comparator)`.
- `NavigableSet` API: `first/last`, `floor(e)`(≤e 최대), `ceiling(e)`(≥e 최소), `lower/higher`, `subSet(from,to)`, `headSet/tailSet` — 모두 O(log n). HashSet엔 이런 근사·범위 개념이 아예 없다.
- 정렬 비용 때문에 단순 중복 체크만 필요하면 HashSet이 빠르다. 정렬·범위가 필요할 때만 TreeSet.

```java
TreeSet<Integer> ts = new TreeSet<>();
ts.add(10); ts.add(30); ts.add(20);
ts.ceiling(15); // 20  (15 이상 최소)
ts.subSet(10, 25); // [10, 20]
```

</details>

## 5. 자주 하는 실수
- 🔴 가변 객체를 Set 원소로 넣고 필드 변경 → hashCode/정렬 위치 어긋나 "못 찾음".
- 🔴 "Set은 순서가 없다"를 전부에 적용 — LinkedHashSet은 삽입순, TreeSet은 정렬순 유지.
- 🟡 TreeSet에 null 추가 → 정렬 비교 시 NPE(정렬 불가). HashSet은 null 1개 허용.
- 🟡 정렬만 필요해서 TreeSet 썼는데 사실 "정렬된 리스트"면 충분 — `list` + `Collections.sort`가 더 쌀 수 있음.

## 6. 코드
```java
import java.util.*;

Set<String> emails = new HashSet<>();        // 빠른 중복 체크
boolean isNew = emails.add("a@x.com");        // 이미 있으면 false

Set<String> ordered = new LinkedHashSet<>();  // 삽입 순서 유지
Set<Integer> sorted = new TreeSet<>();        // 자동 정렬 + 범위 조회
```

## 7. 예상 면접 질문 + 답변 골격

**Q1. "HashSet은 어떻게 중복을 막나요?"**
> ① 내부가 HashMap<E,Object>라 원소를 key로 저장 → ② put이 기존 key면 null이 아닌 값을 반환 → add는 false → ③ 결국 hashCode/equals로 동일성 판단.

**꼬리 Q1-1. "그럼 원소에 요구되는 조건은?"**
> hashCode/equals를 일관되게 구현하고 불변이어야 합니다. 가변 필드로 hashCode를 만들고 나중에 바꾸면 bucket 위치가 어긋나 못 찾습니다.

**Q2. "HashSet vs TreeSet, 언제 뭘 쓰나요?"**
> ① 단순 중복 체크·존재 확인이면 O(1)의 HashSet → ② 정렬 순회·범위(subSet)·근사(ceiling/floor)가 필요하면 O(log n)의 TreeSet.

**꼬리 Q2-1. "정렬이 필요하면 무조건 TreeSet인가요?"**
> 한 번만 정렬해 순회하면 되는 경우엔 리스트에 담아 Collections.sort가 더 쌀 수 있습니다. 계속 정렬 상태를 유지하며 삽입·범위 조회가 잦을 때 TreeSet이 유리합니다.

**Q3. "LinkedHashSet은 왜 존재하나요?"**
> HashSet의 O(1)을 유지하면서 삽입(또는 접근) 순서를 보장해야 할 때. 예: 중복 제거하되 원래 순서를 지키고 싶을 때.

**Q4. "Set 원소로 가변 객체를 넣으면?"**
> put 이후 hashCode 관련 필드를 바꾸면 bucket/정렬 위치와 실제 값이 어긋나 contains/remove가 실패합니다. 원소는 불변이 원칙입니다.

**Q5. "TreeSet에서 20 이상 중 가장 작은 값을 찾으려면?"**
> `ceiling(20)`을 쓰면 O(log n)에 구할 수 있습니다. HashSet엔 이런 근사 조회가 없어 전체 순회 O(n)가 됩니다.
