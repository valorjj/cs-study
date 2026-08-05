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
import type { CandidateKind, Project } from '../lib/resumeTypes'
import type { GraphNode } from '../graph/types'
import './MaskPanel.css'

interface MaskPanelProps {
  project: Project
  nodes: GraphNode[]
}

export function MaskPanel({ project, nodes }: MaskPanelProps) {
  const upsertProject = useResumeStore((s) => s.upsertProject)
  const [writeError, setWriteError] = useState<string | null>(null)

  const neverMask = useMemo(() => buildNeverMask(nodes), [nodes])
  const gate = useMemo(
    () => maskGate(project.narrative, project.maskDecisions, neverMask),
    [project.narrative, project.maskDecisions, neverMask],
  )
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
  // ProjectForm과 같은 방식: 방금 쓴 (id, updatedAt) 조합이 실제로 store에 있는지를
  // 저장 직후 스냅샷으로 확인한다.
  //
  // 같은 텍스트에 대한 기존 결정은 덮어쓴다(추가하지 않는다) — 안 그러면 같은 후보를
  // 두 번 클릭했을 때(또는 가리기→남기기를 빠르게 연타했을 때) 결정 목록에 같은 text가
  // 두 번 들어가고, dictOf가 종류별로 순서대로 번호를 매기므로 뒤 결정들의 토큰 번호가
  // 밀린다.
  const persist = async (text: string, kind: CandidateKind, mask: boolean | null): Promise<void> => {
    const filtered = project.maskDecisions.filter((d) => d.text !== text)
    const next = mask === null ? filtered : [...filtered, { text, kind, mask }]
    const updatedAt = new Date().toISOString()
    await upsertProject({ ...project, maskDecisions: next, updatedAt })
    const saved = useResumeStore
      .getState().projects.some((p) => p.id === project.id && p.updatedAt === updatedAt)
    setWriteError(saved ? null : (useResumeStore.getState().error ?? '결정을 저장하지 못했습니다.'))
  }

  const decide = (text: string, kind: CandidateKind, mask: boolean): void => {
    void persist(text, kind, mask)
  }

  const undo = (text: string, kind: CandidateKind): void => {
    void persist(text, kind, null)
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
                <button type="button" onClick={() => undo(d.text, d.kind)}>되돌리기</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {writeError && <p className="mp-write-error">{writeError}</p>}

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
