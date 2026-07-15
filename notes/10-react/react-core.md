# React 핵심 — 면접 답변 정리본

> 백엔드 3년차 + 프론트 경험 있는 개발자를 위한 React 면접 종합 정리 (백엔드 인터뷰용, 깊은 프론트 심화는 제외).
> 진행 형식: 비유 → 개념 정의 → 다이어그램 → 패턴 정리표 → 핵심 포인트 → 예상 면접 질문.

## 목차
- [R1. Virtual DOM and Reconciliation](#r1-virtual-dom-and-reconciliation) — Virtual DOM, diffing, key
- [R2. Rendering and Re-render](#r2-rendering-and-re-render) — 리렌더 트리거, memo/useMemo/useCallback
- [R3. Hooks](#r3-hooks) — useState/useEffect, Hooks 규칙, 의존성 배열
- [R4. State Management](#r4-state-management) — 로컬 vs 전역, Context vs Redux/Zustand

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

## 6. 패턴 정리표
| 도구 | 메모이제이션 대상 | 언제 쓰나 |
|------|------------------|-----------|
| `React.memo` | 컴포넌트 렌더 결과 | 자식이 무거운데 props가 자주 안 바뀔 때 |
| `useMemo` | 계산된 값 | 비용 큰 연산(정렬/필터) 반복 방지, 참조 동일성 유지(다음 useMemo/memo 입력용) |
| `useCallback` | 함수 참조 | memo화된 자식에 콜백 전달, useEffect 의존성 안정화 |

## 7. 핵심 포인트 (자주 하는 실수)
- 🔴 "props가 안 바뀌면 자식은 리렌더 안 된다" — ❌ 부모가 리렌더되면 기본적으로 자식도 리렌더된다. `React.memo`를 붙여야 props 동일 시 스킵됨.
- 🔴 state를 직접 mutate(`arr.push`, `obj.x = 1`) — 참조가 그대로라 리렌더 누락/오작동.
- 🟡 `useMemo`/`useCallback`을 아무 데나 남발 — 메모이제이션 자체도 비교/캐시 비용이 있어, 가벼운 연산엔 오히려 손해(과최적화 주의).
- 🟡 "리렌더 = 느리다"는 오해 — 리렌더 자체(VDOM 재계산)와 **실제 DOM 갱신**은 다름. 리렌더가 잦아도 diff 결과가 같으면 실제 DOM은 안 바뀜.

## 8. 예상 면접 질문 + 답변 골격
**Q1. "컴포넌트는 언제 리렌더되나요?"**
> ① 자신의 state 변경 ② props 변경 ③ 부모 리렌더(자식 props 불변이어도). 세 번째가 실무에서 "왜 이렇게 자주 리렌더되지?"의 주 원인.

**Q2. "불필요한 리렌더를 어떻게 막나요?"**
> ① `React.memo`로 컴포넌트를 감싸 props 얕은 비교 후 스킵 ② 무거운 계산은 `useMemo`로 캐싱 ③ memo 자식에 넘기는 함수는 `useCallback`으로 참조 고정. 단, 남용하면 비교 비용이 더 커질 수 있어 프로파일링 후 적용.

**Q3. "상태 불변성을 지켜야 하는 이유는?"**
> React는 state 변경 감지를 참조 비교로 함. 원본을 직접 mutate하면 참조가 같아 변경을 못 감지하거나 `memo`의 얕은 비교가 깨짐. 그래서 항상 새 객체/배열을 만들어 교체.

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

## 4. Hooks 규칙 (Rules of Hooks)
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

## 5. 자주 하는 실수
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

## 6. 패턴 정리표
| Hook | 역할 | 대응하는 클래스형 개념 |
|------|------|----------------------|
| `useState` | 렌더 간 유지되는 로컬 값 | `this.state` |
| `useEffect([])` | mount 시 1회 (부수효과: fetch, 구독 등) | `componentDidMount` |
| `useEffect([deps])` | deps 변경 시 재실행 + cleanup | `componentDidUpdate` 일부 |
| `useEffect` cleanup | unmount/재실행 전 정리 | `componentWillUnmount` |

## 7. 핵심 포인트 (자주 하는 실수, 요약)
- 🔴 조건문/반복문 안에서 Hook 호출 — Hook 순서가 렌더마다 달라져 state 매핑 붕괴.
- 🔴 useEffect 의존성 배열에 실제 사용하는 값 누락 — stale closure(옛 값을 계속 참조).
- 🔴 객체/배열/함수를 의존성으로 넣으면서 매 렌더 새로 생성 — 무한 재실행 루프.
- 🟡 setState는 비동기 배치 처리 — 직후 값 읽으면 옛 값. 이전 값 기반이면 함수형 업데이트 사용.
- 🟡 cleanup 함수를 안 써서 이벤트 리스너/타이머가 계속 쌓이는 메모리 누수 주의.

## 8. 예상 면접 질문 + 답변 골격
**Q1. "useState와 useEffect를 설명해주세요."**
> ① `useState`는 리렌더 사이에도 유지되는 컴포넌트 로컬 상태 ② `useEffect`는 렌더 이후 실행되는 부수효과(fetch, 구독, DOM 조작 등)를 의존성 배열 기준으로 제어, cleanup으로 이전 효과 정리.

**Q2. "Hooks 규칙이 뭐고 왜 지켜야 하나요?"**
> ① 최상위에서만, React 컴포넌트/커스텀 Hook에서만 호출 ② React는 Hook을 호출 순서로 각 state 슬롯을 식별하므로, 조건부 호출로 순서가 달라지면 엉뚱한 state가 매핑되는 버그 발생.

**Q3. "useEffect 의존성 배열을 잘못 쓰면 어떤 문제가 생기나요?"**
> ① 누락 시 — effect 안 값이 옛 값(stale closure)에 갇혀 최신 상태 반영 안 됨 ② 매번 새로 생성되는 참조형을 의존성에 넣으면 — 매 렌더 재실행되거나 무한 루프. `useMemo`/`useCallback`으로 참조 고정하거나 원시값으로 좁혀서 해결.

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

## 5. 언제 전역 상태가 필요한가
- 서로 **멀리 떨어진(형제 트리 이상) 여러 컴포넌트**가 같은 데이터를 읽고/써야 할 때.
- prop drilling이 **3~4단계 이상** 되어 중간 컴포넌트가 관심 없는 데이터를 계속 전달할 때.
- 반대로, 부모-자식 1~2단계면 그냥 props로 충분 — 무조건 전역화하면 오히려 데이터 흐름 추적이 어려워짐(과설계 주의).

## 6. 핵심 포인트 (자주 하는 실수)
- 🔴 모든 state를 습관적으로 전역(Redux/Context)에 넣음 — 로컬로 충분한 UI 상태(모달 open 등)까지 전역화하면 관리 복잡도만 증가.
- 🔴 Context 하나에 자주 바뀌는 값(예: 매 초 변하는 카운터)까지 다 넣음 — value 변경 시 **모든 구독 컴포넌트가 리렌더**되어 성능 문제. 자주 바뀌는 값과 안 바뀌는 값은 Context를 분리.
- 🟡 Context는 "상태관리 라이브러리"가 아니라 "값 전달 도구"에 가까움 — Redux처럼 세밀한 selector 최적화가 기본 제공되지 않음.
- 🟡 서버에서 온 데이터(API 응답 캐싱)는 client state 라이브러리보다 **React Query/SWR** 같은 서버 상태 전용 도구가 더 적합(백엔드 개발자에게 익숙한 캐시 무효화 개념과 유사).

## 7. 예상 면접 질문 + 답변 골격
**Q1. "Prop drilling이 뭐고 왜 문제인가요?"**
> ① 상위 state를 여러 단계 아래 자식에 전달하려고 중간 컴포넌트들이 실제로 쓰지도 않는 props를 계속 릴레이하는 것 ② 중간 컴포넌트 시그니처가 데이터 구조에 종속되어 리팩터링 어려움, 가독성 저하가 문제.

**Q2. "Context API와 Redux의 차이는?"**
> ① Context는 React 내장 기능으로 prop drilling을 없애는 값 전달 도구, value 변경 시 구독자 전체가 리렌더 ② Redux는 action/reducer 기반 외부 상태관리로 selector를 통해 필요한 부분만 선택적으로 리렌더, 복잡한 상태 흐름과 미들웨어/DevTools 지원. 규모와 복잡도에 따라 선택.

**Q3. "언제 전역 상태관리가 필요한가요?"**
> ① 형제 트리 이상 멀리 떨어진 여러 컴포넌트가 같은 데이터를 공유해야 할 때 ② prop drilling이 여러 단계로 깊어질 때. 반대로 로컬로 해결 가능한 UI 상태까지 전역화하면 과설계이므로, 항상 "이 상태를 누가 읽는가"부터 판단.

---
