# Queue · Deque — 면접 답변 정리본

> 자바에서 스택·큐·우선순위 큐를 무엇으로 구현하는지, 왜 그런지.

# Queue · Deque (ArrayDeque · PriorityQueue)

**학습 목표**: *"자바에서 스택/큐를 어떻게 구현하나요?"* 에 `Stack` 클래스를 피하고 `ArrayDeque`를 쓰는 이유까지 5분간 답할 수 있다. (내부 구조는 아래 **심화**를 펼쳐 확인하세요.)

## 1. 비유 — 줄서기와 우선 진료

```
Queue (FIFO)      = 매표소 줄        → 먼저 온 사람 먼저 (offer 뒤로, poll 앞에서)
Stack (LIFO)      = 접시 쌓기        → 마지막에 올린 접시 먼저 (push/pop 한쪽 끝)
Deque             = 양쪽 문 있는 줄  → 앞/뒤 모두 넣고 뺄 수 있음 (스택+큐 둘 다)
PriorityQueue     = 응급실 우선 진료 → 순서 무관, "우선순위 최상"부터
```

## 2. 개념 정의 (1줄)
> **Deque**(double-ended queue) = 양끝에서 넣고 뺄 수 있는 자료구조. 자바에선 **`ArrayDeque`**가 스택·큐의 표준 구현이고, 우선순위가 필요하면 **`PriorityQueue`**(이진 힙).

## 3. 다이어그램

```
ArrayDeque (원형 배열):   [ _ ][ B ][ C ][ D ][ _ ]
                            head↑         ↑tail   → 양끝 O(1), 배열이라 캐시 친화적

PriorityQueue (binary heap, 배열 표현):
                 (2)
                /   \
             (5)     (8)     offer/poll = O(log n),  peek(최소) = O(1)
            /  \
         (9)   (7)
```

## 4. 핵심 비교표

| 용도 | 권장 | 피할 것 | 이유 |
|------|------|---------|------|
| 스택(LIFO) | `ArrayDeque` (push/pop) | `Stack` | Stack은 Vector 상속·전체 동기화·레거시 |
| 큐(FIFO) | `ArrayDeque` (offer/poll) | `LinkedList` | 배열 기반이 캐시 친화·오버헤드 적음 |
| 양끝 조작 | `ArrayDeque` | — | Deque 표준 구현 |
| 우선순위 | `PriorityQueue` | 정렬 반복 | 힙으로 offer/poll O(log n) |
| 스레드 안전 큐 | `ConcurrentLinkedQueue` / `LinkedBlockingQueue` | `ArrayDeque` | ArrayDeque는 비동기 |

<details class="deep">
<summary>심화: 왜 Stack 클래스를 쓰지 말고 ArrayDeque인가</summary>

- `java.util.Stack`은 `Vector`를 상속 → **모든 연산에 synchronized**(단일 스레드에도 락 비용), 게다가 인덱스 접근(`get(i)`)까지 열려 있어 스택 추상화가 깨진다(중간을 들여다볼 수 있음).
- `Vector`/`Stack`은 사실상 레거시. 공식 문서도 `Deque`를 스택으로 쓰길 권장.
- `ArrayDeque`는 원형 배열 기반이라 양끝 push/pop이 amortized O(1)이고 노드 오버헤드·cache miss가 없다.

```java
Deque<Integer> stack = new ArrayDeque<>();
stack.push(1); stack.push(2);
int top = stack.pop();   // 2 (LIFO)

Deque<Integer> queue = new ArrayDeque<>();
queue.offer(1); queue.offer(2);
int front = queue.poll(); // 1 (FIFO)
```

⚠️ `ArrayDeque`는 **null 저장 불가**(null을 "비었음" 신호로 씀). null이 필요하면 다른 선택.

</details>

<details class="deep">
<summary>심화: PriorityQueue는 이진 힙 — 정렬이 아니라 "부분 순서"</summary>

- 내부는 **binary heap를 배열로 표현**. 부모 ≤ 자식(min-heap 기본) 불변식만 유지 → **완전 정렬이 아니다**.
- `offer`/`poll` O(log n)(sift-up/down), `peek`(최소) O(1). 임의 원소 `remove`는 O(n).
- **iteration 순서는 정렬 순서가 아님** — 힙 배열 순서로 나온다. 정렬 출력이 필요하면 poll을 반복해야 한다.
- 최대 힙은 `new PriorityQueue<>(Comparator.reverseOrder())`.

```java
PriorityQueue<Integer> pq = new PriorityQueue<>();   // min-heap
pq.offer(30); pq.offer(10); pq.offer(20);
pq.poll(); // 10  (항상 최소부터)
```

</details>

## 5. 자주 하는 실수
- 🔴 스택으로 `Stack` 클래스 사용 — `ArrayDeque` 권장.
- 🔴 큐로 `LinkedList` 사용 — 대부분 `ArrayDeque`가 빠름.
- 🔴 "PriorityQueue를 순회하면 정렬 순서" — 아님. 힙 배열 순서. 정렬은 poll 반복.
- 🟡 `ArrayDeque`에 null 넣기 — 예외. null 의미가 예약돼 있음.

## 6. 코드
```java
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.PriorityQueue;

Deque<Integer> stack = new ArrayDeque<>();   // 스택
Deque<Integer> queue = new ArrayDeque<>();   // 큐
PriorityQueue<int[]> pq =                     // 우선순위 큐 (거리 최소)
        new PriorityQueue<>((a, b) -> a[1] - b[1]);
```

## 7. 예상 면접 질문 + 답변 골격

**Q1. "자바에서 스택을 어떻게 구현하나요?"**
> ① `Deque<T> stack = new ArrayDeque<>()` 로 push/pop → ② `java.util.Stack`은 Vector 상속·전체 동기화·레거시라 지양 → ③ ArrayDeque가 배열 기반이라 빠르고 추상화도 깔끔.

**꼬리 Q1-1. "Stack 클래스는 정확히 뭐가 문제죠?"**
> Vector를 상속해 모든 연산이 synchronized라 단일 스레드에도 락 비용이 있고, 인덱스 접근이 열려 있어 스택 불변식이 깨집니다. 사실상 레거시입니다.

**Q2. "큐가 필요하면 LinkedList vs ArrayDeque?"**
> ArrayDeque 권장. 원형 배열이라 양끝 O(1)에 캐시 친화적이고 노드 오버헤드가 없습니다. LinkedList는 노드가 흩어져 상수 인자가 큽니다.

**Q3. "PriorityQueue의 내부와 복잡도는?"**
> 이진 힙을 배열로 구현합니다. offer/poll은 O(log n), peek은 O(1). 완전 정렬이 아니라 부모-자식 부분 순서만 유지합니다.

**꼬리 Q3-1. "PriorityQueue를 for로 순회하면 정렬돼 나오나요?"**
> 아니요. 힙 배열 순서로 나옵니다. 정렬 출력이 필요하면 poll을 반복해 꺼내야 합니다.

**Q4. "Deque가 뭔가요?"**
> 양끝에서 삽입·삭제가 되는 double-ended queue입니다. 스택으로도 큐로도 쓸 수 있어 자바에선 ArrayDeque가 둘의 표준 구현입니다.

**Q5. "최댓값을 계속 빠르게 꺼내야 한다면?"**
> 최대 힙(`PriorityQueue<>(Comparator.reverseOrder())`)을 쓰면 peek O(1), poll O(log n)로 처리합니다. 매번 정렬하면 O(n log n)이라 비효율입니다.
