# 홈 랜딩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 커뮤니티 방문자를 오리엔테이션하는 '홈' 랜딩 뷰(히어로 + 3 모드 진입 카드)를 추가하고 기본 랜딩으로 만든다.

**Architecture:** 새 `HomeView` 컴포넌트(정적, 3 카드 → `setViewMode`)를 만들고, `ViewMode`에 `'home'`을 추가해 store 기본값·하이드레이트 허용값·ViewToggle 버튼·App 렌더를 연결한다.

**Tech Stack:** Vite + React 18 + TypeScript, zustand, react-icons/lu. 앱은 `interview-map/` (npm은 `cd interview-map` 후 실행).

## Global Constraints

- 앱 루트: `interview-map/` (repo 루트에서 npm 실행 금지).
- 한국어 UI 카피 + 영어 코드.
- 홈 구성 = 히어로 + 3 카드뿐 (진행률·약점·온보딩모달 없음 — YAGNI).
- 3 카드 = 경로(`path`) / 퀴즈(`quiz`) / 지도(`graph`). 목록은 제외.
- 기본 viewMode = `home`; 단 재방문자는 유지된 마지막 탭 존중.
- 커밋 이메일 `30681841+valorjj@users.noreply.github.com`, `Co-Authored-By` 포함.

---

## Task 1: HomeView 컴포넌트 + 스타일

**Files:**
- Create: `interview-map/src/components/HomeView.tsx`
- Create: `interview-map/src/components/HomeView.css`

**Interfaces:**
- Consumes: `useGraphStore` action `setViewMode`; `ViewMode` type (from `../store/graphStore`). `'home'`은 Task 2에서 `ViewMode`에 추가되지만, 카드 타깃은 기존 값(`path`/`quiz`/`graph`)만 쓰므로 Task 1 단독으로 타입 통과.
- Produces: `export function HomeView()` — props 없음.

- [ ] **Step 1: Create `HomeView.tsx`**

`interview-map/src/components/HomeView.tsx`:

```tsx
import type { ReactNode } from 'react'
import { LuMap, LuBrain, LuRoute, LuArrowRight } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import type { ViewMode } from '../store/graphStore'
import './HomeView.css'

interface ModeCard { icon: ReactNode; title: string; desc: string; cta: string; target: ViewMode }

const CARDS: ModeCard[] = [
  { icon: <LuRoute size={26} />, title: '학습 경로', desc: '추천 순서대로 CS·백엔드 기초를 정복', cta: '시작', target: 'path' },
  { icon: <LuBrain size={26} />, title: '면접 퀴즈', desc: '플래시카드 + 면접 꼬리질문 드릴다운', cta: '풀기', target: 'quiz' },
  { icon: <LuMap size={26} />, title: '개념 지도', desc: '개념 간 연결을 그래프로 탐색', cta: '열기', target: 'graph' },
]

// Landing home: orients a first-time visitor with a one-line intro and three
// mode entry cards. Static — each card just switches viewMode.
export function HomeView() {
  const setViewMode = useGraphStore((s) => s.setViewMode)
  return (
    <div className="home">
      <header className="home-hero">
        <h1>CS · 백엔드 면접 지도</h1>
        <p>개념을 잇고 · 면접처럼 파고들고 · 순서대로 정복</p>
      </header>
      <div className="home-cards">
        {CARDS.map((c) => (
          <button key={c.target} className="home-card" onClick={() => setViewMode(c.target)}>
            <span className="home-card-icon">{c.icon}</span>
            <span className="home-card-title">{c.title}</span>
            <span className="home-card-desc">{c.desc}</span>
            <span className="home-card-cta">{c.cta} <LuArrowRight size={14} /></span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `HomeView.css`**

`interview-map/src/components/HomeView.css`:

```css
.home {
  position: fixed; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 36px; padding: 72px 20px 110px;
  background: var(--bg); color: var(--text);
  font-family: system-ui, sans-serif; overflow-y: auto;
}
.home-hero { text-align: center; }
.home-hero h1 { margin: 0 0 10px; font-size: 30px; font-weight: 800; letter-spacing: -0.02em; }
.home-hero p { margin: 0; font-size: 15px; color: var(--text-dim); }

.home-cards { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; max-width: 760px; }
.home-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
  width: 220px; padding: 20px; text-align: left; cursor: pointer;
  border: 1px solid var(--border); border-radius: 14px; background: var(--bg-panel);
  color: var(--text); transition: border-color 0.15s, transform 0.15s;
}
.home-card:hover { border-color: var(--accent); transform: translateY(-2px); }
.home-card-icon { color: var(--accent); }
.home-card-title { font-size: 17px; font-weight: 700; }
.home-card-desc { font-size: 13px; color: var(--text-dim); line-height: 1.5; flex: 1; }
.home-card-cta { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; font-size: 13px; font-weight: 600; color: var(--accent); }

