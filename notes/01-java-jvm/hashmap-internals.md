# HashMap Deep Dive — 면접 답변 정리본

> 한국 IT 3년차 백엔드 면접용 Hash 종합 정리.
> 진행 형식: 비유 → 다이어그램 → 코드 → 패턴 정리표 → 예상 면접 질문.

## 목차
- [T1. Why/When Hash?](#t1-whywhen-hash) — 왜·언제 쓰는가, 안 쓰는가
- [T2. Hash Function](#t2-hash-function) — hashCode → spread → bucket index, worst O(log N) 이유
- [T3. Collision 회피·완화](#t3-collision-회피완화) — load factor, rehash, equals/hashCode 계약
- [T4. Red-Black Tree](#t4-red-black-tree) (예정)
- [T5. Q&A 모의 드릴](#t5-qa-모의-드릴) (예정)

---

# T1. Why/When Hash?

**학습 목표**: *"HashMap을 왜 쓰고, 언제 안 쓰는지"* 5분 동안 자료구조 비교까지 곁들여 답할 수 있다.

## 1. 비유 — 도서관 카드 카탈로그
```
책장에서 책 찾기              → 한 권씩 훑기                O(N)
사전(알파벳 정렬)에서 단어 찾기 → 펼쳐서 좁혀가기            O(log N)
도서관 카드 카탈로그          → "제목 → 카드 번호" 한 번에   O(1)  ← Hash
```
Hash의 본질: **"키 → 숫자(인덱스) 변환 함수"**. 변환만 빠르면 배열처럼 한 번에 꽂힌다.

## 2. 개념 정의 (1줄)
> **HashMap** = `key → hashCode() → spread → bucket index → value` 의 직통 매핑.
> 배열의 O(1) 인덱스 접근을 **임의의 키**(문자열, 객체)로 확장한 자료구조.

## 3. 다이어그램
```
"apple"  →  hashCode()  →  spread (h ^ h>>>16)  →  & (n-1)  →  buckets[5]
              6293             12993                            ↓
                                                      Node{key="apple", value=...}
                                                              ↓ (충돌 시)
                                                      Node{key="grape", value=...}
```

## 4. 언제 쓰는가
| 시나리오 | 예시 |
|----------|------|
| ID로 빠른 lookup | `Map<UserId, User>` 캐시, 세션 저장소 |
| 중복 체크 | `HashSet<String>` 가입 이메일 중복 |
| 카운팅 | `Map<String, Integer>` 단어 빈도 |
| 그룹핑 | `Stream.collect(groupingBy(...))` |
| 양방향 매핑 | BOJ 1620 (이름↔번호) |

## 5. 언제 **안 쓰는가** (면접 핵심)
| 상황 | 대신 쓸 것 | 이유 |
|------|-----------|------|
| 정렬된 순회 필요 | `TreeMap` (Red-Black Tree) | HashMap은 순서 보장 X |
| 범위 검색 (15~25) | `TreeMap.subMap()` | Hash는 범위 개념 X |
| 삽입/접근 순서 유지 | `LinkedHashMap` | LRU 캐시 등 |
| 키가 0~N 정수 | **배열** | HashMap은 Node overhead 큼 |
| Thread-safe | `ConcurrentHashMap` | HashMap은 동시성 X (무한루프 가능) |
| 메모리 타이트 | 배열 / BitSet | bucket + Node + load factor 여유공간 |

## 6. 핵심 포인트 (자주 하는 실수)
- 🔴 "HashMap은 항상 O(1)" — 평균 O(1), worst Java 7=O(N), Java 8+=O(log N).
- 🔴 "key 순서대로 나옴" — iteration 순서 X. LinkedHashMap이 그거 함.
- 🔴 "모든 key는 HashMap이 빠름" — 0~N 작은 정수면 배열이 메모리/속도 모두 우위.
- 🟡 null 허용? HashMap key/value null 허용(key 1개). ConcurrentHashMap, TreeMap은 null key 불가.

## 7. 패턴 정리표 — Map 자매들
| 구현체 | 내부 구조 | Lookup | 순서 | Thread-safe | null key |
|--------|----------|--------|------|-------------|----------|
| HashMap | bucket + LL/RB Tree | O(1) avg | ❌ | ❌ | ✅ (1개) |
| LinkedHashMap | HashMap + 이중연결리스트 | O(1) avg | ✅ 삽입/접근 | ❌ | ✅ |
| TreeMap | Red-Black Tree | O(log N) | ✅ 키 정렬 | ❌ | ❌ |
| ConcurrentHashMap | bucket + CAS/segment lock | O(1) avg | ❌ | ✅ | ❌ |
| HashTable (legacy) | bucket | O(1) avg | ❌ | ✅ (전체 lock) | ❌ |

## 8. 예상 면접 질문 + 답변 골격
**Q1. "HashMap이 평균 O(1)인데 왜 TreeMap을 쓰나요?"**
> ① 정렬·범위검색 필요할 때 → ② 예시(점수 랭킹, 시간 범위 조회) → ③ HashMap은 iteration 순서 X 한계 언급.

**Q2. "1억 명 사용자 중복 체크 어떻게 하실래요?"**
> ① HashSet — 평균 O(1), 메모리 ~1억 × Node ≈ 수 GB → ② 메모리 부족하면 BitSet (정수 ID) 또는 Bloom Filter (확률적, false positive 허용).

**Q3. "HashMap vs ConcurrentHashMap 차이?"**
> ① HashMap 동시성 X (Java 7 resize 무한루프) → ② ConcurrentHashMap은 bucket 단위 lock(Java 8 CAS+synchronized) → ③ HashTable은 전체 lock이라 ConcurrentHashMap이 처리량 훨씬 높음.

**Q4. "키가 0~10만 사이 정수면 HashMap 쓸까요?"**
> ① 아니요. 배열이 우위 → ② Node overhead, hash 계산, load factor로 인한 빈 공간 → ③ HashMap은 임의/문자열 키일 때 가치.

**Q5. "HashMap의 단점은?"**
> ① 순서 보장 X → ② 메모리 overhead → ③ 동시성 X → ④ worst case 성능 저하 → ⑤ key의 hashCode/equals 잘못 구현 시 무력화.

---

# T2. Hash Function

**학습 목표**: *"key 하나가 어떻게 bucket index로 변환되는지"* 그리고 *"같은 bucket에 다 몰리면 왜 O(log N)이 되는지"* 코드 한 줄씩 짚으며 답할 수 있다.

## 1. 비유 — 사물함 번호 매기기
- 책 제목 → 숫자 변환은 어떻게? **3단계 압축**.
- 같은 번호로 매핑되는 책이 너무 많아지면? **번호별 정리함을 LinkedList → 트리로 업그레이드**.

## 2. 3단계 변환 — 실제 Java 8 코드
```java
// HashMap.java (Java 8+)
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}

// putVal() 내부
int i = (n - 1) & hash;   // bucket index, n = capacity
Node<K,V> p = tab[i];
```
```
[key]  →  Step 1: hashCode()       →  32비트 정수 h
       →  Step 2: spread h ^ h>>>16 →  상위·하위 비트 섞임
       →  Step 3: (n - 1) & hash    →  0 ~ n-1 범위 bucket index
```

## 3. 다이어그램 — 비트 단위로 본 spread
`capacity = 16` (n=16, n-1 = `0000_1111`)이면, `& (n-1)` 은 **하위 4비트만 본다**.

```
hashCode(key)        :  1010_1101_0011_0110_1100_1100_0001_0011
                                                  ▲ 하위 4비트만 살아남음
                       1010_1101_0011_0110_1100_1100_0001_0011  (h)
                  ^    0000_0000_0000_0000_1010_1101_0011_0110  (h >>> 16)
spread (h ^ h>>>16) :  1010_1101_0011_0110_0110_0001_0010_0101
                                                              ▲ 이제 상위 16비트가 하위 4비트에 섞임
(n-1) & spread       : 0000_0000_0000_0000_0000_0000_0000_0101 = 5 → buckets[5]
```
➜ **상위 16비트도 bucket 결정에 영향**. 안 그러면 hashCode가 상위 비트만 다른 객체들이 전부 같은 bucket으로 몰림.

## 4. 핵심 Q — *왜 capacity는 2의 거듭제곱?*
```java
i = (n - 1) & hash    // 빠른 bit AND
                      // 만약 n이 2의 거듭제곱이 아니면 % 써야 함 (느림)
```
| 식 | n=16 (2^4) | n=15 |
|----|------------|------|
| `hash % n` | 동작 (느림, division) | 동작 (느림) |
| `(n-1) & hash` | `hash & 1111` = `hash % 16` ✅ | `hash & 1110` ❌ (홀수 인덱스 안 나옴!) |

규칙: HashMap은 생성 시 capacity를 **요청값보다 크거나 같은 2의 거듭제곱**으로 올림 (`tableSizeFor`).

## 5. Collision이 일어나면? — Chaining + Treeify
```
Java 7                            Java 8+
buckets[5] → A → B → C → D        buckets[5] → A → B → C → D      (length < 8: LinkedList)
            ↑ 모두 LinkedList                  ↓ length ≥ 8 (& capacity ≥ 64)
            ↑ search = O(N)                   buckets[5] → Red-Black Tree(A,B,C,D,...)
                                              ↑ search = O(log N)
                                              length ≤ 6 이면 다시 LinkedList (untreeify)
```

**Threshold 두 개 + 한 개**:
- `TREEIFY_THRESHOLD = 8` — 이상이면 트리화
- `UNTREEIFY_THRESHOLD = 6` — 이하면 다시 리스트화 (oscillation 방지로 6/8 갭)
- `MIN_TREEIFY_CAPACITY = 64` — 미만이면 treeify 안 하고 **resize 먼저**

## 6. *그래서 worst case가 왜 O(log N)?*
> N개 entry가 전부 같은 bucket으로 몰리는 최악 (예: `hashCode()=0` 또는 hash collision attack)

| Java 버전 | bucket 자료구조 | search 시간 |
|-----------|-----------------|-------------|
| Java 7 이하 | LinkedList | **O(N)** |
| Java 8 이상 | Red-Black Tree (size ≥ 8) | **O(log N)** |

핵심: **Red-Black Tree는 self-balancing BST라서 height가 항상 ~2 log N 이하 보장**. 일반 BST는 한쪽으로 쏠리면 O(N), RB Tree는 색깔 규칙(빨/검 5가지)으로 균형 강제 ➜ 어떤 삽입 순서든 O(log N).

→ **그래서 Java 8+ HashMap의 worst case time = O(log N)**.

## 7. 자주 하는 실수
- 🔴 `hashCode()`만 잘 만들면 충분 — **hashCode + equals 둘 다** 일관성 있게.
- 🔴 `int i = hash % n` — 틀림. `(n-1) & hash` (n=2^k일 때).
- 🔴 "bucket이 8개 넘으면 무조건 트리" — capacity ≥ 64도 같이 만족해야. 아니면 resize.
- 🟡 hashCode 음수 가능 — `(n-1) & hash`는 양수 인덱스만 나옴.

## 8. 패턴 정리표 — Hash Function 핵심
| 단계 | 무엇 | 왜 |
|------|------|----|
| `hashCode()` | 32비트 정수 생성 | Object 기본은 메모리 주소 기반 |
| spread `h ^ h>>>16` | 상위·하위 비트 mix | 작은 capacity일 때 상위 비트도 활용 |
| `(n-1) & hash` | bucket index | n=2^k일 때 modulo의 빠른 대체 |
| Chaining (LL) | bucket 내 충돌 보관 | bucket이 한 칸이 아닐 때 |
| Treeify (RB Tree) | 충돌 8개↑ + capacity 64↑ | worst O(N) → O(log N) |

## 9. 예상 면접 질문
**Q1. "key는 어떻게 bucket을 찾나요?"** → hashCode → spread → (n-1)&hash 3단계 + 각 단계 *왜*.
**Q2. "왜 capacity가 2의 거듭제곱?"** → `(n-1)&hash`로 modulo 대체, `tableSizeFor` 강제.
**Q3. "spread function 왜?"** → capacity 작을 때 상위 비트가 bucket에 안 반영되는 문제.
**Q4. "worst case가 O(log N)인 이유?"** → 모두 같은 bucket으로 몰림 → bucket 8개+capacity 64↑ → RB Tree → O(log N).
**Q5. "`hashCode()=0`이면?"** → 모두 bucket 0 → Java 8은 RB Tree → O(log N). 단 메모리/CPU 낭비.

---

# T3. Collision 회피·완화

**학습 목표**: *"충돌 어떻게 처리하나요? 어떻게 줄이나요?"* 와 *"equals/hashCode 계약"* 을 코드까지 보여주며 5분 답할 수 있다.

## 1. 비유 — 사물함 16개에 학생 100명
비둘기집 원리: 입력 종류는 무한, bucket은 유한 → **충돌은 피할 수 없다**. 어떻게 다루느냐가 핵심.

## 2. 충돌의 3가지 원인
| 원인 | 설명 | 대응 책임 |
|------|------|----------|
| **비둘기집 원리** | 입력 무한, bucket 유한 | 자료구조 설계 |
| **hashCode 분포 불량** | 같은 hash로 몰림 | 개발자 (key 클래스) |
| **capacity 부족** | bucket 적어서 충돌 ↑ | HashMap (load factor) |

## 3. 4단계 전략

### S1. 좋은 hashCode 설계 (개발자 책임)
JDK String.hashCode 표준 패턴:
```java
int h = 0;
for (char c : chars) h = 31 * h + c;
```
**왜 31?** 홀수 prime — 곱셈으로 비트 분포 확산. JIT가 `31 * x = (x << 5) - x`로 최적화.

실무: `Objects.hash(field1, field2)` 또는 IDE auto-generate. Java 14+ `record`는 자동.

### S2. Load Factor 관리 (HashMap 책임)
- `threshold = capacity × loadFactor`
- default `loadFactor = 0.75` → capacity 16일 때 12개 차면 resize
- LF 낮추면 충돌 ↓ but 메모리 ↑
- 0.75는 **시간/공간 trade-off의 황금비** (Knuth 분석)

### S3. Resize / Rehash
- capacity **2배** (16 → 32 → 64 …)
- 모든 entry 재배치
- **Java 8 영리한 트릭**: capacity 2배 = 비트 1개 추가
  ```
  oldCap = 16  =  0001_0000
  newCap = 32  =  0010_0000
  
  hash & oldCap == 0  →  같은 bucket 위치
  hash & oldCap != 0  →  newBucket = oldBucket + oldCap
  ```
  → modulo 다시 계산 안 해도 됨. 두 그룹으로 깔끔하게 분리.

### S4. Collision Resolution 자료구조
| 방식 | 작동 | 장점 | 단점 | 사용처 |
|------|------|------|------|--------|
| **Separate Chaining** | bucket → LL → RB Tree | resize 단순, 삭제 쉬움 | 포인터 메모리, cache miss | Java HashMap/HashSet |
| **Open Addressing — Linear** | 충돌 시 다음 칸 | cache 친화적, 메모리 ↓ | clustering, LF 민감(max ~0.7) | Python dict, Java IdentityHashMap |
| **Open Addressing — Double Hash** | 두 번째 hash로 step | clustering 적음 | 구현 복잡 | 일부 라이브러리 |

## 4. equals / hashCode 계약 (면접 ⭐)

**3가지 규칙**:
1. **equals(a, b) == true → hashCode(a) == hashCode(b)** (필수)
2. equals false → hashCode 다른 게 *권장* (다 같으면 분산 X)
3. **객체가 변하지 않으면** 호출 시점 무관 같은 hashCode (consistent)

**위반 시 사고**:
| 실수 | 결과 |
|------|------|
| equals만 override, hashCode는 기본 | 같은 의미 객체 2개가 HashSet에 모두 들어감 (Object.hashCode = 메모리 주소) |
| 가변 필드를 hashCode에 넣고 put 후 변경 | 영원히 못 찾음 (bucket 위치 변경, lookup은 새 hash) |
| hashCode만 일관, equals는 == | put은 되는데 같은 의미 객체로 get 시 못 찾음 |

**올바른 구현**:
```java
public final class User {
    private final Long id;        // immutable, equals/hashCode key
    private String displayName;   // mutable, 무관

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof User)) return false;
        return Objects.equals(id, ((User) o).id);
    }
    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
```
JPA Entity는 특히 주의: ID 기반 equals/hashCode 권장 (영속화 전후 식별 일관성). 단, ID가 generate 전엔 null이라 주의.

## 5. 자주 하는 실수
- 🔴 equals만 override, hashCode 안 함 → HashSet/HashMap 무력화
- 🔴 가변 필드를 hashCode에 포함 + 객체 변경 → "있는데 못 찾음"
- 🔴 IDE auto-generate 안 한 채 필드 추가 → silent bug (옛 구현 유지)
- 🟡 Bloom Filter — 메모리 빠듯할 때 확률적 중복 체크 (false positive 허용)

## 6. 패턴 정리표 — 충돌 대응
| 책임 | 무엇 | 방법 |
|------|------|------|
| 개발자 | hashCode 분포 | 31 패턴 / `Objects.hash` / record |
| 개발자 | equals 일관성 | equals/hashCode 함께 override |
| HashMap | bucket 부족 | resize (×2) when size > threshold |
| HashMap | bucket 내 폭증 | Java 8: LL → RB Tree (8/64) |

## 7. 예상 면접 질문 + 답변 골격
**Q1. "HashMap 충돌은 어떻게 처리하나요?"**
> ① Separate Chaining — bucket = LinkedList → ② Java 8부터 길이 8 + capacity 64↑이면 RB Tree → ③ worst O(log N) 보장 → ④ 충돌 자체 줄이기는 hashCode 분포 + load factor 0.75 + resize.

**Q2. "equals/hashCode 계약 설명?"**
> ① equals true이면 hashCode 동일 → ② equals false이면 hashCode 같을 수 있지만 분산 좋아야 → ③ 객체 unchanged면 호출마다 같은 값 → ④ 위반 시 HashSet에 같은 의미 객체 2개 들어가는 사고.

**Q3. "가변 객체를 HashMap key로 쓰면?"**
> ① put 후 mutate 하면 hashCode 변경 → ② lookup은 새 hashCode → 새 bucket → 못 찾음 → ③ key는 immutable이 원칙. JPA Entity ID null→generate 후 사고 사례.

**Q4. "load factor 0.75인 이유?"**
> ① 더 낮으면 메모리 낭비 → ② 더 높으면 충돌 ↑ → ③ Knuth 분석상 0.5~0.75 sweet spot. 0.75는 일반 워크로드 균형.

**Q5. "Java HashMap이 Open Addressing 대신 Chaining 쓰는 이유?"**
> ① resize 부담 적음 → ② 삭제 단순 (O.A.는 tombstone) → ③ Java 8 treeify로 worst O(log N) 가능 → ④ 메모리 overhead는 감수.

---

# T4. Red-Black Tree

**학습 목표**: *"RB Tree가 어떻게 self-balancing이고 왜 height O(log N) 보장하는지"* + *"Java HashMap의 treeify와 어떻게 연결되는지"* 5분 답할 수 있다.

## 1. 비유 — 자동 정리 사서가 있는 책꽂이
일반 BST는 들어오는 순서대로 책을 꽂아 한쪽 쏠리면 LinkedList. RB Tree는 사서가 5가지 색깔 규칙으로 회전·색깔 바꾸기를 강제 → 균형 자동 복구.

## 2. 일반 BST의 문제
```
1,2,3,4,5 순서 삽입:
1
 \
  2
   \
    3       ← height = N, 모든 연산 O(N)
     \
      4
       \
        5
```
현실의 정렬된 데이터(timestamp, auto-increment ID) 흔함 → self-balancing 필요.

## 3. RB Tree의 5가지 규칙 (불변식)
1. 모든 노드는 Red 또는 Black
2. Root는 항상 Black
3. 모든 NIL leaf(null)는 Black
4. Red의 자식은 모두 Black (Red 두 개 연속 X)
5. 어떤 노드에서 자손 NIL까지의 경로의 Black 수는 모두 동일 (Black Height, bh)

```
        7(B)
       /    \
    3(R)   18(R)
    / \    /  \
 2(B) 5(B) 13(B) 21(B)
              /  \
           11(R) 16(R)
```

## 4. *왜 height가 O(log N) 보장되나?* (면접 핵심)
- 규칙 5: 모든 root→leaf 경로의 black 수 동일 (bh)
- 규칙 4: red 두 개 연속 X → 경로의 red 수 ≤ black 수
- ⇒ 가장 짧은 경로 = bh, 가장 긴 경로 ≤ 2·bh
- 두 경로 길이 차이 최대 2배 → balanced
- **height ≤ 2 log₂(n+1)** → 모든 연산 **O(log N)**

## 5. 회전 (Rotation)
규칙 위반 시 회전 + 색깔 변경으로 복구. BST 정렬은 유지, 부모-자식만 재배치.

**Left Rotation**:
```
    P                P
    |                |
    X                Y
   / \    →         / \
  A   Y            X   C
     / \          / \
    B   C        A   B
```

## 6. 삽입 시나리오
1. BST처럼 위치 찾아 삽입, 새 노드는 Red
2. 부모가 Black이면 끝
3. 부모도 Red이면 (규칙 4 위반) → 삼촌 색깔로 분기:
   - **Case 1: 삼촌 Red** → recoloring (부모/삼촌 Black, 조부모 Red), 조부모로 올라가 재검사
   - **Case 2: 삼촌 Black, 안쪽 자식** → 회전으로 Case 3 형태로
   - **Case 3: 삼촌 Black, 바깥쪽 자식** → 조부모 회전 + 색깔 swap

면접에선 "색깔 + 회전으로 균형 복구" 핵심만. case 1/2/3 외울 필요 X.

## 7. RB Tree vs AVL Tree
| 항목 | **RB Tree** | AVL Tree |
|------|-------------|----------|
| Balance 엄격도 | 느슨 (≤ 2 log n) | 엄격 (≤ 1.44 log n) |
| Height | 더 큼 | 더 작음 |
| Lookup | 약간 느림 | 약간 빠름 |
| **Insert/Delete** | **빠름** (회전 평균 ≤ 2회) | 느림 (회전 多) |
| 사용처 | Java TreeMap/HashMap, Linux CFS, C++ map/set | Lookup 위주 |

Java RB 선택 이유: HashMap/TreeMap은 write 빈도 높음 → 회전 적은 RB 유리.

## 8. Java HashMap에서의 RB Tree (treeify 연결)
- `HashMap.TreeNode` 클래스 = RB Tree 노드
- bucket 길이 ≥ 8 AND capacity ≥ 64 → LL → RB Tree (`treeifyBin`)
- bucket 길이 ≤ 6 → RB Tree → LL (`untreeify`)
- 결과: HashMap.get worst case = **O(log N)** (Java 7은 LL이라 O(N))

## 9. 자주 하는 실수
- 🔴 "정렬된 트리" — 맞지만 핵심은 **Self-balancing BST**
- 🔴 5가지 규칙만 외움 — 핵심은 "왜 height가 O(log N)" 직관
- 🔴 "AVL이 항상 우수" — Lookup만 그렇고 write 빈번하면 RB 우위
- 🟡 Java `TreeMap` = RB Tree, `ConcurrentSkipListMap` = Skip List

## 10. 패턴 정리표 — 정렬 자료구조
| 자료구조 | Lookup | Insert/Delete | 정렬 | 주 사용처 |
|---------|--------|---------------|------|----------|
| 일반 BST | O(N) worst | O(N) worst | ✅ | 학술용 |
| **RB Tree** | O(log N) | O(log N), 회전 적음 | ✅ | Java TreeMap, HashMap treeify, Linux CFS |
| AVL Tree | O(log N) ↑ | O(log N), 회전 多 | ✅ | Lookup 위주 |
| B-Tree | O(log N) | O(log N) | ✅ | DB 인덱스, FS |
| Skip List | O(log N) avg | O(log N) avg | ✅ | ConcurrentSkipListMap |

## 11. 예상 면접 질문 + 답변 골격
**Q1. "Red-Black Tree가 뭐고 왜 쓰나요?"**
> ① Self-balancing BST → ② 5가지 색깔 규칙으로 height ≤ 2 log N → ③ Lookup/Insert/Delete worst O(log N) → ④ Java TreeMap, HashMap treeify.

**Q2. "RB Tree height가 O(log N)인 이유?"** ⭐
> ① 규칙 5: 모든 경로 black 수 동일(bh) → ② 규칙 4: red 두 개 연속 X → red ≤ black → ③ 짧은 경로 = bh, 긴 경로 ≤ 2·bh → ④ height ≤ 2 log(n+1).

**Q3. "RB Tree vs AVL Tree?"**
> ① 둘 다 self-balancing BST, O(log N) 보장 → ② AVL 엄격, lookup 빠름 → ③ RB 느슨, 회전 적음, write 빠름 → ④ Java는 write 빈도 고려해 RB.

**Q4. "Java HashMap에서 RB Tree로 언제 변환?"**
> ① bucket 길이 ≥ 8 AND capacity ≥ 64 → treeify → ② 길이 ≤ 6이면 untreeify → ③ 충돌 폭증 시 worst O(log N) 보장.

**Q5. "BST 대신 RB Tree 쓰는 이유?"**
> ① 일반 BST는 정렬 입력에 쏠려 O(N) → ② RB는 회전+색깔로 강제 균형 → 어떤 입력이든 O(log N).

# T5. Q&A 모의 드릴

> 면접관 입장에서 질문 → 본인 답변 → 채점·정정 기록.
> 형식: 🟢 잘한 점 / 🟡 빠진 포인트 / 🔴 틀린 부분 / 📝 모범 답안 골격.

---

## Q1. "HashMap이 평균 O(1)인데 왜 굳이 TreeMap을 쓰나요? 실무 예시 들어서."

**드릴 일자**: 2026-05-12

### 1차 답변
> HashMap 은 Array 처럼 index 하나를 지정하면 굉장히 빠른 속도로 찾을 수 있지만, 순서를 보장하지 않습니다. 예를들어, A 사원을 입사순으로 몇번째 인지 찾는 등의 오퍼레이션에는 Tree 구조가 필요합니다.

**채점 (30/100)**:
- 🟢 "순서 보장 X" 정확, HashMap=Array 비유 좋음
- 🔴 **예시가 틀렸음** — "N번째 입사자 찾기"는 **인덱스 기반 접근** → `ArrayList`가 정답. TreeMap도 rank 쿼리는 O(N) (entrySet 순회 필요). TreeMap이 빛나는 건 **key 기준 범위/근접 검색** (`subMap`, `floorKey`).
- 🟡 TreeMap의 진짜 강점(범위·근사·정렬 순회) 미언급
- 🟡 Trade-off (HashMap O(1) vs TreeMap O(log N)) 미언급

### 2차 답변 (재시도)
> HashMap 은 O(1), 최악의 경우 O(logN) 을 보장하는 자료구조 입니다. Hash 안에서 순서는 보장되지 않습니다. bucket index 를 찾도록 되어있는 내부 구조 상, 순서가 중요하지 않습니다. 따라서 순서 상관없이 존재 유무만을 확인할 때 Hash 는 굉장히 빠른 속도로 원하는 데이터를 찾을 수 있습니다. 그렇다면 Tree 는 어떨까요? Tree 는 red-black tree 로 내부가 구현되어 있어 key 기준으로 자동으로 정렬됩니다. 따라서 항상 정렬 순서가 보장되며 특정 구간에 따른 검색이 용이합니다. 또한 항상 정렬이 이루어지니 근사값을 찾는 것도 용이합니다. 예를들어 도시에 관련된 데이터가 있다고 해보죠. 수질오염도가 40%-60% 인 구간에 있는 district 을 찾는 경우를 예시로 들겠습니다. Java 에서 사용할 때 생각해보면 collection.sort 나 comparingKey 등의 메서드로 정렬 규칙을 override 해서 사용할 수 있습니다.

**채점 (75/100 — 합격선 통과)**:
- 🟢 worst O(log N) 언급 (treeify까지 알고 있음)
- 🟢 **수질오염도 40~60% subMap 예시** — 실무 시나리오 정확. 면접관이 "써본 사람" 인상 받음
- 🟢 "근사값 용이" — `floorKey/ceilingKey` 의도 표현
- 🟡 Trade-off 명시 부족 (마무리에 "순서·범위 필요 없으면 HashMap이 정답" 한 줄 있으면 완벽)
- 🔴 **API 정정 필요**: `Collections.sort` / `comparingByKey` 는 TreeMap의 정렬 API가 **아님**.
  - `Collections.sort(list)` → **List** 정렬용
  - `Comparator.comparing` / `Map.Entry.comparingByKey` → **Stream** 정렬에서 사용
  - **TreeMap의 정렬은 `new TreeMap<>(Comparator)` 생성자에 주입** (삽입 시점에 정렬돼야 하므로)

### 📝 모범 답안 골격
> ① HashMap은 평균 O(1) (worst O(log N))이지만 **순서를 보장하지 않습니다**. bucket index 직통 매핑이라 정렬 개념 자체가 없음. 존재 유무 확인·키→값 캐시에 최적.
>
> ② TreeMap은 **Red-Black Tree 기반**으로 key 자동 정렬. 모든 연산 O(log N)이지만 **(a) 정렬 순회 (b) 범위 검색 `subMap` (c) 근사값 `floorKey/ceilingKey`** 지원.
>
> ③ 예시: 수질오염도 40~60% district 조회 → `pollution.subMap(40.0, 60.0)` 한 줄, O(log N + k). HashMap이면 entrySet 전체 O(N) 필터링.
>
> ④ 결론: 순서·범위·근사가 필요하면 TreeMap, 아니면 HashMap. TreeMap 정렬 규칙은 `new TreeMap<>(Comparator)` 로 주입.

### 💡 배운 점
- TreeMap의 정렬 Comparator는 **생성자**에 넣는다. `Collections.sort` 가 아니다.
- 알고리즘 문제에서 `Comparator`는 `PriorityQueue`, `Arrays.sort` 와 짝이 흔해서 헷갈리기 쉬움.
- "N번째 입사자" 같은 rank 쿼리는 Map 종류가 아니라 `ArrayList` 또는 Order Statistic Tree 영역.

---
