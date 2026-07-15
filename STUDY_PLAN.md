# Algorithm Coding Test Study Plan

> Target: Korean tech company coding tests (Kakao, Naver, Line, Samsung, etc.)
> Platform: Baekjoon (BOJ), Programmers (프로그래머스)
> Language: Java 11 (JDK 11)

---

## Phase 1: Foundations (Week 1-2)

Core data structures and basic problem-solving.

| Day | Topic | Practice |
|-----|-------|----------|
| 1-2 | Array, String manipulation | BOJ 단계별 - 문자열, 1차원 배열 |
| 3-4 | Stack, Queue, Deque | BOJ 10828, 10845, 프로그래머스 Lv1 |
| 5-6 | Hash (Map, Set) | 프로그래머스 해시 카테고리 |
| 7-8 | Sorting (built-in + fundamentals) | BOJ 단계별 - 정렬 |
| 9-10 | Linked List, Heap (Priority Queue) | 프로그래머스 힙 카테고리 |
| 11-14 | Review + easy problems | 프로그래머스 Lv1 풀기 |

## Phase 2: Core Algorithms (Week 3-5)

The most frequently tested topics in Korean coding tests.

| Day | Topic | Practice |
|-----|-------|----------|
| 15-17 | Binary Search | BOJ 1654, 2805, 프로그래머스 이분탐색 |
| 18-20 | BFS / DFS (Graph traversal) | BOJ 1260, 2178, 2667 |
| 21-23 | Dynamic Programming (Basic) | BOJ 1003, 1463, 9095, 11726 |
| 24-26 | DP (Intermediate) | BOJ 12865 (배낭), 11053 (LIS) |
| 27-29 | Greedy | BOJ 11047, 1931, 프로그래머스 탐욕법 |
| 30-35 | Review + mixed problems | 프로그래머스 Lv2 풀기 |

## Phase 3: Advanced Topics (Week 6-8)

Commonly seen in Kakao/Naver level tests.

| Day | Topic | Practice |
|-----|-------|----------|
| 36-38 | Two Pointer / Sliding Window | BOJ 2003, 1644, 3273 |
| 39-41 | Backtracking | BOJ 15649-15652 (N과 M 시리즈) |
| 42-44 | Shortest Path (Dijkstra, Floyd) | BOJ 1753, 11404 |
| 45-47 | Union-Find | BOJ 1717, 1976 |
| 48-50 | Tree (traversal, LCA) | BOJ 1991, 11725 |
| 51-56 | Simulation / Implementation | 삼성 기출 - BOJ 삼성 SW 역량테스트 |

## Phase 4: Real Test Practice (Week 9-12)

Timed mock tests and company-specific prep.

| Week | Focus | Practice |
|------|-------|----------|
| 9 | Kakao past problems | 프로그래머스 카카오 기출 |
| 10 | Samsung past problems | BOJ 삼성 기출 모음 |
| 11 | Programmers Lv3 problems | 프로그래머스 Lv3 |
| 12 | Mock tests (timed) | 2-3 problems in 2 hours |

---

## Daily Routine

1. **Minimum 2 problems/day** (1 easy + 1 medium or 2 medium)
2. Time limit per problem: 30-45 min (move on if stuck, review solution)
3. After solving: write brief notes on approach and time complexity
4. Weekly review: revisit problems you couldn't solve

## Key Tips for Korean Coding Tests

- **프로그래머스** is used by Kakao, Line, etc. — get comfortable with the platform
- **BOJ** is best for topic-based drilling
- Samsung favors **simulation/implementation** — practice thoroughly
- Kakao favors **string parsing, graph, DP** — read problem statements carefully (long!)
- Always consider **edge cases** and **time complexity** before coding
- BOJ에서 빠른 입력: `BufferedReader` + `StringTokenizer` (Scanner는 느림)
- 출력은 `StringBuilder`에 모아서 한 번에 출력
- 자주 쓰는 Java 컬렉션: `ArrayList`, `HashMap`, `HashSet`, `PriorityQueue`, `ArrayDeque`, `TreeMap`
- `Arrays.sort()`는 primitive는 dual-pivot quicksort, Object는 TimSort
- `Collections.sort()` 대신 `list.sort(Comparator)` 활용
- Java 11 유용한 기능: `String.isBlank()`, `String.strip()`, `List.of()`, `Map.of()`

## Progress Tracking

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Total problems solved: ___