@media (max-width: 640px) {
  .home { gap: 24px; padding: 60px 16px 100px; }
  .home-hero h1 { font-size: 24px; }
  .home-card { width: 100%; max-width: 320px; }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd interview-map && npx tsc --noEmit`
Expected: 에러 없음. (`ViewMode`에 아직 `'home'`이 없어도 카드 타깃은 `path`/`quiz`/`graph`만 쓰므로 통과.)

- [ ] **Step 4: Commit**

```bash
cd /Users/jeongjin/Documents/cs-study
git add interview-map/src/components/HomeView.tsx interview-map/src/components/HomeView.css
git commit -m "feat: HomeView landing (hero + 3 mode entry cards)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 'home' viewMode 연결 (store · 하이드레이트 · ViewToggle · App)

**Files:**
- Modify: `interview-map/src/store/graphStore.ts`
- Modify: `interview-map/src/hooks/useTheme.ts`
- Modify: `interview-map/src/components/ViewToggle.tsx`
- Modify: `interview-map/src/App.tsx`

**Interfaces:**
- Consumes: `HomeView` (Task 1).
- Produces: `ViewMode` union이 `'home'`을 포함; 기본 랜딩이 홈.

- [ ] **Step 1: Add `'home'` to `ViewMode` and make it the default**

`interview-map/src/store/graphStore.ts`:
- 타입 변경:
  ```ts
  export type ViewMode = 'home' | 'graph' | 'list' | 'quiz' | 'path'
  ```
- 초기값 변경 (`useGraphStore` 생성자 내 `viewMode: 'graph'` → ):
  ```ts
  viewMode: 'home',
  ```

- [ ] **Step 2: Accept `'home'` in the viewMode hydrate guard**

`interview-map/src/hooks/useTheme.ts` — `useViewModeEffect`의 하이드레이트 조건을 교체:

```ts
    if (saved === 'home' || saved === 'graph' || saved === 'list' || saved === 'quiz' || saved === 'path') setViewMode(saved)
```

- [ ] **Step 3: Add the 홈 button to ViewToggle (first position)**

`interview-map/src/components/ViewToggle.tsx`:
- import에 `LuHome` 추가:
  ```ts
  import { LuHome, LuMap, LuList, LuBrain, LuRoute } from 'react-icons/lu'
  ```
- `<div className="vt" ...>` 바로 다음, 기존 첫 버튼(지도) 앞에 삽입:
  ```tsx
      <button
        role="tab"
        aria-selected={viewMode === 'home'}
        data-active={viewMode === 'home'}
        onClick={() => setViewMode('home')}
      >
        <LuHome size={15} /> 홈
      </button>
  ```

- [ ] **Step 4: Render HomeView in App**

`interview-map/src/App.tsx`:
- import 추가 (다른 뷰 import 근처):
  ```ts
  import { HomeView } from './components/HomeView'
  ```
- 뷰 렌더 분기에 추가 (`{viewMode === 'quiz' && <QuizTab .../>}` 등과 같은 위치):
  ```tsx
  {viewMode === 'home' && <HomeView />}
  ```

- [ ] **Step 5: Typecheck + full test suite + build**

Run: `cd interview-map && npx tsc --noEmit && npx vitest run && npm run build`
Expected: 타입 에러 없음, 전체 테스트 통과, 빌드 성공.

- [ ] **Step 6: Real-browser verify**

dev 서버 실행(`cd interview-map && npm run dev` 백그라운드, 포트 확인) 후:

```js
// scratchpad/verify-home.mjs
import pkg from '/Users/jeongjin/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js'
const { chromium } = pkg
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage()
const errors=[]; p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
// fresh visitor: empty storage → lands on home
await p.goto('http://localhost:5173',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500)
console.log('home cards:', await p.locator('.home-card').count())         // expect 3
console.log('hero:', await p.locator('.home-hero h1').innerText().catch(()=>'NONE'))
// click 면접 퀴즈 card → quiz view
await p.locator('.home-card', { hasText: '면접 퀴즈' }).click(); await p.waitForTimeout(600)
console.log('after quiz card, quiztab present:', await p.locator('.quiztab-modes').count())  // expect 1
// back to home via ViewToggle
await p.locator('.vt button', { hasText: '홈' }).click(); await p.waitForTimeout(400)
console.log('home again cards:', await p.locator('.home-card').count())   // expect 3
// mobile width: cards stack (still 3, single column — just confirm render)
await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(300)
console.log('mobile cards:', await p.locator('.home-card').count())
console.log('errors:', errors.length?errors:'none')
await b.close()
```
Run: `node <scratchpad>/verify-home.mjs`
Expected: `home cards: 3`, `hero` 포함 "면접 지도", `quiztab present: 1`, `home again cards: 3`, `mobile cards: 3`, `errors: none`.

- [ ] **Step 7: Commit**

```bash
cd /Users/jeongjin/Documents/cs-study
git add interview-map/src/store/graphStore.ts interview-map/src/hooks/useTheme.ts interview-map/src/components/ViewToggle.tsx interview-map/src/App.tsx
git commit -m "feat: home as default landing view + 홈 tab

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- 새 홈 뷰 + 기본 랜딩 → Task 1 + Task 2 Step 1 ✓
- 히어로 + 3 카드(경로/퀴즈/지도) → Task 1 CARDS ✓
- 홈 탭 → Task 2 Step 3 ✓
- 재방문자 마지막 탭 존중(하이드레이트) → Task 2 Step 2 ✓
- 온보딩 모달·진행률·약점 없음 → 미포함 ✓
- 검증(첫 로드 홈·카드 이동·재진입·모바일·에러0) → Task 2 Step 6 ✓

**2. Placeholder scan:** 모든 코드 블록 완전 구현. placeholder 없음.

**3. Type consistency:**
- `ViewMode`에 `'home'` 추가(Task 2 Step 1) — HomeView는 `ViewMode` 타입만 import하고 카드 타깃은 기존 값 사용(Task 1), ViewToggle/useTheme/App은 `'home'` 리터럴 사용(Task 2). 순서상 Task 1 단독 타입통과, Task 2에서 `'home'` 도입 후 전체 일관 ✓
- `setViewMode(target: ViewMode)` — 기존 시그니처 그대로 ✓
- `HomeView` 무인자 export → App에서 `<HomeView />` ✓
