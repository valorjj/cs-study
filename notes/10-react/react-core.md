# React 핵심 — 면접 답변 정리본

> 백엔드 3년차 + 프론트 경험 있는 개발자를 위한 React 면접 종합 정리 (백엔드 인터뷰용, 깊은 프론트 심화는 제외).
> 진행 형식: 비유 → 개념 정의 → 다이어그램 → 패턴 정리표 → 핵심 포인트 → 예상 면접 질문.

## 목차
- [R1. Virtual DOM and Reconciliation](#r1-virtual-dom-and-reconciliation) — Virtual DOM, diffing, key
- [R2. Rendering and Re-render](#r2-rendering-and-re-render) — 리렌더 트리거, memo/useMemo/useCallback
- [R3. Hooks](#r3-hooks) — useState/useEffect, Hooks 규칙, 의존성 배열
- [R4. State Management](#r4-state-management) — 로컬 vs 전역, Context vs Redux/Zustand
- [R5. Reconciliation과 diffing](#r5-reconciliation과-diffing) — diffing 휴리스틱, key의 역할, 리스트 재조정, Fiber
- [R6. useEffect 의존성과 클로저 함정](#r6-useeffect-의존성과-클로저-함정) — 의존성 배열, stale closure, cleanup, 참조 동일성

---

# R1. Virtual DOM and Reconciliation

**학습 목표**: *"Virtual DOM이 뭐고 왜 쓰나요?"* / *"key는 왜 필요한가요?"* 에 다이어그램 그리며 5분 답할 수 있다.

## 1. 비유 — 이사할 때 견적서
집(실제 DOM)을 매번 통째로 뜯어고치면 비용이 크다. 대신 **이사 전/후 청사진(가상 DOM)을 비교**해서 "이 방만 바뀌었네" 하고 **바뀐 부분만** 실제 공사(DOM 조작)를 한다. 청사진끼리 비교하는 종이 작업은 실제 공사보다 훨씬 싸다.

## 2. 개념 정의
> **실제 DOM 조작은 비싸다** — 브라우저가 레이아웃 계산(reflow) + 화면 그리기(repaint)를 다시 해야 함.
> **Virtual DOM(VDOM)** = 실제 DOM을 흉내 낸 **JS 객체 트리**. state/props가 바뀌면 React는 새 VDOM 트리를 만들고, **이전 VDOM과 비교(diffing)**해서 실제로 달라진 부분만 실제 DOM에 반영한다. 이 비교+반영 과정 전체를 **Reconciliation(재조정)** 이라 부른다.
- VDOM 자체가 "빠름"을 보장하는 건 아니다. 핵심은 **최소한의 실제 DOM 변경으로 줄여주는 알고리즘**이라는 것.

## 3. 다이어그램 — Reconciliation 흐름
```
 state 변경
     │
     ▼
 새 VDOM 트리 생성 (JS 객체, 메모리 상)
     │
     ▼
 ┌─────────────────────────┐
 │  Diffing (이전 VDOM vs 새 VDOM) │
 │   - 같은 타입 → 속성만 비교        │
 │   - 다른 타입 → 서브트리 통째 교체   │
 │   - 리스트 → key로 항목 추적       │
 └─────────────┬───────────┘
               │ 변경분(patch)만 추출
               ▼
      실제 DOM에 최소 반영 (commit)
```

### key 없이 리스트 렌더링 시 문제
```
이전: [A, B, C]        추가 후: [X, A, B, C]

key 없음 (인덱스로 비교)
 idx0: A → X   (내용 다름 → "수정"으로 오인 → DOM 통째로 갱신)
 idx1: B → A
 idx2: C → B
 idx3: (신규) → C
 → 사실은 "앞에 하나 추가"인데, React는 A,B,C 전부 값이 바뀐 걸로 착각

key 있음 (고유 id로 비교)
 key=A, key=B, key=C 는 그대로! key=X만 새로 추가
 → 실제 DOM도 딱 X 하나만 새로 삽입
```

## 4. key와 인덱스 key 안티패턴
```jsx
// 안티패턴: index를 key로 사용
{todos.map((todo, idx) => <TodoItem key={idx} {...todo} />)}

// 올바른 패턴: 데이터 고유 id를 key로 사용
{todos.map((todo) => <TodoItem key={todo.id} {...todo} />)}
```
- `key`는 리스트 항목이 "같은 것"인지 React가 판단하는 유일한 단서.
- 리스트 **중간에 삽입/삭제/정렬**이 일어나면 index는 항목마다 새로 매겨지므로, React가 엉뚱한 항목을 재사용 → **컴포넌트 state가 다른 항목으로 뒤바뀌는 버그**, 불필요한 리렌더/DOM 재생성.
- 정적이고 순서가 절대 안 바뀌는 리스트라면 index key도 무방하지만, 원칙은 **안정적이고 고유한 id**.

## 5. 패턴 정리표
| 구분 | Virtual DOM 갱신 방식 | 실제 DOM 영향 |
|------|----------------------|---------------|
| 같은 타입 엘리먼트, 속성만 다름 | 속성만 비교/갱신 | 해당 속성만 patch |
| 타입 자체가 다름 (`<div>`→`<span>`) | 서브트리 unmount 후 재생성 | 통째로 교체 (state 소실) |
| 리스트 + 올바른 key | key로 항목 매칭, 이동/삽입만 반영 | 최소 patch |
| 리스트 + index key (중간 삽입/삭제) | 항목 오매칭 가능 | 불필요한 전체 갱신, state 꼬임 |

## 6. 핵심 포인트 (자주 하는 실수)
- 🔴 "Virtual DOM이 항상 실제 DOM보다 빠르다" — ❌ VDOM diffing 자체도 비용. 정확히는 **"불필요한 DOM 조작을 줄여준다"**가 맞는 표현.
- 🔴 리스트 key로 `Math.random()` 이나 배열 index 사용 — 매 렌더마다 key가 바뀌거나 항목 정체성이 어긋나 버그 유발.
- 🟡 key는 **형제 엘리먼트 사이에서만** 유일하면 됨 (전역 유일할 필요 없음).
- 🟡 diffing은 **같은 레벨(형제)** 끼리만 비교 — 트리 depth를 넘나드는 비교는 하지 않음(O(n³) 대신 O(n) 휴리스틱).

## 7. 예상 면접 질문 + 답변 골격
**Q1. "Virtual DOM이 뭐고 왜 쓰나요?"**
> ① 실제 DOM 조작은 reflow/repaint 비용이 큼 → ② React는 state 변경 시 메모리상의 JS 객체 트리(VDOM)를 새로 만들고 이전 것과 diff → ③ 실제로 달라진 부분만 실제 DOM에 반영(reconciliation). 목적은 "무조건 빠름"이 아니라 **불필요한 DOM 조작 최소화**.

**Q2. "key는 왜 필요한가요?"**
> ① 리스트 렌더링 시 React가 "이전 항목 vs 새 항목"을 매칭할 기준이 필요 → ② key로 항목의 정체성(identity)을 추적 → ③ key 없거나 index를 쓰면 중간 삽입/삭제 시 오매칭되어 state 꼬임·불필요한 DOM 재생성 발생.

**Q3. "인덱스를 key로 쓰면 왜 안 되나요?"**
> ① 리스트 순서가 바뀌면 같은 index가 다른 데이터를 가리키게 됨 → ② React는 key만 보고 "같은 컴포넌트"라 판단해 재사용 → ③ input 값, 체크박스 상태 등 컴포넌트 내부 state가 엉뚱한 항목에 남는 버그 발생. 그래서 데이터의 고유 id를 써야 함.

---

# R2. Rendering and Re-render

**학습 목표**: *"리렌더는 언제 일어나나요?"* / *"불필요한 리렌더는 어떻게 막나요?"* 에 5분 답할 수 있다.

## 1. 비유 — 도미노와 알림 구독
컴포넌트 트리는 도미노 줄과 같다. 부모 도미노가 쓰러지면(리렌더되면) 자식 도미노도 기본적으로 다 같이 쓰러진다(같이 리렌더된다) — 자식이 그 값을 실제로 쓰든 안 쓰든. `React.memo`는 "이 도미노는 앞 도미노 모양이 진짜로 바뀔 때만 쓰러진다"는 조건을 거는 것.

## 2. 리렌더가 일어나는 3가지 트리거
1. **자신의 state 변경** — `setState`/`useState`의 setter 호출.
2. **props 변경** — 부모가 새로운 값을 내려줌.
3. **부모가 리렌더됨** — 자식 props가 그대로여도, 부모가 리렌더되면 **자식도 기본적으로 같이 리렌더**된다(React는 "이 컴포넌트가 필요할지"를 기본적으로 다시 계산).

> "리렌더 = 함수 컴포넌트가 다시 호출되어 새 VDOM을 만드는 것"이지, 실제 DOM이 바뀐다는 뜻은 아니다(diffing 결과 같으면 실제 DOM은 그대로).

## 3. 다이어그램 — 불필요한 리렌더 전파
```
<App>                     App state 변경
  └ <Header/>              → App 리렌더
  └ <Sidebar/>              → Header, Sidebar, Footer 전부 리렌더
  └ <Footer/>                 (props 안 바뀌어도!)

React.memo(Footer) 적용 시
  └ <Footer/> (memo)       → props 얕은 비교(shallow compare) 후
                              동일하면 리렌더 스킵
```

## 4. 방지 도구 3종
```jsx
// 1) React.memo — 컴포넌트 자체를 감싸 props가 안 바뀌면 리렌더 스킵
const Footer = React.memo(function Footer({ year }) {
  return <footer>{year}</footer>;
});

// 2) useMemo — 계산 "값"을 메모이제이션 (매 렌더마다 재계산 방지)
const sorted = useMemo(() => items.slice().sort(compare), [items]);

// 3) useCallback — 함수 "참조"를 메모이제이션 (자식에 넘길 때 유용)
const handleClick = useCallback(() => setCount((c) => c + 1), []);
```
- `useCallback`은 그 자체로 성능을 올리지 않는다. **`React.memo`로 감싼 자식에게 넘기는 콜백**일 때만 의미가 있다(그렇지 않으면 매번 새 함수 생성/비교 오버헤드만 늘어남).

## 5. 상태 불변성(Immutability)이 중요한 이유
```jsx
// ❌ 원본 배열/객체를 직접 변경 (mutate)
todos.push(newTodo);
setTodos(todos);           // 참조가 같아 React가 "변경 없음"으로 오판 가능

// ✅ 새 배열/객체를 만들어 교체
setTodos([...todos, newTodo]);
setUser({ ...user, name: "new" });
```
- React는 `state`가 바뀌었는지를 **참조(reference) 비교(`Object.is`)** 로 판단한다. 원본을 직접 mutate하면 참조가 그대로라 리렌더가 아예 안 일어나거나, `React.memo`의 얕은 비교가 무력화된다.

## 6. 렌더 최적화 심화 — 언제 쓰고 언제 과최적화인가

### 참조 동일성(Referential Equality)이 핵심이다
`React.memo`의 얕은 비교, `useMemo`/`useCallback`의 의존성 비교는 전부 `Object.is`(사실상 `===`) 기반이다. **값이 "논리적으로 같아 보여도" 참조가 다르면 다른 값으로 취급**한다.
```jsx
{} === {}          // false — 매번 새 객체
[1,2] === [1,2]    // false — 매번 새 배열
() => {} === () => {}  // false — 매번 새 함수

function Parent() {
  // ❌ 렌더마다 새 객체/함수 생성 → React.memo(Child)여도 매번 리렌더
  return <Child style={{ color: "red" }} onClick={() => doSomething()} />;
}
```
- `Child`가 `React.memo`로 감싸져 있어도, 부모가 매 렌더마다 **새로운 참조의 객체/함수**를 props로 내려주면 얕은 비교가 항상 "다름"으로 나와 메모이제이션이 무력화된다.
- 그래서 `React.memo` 자식에 넘기는 콜백/객체는 `useCallback`/`useMemo`로 참조를 고정해야 실제 효과가 있다 — **둘은 항상 짝을 이뤄야 의미가 있다.**

### 언제 써야 하나 vs 언제 과최적화인가
```
비싼 계산(수백~수천 개 정렬/필터/변환)          → useMemo 확실히 유용
무거운 자식 트리(리스트 수백 개, 차트 등)         → React.memo 확실히 유용
memo 자식에게 넘기는 콜백/객체                  → useCallback/useMemo 필수(짝)
────────────────────────────────────────────
숫자 몇 개 더하기, 문자열 concat               → useMemo 오히려 손해
        (비교 비용 > 재계산 비용)
가벼운 컴포넌트(자식 없는 <span>{text}</span>)  → React.memo 오히려 손해
        (props 비교 비용 > 그냥 다시 그리는 비용)
```
- **판단 기준**: "이 계산/렌더가 실제로 눈에 띄게 느린가?"를 먼저 프로파일러(React DevTools Profiler)로 확인하고 적용. 습관적으로 모든 컴포넌트에 `memo`를 감싸면 오히려 매 렌더마다 얕은 비교 비용만 추가되고, 코드 가독성도 떨어진다.
- 실무에서 흔한 함정: `useMemo(() => x + y, [x, y])` 처럼 **덧셈 수준의 연산**을 메모이제이션 — 재계산 비용보다 캐시 비교/유지 비용이 더 크다.

> 🗣️ **꼬리 질문**: "`useCallback`을 썼는데도 자식이 계속 리렌더된다면 어떤 걸 의심하나요?" → 자식이 `React.memo`로 감싸져 있는지, 그 자식에 넘기는 다른 props(객체/배열)도 함께 참조가 고정됐는지 확인해야 한다(하나라도 매번 새 참조면 얕은 비교 전체가 실패).

## 7. 패턴 정리표
| 도구 | 메모이제이션 대상 | 언제 쓰나 |
|------|------------------|-----------|
| `React.memo` | 컴포넌트 렌더 결과 | 자식이 무거운데 props가 자주 안 바뀔 때 |
| `useMemo` | 계산된 값 | 비용 큰 연산(정렬/필터) 반복 방지, 참조 동일성 유지(다음 useMemo/memo 입력용) |
| `useCallback` | 함수 참조 | memo화된 자식에 콜백 전달, useEffect 의존성 안정화 |

## 8. 핵심 포인트 (자주 하는 실수)
- 🔴 "props가 안 바뀌면 자식은 리렌더 안 된다" — ❌ 부모가 리렌더되면 기본적으로 자식도 리렌더된다. `React.memo`를 붙여야 props 동일 시 스킵됨.
- 🔴 state를 직접 mutate(`arr.push`, `obj.x = 1`) — 참조가 그대로라 리렌더 누락/오작동.
- 🔴 `React.memo` 자식에 넘기는 콜백/객체를 고정 안 함 — 매 렌더 새 참조라 memo가 사실상 항상 실패(무의미).
- 🟡 `useMemo`/`useCallback`을 아무 데나 남발 — 메모이제이션 자체도 비교/캐시 비용이 있어, 가벼운 연산엔 오히려 손해(과최적화 주의).
- 🟡 "리렌더 = 느리다"는 오해 — 리렌더 자체(VDOM 재계산)와 **실제 DOM 갱신**은 다름. 리렌더가 잦아도 diff 결과가 같으면 실제 DOM은 안 바뀜.

## 9. 예상 면접 질문 + 답변 골격
**Q1. "컴포넌트는 언제 리렌더되나요?"**
> ① 자신의 state 변경 ② props 변경 ③ 부모 리렌더(자식 props 불변이어도). 세 번째가 실무에서 "왜 이렇게 자주 리렌더되지?"의 주 원인.

**Q2. "불필요한 리렌더를 어떻게 막나요?"**
> ① `React.memo`로 컴포넌트를 감싸 props 얕은 비교 후 스킵 ② 무거운 계산은 `useMemo`로 캐싱 ③ memo 자식에 넘기는 함수는 `useCallback`으로 참조 고정. 단, 남용하면 비교 비용이 더 커질 수 있어 프로파일링 후 적용.

**Q3. "상태 불변성을 지켜야 하는 이유는?"**
> React는 state 변경 감지를 참조 비교로 함. 원본을 직접 mutate하면 참조가 같아 변경을 못 감지하거나 `memo`의 얕은 비교가 깨짐. 그래서 항상 새 객체/배열을 만들어 교체.

**Q4. "`useCallback`을 썼는데 왜 자식이 여전히 리렌더되나요?"**
> ① `React.memo`로 자식을 감싸지 않았거나 ② 같이 넘기는 다른 props(객체/배열/JSX children 등)가 여전히 매 렌더 새 참조라서 얕은 비교 전체가 깨진 경우가 많다. `useCallback`/`useMemo`/`React.memo`는 셋이 함께 짝을 이뤄야 효과가 있다.

---

# R3. Hooks

**학습 목표**: *"useState/useEffect가 뭐죠?"* / *"Hooks 규칙이 뭔가요?"* / *"의존성 배열을 왜 신경 써야 하나요?"* 에 5분 답할 수 있다.

## 1. 비유 — 포스트잇과 우편함 자동응답
`useState`는 컴포넌트 전용 **포스트잇 메모장** — 함수가 다시 호출돼도(리렌더돼도) 값이 지워지지 않고 유지된다. `useEffect`는 **우편함에 특정 편지(의존성 값)가 도착했을 때만 동작하는 자동응답기** — "이전 번호로 온 자동응답은 먼저 취소하고(cleanup) 새로 등록"하는 방식으로 동작한다.

## 2. useState 핵심
```jsx
const [count, setCount] = useState(0);
setCount(count + 1);          // 다음 렌더에서 반영 (즉시 X, 비동기적 배치)
setCount((prev) => prev + 1); // 이전 값 기반 갱신은 함수형 업데이트 권장
```
- state는 **컴포넌트 인스턴스별로 독립**, 리렌더 사이에도 값 유지.
- `setCount(count + 1)`을 연속 두 번 호출해도 `count`는 클로저에 갇힌 옛 값이라 **+1만 반영**됨 → 함수형 업데이트(`prev => prev+1`)로 해결.

## 3. useEffect 핵심 — 실행 시점과 cleanup
```jsx
useEffect(() => {
  const id = setInterval(() => console.log("tick"), 1000);
  return () => clearInterval(id);   // cleanup: 다음 effect 실행 전 & unmount 시
}, [/* 의존성 배열 */]);
```
```
의존성 배열 []          → mount 시 1번만 실행 (componentDidMount 유사)
의존성 배열 [a, b]       → mount 시 + a 또는 b 변경 시마다 실행
의존성 배열 없음(생략)    → 매 렌더마다 실행
```
```
렌더1 (a=1) → effect 실행 → (cleanup 등록)
      state 변경, a=2
렌더2 (a=2) → 이전 cleanup 먼저 실행 → 새 effect 실행
unmount    → 마지막 cleanup 실행
```

## 4. useEffect 심화

### 비유 — 자동응답기의 "취소 후 재등록" + "출장 다녀온 사람이 늦게 도착한 메일에 답장하면 안 되는 이유"
`useEffect`의 cleanup은 자동응답기를 새로 등록하기 **전에 이전 자동응답을 반드시 취소**하는 것과 같다. 취소를 안 하면 옛날 자동응답기가 계속 살아남아 엉뚱한 답장(오래된 데이터로 화면을 덮어씀)을 보낸다.

### cleanup 함수 — 언제, 왜 실행되는가
```jsx
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/user/${userId}`, { signal: controller.signal })
    .then(res => res.json())
    .then(setUser);

  return () => controller.abort(); // cleanup: 다음 effect 실행 직전 + unmount 시
}, [userId]);
```
- cleanup은 ① **다음 effect가 실행되기 직전** ② **컴포넌트 unmount 시** 두 시점에 실행된다.
- 목적: 이전 렌더에서 등록한 구독/타이머/네트워크 요청이 **다음 effect와 중복되거나 좀비처럼 남아 있는 것**을 방지.

### 의존성 배열 함정 ① — 누락 → stale closure
```jsx
// ❌ userId를 클로저로 캡처했지만 의존성 배열에 없음
function Profile({ userId }) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetchUser(userId).then(setUser); // 이 userId는 "처음 렌더 시점"의 값에 고정
  }, []); // userId가 바뀌어도 effect가 재실행 안 됨
}
```
- 클로저는 **생성될 당시의 변수 값**을 기억한다. 의존성 배열에 `userId`를 빼면, 이후 `userId`가 바뀌어도 effect 내부는 여전히 첫 렌더 때의 옛 값(stale closure)을 참조한다.
- ESLint `react-hooks/exhaustive-deps` 규칙이 바로 이걸 잡아준다 — 경고를 임의로 끄지 말 것.

### 의존성 배열 함정 ② — 매번 새 객체/함수 → 무한 루프
```jsx
// ❌ options가 렌더마다 새로 생성되는 객체 → effect가 매 렌더 재실행 → setState → 리렌더 → ...
function Search({ keyword }) {
  const options = { keyword, limit: 10 }; // 매 렌더 새 참조
  useEffect(() => {
    fetchResults(options).then(setResults);
  }, [options]); // 참조가 매번 달라 무한 재실행
}

