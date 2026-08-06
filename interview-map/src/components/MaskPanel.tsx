// 마스킹 확정 패널. 후보별 가리기/남기기 결정 + 전송 전문 미리보기.
//
// 미리보기는 buildExtractPayload를 직접 불러 그 결과를 그대로 렌더한다. 별도로
// 문자열을 조립하면 언젠가 전송 경로와 갈라지고, 그날 미리보기는 거짓 안전감만
// 주는 장식이 된다. buildExtractPayload가 던지는 예외도 실패가 아니라 정보다 —
// 왜 아직 보낼 수 없는지가 곧 메시지이므로 그대로 보여준다.
//
// 결정의 유일한 진실은 store다. 이 컴포넌트는 로컬로 결정을 들고 있지 않는다 —
// 들고 있으면 "패널은 결정됐다고 보여주는데 store엔 안 남았다"는 상태가 생기고,
// Task 8의 전송 경로는 store의 프로젝트로 payload를 새로 만들기 때문에 그 순간
// 미리보기와 실제 전송이 갈라진다(회귀 방지 테스트: '저장이 거부되면 마스킹된
// 것처럼 보여주지 않는다'). project prop이 최신이라는 보장은 이 컴포넌트가 아니라
// 부모(ResumeView)의 책임이다 — ResumeView는 store의 projects를 구독하고 매
// 렌더마다 id로 다시 찾아 prop으로 넘긴다. 그래서 여기서는 prop을 그대로 믿는다.
import { useMemo, useState } from 'react'
import { useResumeStore } from '../store/resumeStore'
import { buildNeverMask, dictOf, maskGate } from '../lib/mask'
import { buildExtractPayload } from '../lib/extractPayload'
import { requestExtract } from '../lib/extract'
import { mergeLlm } from '../lib/conceptMatch'
import type { ExtractOutcome } from '../lib/extract'
import { STAGE_LABELS } from '../lib/resumeTypes'
import type { CandidateKind, MaskDecision, Project } from '../lib/resumeTypes'
import type { GraphNode } from '../graph/types'
import './MaskPanel.css'

// LLM에 보내는 서술문은 이미 마스킹된 버전이라, 모델이 돌려주는 reason 문장이
// "[COMPANY_1]의 정산 배치에서…" 처럼 그 토큰을 그대로 인용할 수 있다
// (extract-prompt.ts EXTRACT_SYSTEM이 토큰을 "그대로 둔다"고 명시적으로 지시한다 —
// 엣지케이스가 아니라 기대된 출력 모양이다). dictOf가 만드는 토큰↔실제 용어 대응은
// project.maskDecisions의 결정 순서에서 매번 새로 계산되는 값이다(위 dict 주석 참조) —
// 한 번 되돌리기를 누르면 그 뒤 같은 kind의 번호가 당겨져 옛 토큰 문자열이 가리키던
// 대상이 바뀐다. evidence로 영속화되는 텍스트에 이 토큰이 살아 있으면, 그 순간의
// 배정을 문자열로 고정해버려서 나중에 다른 결정을 되돌렸을 때 의미가 어긋난 채로
// 저장 데이터에 영구히 남는다(내보내기 JSON에 노출되고, ProjectForm이 편집마다
// 그대로 재저장한다). 저장 전에 토큰을 중화한다.
const MASK_TOKEN_RE = /\[[A-Z]+_\d+\]/g

function stripMaskTokens(text: string): string {
  return text.replace(MASK_TOKEN_RE, '(가려진 항목)')
}

interface MaskPanelProps {
  project: Project
  nodes: GraphNode[]
}

// 저장 실패 메시지는 그 실패를 낳은 결정(text)에 묶여 있다 — 관계없는 다른 결정이
// 성공했다고 해서 지우면 안 된다(review round 2 finding 1). 같은 text에 대한 쓰기가
// 나중에 실제로 반영됐을 때만 지운다.
interface WriteError {
  text: string
  message: string
}

