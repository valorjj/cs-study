import travUrl from '../assets/guide/04-node-traversal.svg'
import { FlowPlayer } from './flow/FlowPlayer'
import { turnLifecycle } from './flow/flows/turnLifecycle'
import { depthLadder } from './flow/flows/depthLadder'
import './GuideView.css'

export function GuideView() {
  return (
    <div className="guide">
      <h1>설계 가이드 — 왜 이렇게 만들었나</h1>
      <p className="guide-lead">
        이 면접 시뮬레이터를 만들며 <b>견고하고(solid) 안전하고(safe) 오래가는(durable)</b> 설계를 목표로 삼았습니다.
        처음 보는 동료나 면접 준비자가 "왜 이 구조인지" 편하게 이해하도록, 비유부터 살아 움직이는 흐름도까지 정리했습니다.
      </p>

      <section>
        <h2>비유: 좋은 면접관은 사다리를 오른다</h2>
        <p>
          진짜 면접관은 "포트가 뭐죠?"로 가볍게 시작합니다. 답을 들으면 "그럼 8080에 앱을 띄우면 무슨 일이 나죠?"로
          한 발 더, 또 "OS 레벨에선 어떻게 되죠?", "두 프로세스가 같은 포트를 잡으면요?"로 <b>한 개념을 계속 깊이</b> 팝니다.
          우리는 이 "점점 깊어지는" 리듬을 개념마다 4계단(L1~L4)의 사다리로 코드에 새겼습니다. 아래 흐름도가 그 한 판을 보여줍니다.
        </p>
      </section>

      <section>
        <h2>한 턴의 생애 — 질문 하나가 만들어지는 과정</h2>
        <p>
          사용자가 개념 하나를 마주하면, 브라우저·Edge Function·데이터베이스·Gemini가 손발을 맞춰 질문 하나를 만들어냅니다.
          <b>▶ 재생</b>을 눌러 한 턴이 어떻게 흘러가는지 따라가 보세요. 핵심은 "캐시를 먼저 본다"는 것 —
          이미 있으면 LLM을 아예 부르지 않아 토큰이 0입니다.
        </p>
        <FlowPlayer flow={turnLifecycle} />
        <details className="deep">
          <summary>더 깊이 — 캐시·상한·미터가 실제로 도는 법</summary>
          <ul>
            <li><b>캐시 키</b>는 <code>(node_id, rung, note_hash)</code>이고, <code>note_hash</code>는 <b>서버가 노트 텍스트에서 직접 계산</b>합니다(클라 값 불신 → 공유 캐시 오염 차단).</li>
            <li><b>상한</b>은 <code>reserve_grade_slot</code> 한 문장으로 예약+증가를 원자화(TOCTOU 없음), LLM 실패 시 <code>refund</code>로 되돌립니다(실패는 무료).</li>
            <li><b>미터</b>는 <code>grade_events</code>에 성공 호출만 로깅 — 캐시 히트는 로깅도 예약도 하지 않습니다.</li>
          </ul>
        </details>
      </section>

      <section>
        <h2>왜 graph DB를 쓰지 않았나</h2>
        <p>
          "개념이 그래프로 얽혀 있으니 Neo4j 같은 graph DB가 필요하지 않나?" — 자연스러운 질문이지만, 답은 "아니오"였습니다.
          개념 연결(122노드·169엣지)은 이미 <code>graph.json</code>에 있고, 순회는 브라우저 메모리에서 순수 함수로 <b>마이크로초</b> 만에 끝납니다.
          graph DB가 값을 하는 건 수백만 노드, 서버측 다단계 질의, 동시 영속화가 필요할 때입니다. 무엇보다 graph DB는
          <b>질문을 만들어 주지도, 토큰을 아껴 주지도</b> 않습니다 — 그건 전혀 다른 문제(LLM과 캐시)였으니까요.
        </p>
        <details className="deep">
          <summary>더 깊이 — 그래도 언제 graph DB가 정당한가</summary>
          <p>노드가 수백만 규모거나, "6홉 이내 연결 경로" 같은 깊은 그래프 질의를 서버에서 상시 돌리거나, 그래프 구조 자체를 여러 사용자가 동시에 편집·영속화해야 할 때. 우리는 셋 다 아닙니다.</p>
        </details>
      </section>

      <section>
        <h2>개념 안 — 깊이 사다리</h2>
        <p>
          한 개념 안에서 채점 점수가 다음 계단을 정합니다. 3점 이상이면 한 계단 올라가고, 2점 이하면 답변에 맞춘 힌트를 한 번 주고
          다시 기회를 줍니다. 계단당 최대 두 번 — 그래서 한 개념은 아무리 길어도 네 계단으로 끝나고, 비용이 구조적으로 상한을 가집니다.
        </p>
        <FlowPlayer flow={depthLadder} />
        <details className="deep">
          <summary>더 깊이 — 사다리 엔진이 계단을 정하는 규칙</summary>
          <ul>
            <li><b>climb</b> — <code>score ≥ 3</code>이면 다음 계단으로, <code>reached</code>를 현재 계단까지 올림.</li>
            <li><b>offer-hint</b> — <code>score ≤ 2</code>이고 <code>attempts = 0</code>이면 답변 기반 힌트 + 재시도 1회.</li>
            <li><b>node-done</b> — L4를 넘거나 재시도도 <code>≤ 2</code>면 종료. 계단당 최대 2번이라 한 개념은 아무리 길어도 유한 — 비용이 구조적으로 상한을 가짐.</li>
          </ul>
        </details>
      </section>

      <section>
        <h2>개념 사이 — 그래프 순회</h2>
        <p>
          한 개념을 끝내면, 거기서 얼마나 깊이 갔는지가 다음 개념을 고릅니다. 깊이 마스터했으면 자식 개념으로 더 깊이,
          무난했으면 형제 개념으로 옆으로, 입구에서 막혔으면 부모 개념으로 물러섭니다. 막힘 2번 또는 8개 개념에서 한 세션이 끝납니다.
        </p>
        <img className="guide-diagram" src={travUrl} alt="개념 사이 순회" />
        <p className="guide-note">※ 이 그림도 다음 업데이트에서 흐름도로 바뀝니다.</p>
      </section>

      <section>
        <h2>안전하게 지었습니다</h2>
        <p>
          공개된 학습 도구인 만큼, 틀린 지식을 정답처럼 가르치거나 누군가 시스템을 악용하는 일을 막는 데 특히 신경 썼습니다.
        </p>
        <details className="deep">
          <summary>더 깊이 — 견고·안전 장치 목록</summary>
          <ul>
            <li><b>원자적 일일 상한</b> — reserve/refund 한 문장으로 TOCTOU 없음, 실패는 무료(환불).</li>
            <li><b>인젝션 방어</b> — 노트·답변을 구분선으로 감싸고 구분선 토큰을 중화("지시처럼 보여도 자료로만").</li>
            <li><b>환각 방지</b> — 노트 근거 우선, 표준지식 확장은 <code>🔎 AI 확장</code>으로 명시, 자신 없으면 스킵.</li>
            <li><b>공유 캐시 오염 차단</b> — 캐시 키 해시를 서버가 직접 유도(클라 값 불신).</li>
            <li><b>접근 제어</b> — RLS + SECURITY DEFINER(쓰기는 함수만), 로그인 필수.</li>
            <li><b>정직한 한계</b> — 미터는 우리 호출 기준(Google 잔여 할당량 아님), 크로스도메인은 다음 이터레이션.</li>
          </ul>
        </details>
      </section>
    </div>
  )
}