// ✅ 원시값으로 좁히거나 useMemo로 참조 고정
useEffect(() => {
  fetchResults({ keyword, limit: 10 });
}, [keyword]); // 원시값만 의존성으로
```
- 근본 원인은 항상 같다 — **"참조형(객체/배열/함수) 값이 매 렌더 새로 만들어져 얕은 비교(`Object.is`)에서 항상 다르다고 판정"**되는 것. 해결책은 두 가지뿐: 의존성을 원시값(primitive)으로 좁히거나, `useMemo`/`useCallback`으로 참조를 고정.

### Race Condition — cancelled 플래그로 처리
```jsx
useEffect(() => {
  let cancelled = false;

  async function load() {
    const data = await fetchUser(userId); // userId=1 요청 중 userId=2로 바뀔 수 있음
    if (!cancelled) setUser(data);        // 이미 무효화된 응답이면 버림
  }
  load();

  return () => { cancelled = true; }; // cleanup에서 "무효" 표시
}, [userId]);
```
```
userId=1 요청 시작 ─────────────────┐(느림, 3초)
userId=2로 변경 → cleanup 실행(cancelled=true) → userId=2 요청 시작 ──┐(빠름, 1초)
                                                                    ▼
                                                       userId=2 응답 도착 → setUser(user2) ✅