export function MaskPanel({ project, nodes }: MaskPanelProps) {
  const upsertProject = useResumeStore((s) => s.upsertProject)
  const pendingWrites = useResumeStore((s) => s.pendingWrites)
  const [writeError, setWriteError] = useState<WriteError | null>(null)
  // AI 추출 배너는 writeError와 다른 상태다 — writeError는 마스킹 결정 저장에 묶여
  // 있고(text별), 이건 추출 요청 자체의 결과다. 섞으면 결정 저장 실패가 추출 배너를
  // 지우거나 그 반대가 되는 혼선이 생긴다.
  const [extractBusy, setExtractBusy] = useState(false)
  const [extractBanner, setExtractBanner] = useState<string | null>(null)

  const neverMask = useMemo(() => buildNeverMask(nodes), [nodes])
  const gate = useMemo(
    () => maskGate(project.narrative, project.maskDecisions, neverMask),
    [project.narrative, project.maskDecisions, neverMask],
  )
  // dict가 주는 토큰 문자열([COMPANY_1] 등)은 렌더 시점에 project.maskDecisions
  // 순서로부터 매번 새로 계산된다 — 절대 어딘가에 저장해 재사용하면 안 된다.
  // 중간 결정을 되돌리면(undo) 그 뒤 항목들의 번호가 당겨진다(mask.ts의 buildMaskDict
  // 주석 참조 — 번호를 촘촘히 채우는 게 의도된 동작이다). Task 8이 LLM 사유 등을 이
  // 토큰 문자열과 함께 저장하면, 나중에 다른 항목이 되돌려졌을 때 저장된 문자열이
  // 가리키는 항목이 바뀌어 있을 수 있다 — 토큰은 항상 이 dict에서 그 자리에서만 읽어야
  // 한다.
  const dict = useMemo(() => dictOf(project.maskDecisions), [project.maskDecisions])

  // 미리보기는 전송 경로 그 자체를 부른다. 별도 조립을 하면 언젠가 둘이 갈라진다.
  // throw는 실패가 아니라 정보다 — 왜 아직 보낼 수 없는지가 곧 메시지다.
  const preview = useMemo(() => {
    try { return { ok: true as const, payload: buildExtractPayload(project, nodes) } }
    catch (e) { return { ok: false as const, message: e instanceof Error ? e.message : String(e) } }
  }, [project, nodes])

  // base는 이 함수를 만든 렌더의 `project` prop이 아니라 호출 시점에 store에서 직접
  // 읽는다(review round 2 finding 1) — 두 결정을 연달아 클릭하면(가가 → 나나, 첫 쓰기가
  // 끝나기 전에) 둘 다 같은 렌더의 `project.maskDecisions`(예전 값)를 base로 삼아 서로의
  // 결정을 덮어써 하나를 잃는다. store에서 다시 읽으면 앞선 클릭의 동기 `set()`이 이미
  // 반영된 뒤이므로 잃지 않는다.
  //
  // 성공 여부는 upsertProject의 반환값(PersistResult)의 `ok`로 직접 판정한다.
  // `reason`('locked' | 'disk')이 원인을 구분해 주지만, 이 컴포넌트는 원인별로 다른 문구를
  // 보여주지 않고 `result.error`를 그대로 띄우면 충분하므로 여기서는 쓰지 않는다
  // (review round 1 finding 6 — 이전 주석은 "ok 하나로 원인까지 구별된다"고 썼는데, 그건
  // 틀린 말이었다: boolean 하나로는 원인을 구별할 수 없다. store가 실제로 `reason`을
  // 반환값에 담도록 고쳤다).
  //
  // 같은 텍스트에 대한 기존 결정은 덮어쓴다(추가하지 않는다) — UI 클릭 경로로는 이
  // 후보가 이미 결정된 상태면 undecided 목록에서 사라져 버튼 자체가 없어지므로 이
  // 필터가 실제로 클릭 연타에서 발동할 일은 없다. 이 필터가 지키는 것은 가져온/이전
  // 형식의 저장 데이터에 같은 text가 중복으로 이미 들어 있는 경우다 — 그런 중복은
  // dictOf의 종류별 순번을 밀리게 하고 결정 목록의 React key(`d.text`)도 충돌시킨다.
  const persist = async (
    text: string,
    buildNext: (base: MaskDecision[]) => MaskDecision[],
  ): Promise<void> => {
    const base = useResumeStore.getState().projects.find((p) => p.id === project.id)
    if (!base) {
      // 저장하려는 사이에 프로젝트 자체가 삭제됐다 — ProjectForm의 "이미 삭제됨" 가드와
      // 같은 처지다. 새로 만들 근거(base)가 없으니 쓰지 않는다.
      setWriteError({ text, message: '이 프로젝트는 삭제되어 결정을 저장할 수 없습니다.' })
      return
    }
    const next = buildNext(base.maskDecisions)
    const result = await upsertProject({ ...base, maskDecisions: next, updatedAt: new Date().toISOString() })

    if (!result.ok) {
      setWriteError({ text, message: result.error })
      return
    }
    // 이 쓰기가 가리키던 실패만 지운다 — 관계없는 다른 결정이 그 사이 성공했다고 해서
    // 지우면(무조건 setWriteError(null)) 진짜 실패한 메시지가 조용히 사라진다.
    setWriteError((cur) => (cur && cur.text === text ? null : cur))
  }

  const decide = (text: string, kind: CandidateKind, mask: boolean): void => {
    void persist(text, (base) => [...base.filter((d) => d.text !== text), { text, kind, mask }])
  }

  const undo = (text: string): void => {
    void persist(text, (base) => base.filter((d) => d.text !== text))
  }

  // requestExtract는 Promise<ExtractOutcome>로 선언돼 있지만 실제로 reject할 수 있다 —
  // 마스킹 게이트(buildExtractPayload)가 미확정 후보를 발견하면 그건 Outcome이 아니라
  // 불변식 위반이라 throw로 온다(extract.ts 주석 참조). 이 try는 그 호출 하나만
  // 감싼다 — UI 클릭 경로로는 사실 도달 불가능하다(버튼은 preview.ok일 때만 뜨고,
  // requestExtract가 같은 project/nodes로 같은 게이트를 다시 돈다). 그래도 방어적으로
  // 남겨둔다: 원본 예외 메시지를 그대로 보여준다 — 왜 못 보내는지가 곧 메시지라는 이
  // 컴포넌트의 원칙(위 preview 주석 참조)을 따른다(review round 1 finding 2).
  //
  // 이 try를 mergeLlm/upsertProject까지 넓히면 안 된다 — 넓혔던 round 0 구현에서
  // mergeLlm이 던진 TypeError(`llm.nodeIds is not iterable`)가 그대로 배너에 떠서
  // "한도 초과" 안내를 지워버린 게 실제로 재현됐다. 그 아래는 별도 try로 감싸
  // 예기치 못한 예외는 콘솔에만 원문을 남기고 화면에는 번역된 일반 문구를 보인다.
  const runExtract = async (): Promise<void> => {
    setExtractBusy(true)
    setExtractBanner(null)
    let out: ExtractOutcome
    try {
      out = await requestExtract(project, nodes)
    } catch (e) {
      setExtractBanner(e instanceof Error ? e.message : String(e))
      setExtractBusy(false)
      return
    }
    try {
      if (!out.ok) {
        setExtractBanner({
          rate_limited: '오늘 AI 사용 한도를 다 썼습니다. 지도는 로컬 매칭으로 이미 그려져 있습니다.',
          unauthenticated: 'AI 추출은 로그인이 필요합니다.',
          extract_error: 'AI 추출에 실패했습니다.',
          network: '네트워크에 연결할 수 없습니다.',
        }[out.reason])
        return
      }
      // base는 요청을 보낸 렌더의 `project` prop이 아니라 응답이 온 시점에 store에서
      // 다시 읽는다(review round 1 finding 1). requestExtract는 네트워크 왕복 — 수 초가
      // 걸릴 수 있고, 그 사이 사용자는 목록으로 돌아가 이 프로젝트를 삭제하거나
      // 편집(서술문 수정, 새 마스킹 결정)할 수 있다. 캡처된 prop을 base로 쓰면 그
      // 편집이나 삭제가 이 쓰기에 덮여 조용히 되돌아간다 — persist()가 이미 같은
      // 이유로 store에서 다시 읽는 것과 같은 문제, 같은 해법이다.
      const base = useResumeStore.getState().projects.find((p) => p.id === project.id)
      if (!base) {
        setExtractBanner('이 프로젝트는 삭제되어 추출 결과를 저장할 수 없습니다.')
        return
      }
      // reasons에 마스킹 토큰이 섞여 있을 수 있다(파일 상단 stripMaskTokens 주석 참조) —
      // 저장하기 전에 중화한다. mergeLlm의 계약(반환 형태)은 그대로 두고, 이 함수가
      // 이미 소유한 입력 객체만 손본다.
      const reasons = Object.fromEntries(
        Object.entries(out.reasons).map(([id, reason]) => [id, stripMaskTokens(reason)]),
      )
      const merged = mergeLlm(base.matches, { nodeIds: out.nodeIds, reasons }, nodes)
      // upsertProject는 Promise<void>가 아니다(Task 5b) — 메모리엔 반영돼도 디스크
      // 쓰기가 실패할 수 있고, 그걸 void로 무시하면 사용자는 지도가 저장됐다고
      // 오해한다.
      const result = await upsertProject({ ...base, matches: merged.matches, updatedAt: new Date().toISOString() })
      if (!result.ok) {
        setExtractBanner(result.error)
        return
      }
      if (merged.dropped > 0) {
        setExtractBanner(`AI가 준 개념 ${merged.dropped}개는 그래프에 없어 버렸습니다.`)
      }
    } catch (e) {
      // mergeLlm/upsertProject는 정상 동작 중엔 던지지 않는다 — 던지면 예기치 못한
      // 버그다. 원본 예외를 사용자에게 그대로 보이면 내부 구현 세부사항이 새므로
      // 콘솔에만 남기고 화면에는 번역된 일반 문구를 쓴다(review round 1 finding 2).
      console.error('MaskPanel: AI 추출 결과 처리 중 예기치 않은 예외', e)
      setExtractBanner('AI 추출 결과를 처리하는 중 오류가 발생했습니다.')
    } finally {
      setExtractBusy(false)
    }
  }

  return (
    <div className="mp">
      {gate.undecided.length > 0 && (
        <div className="mp-undecided">
          <h3>결정이 필요한 후보</h3>
          <ul className="mp-candidates">
            {gate.undecided.map((c) => (
              <li key={c.text} className="mp-candidate">
                <span className="mp-candidate-text">{c.text}</span>
                <div className="mp-candidate-actions">
                  <button type="button" onClick={() => decide(c.text, c.kind, true)}>
                    {`${c.text} 가리기`}
                  </button>
                  <button type="button" onClick={() => decide(c.text, c.kind, false)}>
                    {`${c.text} 남기기`}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {project.maskDecisions.length > 0 && (
        <div className="mp-decided">
          <h3>결정된 항목</h3>
          <ul className="mp-decisions">
            {project.maskDecisions.map((d) => (
              <li key={d.text} className="mp-decision">
                <span className="mp-decision-text">{d.text}</span>
                <span className="mp-decision-token">{d.mask ? dict[d.text] : '남김'}</span>
                <button type="button" onClick={() => undo(d.text)}>되돌리기</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {writeError && <p className="mp-write-error">{writeError.message}</p>}

      <div className="mp-preview">
        {preview.ok ? (
          <details open>
            <summary>전송 전문 미리보기</summary>
            <pre className="mp-preview-pre" data-testid="mask-preview">
              {preview.payload.maskedNarrative}
            </pre>
            {/* stack·lifecycle은 개수가 아니라 값 그대로 보여준다(review round 4 finding 2).
                이 화면은 "전송 전문 미리보기"이고, mask.ts는 실제 안전 보증을 바로 이
                미리보기에 걸고 있다 — 그런데 stack은 마스킹하지 않고 원문 그대로 전송된다
                (extractPayload.ts의 필드 주석: 기술 용어는 추출의 핵심 신호다). "기술스택
                2개"만 보여주면 사용자는 기기를 떠난 문자열을 끝까지 보지 못한 채 미리보기를
                승인하게 된다. catalog만 개수로 남긴다 — 100개가 넘는 공개 그래프 id라
                나열하면 정작 중요한 부분이 묻힌다. */}
            <ul className="mp-preview-stats">
              <li>
                기술스택: {preview.payload.stack.length > 0 ? preview.payload.stack.join(', ') : '없음'}
              </li>
              <li>
                담당 단계: {preview.payload.lifecycle.length > 0
                  ? preview.payload.lifecycle.map((s) => STAGE_LABELS[s]).join(', ')
                  : '없음'}
              </li>
              <li>개념 목록 {preview.payload.catalog.length}개(공개 그래프 id)</li>
            </ul>
            <p className="mp-preview-note">
              기술스택은 추출의 핵심 신호라서 마스킹하지 않고 위 문자열 그대로 전송됩니다.
            </p>
            {/* 이 버튼은 미리보기가 안전하다고 보여줄 때만 뜬다 — 미리보기가 곧 전송
                본문이므로, 미리보기가 없다는 건 아직 보낼 수 없다는 뜻이다. */}
            {/* pendingWrites도 함께 본다(review round 1 minor) — 마스킹 결정 저장이
                아직 큐에서 도는 중에 추출을 누르면, 위 base 재조회가 그 쓰기의 결과를
                못 보고 낡은 base로 병합할 창이 그만큼 넓어진다. 완전히 없애는 건 아니지만
                (base 재조회 자체가 그 창을 좁히는 실질적 방어다), 값싼 추가 방어다. */}
            <button
              type="button"
              className="mp-extract-btn"
              onClick={() => void runExtract()}
              disabled={extractBusy || pendingWrites > 0}
            >
              {extractBusy ? 'AI 개념 추출 중…' : 'AI 개념 추출'}
            </button>
            {extractBanner && <p className="mp-extract-banner">{extractBanner}</p>}
          </details>
        ) : (
          <p className="mp-preview-blocked">{preview.message}</p>
        )}
      </div>
    </div>
  )
}
