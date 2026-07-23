# experiments/

이 저장소의 학습 실험(prototype) 모음. **검증(spike) 목적**의 코드이며, 아직 앱(`interview-map/`)에 연결되지 않았다.
전체 설계·결과·정직한 평가는 [`docs/how-it-works.md`](../docs/how-it-works.md) 참고.

전제: 로컬 [Ollama](https://ollama.com) 서버가 `http://localhost:11434`에서 실행 중이어야 한다.

```bash
brew install ollama && brew services start ollama
ollama pull qwen2.5:3b-instruct   # 채점용
ollama pull nomic-embed-text      # 벡터 실습용
```

> 실험을 끝내면 `ollama stop <model>` 로 모델을 메모리에서 내려 발열을 줄이자.

---

## slm-scoring/ — 서술형 답변 자동 채점 + 꼬리질문 드릴다운

로컬 SLM(`qwen2.5:3b-instruct`)에게 **채점만** 시키고(JSON), 라우팅은 코드가 결정한다.

| 파일 | 역할 |
|------|------|
| `score.mjs` | 채점 함수 `score({question, reference, userAnswer})` → `{score 1~5, missing_keywords, feedback, next_action}`. 프롬프트 인젝션 방어 포함. |
| `fixtures.json` | 골든셋 — 실제 notes 카드 12개 × 답변 3종(강/부분/약) + 적대적 10건. |
| `run.mjs` | 골든셋 러너. 밴드 적중·순서 위반·JSON 파싱·지연 + 적대적 통과율 출력. |
| `drill.mjs` | end-to-end 드릴다운 흐름 콘솔 시연 (실제 notes 드릴체인 사용). |

```bash
cd experiments/slm-scoring
node run.mjs                          # 골든셋 채점 (기본 3b)
MODEL=qwen2.5:7b-instruct node run.mjs # 다른 모델로 비교
node drill.mjs                        # 드릴다운 흐름 시연
```

**검증 결과(요약):** 3b — 밴드 89%, 순서위반 0, 파싱실패 0, 적대적 10/10, 지연 p50 ~1.7초. 파인튜닝 불필요.

## vector-similarity/ — 임베딩 기반 "비슷한 카드 찾기" (side-quest)

notes 카드 질문을 임베딩해 코사인 유사도로 top-k를 찾는 벡터 검색 실습. 개념은 [`notes/04-database/vector-db-and-rag.md`](../notes/04-database/vector-db-and-rag.md).

| 파일 | 역할 |
|------|------|
| `extract.mjs` | `notes/**/*.md`에서 카드 질문 추출 (fence-aware). |
| `embed.mjs` | 질문을 `nomic-embed-text`로 임베딩 → `embeddings.json` 생성. |
| `similar.mjs` | 임베딩 로드 → 샘플 쿼리별 top-5 유사 카드 출력. |

```bash
cd experiments/vector-similarity
node embed.mjs      # embeddings.json 생성 (약 12초)
node similar.mjs    # 유사도 검색 데모
```

> `embeddings.json`은 생성물이라 git에 넣지 않는다(`.gitignore`). `node embed.mjs`로 재생성.
