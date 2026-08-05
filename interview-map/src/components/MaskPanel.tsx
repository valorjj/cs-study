// 마스킹 확정 패널. 후보별 가리기/남기기 결정 + 전송 전문 미리보기.
//
// 미리보기는 buildExtractPayload를 직접 불러 그 결과를 그대로 렌더한다. 별도로
// 문자열을 조립하면 언젠가 전송 경로와 갈라지고, 그날 미리보기는 거짓 안전감만
// 주는 장식이 된다. buildExtractPayload가 던지는 예외도 실패가 아니라 정보다 —
// 왜 아직 보낼 수 없는지가 곧 메시지이므로 그대로 보여준다.
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

export function MaskPanel({ project, nodes }: MaskPanelProps) {
  const upsertProject = useResumeStore((s) => s.upsertProject)

  // project.maskDecisions는 마운트 시점의 스냅샷만 초기값으로 쓴다. 이 화면에서
  // 내리는 결정의 진실은 이후로는 이 로컬 상태다 — 바깥(store)이 다른 이유로
  // 리셋되더라도(예: 다른 화면의 동작, 테스트의 직접 setState) 사용자가 이 패널에서
  // 이미 내린 결정이 조용히 되돌아가 화면이 깜빡이듯 undecided로 되돌아가면 안 된다.
  // 영속화는 upsertProject로 그때그때 내보낸다.
  const [decisions, setDecisions] = useState<MaskDecision[]>(project.maskDecisions)

  const current: Project = useMemo(
    () => ({ ...project, maskDecisions: decisions }),
    [project, decisions],
  )

  const neverMask = useMemo(() => buildNeverMask(nodes), [nodes])
  const gate = useMemo(
    () => maskGate(current.narrative, decisions, neverMask),
    [current.narrative, decisions, neverMask],
  )
  const dict = useMemo(() => dictOf(decisions), [decisions])

  // 미리보기는 전송 경로 그 자체를 부른다. 별도 조립을 하면 언젠가 둘이 갈라진다.
  // throw는 실패가 아니라 정보다 — 왜 아직 보낼 수 없는지가 곧 메시지다.
  const preview = useMemo(() => {
    try { return { ok: true as const, payload: buildExtractPayload(current, nodes) } }
    catch (e) { return { ok: false as const, message: e instanceof Error ? e.message : String(e) } }
  }, [current, nodes])

  const decide = (text: string, kind: CandidateKind, mask: boolean): void => {
    const next = [...decisions, { text, kind, mask }]
    setDecisions(next)
    void upsertProject({ ...project, maskDecisions: next })
  }

  const undo = (text: string): void => {
    const next = decisions.filter((d) => d.text !== text)
    setDecisions(next)
    void upsertProject({ ...project, maskDecisions: next })
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

      {decisions.length > 0 && (
        <div className="mp-decided">
          <h3>결정된 항목</h3>
          <ul className="mp-decisions">
            {decisions.map((d) => (
              <li key={d.text} className="mp-decision">
                <span className="mp-decision-text">{d.text}</span>
                <span className="mp-decision-token">{d.mask ? dict[d.text] : '남김'}</span>
                <button type="button" onClick={() => undo(d.text)}>되돌리기</button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