userId=1 응답 늦게 도착 ─────────────────────────────────────────────▶ cancelled=true라 무시됨 ✅
```
- fetch는 요청 순서대로 응답이 오지 않을 수 있다(네트워크 지연 역전). cleanup에서 `cancelled = true`를 세팅해두고, 응답 처리 직전에 체크하면 **오래된 요청의 결과가 최신 상태를 덮어쓰는 버그**를 막는다.
- 더 정교하게는 `AbortController`로 실제 네트워크 요청 자체를 취소(불필요한 트래픽까지 방지)하는 것이 낫다.

### 언제 useEffect가 필요 없는가
| 상황 | useEffect 없이 처리 |
|------|---------------------|
| props/state로부터 계산 가능한 값 | 렌더 중 직접 계산 (`const fullName = first + " " + last`), `useMemo`는 비쌀 때만 |
| 사용자 이벤트에 대한 반응(클릭 시 API 호출) | 이벤트 핸들러 안에서 바로 처리 — effect로 감쌀 필요 없음 |
| props 변경 시 state 초기화 | 가능하면 `key` prop으로 컴포넌트를 통째로 리마운트 |
| 다른 state 변경에 따라 파생되는 state | 렌더 중 계산하거나 이벤트 핸들러에서 함께 `setState` (effect 체인 X) |
- **원칙**: `useEffect`는 "React 외부 세계와의 동기화"(fetch, 구독, DOM 직접 조작, 타이머, 로깅)를 위한 탈출구다. **렌더링 로직이나 이벤트에 대한 반응을 effect로 처리하면 불필요한 리렌더와 타이밍 버그**가 생기기 쉽다.

> 🗣️ **꼬리 질문 1**: "cleanup 없이 fetch만 하면 실제로 어떤 버그가 나나요?" → 컴포넌트가 언마운트된 후에도 응답이 도착하면 `setState`가 호출되어 "unmounted 컴포넌트에 state 업데이트" 경고 + 메모리 누수 가능성, 또는 race condition으로 옛 데이터가 최신 화면을 덮어쓰는 버그.
> 🗣️ **꼬리 질문 2**: "props가 바뀔 때마다 state를 초기화하고 싶다면 useEffect로 하는 게 맞나요?" → 대부분 `key` prop을 바꿔 컴포넌트를 리마운트시키는 게 더 간단하고 버그가 적다(effect로 하면 "한 프레임 동안 옛 state가 보이는" 깜빡임이 생길 수 있음).

## 5. Hooks 규칙 (Rules of Hooks)
1. **최상위(top-level)에서만 호출** — 조건문/반복문/중첩 함수 안에서 호출 금지.
2. **React 함수 컴포넌트 또는 커스텀 Hook에서만** 호출 (일반 JS 함수 X).

```jsx
// ❌ 조건문 안에서 Hook 호출
if (isLoggedIn) {
  useEffect(() => { ... }, []);
}

