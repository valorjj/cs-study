# ArrayList vs LinkedList — 면접 답변 정리본

> List 두 구현체의 차이를 Big-O와 메모리·캐시 관점까지 답할 수 있게.

# ArrayList vs LinkedList

**학습 목표**: *"ArrayList와 LinkedList 중 언제 무엇을 쓰나요?"* 를 Big-O뿐 아니라 **캐시 지역성**까지 곁들여 5분간 답할 수 있다. (내부 성장·메모리 배치는 아래 **심화**를 펼쳐 확인하세요.)

## 1. 비유 — 번호표 좌석 vs 보물찾기 쪽지

```
ArrayList  = 극장 좌석(연속 번호)   → "12번 좌석" 바로 감  O(1)
             중간에 관객 끼워넣기    → 뒤 사람 전부 한 칸씩  O(n)
LinkedList = 보물찾기 쪽지(다음 위치)→ n번째 쪽지까지 따라감 O(n)
             쪽지 사이에 끼워넣기    → 앞뒤 쪽지 2개만 수정  O(1)*
```
\* 단, "그 위치를 이미 알고 있을 때"만 O(1). 위치를 찾아가는 비용 O(n)이 먼저다.

## 2. 개념 정의 (1줄)
> **ArrayList** = 내부가 **동적 배열**(연속 메모리). **LinkedList** = 내부가 **이중 연결 리스트**(노드가 앞/뒤 참조).

## 3. 다이어그램 — 메모리 배치

```
ArrayList:  [A][B][C][D][ ][ ]   ← 연속된 한 덩어리(배열) + 남는 capacity
             ^index 0 ~ 3         임의 접근 = 주소 계산 한 방 O(1)

LinkedList: (A)⇄(B)⇄(C)⇄(D)      ← 노드가 힙 여기저기 흩어짐
             각 노드 = {prev, item, next}  → n번째 = 순차 추적 O(n)
```

## 4. 핵심 동작

| 연산 | ArrayList | LinkedList |
|------|-----------|-----------|
| 임의 접근 `get(i)` | **O(1)** | O(n) |
| 끝에 추가 `add` | O(1) amortized | O(1) |
| 앞/중간 삽입·삭제 | O(n) (밀기) | O(1) *(위치 아는 경우)* + 탐색 O(n) |
| 검색 `contains` | O(n) | O(n) |
| 메모리 | 배열 + 여유공간 | 노드마다 prev/next 참조 오버헤드 |
| 캐시 지역성 | **좋음**(연속) | 나쁨(포인터 추적, cache miss) |

<details class="deep">
<summary>심화: ArrayList의 동적 성장 — capacity·1.5배·System.arraycopy</summary>

- 내부 `Object[] elementData`. 기본 capacity 10(첫 add 시 할당).
- 가득 차면 `grow()`: **newCapacity = old + (old >> 1)** ≈ **1.5배**로 늘리고 `Arrays.copyOf`(내부 `System.arraycopy`)로 통째 복사 → 이 순간만 O(n), 평균은 **amortized O(1)**.
- 크기를 알면 `new ArrayList<>(expectedSize)`로 초기 capacity 지정 → 반복 성장·복사 회피.
- `remove(i)`는 뒤 요소를 `System.arraycopy`로 한 칸씩 당김 → O(n). 끝에서 remove는 O(1).

```java
// 대량 추가 전 capacity 예약 → 성장 복사 제거
List<Integer> list = new ArrayList<>(1_000_000);
```

</details>

<details class="deep">
<summary>심화: LinkedList가 실무에서 거의 안 쓰이는 이유</summary>

- "중간 삽입이 많으면 LinkedList"는 **함정**. 삽입 위치를 찾는 데 이미 O(n)이고, 노드가 힙에 흩어져 **cache miss**가 잦아 상수 인자가 크다. 실측에선 ArrayList가 대부분 더 빠르다.
- LinkedList의 O(1) 삽입/삭제는 **이미 그 노드의 참조(예: ListIterator)를 들고 있을 때**만 유효.
- 자바에서 스택/큐가 필요하면 LinkedList 말고 **`ArrayDeque`**(연속 배열 기반)가 표준(Queue·Deque 노드 참조).
- 결론: 기본은 **ArrayList**, LinkedList는 "양끝 조작 + 반복자 기반 삭제"가 확실할 때만.

</details>

## 5. 자주 하는 실수
- 🔴 "중간 삽입 많으니 LinkedList" — 위치 탐색 O(n) + cache miss로 대개 ArrayList가 빠름.
- 🔴 큐/스택을 `LinkedList`로 — `ArrayDeque` 권장.
- 🟡 대량 add 전에 초기 capacity 미지정 — 여러 번 성장·복사 발생.
- 🟡 `for (int i=0; i<list.size(); i++) list.get(i)`를 LinkedList에 — 매 `get`이 O(n) → 전체 O(n²). 순회는 향상 for/Iterator로.

## 6. 코드
```java
import java.util.ArrayList;
import java.util.List;

List<Integer> list = new ArrayList<>();   // 기본은 ArrayList
list.add(10);                              // amortized O(1)
int x = list.get(0);                       // O(1)
// 앞쪽 대량 삽입/삭제가 지배적이고 반복자 기반이면 그때만 LinkedList 고려
```

## 7. 예상 면접 질문 + 답변 골격

**Q1. "ArrayList와 LinkedList의 차이는?"**
> ① ArrayList=동적 배열(연속), LinkedList=이중 연결 리스트 → ② 임의 접근 O(1) vs O(n), 앞/중간 삽입은 반대 성향 → ③ 실무 기본은 캐시 지역성 좋은 ArrayList.

**꼬리 Q1-1. "그럼 중간 삽입이 잦으면 LinkedList가 유리한가요?"**
> 대개 아니오. 삽입 위치 탐색이 이미 O(n)이고 노드가 흩어져 cache miss가 커서, 실측은 ArrayList가 빠른 경우가 많습니다. LinkedList의 O(1)은 노드 참조를 이미 든 경우에만입니다.

**Q2. "ArrayList는 어떻게 커지나요?"**
> ① 내부 배열이 가득 차면 grow → ② 약 1.5배로 늘려 System.arraycopy로 복사 → ③ 개별 add는 amortized O(1), 크기를 알면 초기 capacity 지정으로 복사 회피.

**꼬리 Q2-1. "add가 O(1)인데 왜 amortized라고 하나요?"**
> 대부분의 add는 O(1)이지만 성장하는 순간은 전체 복사 O(n)이라, n번에 걸쳐 평탄화하면 평균 O(1)이기 때문입니다.

**Q3. "ArrayList의 remove 비용은?"**
> 끝에서 remove는 O(1), 중간/앞은 뒤 요소를 당겨야 해서 O(n)입니다.

**Q4. "배열(array)과 ArrayList의 차이는?"**
> 배열은 고정 크기·제네릭 불가·원시타입 저장 가능, ArrayList는 가변 크기·제네릭·박싱 필요. 성능 극한이면 배열, 편의는 ArrayList.

**Q5. "1억 개 정수를 담아 인덱스 접근만 한다면?"**
> 원시 int라면 `int[]` 배열이 박싱 오버헤드가 없어 최선입니다. ArrayList<Integer>는 Integer 박싱으로 메모리·GC 부담이 큽니다.
