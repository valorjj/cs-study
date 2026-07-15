# cs-study

한국 IT 백엔드 인터뷰를 준비하며 정리한 **CS 개념 노트 + 알고리즘 풀이 + 지식 그래프 앱** 모음입니다.
주니어 개발자도 참고할 수 있도록 공개로 운영합니다.

> A public collection of CS interview notes, algorithm solutions, and an interactive
> knowledge-graph app, written while preparing for Korean backend engineering interviews.

## 🗺️ interview-map — 인터랙티브 지식 그래프

CS 개념을 **유기적으로 연결된 지도**로 탐색하는 웹앱입니다. Google Maps처럼
줌 아웃하면 큰 도메인(OS·Java·Network…)만, 줌 인하면 하위 개념(GC·JIT·ClassLoader…)이
드러나는 **semantic zoom**과, 도메인을 가로지르는 개념 연결(cross-link)을 시각화합니다.

- 스택: React + TypeScript + Vite + [React Flow](https://reactflow.dev/)
- 그래프 구조는 [`interview-map/src/graph/graph.json`](interview-map/src/graph/graph.json) 한 곳에서 관리하고,
  각 노드는 [`notes/`](notes/)의 마크다운을 참조합니다 (내용 중복 없음).
- **Live demo:** _배포 후 링크 추가 예정_ <!-- https://<your-vercel-app>.vercel.app -->

```bash
cd interview-map
npm install
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드 (tsc -b && vite build → dist/)
npm test         # 단위 테스트 (Vitest)
```

## 📁 구성

| 경로 | 내용 |
|------|------|
| [`notes/`](notes/) | CS 개념 노트 (Java/JVM, OS, Network, DB, Spring, System Design, DevOps) — 면접 답변 형식 |
| [`01-data-structures/`](01-data-structures/) | 알고리즘 풀이 코드 (BOJ, Java 11) |
| [`STUDY_PLAN.md`](STUDY_PLAN.md) | 12주 알고리즘 학습 일정 |
| [`interview-map/`](interview-map/) | 지식 그래프 웹앱 |

## 📝 노트 작성 방식

각 노트는 일관된 순서를 따릅니다: **비유 → 개념 정의 → 다이어그램 → 코드 → 핵심 포인트/자주 하는 실수 →
패턴 정리표 → 예상 면접 질문**. 한국어 설명 + 영어 코드.

가장 완성된 예시: [`notes/01-java-jvm/jvm-memory-gc.md`](notes/01-java-jvm/jvm-memory-gc.md)
(JVM 구조 · Class Loader · GC · JIT · 동시성).

---

학습용 개인 저장소입니다. 오류를 발견하면 이슈로 알려주세요.
