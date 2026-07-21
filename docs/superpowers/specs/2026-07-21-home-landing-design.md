# 홈 랜딩 — 설계 (Design Spec)

**날짜:** 2026-07-21
**상태:** 승인됨 (구현 계획 대기)

## 목표 (Goal)

커뮤니티에서 링크를 타고 처음 온 개발자가 "이 앱이 뭐고 어디서 시작하지"를 즉시 이해하도록 하는 랜딩 홈을 추가한다. 지금은 첫 화면이 지도(graph)라 맥락 없이 방치되는데, 홈이 오리엔테이션 역할을 대신한다. 별도 온보딩 모달은 만들지 않는다(홈이 그 역할).

## 배경 / 근거 (Context)

- 현재 기본 뷰는 `graph`. 하단 `ViewToggle`에 4탭(지도/목록/퀴즈/경로). 상단은 검색+로그인+테마.
- `viewMode`는 localStorage에 유지됨(`useViewModeEffect`).
- 공유 목표: 첫 30초가 이탈을 가름 → 방향 안내가 핵심.

## 확정된 결정 (Decisions)

1. **새 '홈' 랜딩 뷰**를 추가하고 **기본 viewMode를 `home`으로**. 단 재방문자는 유지된 마지막 탭에 도착(홈 강제 안 함).
2. **홈 구성 = 히어로(한 줄 소개) + 3 모드 진입 카드**뿐. 진행률·약점 섹션은 넣지 않는다(YAGNI; 향후 SRS/대시보드 때 별도).
3. **3 카드 = 지도(탐색) / 퀴즈·드릴다운(면접 점검) / 경로(순서 학습).** 목록(list)은 개념 클릭 시 진입하므로 카드에서 제외.
4. 별도 온보딩 모달 없음. 게스트/로그인 무관 동일(정적 화면, 클라우드·약점 데이터 의존 없음).

## 화면 구성 (Layout)

```
        CS·백엔드 면접 지도            ← 히어로 타이틀
   개념을 잇고 · 면접처럼 파고들고 · 순서대로 정복   ← 한 줄 소개(KR)

 ┌─────────┐ ┌─────────┐ ┌─────────┐
 │ 🗺 지도   │ │ 🎤 면접   │ │ 🧭 학습경로│
 │ 개념 연결 │ │ 퀴즈·드릴 │ │ 추천순서로│   ← 3 모드 카드 (각 1줄 설명)
 │ 탐색      │ │ 다운 점검 │ │ 정복      │
 │ [열기 →] │ │ [풀기 →] │ │ [시작 →] │   ← 버튼 → setViewMode(...)
 └─────────┘ └─────────┘ └─────────┘
```

- 카드 버튼 클릭 → `setViewMode('graph' | 'quiz' | 'path')`로 해당 탭 이동.
- 반응형: 데스크톱 3열, 모바일 1열 스택.

## 아키텍처 / 파일 구조 (Architecture)

| 파일 | 변경 |
|---|---|
| `src/store/graphStore.ts` | `ViewMode`에 `'home'` 추가; 초기값 `viewMode: 'home'` |
| `src/hooks/useTheme.ts` | `useViewModeEffect`의 하이드레이트 허용값에 `'home'` 추가 |
| `src/components/ViewToggle.tsx` (+ `.css`) | 맨 앞에 `홈` 버튼(`LuHome`) 추가 |
| `src/components/HomeView.tsx` + `.css` | **신규** — 히어로 + 3 진입 카드 |
| `src/App.tsx` | `viewMode === 'home'`이면 `<HomeView />` 렌더 |

### HomeView 계약
- Props 없음(정적). `const setViewMode = useGraphStore((s) => s.setViewMode)`만 사용.
- 카드 데이터는 컴포넌트 내부 상수 배열: `{ icon, title, desc, cta, target: ViewMode }[]`.

## 데이터 흐름 (Data Flow)
1. 신규 방문 → 저장된 viewMode 없음 → store 기본값 `home` → `App`이 `<HomeView>` 렌더.
2. 카드 버튼 클릭 → `setViewMode(target)` → 해당 뷰로 전환(+ ViewToggle에도 반영).
3. 재방문 → `useViewModeEffect`가 저장된 마지막 viewMode 하이드레이트(홈일 수도, 다른 탭일 수도).

## 에러 / 엣지 (Edge Cases)
- 저장된 viewMode가 구버전이라 목록에 없으면 무시하고 기본값 유지(기존 가드 동작).
- 홈은 네트워크/스토어 상태에 의존하지 않아 로딩·에러 상태 불필요.

## 테스트 (Testing)
- 실브라우저(Playwright): 첫 로드(빈 localStorage) 시 홈 도착 및 3 카드 노출; 각 카드 클릭 시 지도/퀴즈/경로로 이동; 홈 탭 재진입; 모바일 폭(1열) 확인; 콘솔 에러 0.
- 회귀: `useViewModeEffect`가 `'home'`을 하이드레이트 허용값으로 받아 재방문 시 홈 유지.

## 범위 밖 (Out of Scope)
- 진행률·약점·이어서 학습 섹션(향후 SRS/대시보드).
- 온보딩 모달·투어.
- README·스크린샷(별도 작업).
