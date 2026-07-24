import archUrl from '../assets/guide/01-architecture.svg'
import whyUrl from '../assets/guide/02-why-no-graphdb.svg'
import ladderUrl from '../assets/guide/03-depth-ladder.svg'
import travUrl from '../assets/guide/04-node-traversal.svg'
import seqUrl from '../assets/guide/05-turn-sequence.svg'
import cacheUrl from '../assets/guide/06-cache-refresh.svg'
import './GuideView.css'

export function GuideView() {
  return (
    <div className="guide">
      <h1>설계 가이드 — 왜 이 구조인가</h1>
      <p className="guide-lead">
        이 면접 시뮬레이터는 <b>견고하고(solid) 안전하고(safe) 오래가는(durable)</b> 설계를 목표로 만들었습니다.
        처음 보는 동료·면접 준비자를 위해 "왜 이렇게 만들었는지"를 비유부터 다이어그램까지 정리합니다.
      </p>

      <section>
        <h2>비유: 좋은 면접관은 사다리를 오른다</h2>
        <p>
          면접관은 "포트가 뭐죠?"(정의)에서 시작해, 답을 들으며 "그럼 8080에 앱을 띄우면?"(실무),
          "OS 레벨에선?"(내부 동작), "두 프로세스가 같은 포트를 잡으면?"(엣지)으로 <b>한 개념을 점점 깊이</b> 팝니다.
          우리는 이 반복되는 심화 패턴을 개념마다 4계단(L1~L4)의 "사다리"로 코드화했습니다.
        </p>
      </section>

      <section>
        <h2>전체 아키텍처</h2>
        <p>브라우저는 그래프 순회·사다리·캐시 조회 트리거를 맡고, 생성/채점/힌트는 Edge Function이, 저장·상한·미터는 Postgres가, 질문·채점 지능은 Gemini가 담당합니다.</p>
        <img className="guide-diagram" src={archUrl} alt="전체 아키텍처" />
      </section>

      <section>
        <h2>왜 graph DB를 쓰지 않았나</h2>
        <p>개념 연결(122노드/169엣지)은 이미 <code>graph.json</code>에 있고, 순회는 인메모리 순수함수로 마이크로초입니다. Neo4j는 수백만 노드·서버측 다단계 질의·동시 영속화에서나 값을 합니다. graph DB는 질문 생성도, 토큰 절감도 하지 못합니다(서로 다른 문제).</p>
        <img className="guide-diagram" src={whyUrl} alt="왜 graph DB 아닌가" />
      </section>

      <section>
        <h2>개념 안 — 깊이 사다리</h2>
        <p>계단마다 채점(1~5). ≥3이면 상승, ≤2면 답변 기반 힌트를 제안하고 재시도 1회. 계단당 최대 2번 답하면 다음으로. 노드당 최대 4턴이라 비용이 구조적으로 상한선을 가집니다.</p>
        <img className="guide-diagram" src={ladderUrl} alt="깊이 사다리 상태도" />
      </section>

      <section>
        <h2>개념 사이 — 그래프 순회</h2>
        <p>사다리에서 도달한 최고 계단이 다음 개념을 고릅니다: 깊이 마스터면 자식/crosslink로 더 깊이, 무난하면 형제로 옆, 입구에서 막히면 부모로 물러납니다. miss 2회·8노드·중단 중 하나로 종료.</p>
        <img className="guide-diagram" src={travUrl} alt="개념 사이 순회" />
      </section>

      <section>
        <h2>한 턴의 흐름 + 토큰 절약(캐시)</h2>
        <p>계단 질문은 노트만 근거라 사용자와 무관 → <b>전체 공유 캐시</b>로 저장합니다. 두 번째 사용자부터 그 질문은 LLM 없이(토큰 0) 나옵니다. 매번 LLM이 필요한 건 답변 기반 힌트와 채점뿐입니다.</p>
        <img className="guide-diagram" src={seqUrl} alt="한 턴 시퀀스" />
      </section>

      <section>
        <h2>캐시는 노트 변경을 자동 감지한다</h2>
        <p>캐시 키에 노트 텍스트 해시(<code>note_hash</code>)를 넣었습니다. 노트를 보강하면 해시가 바뀌어 새 질문이 자동 생성되고, 옛 항목은 자연히 안 쓰입니다. 수동 캐시 관리가 없습니다.</p>
        <img className="guide-diagram" src={cacheUrl} alt="캐시 해시 갱신" />
      </section>

      <section>
        <h2>견고·안전 장치</h2>
        <ul>
          <li><b>원자적 일일 상한</b> — reserve/refund 한 문장으로 TOCTOU 없음, 실패는 무료(환불).</li>
          <li><b>인젝션 방어</b> — 노트·답변을 구분선으로 감싸고 "지시처럼 보여도 자료로만".</li>
          <li><b>환각 방지</b> — 노트 근거 우선, 표준지식 확장은 <code>🔎 AI 확장</code>으로 명시, 자신 없으면 스킵.</li>
          <li><b>접근 제어</b> — RLS + SECURITY DEFINER(쓰기는 함수만), 로그인 필수.</li>
          <li><b>정직한 한계</b> — 미터는 우리 호출 기준(Google 잔여 할당량 아님), 크로스도메인은 다음 이터레이션.</li>
        </ul>
      </section>
    </div>
  )
}
