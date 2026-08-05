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
import type { CandidateKind, MaskDecision, Project } from '../lib/resumeTypes'
import type { GraphNode } from '../graph/types'
import './MaskPanel.css'

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
  const [writeError, setWriteError] = useState<WriteError | null>(null)

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

  // upsertProject는 절대 throw하지 않는다 — 금고가 잠겨 있으면 store.error만 세팅하고
  // 조용히 리턴한다. 그 신호를 여기서 직접 확인하지 않으면(그리고 store.error를 그대로
  // 읽지도 않으면 — stale할 수 있다) 저장이 실패해도 사용자는 결정이 반영된 줄 안다.
  //
  // base는 이 함수를 만든 렌더의 `project` prop이 아니라 호출 시점에 store에서 직접
  // 읽는다(review round 2 finding 1) — 두 결정을 연달아 클릭하면(가가 → 나나, 첫 쓰기가
  // 끝나기 전에) 둘 다 같은 렌더의 `project.maskDecisions`(예전 값)를 base로 삼아 서로의
  // 결정을 덮어써 하나를 잃는다. store에서 다시 읽으면 앞선 클릭의 동기 `set()`이 이미
  // 반영된 뒤이므로 잃지 않는다.
  //
  // 성공 여부도 우리가 새로 민 updatedAt 타임스탬프가 아니라, 실제로 원하던 상태
  // (이 text에 대해 mask값의 결정이 있는지/없는지)가 store에 있는지로 직접 확인한다.
  // 타임스탬프는 같은 밀리초 안에 여러 호출이 겹치면 충돌해 다른 호출의 쓰기를 "내
  // 쓰기"로 착각하게 만든다(실제로 재현해 확인함 — round 2 보고서 참조).
  //
  // 같은 텍스트에 대한 기존 결정은 덮어쓴다(추가하지 않는다) — UI 클릭 경로로는 이
  // 후보가 이미 결정된 상태면 undecided 목록에서 사라져 버튼 자체가 없어지므로 이
  // 필터가 실제로 클릭 연타에서 발동할 일은 없다. 이 필터가 지키는 것은 가져온/이전
  // 형식의 저장 데이터에 같은 text가 중복으로 이미 들어 있는 경우다 — 그런 중복은
  // dictOf의 종류별 순번을 밀리게 하고 결정 목록의 React key(`d.text`)도 충돌시킨다.
  // 한계: 이 확인은 메모리(store.projects)만 본다. upsertProject는 디스크 쓰기가 실패해도
  // (`writeStoredVault`가 false를 돌려줘도) `set({ projects: next })`을 그 실패보다 먼저
  // 실행해 두므로, 여기서 store를 다시 읽어도 "성공"으로 보인다 — 새로고침하면 사라지는
  // 결정이 조용히 생길 수 있다는 뜻이다. 이건 store 계층의 결함(diskWrite 실패를
  // projects에 반영하지 않음)이라 이 컴포넌트에서 고칠 수 없다 — 별도로 upsertProject
  // 자체의 반환값/롤백을 바꾸는 작업으로 처리된다(Task 4의 ProjectForm도 같은 한계를 가짐).
  const persist = async (
    text: string,
    mask: boolean | null,
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
    await upsertProject({ ...base, maskDecisions: next, updatedAt: new Date().toISOString() })

    const after = useResumeStore.getState().projects.find((p) => p.id === project.id)
    const landed = after !== undefined && (mask === null
      ? !after.maskDecisions.some((d) => d.text === text)
      : after.maskDecisions.some((d) => d.text === text && d.mask === mask))

    if (!landed) {
      setWriteError({ text, message: useResumeStore.getState().error ?? '결정을 저장하지 못했습니다.' })
      return
    }
    // 이 쓰기가 가리키던 실패만 지운다 — 관계없는 다른 결정이 그 사이 성공했다고 해서
    // 지우면(무조건 setWriteError(null)) 진짜 실패한 메시지가 조용히 사라진다.
    setWriteError((cur) => (cur && cur.text === text ? null : cur))
  }

  const decide = (text: string, kind: CandidateKind, mask: boolean): void => {
    void persist(text, mask, (base) => [...base.filter((d) => d.text !== text), { text, kind, mask }])
  }

  const undo = (text: string): void => {
    void persist(text, null, (base) => base.filter((d) => d.text !== text))
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
            <ul className="mp-preview-stats">
              <li>기술스택 {preview.payload.stack.length}개</li>
              <li>담당 단계 {preview.payload.lifecycle.length}개</li>
              <li>개념 목록 {preview.payload.catalog.length}개</li>
            </ul>
          </details>
        ) : (
          <p className="mp-preview-blocked">{preview.message}</p>
        )}
      </div>
    </div>
  )
}