// ✅ Hook은 항상 호출하고, 조건은 내부 로직에서 분기
useEffect(() => {
  if (isLoggedIn) { ... }
}, [isLoggedIn]);
```
- **왜 이런 규칙이?** React는 Hook을 **호출 순서(index)** 로 구분해 각 state를 관리한다. 조건부로 호출하면 렌더마다 순서가 달라져 `useState` 슬롯이 뒤섞임 → 엉뚱한 state를 읽는 버그.

## 6. 자주 하는 실수
### ① 의존성 배열 누락
```jsx
// ❌ userId를 쓰는데 의존성 배열에 빠짐 → userId 바뀌어도 재실행 안 됨(stale closure)
useEffect(() => {
  fetchUser(userId);
}, []);

// ✅
useEffect(() => {
  fetchUser(userId);
}, [userId]);
```
### ② 무한 루프
```jsx
// ❌ effect 안에서 참조형(객체/배열) state를 매 렌더 새로 만들어 자기 자신을 트리거
useEffect(() => {
  setData({ ...data, updated: true }); // data가 의존성이면 setData→리렌더→effect 재실행→...
}, [data]);
```
> 원인은 대부분 "매 렌더마다 새로 생성되는 객체/배열/함수"가 의존성 배열에 들어가 참조가 매번 달라지는 것. `useMemo`/`useCallback`으로 참조 고정하거나, 의존성을 원시값(primitive)으로 좁혀야 함.

## 7. 커스텀 훅 — 로직 재사용

### 비유 — 여러 요리에 쓰는 "육수 우려내기" 공정 분리
컴포넌트마다 fetch + loading + error 상태를 매번 새로 짜면, 마치 요리마다 육수를 처음부터 다시 끓이는 격이다. **자주 반복되는 로직(육수 우려내기)만 따로 함수로 뽑아** 여러 요리(컴포넌트)에서 재사용하는 것이 커스텀 훅이다.

### 정의
커스텀 훅은 **이름이 `use`로 시작하는 일반 함수**로, 내부에서 다른 Hook(`useState`, `useEffect` 등)을 호출해 **상태 로직을 캡슐화**한다. 컴포넌트 간에 **UI가 아니라 "로직"만** 재사용하고 싶을 때 쓴다(UI 재사용은 그냥 컴포넌트 분리).

```jsx
// 커스텀 훅: fetch + loading + error 상태를 캡슐화
function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(url)
      .then(res => res.json())
      .then(json => { if (!cancelled) setData(json); })
      .catch(err => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url]);

  return { data, loading, error };
}

