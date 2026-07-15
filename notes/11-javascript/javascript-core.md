# JavaScript 핵심 — 면접 답변 정리본

> 백엔드(Java/Spring) 3년차 + 프론트 경험자용 JS 면접 종합 정리.
> 진행 형식: 비유 → 다이어그램 → 코드 → 패턴 정리표 → 예상 면접 질문.

## 목차
- [J1. Event Loop and Async](#j1-event-loop-and-async) — 콜 스택, 태스크/마이크로태스크 큐, 이벤트 루프
- [J2. Closures and Scope](#j2-closures-and-scope) — 클로저, 렉시컬 스코프, 호이스팅, TDZ
- [J3. Prototype and this](#j3-prototype-and-this) — 프로토타입 체인, this 바인딩 4가지, 화살표 함수
- [J4. Types and Coercion](#j4-types-and-coercion) — 원시/참조 타입, ==/===, truthy/falsy, null/undefined/NaN
- [J5. Modern JS (ES6+)](#j5-modern-js-es6) — let/const, 구조분해, 스프레드/rest, async/await, 모듈

---

# J1. Event Loop and Async

**학습 목표**: *"JS는 싱글 스레드인데 어떻게 비동기 처리를 하나요?"* / *"setTimeout(0)과 Promise.then 중 뭐가 먼저 실행되나요?"* 에 다이어그램 그리며 5분 답할 수 있다.

## 1. 비유 — 카페 직원 한 명 + 주문 알림판

카페에 직원(콜 스택)이 **한 명**뿐. 손님이 오면 주문을 받아 즉시 처리하지만, "커피 로스팅 30분 걸림" 같은 오래 걸리는 일은 **외부 로스터기(Web API/브라우저·Node 백그라운드)**에 맡기고 다음 손님을 받는다. 로스팅이 끝나면 완료된 원두가 **대기열(큐)**에 쌓이고, 직원은 지금 하던 일이 다 끝난 뒤(콜 스택이 비면) 대기열에서 하나씩 꺼내 처리한다. VIP 알림(Promise, 마이크로태스크)은 일반 대기표(setTimeout, 매크로태스크)보다 **항상 먼저** 처리된다.

## 2. 개념 정의 (1줄)
> JS 엔진은 **콜 스택 하나**로 동작하는 싱글 스레드지만, 브라우저/Node가 제공하는 **Web API(타이머, I/O, 네트워크)**에 비동기 작업을 위임하고, 완료된 콜백을 **큐**에 쌓았다가 **이벤트 루프**가 콜 스택이 빌 때마다 순서대로 꺼내 실행하는 방식으로 "동시성처럼 보이는" 처리를 한다.

## 3. 다이어그램 — 전체 구조
```
        Call Stack (싱글 스레드, 동기 코드 실행)
     ┌─────────────────────────┐
     │  현재 실행 중인 함수      │
     └───────────┬─────────────┘
                 │ 비동기 함수 호출 시 위임
                 ▼
     ┌─────────────────────────┐
     │  Web APIs / Node APIs    │  setTimeout, fetch, fs.readFile 등
     │  (브라우저/libuv가 처리)  │
     └───────────┬─────────────┘
                 │ 완료되면 콜백을 큐에 적재
     ┌───────────▼─────────────┐      ┌───────────────────────┐
     │ Microtask Queue          │      │ Task(Macrotask) Queue  │
     │ Promise.then/catch/finally│     │ setTimeout, setInterval│
     │ async/await, MutationObs │      │ setImmediate, I/O 콜백 │
     └───────────┬─────────────┘      └───────────┬───────────┘
                 │                                 │
                 └──────────► Event Loop ◄─────────┘
              "콜 스택이 비면, 마이크로태스크 큐를
               '전부' 비운 후에야 매크로태스크 1개를 꺼낸다"
```

## 4. 이벤트 루프 동작 순서 (한 tick)
```
1. Call Stack의 동기 코드를 끝까지 실행
2. Call Stack이 완전히 비면:
   → Microtask Queue를 "큐가 빌 때까지" 전부 실행
     (실행 중 새로 추가된 마이크로태스크도 이번 턴에 다 처리)
3. Macrotask(Task) Queue에서 딱 1개만 꺼내 실행
4. 다시 2번으로 (렌더링 등은 매크로태스크 사이사이에 발생)
```

## 5. 코드 — setTimeout(0) vs Promise.then 순서
```javascript
console.log('1');                          // 동기

setTimeout(() => console.log('2'), 0);     // 매크로태스크 큐로

Promise.resolve().then(() => console.log('3')); // 마이크로태스크 큐로

console.log('4');                          // 동기

// 실행 순서: 1 → 4 → 3 → 2
```
> 이유: 동기 코드(1, 4)가 먼저 콜 스택을 다 비우고, 콜 스택이 비는 순간 **마이크로태스크(3)를 매크로태스크(2)보다 항상 먼저** 처리하기 때문. `setTimeout(fn, 0)`이라도 "즉시 실행"이 아니라 **큐에 줄서기**일 뿐이다.

## 6. Cross-link — OS/Node와의 연결
- **OS 논블로킹 I/O와 같은 발상**: OS의 epoll/kqueue가 "I/O 완료를 기다리며 스레드를 블로킹하지 말고, 완료되면 알림 받아 처리"하는 것과 동일한 아이디어를 JS는 언어 차원(이벤트 루프)에서 구현한 것. 즉 **커널 레벨 논블로킹 I/O 모델 → JS 이벤트 루프 모델**로 이어지는 같은 철학.
- **Node.js 동시성**: Node는 이 이벤트 루프를 **libuv**로 구현. 네트워크/타이머는 OS의 논블로킹 I/O(epoll 등)로 처리하고, 파일시스템처럼 논블로킹이 안 되는 일부 작업은 **내부 스레드 풀**(기본 4개)에 위임한 뒤 완료 콜백만 큐로 돌려받는다. 즉 "JS 실행 자체는 싱글 스레드"지만 "I/O는 커널/스레드풀이 병렬 처리" → 싱글 스레드로도 수만 커넥션을 처리하는 이유.

## 7. 핵심 포인트 (자주 하는 실수)
- 🔴 "`setTimeout(fn, 0)`은 즉시 실행된다" — ❌ 최소 지연 후 **매크로태스크 큐에 줄서기**. 콜 스택 + 마이크로태스크가 다 끝나야 실행.
- 🔴 "Promise.then은 동기 코드보다 먼저 실행된다" — ❌ **동기 코드가 항상 우선**. 마이크로태스크는 "동기 코드 이후, 다음 매크로태스크 이전"에 실행.
- 🔴 무한히 `.then()`을 재귀 호출하면 마이크로태스크 큐가 끝없이 채워져 **매크로태스크(렌더링 포함)가 영원히 밀림** — starvation.
- 🟡 `async/await`는 Promise의 문법 설탕. `await` 뒤 코드는 사실상 `.then()` 콜백 → **마이크로태스크**로 스케줄됨.
- 🟡 Node의 매크로태스크는 phase가 더 세분화(timers → pending callbacks → poll → check(`setImmediate`) → close callbacks).

## 8. 정리표 — 큐 비교
| | Microtask Queue | Task(Macrotask) Queue |
|--|------------------|------------------------|
| 대표 | Promise.then/catch/finally, async/await, queueMicrotask | setTimeout, setInterval, setImmediate(Node), I/O, UI 이벤트 |
| 우선순위 | 높음 (항상 먼저) | 낮음 (마이크로태스크 다 비운 후 1개) |
| 처리 방식 | 큐가 빌 때까지 전부 | 한 tick당 1개만 |
| 렌더링(브라우저) | 마이크로태스크 사이엔 안 일어남 | 매크로태스크 사이에 발생 가능 |

## 9. 예상 면접 질문 + 답변 골격
**Q1. "JS는 싱글 스레드인데 어떻게 비동기 처리를 하나요?"**
> ① JS 엔진 자체는 콜 스택 하나뿐인 싱글 스레드 → ② 타이머·네트워크·파일 I/O 같은 오래 걸리는 작업은 브라우저/Node의 Web API(또는 libuv)에 위임 → ③ 완료되면 콜백이 큐에 쌓이고 → ④ 콜 스택이 빌 때마다 이벤트 루프가 큐에서 꺼내 실행. "JS 실행은 싱글, I/O는 별도"가 핵심.

**Q2. "setTimeout(0)과 Promise.then 중 뭐가 먼저 실행되나요?"**
> Promise.then이 먼저. `setTimeout`은 매크로태스크, `Promise.then`은 마이크로태스크인데, 이벤트 루프는 콜 스택이 빈 뒤 **마이크로태스크 큐를 전부 비우고 나서야** 매크로태스크를 하나 꺼내기 때문.

**Q3. "이벤트 루프 동작 순서를 설명해주세요."**
> 동기 코드 실행 → 콜 스택 비면 마이크로태스크 큐 전부 처리 → 매크로태스크 큐에서 1개 처리 → 다시 마이크로태스크 큐 확인, 반복. 브라우저는 매크로태스크 사이사이 리렌더링.

**Q4. "Node.js는 어떻게 싱글 스레드로 높은 동시성을 내나요?"**
> JS 실행 자체(콜 스택)는 싱글 스레드지만, libuv가 네트워크 I/O는 OS의 논블로킹 I/O(epoll/kqueue)로, 파일시스템 등 일부는 내부 스레드 풀로 넘겨 병렬 처리하고 결과만 콜백 큐로 돌려받는다. OS 논블로킹 I/O 모델과 같은 발상을 언어 차원에서 구현한 것.

---

# J2. Closures and Scope

**학습 목표**: *"클로저가 뭐고 왜 쓰나요?"* / *"var와 let/const 스코프 차이는?"* / *"TDZ가 뭐죠?"* 에 코드로 5분 답할 수 있다.

## 1. 비유 — 배낭을 메고 다니는 함수

함수가 만들어질 때, 자기가 태어난 곳(외부 함수)의 변수들을 **배낭에 넣어 짊어지고** 어디로 이동하든 계속 들고 다닌다. 외부 함수가 이미 실행을 끝내고 사라졌어도, 배낭 속 변수는 **그 함수가 계속 참조하는 한 살아남는다**. 이게 클로저 — "환경을 기억하는 함수".

## 2. 개념 정의
> **클로저(Closure)** = 함수와 그 함수가 선언될 당시의 **렉시컬 스코프(주변 환경)** 의 조합. 외부 함수 실행이 끝나도 내부 함수가 외부 변수를 참조하고 있으면, 그 변수는 GC 대상이 되지 않고 계속 살아있다.
> **렉시컬 스코프** = 함수의 스코프가 **호출 위치가 아니라 코드가 작성된 위치(정적)** 로 결정되는 방식.

## 3. 다이어그램 — 클로저 구조
```
function outer() {
    let count = 0;              // outer의 렉시컬 환경
    return function inner() {   // inner가 이 환경을 "배낭"에 담아 캡처
        count++;
        return count;
    };
}

const counter = outer();   // outer() 실행 종료 → 스택 프레임은 pop
                            // 하지만 count는 inner가 참조 중이라 GC 안 됨
counter();  // 1
counter();  // 2  ← count가 계속 유지됨 (private 상태)
```
```
Call Stack (outer 실행 종료 후)          Heap (클로저 환경, 계속 참조됨)
┌───────────────┐                      ┌─────────────────┐
│ counter() 호출 │──── inner 함수 ─────►│ [[Environment]]  │
└───────────────┘                      │  count: 2        │
                                        └─────────────────┘
```

## 4. 활용 예 — 모듈 패턴 / private 변수
```javascript
function createBankAccount(balance) {
    // balance는 외부에서 직접 접근 불가 (private)
    return {
        deposit(amount) { balance += amount; return balance; },
        getBalance() { return balance; }
    };
}
const acc = createBankAccount(1000);
acc.deposit(500);      // 1500
// acc.balance → undefined, 직접 접근 불가
```

## 5. 호이스팅과 TDZ
```javascript
console.log(a);   // undefined (호이스팅됨, 선언은 끌어올려짐)
var a = 1;

console.log(b);    // ReferenceError: Cannot access 'b' before initialization (TDZ)
let b = 2;
```
- **호이스팅**: `var`/`function`/`let`/`const` 선언은 모두 스코프 최상단으로 끌어올려짐(엔진이 컴파일 단계에서 미리 등록).
- **차이**: `var`는 끌어올려지며 `undefined`로 **초기화까지 됨**. `let`/`const`는 선언은 끌어올려지지만 **초기화되지 않은 채** 스코프 진입 시점부터 실제 `let/const` 문을 만나기 전까지 **TDZ(Temporal Dead Zone)** 에 놓여 접근 시 에러.
- **TDZ**를 두는 이유: `let`/`const`를 선언 전에 쓰는 실수를 런타임 에러로 잡아내기 위함 (`var`의 "일단 undefined로 조용히 넘어가는" 문제를 개선).

## 6. var vs let/const 스코프 차이
```javascript
for (var i = 0; i < 3; i++) {
    setTimeout(() => console.log(i), 0);   // 3, 3, 3
}
for (let j = 0; j < 3; j++) {
    setTimeout(() => console.log(j), 0);   // 0, 1, 2
}
```
- `var`는 **함수 스코프**(function-scoped) → 루프 전체가 같은 `i`를 공유, 클로저가 캡처한 건 최종값 3.
- `let`은 **블록 스코프**(block-scoped) → 매 반복마다 **새로운 바인딩**이 생성되어 각 클로저가 자신만의 `j`를 캡처.

## 7. 핵심 포인트 (자주 하는 실수)
- 🔴 "클로저는 특별한 문법이다" — ❌ 특별한 게 아니라 **JS 함수의 기본 동작**. 내부 함수가 외부 변수를 참조하면 항상 클로저가 형성됨.
- 🔴 "TDZ는 `let`/`const`가 호이스팅 안 된다는 뜻" — ❌ **선언 자체는 호이스팅됨**, 다만 초기화 전까지 접근 불가한 구간(TDZ)이 있을 뿐.
- 🔴 반복문 안에서 클로저로 콜백을 여러 개 만들 때 `var` 쓰면 **전부 같은 최종값**을 캡처하는 버그 — `let`으로 바꾸거나 IIFE로 스코프 분리.
- 🟡 클로저가 큰 객체를 계속 참조하면 **메모리 누수** 위험(GC가 못 치움) — 이벤트 리스너 해제 시 특히 주의.
- 🟡 `function` 선언은 호이스팅 시 **정의까지 통째로 끌어올려짐**(호출 코드보다 아래에 있어도 호출 가능), 반면 `const fn = () => {}` 형태는 변수 호이스팅 규칙(TDZ)을 따름.

## 8. 정리표 — 스코프/선언 비교
| | `var` | `let` | `const` |
|--|-------|-------|---------|
| 스코프 | 함수 스코프 | 블록 스코프 | 블록 스코프 |
| 재선언 | 가능 | 불가 | 불가 |
| 재할당 | 가능 | 가능 | 불가(참조 재할당만; 객체 내부 수정은 가능) |
| 호이스팅 시 초기값 | `undefined` | TDZ (접근 불가) | TDZ (접근 불가) |
| 전역 선언 시 | `window` 프로퍼티가 됨 | 안 됨 | 안 됨 |

## 9. 예상 면접 질문 + 답변 골격
**Q1. "클로저가 뭐고 왜 쓰나요?"**
> 함수 + 선언 당시의 렉시컬 환경의 조합. 외부 함수가 끝나도 내부 함수가 참조하는 변수는 살아남아, private 상태 유지(카운터, 모듈 패턴)나 콜백에 데이터를 캡처해 넘길 때 활용.

**Q2. "var와 let/const 스코프 차이는?"**
> var는 함수 스코프라 블록({}) 무시하고 함수 전체에서 유효, 재선언 가능. let/const는 블록 스코프라 {} 단위로 유효범위가 갇힘. 반복문에서 클로저 캡처 시 이 차이로 버그가 갈린다(var는 전체가 최종값 공유, let은 매 반복 새 바인딩).

**Q3. "TDZ가 뭐죠?"**
> Temporal Dead Zone. let/const는 선언이 스코프 최상단으로 호이스팅되지만 초기화되지 않은 상태로 남아, 실제 선언문 전까지 접근하면 ReferenceError. var처럼 조용히 undefined를 주는 대신 실수를 런타임에 바로 드러내기 위한 장치.

**Q4. "호이스팅이 뭔가요?"**
> 변수/함수 선언을 코드 실행 전에 스코프 최상단으로 끌어올리는 JS 엔진의 동작. var/function은 초기화까지 되어 undefined로 접근 가능하고, let/const는 선언만 끌어올려져 TDZ에 놓인다.

---

# J3. Prototype and this

**학습 목표**: *"프로토타입 체인이 뭔가요?"* / *"this는 어떻게 결정되나요?"* / *"화살표 함수의 this는 왜 다른가요?"* 에 코드로 5분 답할 수 있다.

## 1. 비유 — 족보(가계도)를 따라 올라가며 물어보기

객체에게 프로퍼티나 메서드를 물어봤을 때, 자기 자신에게 없으면 **"우리 부모님은 아실까?"** 하고 부모(프로토타입)에게 묻고, 부모도 모르면 **조부모**에게 묻는 식으로 족보를 타고 올라간다. 최상위 조상(`Object.prototype`)까지 가도 없으면 `undefined`. 이게 **프로토타입 체인을 통한 상속**.

## 2. 프로토타입 체인
```javascript
function Animal(name) { this.name = name; }
Animal.prototype.speak = function () { return `${this.name} makes a sound`; };

const dog = new Animal('Rex');
dog.speak();   // "Rex makes a sound" — dog엔 speak 없음 → 프로토타입에서 발견
```
```
dog ──[[Prototype]]──► Animal.prototype ──[[Prototype]]──► Object.prototype ──► null
{name:'Rex'}              {speak: fn}                         {toString, ...}
```
- `new Animal()`은 내부적으로: ① 빈 객체 생성 → ② 그 객체의 `[[Prototype]]`을 `Animal.prototype`으로 연결 → ③ `this`를 그 객체로 바인딩해 생성자 실행 → ④ 객체 반환.
- ES6 `class`는 이 **프로토타입 기반 상속의 문법 설탕**일 뿐, 내부 동작은 동일.

## 3. this 바인딩 4가지 규칙 (우선순위 순)
```javascript
// ① 기본 바인딩 — 그냥 호출
function show() { console.log(this); }
show();   // strict mode: undefined / non-strict: 전역 객체(window/global)

// ② 암시적 바인딩 — 객체.메서드() 형태
const obj = { name: 'A', show() { console.log(this.name); } };
obj.show();   // 'A' — obj가 this

// ③ 명시적 바인딩 — call / apply / bind
function greet() { console.log(this.name); }
greet.call({ name: 'B' });    // 'B' (인자를 콤마로)
greet.apply({ name: 'C' });   // 'C' (인자를 배열로)
const bound = greet.bind({ name: 'D' });
bound();                      // 'D' — 영구 고정, 이후 call/apply로도 못 바꿈

// ④ new 바인딩 — 생성자 호출
function Person(name) { this.name = name; }
const p = new Person('E');    // this = 새로 생성된 객체
```
> **우선순위**: `new` > 명시적(`bind` > `call`/`apply`) > 암시적 > 기본.

## 4. 화살표 함수의 this — "자기 것이 없다"
```javascript
const obj = {
    name: 'A',
    regular: function () { console.log(this.name); },       // 호출 방식에 따라 결정
    arrow: () => { console.log(this.name); },                 // 정의된 위치의 상위 스코프 this
};
obj.regular();   // 'A' (obj가 호출)
obj.arrow();     // undefined (arrow는 obj 생성 시점의 상위 스코프 this를 그대로 씀, 전역이면 undefined)
```
- 화살표 함수는 **자기 자신의 `this`를 만들지 않는다** — 정의될 때(렉시컬)의 바깥 스코프 `this`를 그대로 물려받음.
- `call`/`apply`/`bind`로도 화살표 함수의 `this`는 바꿀 수 없음.
- 그래서 **콜백 안에서 바깥 this를 유지하고 싶을 때** 화살표 함수가 유용:
```javascript
class Timer {
    constructor() { this.seconds = 0; }
    start() {
        setInterval(() => { this.seconds++; }, 1000);  // 화살표 → Timer 인스턴스의 this 유지
        // 만약 function() {...} 썼다면 this는 setInterval 호출부(전역/undefined)로 깨짐
    }
}
```

## 5. 핵심 포인트 (자주 하는 실수)
- 🔴 "this는 함수가 정의된 곳에서 결정된다" — ❌ **일반 함수의 this는 호출 방식(누가 호출했는가)** 에 따라 결정. 정의 위치로 결정되는 건 **화살표 함수**뿐.
- 🔴 메서드를 콜백으로 넘기면 `this`가 깨짐:
  ```javascript
  setTimeout(obj.show, 1000);  // obj 없이 호출됨 → this가 obj가 아님!
  setTimeout(() => obj.show(), 1000);  // 또는 .bind(obj) 로 해결
  ```
- 🔴 "class 문법이니 프로토타입과 무관하다" — ❌ `class`도 내부적으로 **프로토타입 체인**을 사용하는 문법 설탕.
- 🟡 `Object.create(proto)`로 프로토타입을 직접 지정해 객체를 만들 수도 있음(생성자 함수 없이).
- 🟡 화살표 함수를 **객체 리터럴의 메서드**로 쓰면 대개 버그(위 예시 `arrow()` 참고) — 메서드는 일반 함수로, 콜백만 화살표로.

## 6. 정리표 — this 결정 규칙
| 호출 방식 | this |
|-----------|------|
| `fn()` | 기본: strict=`undefined`, 아니면 전역 객체 |
| `obj.fn()` | `obj` |
| `fn.call(x)` / `fn.apply(x)` | `x` |
| `fn.bind(x)()` | `x` (영구 고정) |
| `new Fn()` | 새로 생성된 객체 |
| 화살표 함수 | 정의 시점의 **상위 스코프 this** (호출 방식 무관) |

## 7. 예상 면접 질문 + 답변 골격
**Q1. "프로토타입 체인이 뭔가요?"**
> 객체가 프로퍼티/메서드를 찾을 때 자신에게 없으면 `[[Prototype]]`으로 연결된 상위 객체를 계속 타고 올라가며 찾는 메커니즘. `Object.prototype`까지 가도 없으면 undefined. class 문법도 내부적으로 이 체인을 씀.

**Q2. "this 바인딩 규칙 4가지를 설명해주세요."**
> 우선순위 순으로 ① new(새 객체) ② 명시적(call/apply/bind) ③ 암시적(obj.method() → obj) ④ 기본(그냥 호출 → strict는 undefined, 아니면 전역). 화살표 함수는 이 규칙과 무관하게 정의 시점의 상위 스코프 this를 그대로 씀.

**Q3. "화살표 함수의 this는 왜 다른가요?"**
> 화살표 함수는 자체 this를 바인딩하지 않고 정의된 위치의 렉시컬 스코프 this를 그대로 캡처. 그래서 콜백 안에서 바깥(클래스 인스턴스 등)의 this를 유지하고 싶을 때 유용하고, call/apply/bind로도 못 바꾼다.

**Q4. "call, apply, bind 차이는?"**
> 셋 다 this를 명시적으로 지정. call은 인자를 콤마로 나열, apply는 배열로 전달, bind는 즉시 실행하지 않고 this가 고정된 새 함수를 반환(이후 재호출).

---

# J4. Types and Coercion

**학습 목표**: *"== 와 === 차이는?"* / *"null과 undefined는 뭐가 다른가요?"* / *"NaN은 왜 특이한가요?"* 에 5분 답할 수 있다.

## 1. 비유 — 원본 소포 vs 창고 주소가 적힌 쪽지

원시 타입(문자열, 숫자 등)은 **소포 안에 내용물이 직접 들어있는 것**과 같아서 복사하면 완전히 독립된 사본이 생긴다. 참조 타입(객체, 배열)은 **소포 대신 "창고 몇 번 칸에 있음"이라 적힌 쪽지**를 주고받는 것 — 쪽지를 복사해도 둘 다 같은 창고 칸(같은 객체)을 가리켜서, 한쪽에서 내용물을 바꾸면 다른 쪽도 영향을 받는다.

## 2. 원시 타입 vs 참조 타입
```javascript
// 원시 타입(Primitive) — 값 자체가 복사됨
let a = 10;
let b = a;
b = 20;
console.log(a);   // 10 (영향 없음)

// 참조 타입(Reference) — 참조(주소)가 복사됨
let obj1 = { count: 10 };
let obj2 = obj1;
obj2.count = 20;
console.log(obj1.count);   // 20 (같은 객체를 가리킴)
```
- **원시 타입 7종**: `string`, `number`, `boolean`, `undefined`, `null`, `symbol`, `bigint`. 불변(immutable), 값으로 비교/복사.
- **참조 타입**: `object`, `array`, `function` 등. 가변(mutable), 참조(주소)로 비교/복사.

## 3. == vs === (형변환)
```javascript
1 == '1'        // true  — 타입 다르면 강제 형변환 후 비교 (숫자로 맞춤)
1 === '1'       // false — 타입까지 비교, 다르면 바로 false
null == undefined   // true  — 이 둘끼리는 특별히 느슨하게 같다고 취급 (== 유일한 예외 케이스)
null === undefined   // false — 타입이 다름 (object vs undefined)
0 == false      // true
0 === false     // false
```
- `==` (loose equality): 타입이 다르면 **암묵적 형변환(coercion)** 후 비교 → 예측하기 어려운 결과 다수.
- `===` (strict equality): 타입까지 같아야 true. **실무 기본값은 항상 `===`**.

## 4. Truthy / Falsy
```javascript
// Falsy 값 — 딱 7개, 이것만 외우면 나머지는 전부 truthy
false, 0, -0, 0n, '', null, undefined, NaN

if ('0') console.log('실행됨');   // 문자열 '0'은 truthy! (빈 문자열만 falsy)
if ([])  console.log('실행됨');   // 빈 배열도 truthy! (객체는 항상 truthy)
if ({})  console.log('실행됨');   // 빈 객체도 truthy!
```
> 🔴 자주 틀리는 포인트: **빈 배열 `[]`과 빈 객체 `{}`는 truthy**. falsy는 위 7개뿐.

## 5. null vs undefined
| | `undefined` | `null` |
|--|-------------|--------|
| 의미 | "값이 할당된 적 없음" (엔진이 자동 부여) | "의도적으로 값이 없음"을 **개발자가 명시** |
| 발생 시점 | 선언만 하고 초기화 안 함, 존재하지 않는 프로퍼티 접근, 함수가 return 없이 끝남 | 개발자가 직접 대입 |
| `typeof` | `'undefined'` | `'object'` (자바스크립트 초기 버그, 언어 표준에 굳어짐) |
| `== ` 비교 | `null == undefined` → `true` | 위와 동일 |

```javascript
let x;                 // undefined (초기화 안 함)
let y = null;          // null (명시적으로 "없음"을 표현)
function f() {}
f();                   // undefined (return 없음)
```

## 6. NaN — "Not a Number"인데 typeof는 number
```javascript
typeof NaN            // 'number' — NaN도 숫자 타입에 속함(IEEE 754 특수값)
NaN === NaN            // false — NaN은 자기 자신과도 같지 않은 유일한 값
Number.isNaN(NaN)      // true — 정확한 NaN 판별
isNaN('hello')         // true — 전역 isNaN은 형변환 후 판단(부정확, 비권장)
Number.isNaN('hello')  // false — 형변환 없이 정확히 NaN인지만 확인(권장)
```
> `NaN` 여부 확인은 항상 **`Number.isNaN()`** 을 쓸 것 (전역 `isNaN`은 암묵적 형변환 때문에 오탐 발생).

## 7. 핵심 포인트 (자주 하는 실수)
- 🔴 `==` 를 기본으로 쓰다가 `0 == ''`, `0 == '0'`, `1 == true` 같은 예상 밖 true에 당함 — **`===`를 기본값으로**.
- 🔴 "빈 배열/객체는 falsy" — ❌ **truthy**. falsy는 정확히 7개(`false, 0, -0, 0n, '', null, undefined, NaN`)뿐.
- 🔴 객체를 얕은 복사(`{...obj}`, `Object.assign`)해도 **중첩된 내부 객체는 여전히 참조 공유** — 깊은 복사가 필요하면 `structuredClone()` 등 사용.
- 🟡 `typeof null === 'object'`는 JS 초기 구현 버그가 하위호환 때문에 표준으로 남은 것 — null 체크는 `=== null`로.
- 🟡 함수 매개변수/return 값이 명시적으로 없으면 `undefined`가 자동으로 채워짐.

## 8. 정리표
| 구분 | 원시(Primitive) | 참조(Reference) |
|------|------------------|-------------------|
| 예 | string, number, boolean, null, undefined, symbol, bigint | object, array, function |
| 저장 | 값 자체 | 참조(주소) |
| 복사 | 독립적 사본 | 같은 대상 공유 |
| 비교(`===`) | 값 비교 | 참조(주소) 비교 |
| 가변성 | 불변 | 가변 |

## 9. 예상 면접 질문 + 답변 골격
**Q1. "== 와 === 차이는?"**
> `==`는 타입이 다르면 암묵적 형변환 후 비교, `===`는 타입까지 같아야 true. 형변환 규칙이 직관적이지 않아 실무에서는 `===`를 기본으로 쓰고, `==`는 `null == undefined` 체크 같은 의도적인 경우만 제한적으로 사용.

**Q2. "null과 undefined의 차이는?"**
> undefined는 값이 아직 할당되지 않았음을 엔진이 자동으로 부여하는 값(선언만 함, 존재하지 않는 프로퍼티, return 없는 함수), null은 "값이 없음"을 개발자가 의도적으로 명시하는 값. typeof는 각각 'undefined'와 'object'(역사적 버그).

**Q3. "truthy/falsy가 뭔가요?"**
> 조건문에서 true/false로 취급되는 값. falsy는 `false, 0, -0, 0n, '', null, undefined, NaN` 7개뿐이고 나머지는 전부 truthy. 빈 배열/빈 객체도 truthy라는 게 자주 틀리는 포인트.

**Q4. "NaN이 왜 특이한가요?"**
> typeof NaN은 'number'인데 NaN === NaN은 false(자기 자신과도 다른 유일한 값). 정확한 판별은 형변환 없는 `Number.isNaN()`을 써야 하고, 전역 `isNaN()`은 형변환 때문에 오탐이 생길 수 있음.

---

# J5. Modern JS (ES6+)

**학습 목표**: *"ES6에서 뭐가 바뀌었나요?"* / *"async/await은 Promise와 어떤 관계인가요?"* / *"CommonJS와 ES Module 차이는?"* 에 코드로 5분 답할 수 있다.

## 1. 비유 — 오래된 사무실에 새 도구가 들어옴

`var`로 서류를 아무 서랍에나 넣던 시절(함수 스코프, 재선언 허용)에서, `let`/`const`로 **서랍마다 이름표를 붙이는(블록 스코프, 재선언 금지)** 체계로 바뀌었다. 함수 작성도 `function(a, b) { return a+b }` 같은 긴 양식 대신 `(a, b) => a+b`로 간소화됐고, 객체/배열을 풀어 담는 것도 일일이 손으로 꺼내던 걸(`obj.a`, `obj.b`) **한 번에 분해해서 이름 붙여 받는** 방식(구조분해)으로 바뀌었다.

## 2. let/const — 재정리
```javascript
let count = 1;      // 재할당 가능, 블록 스코프
const PI = 3.14;    // 재할당 불가, 블록 스코프
const arr = [1, 2];
arr.push(3);         // OK — const는 "재할당 금지"지 "불변"이 아님. 내부 변경은 자유
// arr = [4, 5];     // TypeError — 참조 자체를 바꾸는 건 금지
```
> J2에서 다룬 TDZ/블록 스코프가 이 두 키워드의 근거. **기본값은 `const`, 재할당 필요할 때만 `let`**, `var`는 사용 안 함.

## 3. 화살표 함수 — 간결한 문법 + this 특성
```javascript
const add = (a, b) => a + b;              // 표현식 바로 반환 (중괄호 없으면 암묵적 return)
const square = x => x * x;                 // 인자 1개면 괄호 생략 가능
const noop = () => {};                     // 인자 없으면 괄호 필수
const arr = [1, 2, 3].map(x => x * 2);     // 콜백에서 특히 간결
```
> this를 렉시컬로 캡처하는 특성(J3)과 `arguments` 객체가 없다는 점이 일반 함수와의 핵심 차이.

## 4. 구조분해 할당 (Destructuring)
```javascript
// 객체 구조분해
const user = { name: 'Kim', age: 30, address: { city: 'Seoul' } };
const { name, age: userAge, address: { city } } = user;
// name='Kim', userAge=30, city='Seoul'

const { name: n = 'Unknown' } = {};   // 기본값 — n = 'Unknown'

// 배열 구조분해 (순서 기반)
const [first, , third] = [1, 2, 3];   // first=1, third=3 (2번째는 건너뜀)
const [x, y] = [y, x];  // 이렇게는 안 됨. 스왑은:
let p = 1, q = 2;
[p, q] = [q, p];         // 스왑 — 임시 변수 없이 가능

// 함수 매개변수에서 바로 구조분해
function printUser({ name, age }) { console.log(`${name}, ${age}`); }
```

## 5. 스프레드(spread) / 나머지(rest)
```javascript
// 스프레드 — 펼치기 (배열/객체 복사, 합치기)
const arr1 = [1, 2];
const arr2 = [...arr1, 3, 4];          // [1,2,3,4] — 얕은 복사 + 결합
const merged = { ...{ a: 1 }, ...{ b: 2 } };  // { a:1, b:2 }

function sum(a, b, c) { return a + b + c; }
sum(...[1, 2, 3]);                     // 배열을 인자로 펼쳐서 전달

// 나머지(rest) — 모아 담기 (매개변수, 구조분해에서)
function sumAll(...nums) { return nums.reduce((a, b) => a + b, 0); }
sumAll(1, 2, 3, 4);   // 10

const [head, ...tail] = [1, 2, 3, 4];  // head=1, tail=[2,3,4]
const { id, ...rest } = { id: 1, name: 'A', age: 20 };  // rest={name:'A', age:20}
```
> **구분**: 같은 `...` 문법이지만 **선언/매개변수 위치**에 있으면 rest(모으기), **호출/리터럴 위치**에 있으면 spread(펼치기).

## 6. async/await — Promise 위의 문법 설탕
```javascript
// Promise 체이닝 방식
function fetchUserPromise(id) {
    return fetch(`/users/${id}`)
        .then(res => res.json())
        .then(data => data.name)
        .catch(err => console.error(err));
}

// async/await 방식 — 동일한 동작을 동기 코드처럼 작성
async function fetchUserAsync(id) {
    try {
        const res = await fetch(`/users/${id}`);
        const data = await res.json();
        return data.name;
    } catch (err) {
        console.error(err);
    }
}
```
- `async` 함수는 **항상 Promise를 반환**(반환값이 Promise가 아니면 자동으로 감싸짐).
- `await`는 Promise가 처리(resolve/reject)될 때까지 **해당 함수 실행만** 일시 정지(다른 코드/스레드는 안 막힘) — 처리 후 이어서 실행되는 부분은 사실상 `.then()` 콜백이라 **마이크로태스크로 스케줄**(J1 참고).
- 에러 처리는 `.catch()` 대신 **`try/catch`** 로 자연스럽게 표현 가능.
- 여러 비동기 작업을 **동시에** 실행하고 싶으면 `await`를 순차로 걸지 말고 `Promise.all([...])`로 묶을 것.
```javascript
// 나쁜 예 — 순차 실행(총 시간 = 합)
const a = await fetchA();
const b = await fetchB();

// 좋은 예 — 병렬 실행(총 시간 = 더 긴 쪽)
const [a, b] = await Promise.all([fetchA(), fetchB()]);
```

## 7. 모듈 (import/export)
```javascript
// math.js — named export
export function add(a, b) { return a + b; }
export const PI = 3.14;

// math.js — default export (모듈당 1개만)
export default function multiply(a, b) { return a * b; }

// main.js
import multiply, { add, PI } from './math.js';
import * as math from './math.js';   // 전체를 네임스페이스로
```
| | CommonJS (Node 전통 방식) | ES Module |
|--|---------------------------|-----------|
| 문법 | `require`/`module.exports` | `import`/`export` |
| 로딩 시점 | 런타임(동기) | 정적 분석(컴파일 타임에 의존관계 파악) — 트리 셰이킹 가능 |
| 실행 방식 | 동기 로드 | 기본적으로 비동기 로드 가능 |
| 값 방식 | 내보낸 값의 **복사본** | 내보낸 값의 **live binding**(원본 값 변경이 반영됨) |

## 8. 핵심 포인트 (자주 하는 실수)
- 🔴 `const`가 "불변"이라고 착각 — ❌ **재할당만 금지**. 배열/객체 내부는 여전히 변경 가능(`push`, 프로퍼티 수정).
- 🔴 병렬로 처리해도 되는 `await`를 순차로 나열해 **불필요하게 느림** — 서로 의존하지 않으면 `Promise.all`.
- 🔴 스프레드로 얕은 복사한 객체의 **중첩 객체는 여전히 참조 공유**(J4의 참조 타입 문제 재등장).
- 🟡 `async` 함수는 `try/catch`가 없으면 reject된 Promise가 **unhandled rejection**으로 남을 수 있음 — 항상 에러 처리 고려.
- 🟡 default export는 모듈당 하나, named export는 여러 개 가능 — import 시 이름 자유도(`import` alias `as`)도 서로 다름.

## 9. 정리표 — ES6+ 핵심 기능 한눈에
| 기능 | 이전 방식 | ES6+ | 핵심 이득 |
|------|-----------|------|-----------|
| 변수 선언 | `var` | `let`/`const` | 블록 스코프, TDZ로 실수 방지 |
| 함수 | `function(){}` | 화살표 함수 | 간결함, this 렉시컬 캡처 |
| 값 분해 | `obj.a`, `arr[0]` 개별 접근 | 구조분해 | 가독성, 기본값/별칭 지정 |
| 배열/객체 복사·합치기 | `concat`, `Object.assign` | 스프레드(`...`) | 간결한 얕은 복사/병합 |
| 가변 인자 | `arguments` 객체 | rest(`...`) | 진짜 배열, 화살표 함수에서도 동작 |
| 비동기 | 콜백 → Promise 체이닝 | async/await | 동기 코드처럼 가독성 있는 비동기 |
| 코드 분리 | CommonJS `require` | ES Module `import/export` | 정적 분석, 트리 셰이킹 |

## 10. 예상 면접 질문 + 답변 골격
**Q1. "ES6에서 가장 중요한 변화가 뭐라고 생각하나요?"**
> `let`/`const`로 블록 스코프 확립, 화살표 함수와 this 렉시컬 캡처, Promise 도입(이후 async/await로 발전), 모듈 시스템 표준화(import/export)를 꼽는다. 특히 Promise/async-await는 콜백 지옥 문제를 구조적으로 해결.

**Q2. "async/await은 Promise와 어떤 관계인가요?"**
> async/await은 Promise 위에 얹힌 문법 설탕. async 함수는 항상 Promise를 반환하고, await는 그 Promise가 처리될 때까지 해당 함수만 일시정지시킨다(다른 코드는 안 막힘). 내부적으로 await 이후 코드는 .then() 콜백처럼 마이크로태스크로 실행된다.

**Q3. "스프레드와 rest 문법 차이는?"**
> 같은 `...` 문법이지만 위치로 구분. 함수 호출/배열-객체 리터럴 안에서는 펼치는 스프레드, 함수 매개변수나 구조분해 좌변에서는 나머지를 모으는 rest.

**Q4. "CommonJS와 ES Module 차이는?"**
> CommonJS(require)는 런타임에 동기적으로 로드하고 내보낸 값의 복사본을 받는 반면, ES Module(import/export)은 정적으로 분석되어 트리 셰이킹이 가능하고 내보낸 값의 live binding을 유지한다(원본이 바뀌면 import한 쪽도 반영).

**Q5. "여러 비동기 작업을 병렬로 처리하려면?"**
> 서로 의존하지 않는 작업이면 `await`를 순차로 걸지 말고 `Promise.all([...])`로 동시에 시작해 묶어서 기다린다. 순차로 걸면 총 대기시간이 각 작업 시간의 합이 되어 불필요하게 느려진다.