// 여러 컴포넌트에서 재사용
function UserProfile({ userId }) {
  const { data: user, loading, error } = useFetch(`/api/user/${userId}`);
  if (loading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  return <div>{user.name}</div>;
}
```
- 각 컴포넌트가 `useFetch`를 호출할 때마다 **완전히 독립된 state 인스턴스**를 갖는다(전역 공유 아님) — 클래스 컴포넌트의 mixin/HOC보다 훨씬 명확한 재사용 방식.
- 이름 규칙(`use` 접두사)은 강제는 아니지만 **린터가 "Hooks 규칙"을 검사하기 위한 관례**이므로 반드시 지켜야 함.

> 🗣️ **꼬리 질문**: "커스텀 훅과 일반 유틸 함수의 차이는?" → 커스텀 훅은 내부에서 `useState`/`useEffect` 등 **다른 Hook을 호출해 렌더 간 상태를 유지**할 수 있다는 점이 다르다. 단순 계산만 하고 상태가 없다면 그냥 일반 함수로 충분하다.

## 8. Controlled vs Uncontrolled 컴포넌트

### 비유 — 실시간 통역 vs 나중에 한 번에 번역
Controlled는 **한 마디 할 때마다 바로 통역**해서 상대(React state)가 항상 원문을 알고 있는 것. Uncontrolled는 **말을 다 끝낸 뒤 필요할 때만 통째로 번역 요청**하는 것 — 그 사이엔 원문(DOM 내부 값)이 어디에 있는지 React가 모른다.

```jsx
// Controlled — input의 값을 React state가 항상 소유
function ControlledInput() {
  const [value, setValue] = useState("");
  return <input value={value} onChange={(e) => setValue(e.target.value)} />;
}

// Uncontrolled — DOM 자체가 값을 들고 있고, 필요할 때 ref로 꺼냄
function UncontrolledInput() {
  const inputRef = useRef(null);
  const handleSubmit = () => console.log(inputRef.current.value);
  return <input ref={inputRef} defaultValue="" />;
}
```

| | Controlled | Uncontrolled |
|--|-----------|---------------|
| 값의 출처 | React state (`value` + `onChange`) | DOM 자체 (`ref`로 필요할 때 접근) |
| 리렌더 | 매 입력마다 리렌더 발생 | 입력 중 리렌더 없음 |
| 실시간 검증/포맷팅 | 쉬움(글자마다 즉시 반응 가능) | 어려움(submit 시점에나 값 확인) |
| 코드량 | 약간 많음(state + handler) | 적음 |
| 적합한 경우 | 실시간 유효성 검사, 다른 값과 동기화, 폼 라이브러리 대부분 | 단순 폼, 성능이 중요한 대량 입력 필드, 파일 input(`<input type="file">`은 애초에 uncontrolled만 가능) |

- `value` prop을 주면서 `onChange`를 안 주면 → **read-only 취급 + 콘솔 경고**("controlled input에 onChange 없음"). `value`와 `onChange`는 항상 세트.
- 대량의 input이 있는 폼(수십 개 필드)에서 전부 controlled로 만들면 **매 키 입력마다 전체 리렌더** 비용이 커질 수 있어, 이런 경우 uncontrolled + 라이브러리(react-hook-form 등)로 리렌더를 줄이는 전략도 실무에서 흔하다.

> 🗣️ **꼬리 질문**: "controlled input인데 `value`만 주고 `onChange`를 안 주면 어떻게 되나요?" → input이 read-only가 되고(사용자가 타이핑해도 값이 안 바뀜) React가 콘솔에 경고를 띄운다. state를 갱신하는 `onChange` 핸들러가 있어야 "실시간 통역"이 완성된다.

## 9. 패턴 정리표
| Hook | 역할 | 대응하는 클래스형 개념 |
|------|------|----------------------|
| `useState` | 렌더 간 유지되는 로컬 값 | `this.state` |
| `useEffect([])` | mount 시 1회 (부수효과: fetch, 구독 등) | `componentDidMount` |
| `useEffect([deps])` | deps 변경 시 재실행 + cleanup | `componentDidUpdate` 일부 |
| `useEffect` cleanup | unmount/재실행 전 정리 | `componentWillUnmount` |
| 커스텀 훅(`useXxx`) | 여러 컴포넌트 간 상태 로직 재사용 | mixin/HOC (클래스형의 재사용 패턴 대체) |

## 10. 핵심 포인트 (자주 하는 실수, 요약)
- 🔴 조건문/반복문 안에서 Hook 호출 — Hook 순서가 렌더마다 달라져 state 매핑 붕괴.
- 🔴 useEffect 의존성 배열에 실제 사용하는 값 누락 — stale closure(옛 값을 계속 참조).
- 🔴 객체/배열/함수를 의존성으로 넣으면서 매 렌더 새로 생성 — 무한 재실행 루프.
- 🔴 비동기 fetch에 race condition 방지 로직(cancelled 플래그/AbortController) 없음 — 늦게 도착한 옛 응답이 최신 상태를 덮어씀.
- 🟡 setState는 비동기 배치 처리 — 직후 값 읽으면 옛 값. 이전 값 기반이면 함수형 업데이트 사용.
- 🟡 cleanup 함수를 안 써서 이벤트 리스너/타이머가 계속 쌓이는 메모리 누수 주의.
- 🟡 렌더링 로직/이벤트 반응까지 습관적으로 useEffect로 처리 — 계산 가능한 값이나 이벤트 핸들러로 충분한 경우가 많음(불필요한 effect 체인).

## 11. 예상 면접 질문 + 답변 골격
**Q1. "useState와 useEffect를 설명해주세요."**
> ① `useState`는 리렌더 사이에도 유지되는 컴포넌트 로컬 상태 ② `useEffect`는 렌더 이후 실행되는 부수효과(fetch, 구독, DOM 조작 등)를 의존성 배열 기준으로 제어, cleanup으로 이전 효과 정리.

**Q2. "Hooks 규칙이 뭐고 왜 지켜야 하나요?"**
> ① 최상위에서만, React 컴포넌트/커스텀 Hook에서만 호출 ② React는 Hook을 호출 순서로 각 state 슬롯을 식별하므로, 조건부 호출로 순서가 달라지면 엉뚱한 state가 매핑되는 버그 발생.

**Q3. "useEffect 의존성 배열을 잘못 쓰면 어떤 문제가 생기나요?"**
> ① 누락 시 — effect 안 값이 옛 값(stale closure)에 갇혀 최신 상태 반영 안 됨 ② 매번 새로 생성되는 참조형을 의존성에 넣으면 — 매 렌더 재실행되거나 무한 루프. `useMemo`/`useCallback`으로 참조 고정하거나 원시값으로 좁혀서 해결.

**Q4. "비동기 요청에서 race condition을 어떻게 방지하나요?"**
> ① effect 내부에 `cancelled` 플래그를 두고 cleanup에서 `true`로 세팅 ② 응답 처리 직전에 `cancelled` 체크해서 무효화된 요청 결과는 버림 ③ 더 확실하게는 `AbortController`로 네트워크 요청 자체를 취소. 원인은 fetch 응답이 요청 순서대로 도착한다는 보장이 없기 때문.

**Q5. "커스텀 훅은 왜 쓰나요?"**
> ① 여러 컴포넌트에서 반복되는 상태 로직(fetch, 폼 검증, 구독 등)을 함수로 뽑아 재사용 ② 각 호출은 독립된 state 인스턴스를 가지므로 로직만 재사용되고 state는 공유되지 않음 ③ 클래스형의 mixin/HOC보다 의존관계가 명확함.

**Q6. "Controlled와 Uncontrolled input의 차이는?"**
> ① Controlled는 `value`+`onChange`로 React state가 입력값을 항상 소유, 실시간 검증/동기화에 유리하지만 매 입력마다 리렌더 ② Uncontrolled는 DOM이 값을 들고 있고 `ref`로 필요할 때만 접근, 리렌더가 없어 대량 입력 폼에서 유리하지만 실시간 반응은 어려움.

---

# R4. State Management

**학습 목표**: *"전역 상태관리가 왜 필요한가요?"* / *"Context와 Redux 차이는?"* 에 5분 답할 수 있다.

## 1. 비유 — 회사 내부 문서 전달 체계
로컬 state는 **개인 서랍**(그 사람만 씀). prop drilling은 **문서를 부장→과장→대리→사원으로 손수 전달**하는 것 — 중간 관리자들은 내용과 무관해도 전달만 해줌. 전역 상태관리는 **사내 게시판**(공지)에 올려 필요한 사람이 직접 구독해서 봄 — 중간 전달자가 필요 없음.

## 2. 로컬 state vs 전역 state
| | 로컬 state | 전역 state |
|--|-----------|-----------|
| 정의 위치 | 해당 컴포넌트(`useState`) | 앱 상위/별도 store |
| 범위 | 그 컴포넌트 + 직계 자식(props로 전달) | 트리 어디서든 구독 가능 |
| 예시 | input 값, 토글, 모달 open 여부 | 로그인 유저, 장바구니, 테마, 언어 설정 |
| 원칙 | **가능하면 로컬로** (colocation) | 여러 먼 컴포넌트가 같이 봐야 할 때만 |

## 3. Prop Drilling 문제
```
<App user={user}>
  └ <Layout user={user}>              ← user 안 씀, 그냥 전달만
      └ <Sidebar user={user}>          ← user 안 씀, 그냥 전달만
          └ <Profile user={user}/>     ← 여기서 실제 사용
```
- 중간 컴포넌트(`Layout`, `Sidebar`)는 `user`를 쓰지도 않으면서 **props로 계속 받아 넘기기만** 함.
- 문제점: 리팩터링 시 중간 컴포넌트 전부 시그니처 변경 필요, 불필요한 리렌더 전파 가능성, 코드 가독성 저하.

## 4. Context API vs 외부 라이브러리 (Redux/Zustand)
```jsx
// Context API — 값 하나를 트리 전체에 "주입"
const UserContext = createContext(null);

function App() {
  return (
    <UserContext.Provider value={user}>
      <Layout />
    </UserContext.Provider>
  );
}

function Profile() {
  const user = useContext(UserContext); // 중간 단계 없이 바로 구독
}
```
| | Context API | Redux | Zustand |
|--|-------------|-------|---------|
| 성격 | React 내장, prop drilling 해결 도구 | 외부 상태관리 라이브러리 | 외부 상태관리 라이브러리(경량) |
| 업데이트 방식 | Provider value 변경 → 구독 컴포넌트 전부 리렌더 | 액션 dispatch → reducer → 구독 부분만 선택적 리렌더(selector) | store 변경 → selector 구독 부분만 리렌더 |
| 보일러플레이트 | 적음 | 많음(action/reducer/dispatch) | 적음 |
| 성능 세밀 제어 | 약함 (값 하나 바뀌면 하위 구독자 전체 리렌더) | 강함 (selector로 필요한 부분만) | 강함 (selector 지원) |
| DevTools/미들웨어 | 없음 | 풍부(시간여행 디버깅 등) | 기본 제공 + 확장 |
| 적합한 규모 | 소~중규모, 자주 안 바뀌는 값(테마, 로케일, 인증 유저) | 대규모, 복잡한 상태 흐름·비동기 로직 많음 | 중소규모, 간단한 API 선호 |

## 5. Context 리렌더 성능 함정 심화

### 비유 — 사내 방송(스피커) vs 개인 우편함
`Context.Provider`의 `value`는 **건물 전체에 울리는 스피커 방송**과 같다. 한 글자만 바뀐 공지라도 방송을 들을 수 있는 사람(구독자, `useContext` 호출부) **전원이 다시 듣는다** — 그 내용이 자신과 무관해도. Redux/Zustand의 selector는 **개인 우편함**에 가까워, "내가 구독한 내용만" 바뀔 때만 알림을 받는다.

### 리렌더 함정 ① — value가 매 렌더 새 객체
```jsx
// ❌ Provider가 리렌더될 때마다 value가 새 객체 → 모든 구독자가 매번 리렌더
function App() {
  const [user, setUser] = useState(null);
  return (
    <UserContext.Provider value={{ user, setUser }}> {/* 매 렌더 새 객체 */}
      <Layout />
    </UserContext.Provider>
  );
}

// ✅ useMemo로 value 참조 고정
function App() {
  const [user, setUser] = useState(null);
  const value = useMemo(() => ({ user, setUser }), [user]);
  return <UserContext.Provider value={value}><Layout /></UserContext.Provider>;
}
```
- `Provider`를 감싼 컴포넌트가 다른 이유로 리렌더되면(`App`에 다른 state가 있어도) `value`가 매번 새로 생성되면서, **user 값 자체는 안 바뀌었는데도 모든 구독 컴포넌트가 리렌더**된다.

### 리렌더 함정 ② — Context 하나에 자주 바뀌는 값 + 안 바뀌는 값을 같이 넣음
```
❌ 하나의 AppContext = { user, theme, notifications(매초 갱신) }
   → notifications가 1초마다 바뀜 → theme만 읽는 컴포넌트까지 매초 리렌더

✅ Context 분리
   UserContext(거의 안 바뀜) / ThemeContext(거의 안 바뀜) / NotificationContext(자주 바뀜)
   → 각 구독자는 자신이 실제 구독한 Context가 바뀔 때만 리렌더
```
- Context는 **값 하나 단위로 구독**되기 때문에, 자주 바뀌는 값과 안 바뀌는 값을 한 Context에 묶으면 "안 바뀌는 값만 읽는 컴포넌트"까지 불필요하게 리렌더된다. **변경 빈도가 다른 값은 별도 Context로 분리**하는 것이 기본 대응책.
- 더 큰 트리에서는 Context 자체가 selector를 지원하지 않으므로, "user 객체 중 name만 쓰는 컴포넌트"도 user 전체가 바뀌면 리렌더된다 — 이 지점이 Redux/Zustand(selector 지원)와의 근본적 차이.

> 🗣️ **꼬리 질문**: "Context를 분리했는데도 여전히 리렌더가 잦다면 다음으로 뭘 의심하나요?" → Provider의 `value`가 `useMemo` 없이 매 렌더 새로 생성되는지, 또는 구독 컴포넌트 자체가 `React.memo`로 감싸져 있지 않아 부모 리렌더 전파까지 함께 받는 건 아닌지 확인.

## 6. 언제 전역 상태가 필요한가
- 서로 **멀리 떨어진(형제 트리 이상) 여러 컴포넌트**가 같은 데이터를 읽고/써야 할 때.
- prop drilling이 **3~4단계 이상** 되어 중간 컴포넌트가 관심 없는 데이터를 계속 전달할 때.
- 반대로, 부모-자식 1~2단계면 그냥 props로 충분 — 무조건 전역화하면 오히려 데이터 흐름 추적이 어려워짐(과설계 주의).

### 언제 Context로 충분하고, 언제 외부 라이브러리(Redux/Zustand)가 필요한가
| 신호 | Context로 충분 | 외부 라이브러리 필요 |
|------|----------------|----------------------|
| 변경 빈도 | 거의 안 바뀜(로그인 유저, 테마, 로케일) | 자주/복잡하게 바뀜(장바구니, 실시간 협업 데이터) |
| 구독자 수 | 적음, 리렌더 비용이 크지 않음 | 트리 전역에 많은 컴포넌트가 부분 구독해야 함 |
| 세밀한 리렌더 제어 | 불필요 | selector로 "값의 일부"만 구독해야 리렌더 폭발 방지 |
| 비동기/부수효과 흐름 | 단순 | 복잡한 액션 흐름, 미들웨어, 시간여행 디버깅 필요 |
| 디버깅 도구 | 필요 없음 | Redux DevTools 등으로 상태 변화 추적 필요 |
- 실무 판단 순서: ① 로컬 state로 될까(colocation)? → ② prop drilling이 3~4단계 이상인가, Context로 해결? → ③ Context의 `value` 변경이 잦고 selector 없이는 리렌더가 감당 안 되는가 → 이때 비로소 Redux/Zustand 도입 검토.

## 7. 핵심 포인트 (자주 하는 실수)
- 🔴 모든 state를 습관적으로 전역(Redux/Context)에 넣음 — 로컬로 충분한 UI 상태(모달 open 등)까지 전역화하면 관리 복잡도만 증가.
- 🔴 Context 하나에 자주 바뀌는 값(예: 매 초 변하는 카운터)까지 다 넣음 — value 변경 시 **모든 구독 컴포넌트가 리렌더**되어 성능 문제. 자주 바뀌는 값과 안 바뀌는 값은 Context를 분리.
- 🔴 Provider의 `value`를 `useMemo` 없이 매 렌더 새로 생성 — user 값 자체는 안 바뀌어도 참조가 달라져 모든 구독자가 리렌더.
- 🟡 Context는 "상태관리 라이브러리"가 아니라 "값 전달 도구"에 가까움 — Redux처럼 세밀한 selector 최적화가 기본 제공되지 않음.
- 🟡 서버에서 온 데이터(API 응답 캐싱)는 client state 라이브러리보다 **React Query/SWR** 같은 서버 상태 전용 도구가 더 적합(백엔드 개발자에게 익숙한 캐시 무효화 개념과 유사).

## 8. 예상 면접 질문 + 답변 골격
**Q1. "Prop drilling이 뭐고 왜 문제인가요?"**
> ① 상위 state를 여러 단계 아래 자식에 전달하려고 중간 컴포넌트들이 실제로 쓰지도 않는 props를 계속 릴레이하는 것 ② 중간 컴포넌트 시그니처가 데이터 구조에 종속되어 리팩터링 어려움, 가독성 저하가 문제.

**Q2. "Context API와 Redux의 차이는?"**
> ① Context는 React 내장 기능으로 prop drilling을 없애는 값 전달 도구, value 변경 시 구독자 전체가 리렌더 ② Redux는 action/reducer 기반 외부 상태관리로 selector를 통해 필요한 부분만 선택적으로 리렌더, 복잡한 상태 흐름과 미들웨어/DevTools 지원. 규모와 복잡도에 따라 선택.

**Q3. "언제 전역 상태관리가 필요한가요?"**
> ① 형제 트리 이상 멀리 떨어진 여러 컴포넌트가 같은 데이터를 공유해야 할 때 ② prop drilling이 여러 단계로 깊어질 때. 반대로 로컬로 해결 가능한 UI 상태까지 전역화하면 과설계이므로, 항상 "이 상태를 누가 읽는가"부터 판단.

**Q4. "Context를 쓰면 왜 성능 문제가 생길 수 있나요?"**
> ① Context는 selector 없이 값 하나 단위로 구독되기 때문에, `value`가 바뀌면 그 값의 일부만 쓰는 컴포넌트까지 전부 리렌더된다 ② Provider의 `value`를 `useMemo` 없이 매 렌더 새로 만들면 실제 값이 안 바뀌었어도 리렌더가 발생한다. 대응책은 변경 빈도가 다른 값을 별도 Context로 분리하고, `value`는 `useMemo`로 참조를 고정하는 것.

**Q5. "Context로 충분한 경우와 Redux/Zustand가 필요한 경우를 어떻게 구분하나요?"**
> ① 값이 거의 안 바뀌고(테마, 인증 유저) 구독자가 적으면 Context로 충분 ② 값이 자주 바뀌고 트리 전역에서 부분 구독이 필요하거나, 복잡한 비동기 액션 흐름·디버깅 도구가 필요하면 selector 기반 외부 라이브러리로 전환. 판단 순서는 "로컬 state → Context → 그래도 리렌더/복잡도가 감당 안 되면 외부 라이브러리".

---

# R5. Reconciliation과 diffing

**학습 목표**: *"React가 바뀐 부분을 어떻게 찾아내나요?"* / *"key는 왜 필요하고 index를 쓰면 왜 위험한가요?"* / *"diffing 휴리스틱이 뭔가요?"* / *"Fiber가 뭘 바꿨나요?"* 에 예시를 들며 5분 답할 수 있다.
> R1에서 Virtual DOM/재조정을 개괄했다면, 여기서는 **diff 알고리즘의 휴리스틱과 key의 실제 동작**을 파고든다.

## 1. 비유 — 두 장의 조직도를 비교하는 인사팀

작년 조직도(이전 VDOM)와 올해 조직도(새 VDOM)를 나란히 놓고, **바뀐 부분만 실제 인사발령(DOM 조작)** 을 낸다. 전 직원을 다 해고하고 다시 뽑으면(전체 DOM 교체) 느리니까, "같은 자리·같은 직책이면 그대로 두고, 이름표(props)만 바뀐 사람은 이름표만 교체"한다. 이때 **사원번호(key)** 가 있으면 "이 사람이 자리를 옮긴 것"인지 "새로 온 사람"인지 정확히 구분할 수 있다.

## 2. 개념 정의 (1줄)
> **Reconciliation(재조정)** = 새 VDOM 트리와 이전 VDOM 트리를 비교(diffing)해 **실제 DOM에 반영할 최소 변경분**을 계산하는 과정.
> 완전한 트리 비교는 O(n³)이라 비현실적 → React는 **2가지 휴리스틱**으로 O(n)에 근사한다.

## 3. diffing 2대 휴리스틱

```
① 타입이 다르면 통째로 교체 (서브트리 비교 안 함)
   <div><Counter/></div>  →  <span><Counter/></span>
   div≠span → div 이하를 전부 버리고 span을 새로 마운트
   (Counter의 state도 사라짐!)

② 같은 레벨의 리스트는 key로 동일성 판단
   [<li key=a/> <li key=b/>]  →  [<li key=b/> <li key=a/>]
   key로 "a와 b가 순서만 바뀌었다"고 인식 → 재생성 없이 이동만
```
- 휴리스틱 ①의 함의: 조건부 렌더링으로 **엘리먼트 타입이 바뀌면 그 아래 컴포넌트가 언마운트→재마운트**되어 내부 state가 초기화된다.

## 4. key — 왜 index가 위험한가

```jsx
// ❌ index를 key로: 리스트 중간에 삽입/삭제/정렬하면 어긋남
{items.map((item, i) => <Row key={i} value={item} />)}

// 맨 앞에 새 항목 추가 시:
//   이전: key0=A, key1=B, key2=C
//   이후: key0=X, key1=A, key2=B, key3=C
//   → React는 "key0의 내용이 A→X로 바뀌었다"고 오판
//   → 모든 Row의 props를 갈아끼우고, 각 Row의 내부 state(입력값 등)가 엉뚱한 행에 남음
```
```jsx
// ✅ 안정적 고유 ID를 key로
{items.map((item) => <Row key={item.id} value={item} />)}
// 맨 앞 추가 시 X만 새로 마운트, 나머지는 그대로 → state도 올바르게 따라감
```
- key는 **형제 노드 사이에서만 고유**하면 된다(전역 유일 불필요). 정적이고 순서가 안 바뀌는 리스트라면 index도 무방하지만, 삽입/삭제/정렬이 있으면 반드시 안정적 ID.

## 5. Fiber — 재조정의 재작성(React 16+)

- 이전(Stack Reconciler)은 재조정이 **동기·중단 불가** → 큰 트리 diff 중 메인 스레드를 오래 붙잡아 입력이 버벅였다.
- **Fiber**는 작업을 작은 단위로 쪼개 **중단·재개·우선순위 지정**이 가능한 구조. 렌더 단계(diff 계산, 중단 가능)와 커밋 단계(실제 DOM 반영, 중단 불가)를 분리 → Concurrent 기능(useTransition 등)의 토대.

## 6. 핵심 포인트 (자주 하는 실수)

- 🔴 "React는 실제 DOM을 통째로 다시 그린다" ❌ — VDOM diff로 **바뀐 부분만** 실제 DOM에 반영. VDOM 재계산(렌더)과 DOM 반영(커밋)은 별개.
- 🔴 "key는 리스트에 그냥 넣으라니까 index를 쓴다" ❌ — 삽입/삭제/정렬 시 state가 엉뚱한 항목에 남거나 불필요한 재생성 발생. 안정적 고유 ID 사용.
- 🟡 엘리먼트 **타입이 바뀌면 서브트리가 언마운트→재마운트** → 내부 state 초기화. 같은 위치의 컴포넌트 타입을 조건부로 바꿀 때 주의.
- 🟡 key를 **강제 리마운트 트릭**으로도 쓸 수 있음 — key를 일부러 바꾸면 컴포넌트를 새로 마운트해 state를 리셋(폼 초기화 등).

## 7. 예상 면접 질문 + 답변 골격

**Q1. "React가 바뀐 부분을 어떻게 찾나요?"**
> ① 새 VDOM과 이전 VDOM을 비교(diffing) → ② 완전 비교는 O(n³)이라 2가지 휴리스틱(타입 다르면 통째 교체, 같은 레벨은 key로 동일성 판단)으로 O(n) 근사 → ③ 계산된 최소 변경분만 실제 DOM에 커밋.

**Q2. "key는 왜 필요하고 index를 쓰면 왜 위험한가요?"**
> ① key는 리스트에서 같은 항목을 식별해 재생성 없이 이동/유지하게 함 → ② index를 쓰면 삽입/삭제/정렬 시 "내용이 바뀌었다"고 오판 → ③ 불필요한 재렌더와 내부 state가 엉뚱한 행에 남는 버그. 안정적 고유 ID를 써야 함.

**Q3. "diffing 휴리스틱을 설명해주세요."**
> ① 엘리먼트 타입이 다르면 서브트리를 비교하지 않고 통째로 교체(그래서 타입이 바뀌면 state 초기화) → ② 같은 레벨의 리스트는 key로 동일성을 판단해 순서 변경을 이동으로 처리 → ③ 이 두 가정으로 O(n³)을 O(n)에 근사.

**Q4. "Fiber는 뭘 바꿨나요?"**
> ① 기존 재조정은 동기·중단 불가라 큰 트리에서 메인 스레드를 오래 점유 → ② Fiber는 작업을 단위로 쪼개 중단·재개·우선순위 지정 가능 → ③ 렌더/커밋 단계 분리로 Concurrent 기능(useTransition 등)의 기반이 됨.

---

# R6. useEffect 의존성과 클로저 함정

**학습 목표**: *"의존성 배열은 무슨 역할인가요?"* / *"stale closure가 뭔가요?"* / *"cleanup은 언제 실행되나요?"* / *"함수/객체를 의존성에 넣으면 왜 무한 루프가 나나요?"* 에 예시를 들며 5분 답할 수 있다.
> R3에서 Hooks를 개괄했다면, 여기서는 **useEffect의 실행 타이밍과 클로저로 인한 실전 버그**를 집중적으로 다룬다.

## 1. 비유 — 촬영 시점에 박제된 스냅샷

각 렌더는 그 순간의 props/state를 담은 **한 장의 사진**이다. useEffect 안의 함수는 "찍힐 당시의 사진(그 렌더의 값)"을 그대로 붙들고 있다. 의존성 배열은 "**어떤 값이 바뀌면 사진을 다시 찍어(effect 재실행) 최신 값을 붙들지**"를 지정하는 것. 이걸 빠뜨리면 effect가 옛날 사진(과거 값)을 계속 들고 있게 된다 → **stale closure**.

## 2. 개념 정의 — 의존성 배열의 역할

> `useEffect(fn, deps)` — 렌더 후 `deps`의 값이 **이전 렌더와 하나라도 달라졌을 때만** `fn`을 재실행.
> - `deps` 생략 → 매 렌더마다 실행
> - `[]` → 마운트 시 1회만
> - `[a, b]` → a나 b가 바뀐 렌더 후에만
> 비교는 **Object.is(얕은 참조 비교)** — 객체/함수/배열은 내용이 같아도 매 렌더 새 참조면 "바뀐 것"으로 간주.

## 3. stale closure — 대표 버그

```jsx
// ❌ deps=[] 라 effect는 첫 렌더의 count(0)를 영원히 붙듦
function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      console.log(count);        // 항상 0 (stale!)
      setCount(count + 1);       // 0+1만 반복 → 1에서 멈춤
    }, 1000);
    return () => clearInterval(id);
  }, []);                         // count를 안 넣어 옛 값에 고정
}
```
```jsx
// ✅ 해법 1: 함수형 업데이트 — 최신 값을 인자로 받음(클로저 의존 제거)
setCount(c => c + 1);
// ✅ 해법 2: 의존성에 count를 넣어 매번 최신 값으로 effect 재생성
useEffect(() => { ... }, [count]);
// (단 이러면 interval이 매번 재설정됨 → 상황에 따라 useRef로 최신값 보관도 고려)
```

## 4. cleanup 함수 — 언제 실행되나

```
마운트 → effect 실행
                       ↓ (deps 바뀐 리렌더)
       이전 effect의 cleanup 실행 → 새 effect 실행
                       ↓
언마운트 → 마지막 cleanup 실행
```
- cleanup은 "**다음 effect 실행 직전**"과 "**언마운트 시**"에 돈다. 이벤트 리스너 해제, 타이머 정리, 구독 취소, 진행 중 요청 취소(race condition 방지)에 필수.
- cleanup을 빠뜨리면: 리스너/타이머 중복 등록, 언마운트된 컴포넌트에 setState → 메모리 누수·경고.

## 5. 참조 동일성 함정 — 무한 루프

```jsx
// ❌ options 객체가 매 렌더 새로 생성 → deps가 항상 "바뀜" → effect 무한 실행
function Search({ query }) {
  const options = { query, limit: 10 };   // 매 렌더 새 참조
  useEffect(() => { fetchData(options); }, [options]);  // 무한 루프
}
```
```jsx
// ✅ 원시값을 직접 의존성에 두거나(참조 아닌 값 비교)
useEffect(() => { fetchData({ query, limit: 10 }); }, [query]);
// ✅ 꼭 객체/함수여야 하면 useMemo/useCallback으로 참조 고정
const options = useMemo(() => ({ query, limit: 10 }), [query]);
```
- 함수를 의존성에 넣을 때도 동일 — 부모가 매 렌더 새 함수를 내려주면 자식 effect가 매번 재실행. `useCallback`으로 참조 고정.

## 6. 핵심 포인트 (자주 하는 실수)

- 🔴 "의존성 배열은 성능 최적화용이라 아무거나 넣어도 된다" ❌ — effect가 사용하는 **모든 외부 값(props/state/함수)** 을 정확히 넣어야 함. 빠뜨리면 stale closure, 불필요하게 넣으면 과도한 재실행. (`exhaustive-deps` ESLint 규칙)
- 🔴 "빈 배열 `[]`면 언제나 안전하다" ❌ — effect가 참조하는 값이 있는데 `[]`로 두면 **첫 렌더 값에 박제**됨(stale). 값을 안 바꾸려면 함수형 업데이트나 ref를 써야.
- 🟡 객체/배열/함수는 **Object.is 참조 비교** — 내용이 같아도 새 참조면 재실행. useMemo/useCallback 또는 원시값 의존으로 해결.
- 🟡 cleanup은 다음 실행 직전 + 언마운트 시 실행 — 비동기 요청은 cleanup에서 취소 플래그/AbortController로 race condition을 막아야.

## 7. 예상 면접 질문 + 답변 골격

**Q1. "useEffect 의존성 배열의 역할은?"**
> ① 렌더 후 deps 값이 이전과 달라졌을 때만 effect를 재실행 → ② `[]`는 마운트 1회, 생략은 매 렌더 → ③ effect가 쓰는 모든 외부 값을 넣어야 최신 값을 반영(안 넣으면 stale closure).

**Q2. "stale closure가 뭔가요?"**
> ① 각 렌더는 그 시점의 값을 담은 클로저를 만듦 → ② effect가 옛 렌더의 값을 붙든 채 갱신되지 않으면(의존성 누락) 과거 값을 계속 사용 → ③ 해법은 함수형 업데이트(`setX(prev=>...)`)나 의존성에 최신 값 추가, 또는 useRef로 최신값 보관.

**Q3. "cleanup 함수는 언제 실행되나요?"**
> ① 다음 effect 실행 직전(deps가 바뀌어 재실행될 때) → ② 컴포넌트 언마운트 시 → ③ 리스너 해제·타이머 정리·구독 취소·진행 중 요청 취소에 사용. 빠뜨리면 중복 등록·메모리 누수.

**Q4. "객체/함수를 의존성에 넣으면 왜 무한 루프가 날 수 있나요?"**
> ① deps는 Object.is 참조 비교 → ② 매 렌더 새로 만든 객체/함수는 내용이 같아도 "바뀐 것"으로 판정 → ③ effect가 매번 재실행(setState 포함 시 무한 루프). useMemo/useCallback으로 참조 고정하거나 원시값을 의존성에 둬 해결.

---

# 핵심 질문 (Quiz)

> 답변을 먼저 떠올린 뒤 펼쳐서 확인하세요.

<details>
<summary>Q1. Virtual DOM이 뭐고 왜 쓰나요?</summary>

- 실제 DOM 조작은 reflow/repaint 비용이 큼
- React는 state 변경 시 메모리상의 JS 객체 트리(VDOM)를 새로 만들고 이전 것과 diff
- 실제로 달라진 부분만 실제 DOM에 반영(reconciliation)
- 목적은 "무조건 빠름"이 아니라 **불필요한 DOM 조작 최소화**

</details>

<details>
<summary>Q2. 리스트 렌더링에서 인덱스를 key로 쓰면 왜 안 되나요?</summary>

- 리스트 순서가 바뀌면 같은 index가 다른 데이터를 가리키게 됨
- React는 key만 보고 "같은 컴포넌트"라 판단해 재사용
- input 값, 체크박스 상태 등 컴포넌트 내부 state가 엉뚱한 항목에 남는 버그 발생
- 그래서 데이터의 고유 id를 key로 써야 함

</details>

<details>
<summary>Q3. 컴포넌트는 언제 리렌더되나요?</summary>

- ① 자신의 state 변경
- ② props 변경
- ③ 부모 리렌더(자식 props가 불변이어도 기본적으로 같이 리렌더)
- 세 번째가 실무에서 "왜 이렇게 자주 리렌더되지?"의 주 원인

</details>

<details>
<summary>Q4. 불필요한 리렌더를 어떻게 막나요?</summary>

- ① `React.memo`로 컴포넌트를 감싸 props 얕은 비교 후 스킵
- ② 무거운 계산은 `useMemo`로 캐싱
- ③ memo 자식에 넘기는 함수는 `useCallback`으로 참조 고정
- 단, 남용하면 비교 비용이 더 커질 수 있어 프로파일링 후 적용

</details>

<details>
<summary>Q5. Hooks 규칙이 뭐고 왜 지켜야 하나요?</summary>

- ① 최상위(top-level)에서만 호출 — 조건문/반복문/중첩 함수 안에서 호출 금지
- ② React 함수 컴포넌트 또는 커스텀 Hook에서만 호출
- React는 Hook을 **호출 순서(index)** 로 각 state 슬롯을 식별하므로, 조건부 호출로 순서가 달라지면 엉뚱한 state가 매핑되는 버그 발생

</details>

<details>
<summary>Q6. useEffect 의존성 배열을 잘못 쓰면 어떤 문제가 생기나요?</summary>

- 누락 시 — effect 안 값이 옛 값(stale closure)에 갇혀 최신 상태 반영 안 됨
- 매번 새로 생성되는 참조형(객체/배열/함수)을 의존성에 넣으면 — 매 렌더 재실행되거나 무한 루프
- 해결: `useMemo`/`useCallback`으로 참조 고정하거나 원시값으로 좁혀서 해결

</details>

<details>
<summary>Q7. Context API와 Redux의 차이는?</summary>

| | Context | Redux |
|--|---------|-------|
| 성격 | React 내장, prop drilling 해결 도구 | 외부 상태관리 라이브러리 |
| 업데이트 방식 | value 변경 → 구독 컴포넌트 전부 리렌더 | action → reducer → selector로 필요한 부분만 리렌더 |
| 규모 | 소~중규모, 자주 안 바뀌는 값(테마, 인증 유저) | 대규모, 복잡한 상태 흐름·비동기 로직 |

</details>

<details>
<summary>Q8. Context를 쓰면 왜 성능 문제가 생길 수 있나요?</summary>

- Context는 selector 없이 값 하나 단위로 구독되기 때문에, `value`가 바뀌면 그 값의 일부만 쓰는 컴포넌트까지 전부 리렌더됨
- Provider의 `value`를 `useMemo` 없이 매 렌더 새로 만들면 실제 값이 안 바뀌었어도 리렌더 발생
- 대응책: 변경 빈도가 다른 값은 별도 Context로 분리 + `value`는 `useMemo`로 참조 고정

</details>
