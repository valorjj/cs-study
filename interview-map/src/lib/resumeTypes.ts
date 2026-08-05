// 이력 기능의 타입 경계. store와 lib이 서로를 import하지 않도록 타입만 여기 모은다.

// 단일 백엔드 개발자가 실제로 담당하는 생애주기 단계. spec B의 출제 범위가 된다.
export type Stage =
  | 'architecture' | 'mvp' | 'feature' | 'cicd'
  | 'traffic' | 'tx' | 'qa' | 'ops'

export const STAGES: readonly Stage[] = [
  'architecture', 'mvp', 'feature', 'cicd', 'traffic', 'tx', 'qa', 'ops',
]

export const STAGE_LABELS: Record<Stage, string> = {
  architecture: '아키텍처 설계',
  mvp: 'MVP 구축',
  feature: '기능 개발',
  cicd: 'CI/CD',
  traffic: '트래픽 대응',
  tx: '트랜잭션 관리',
  qa: 'QA',
  ops: '운영·장애 대응',
}

// 개념이 어떤 경로로 매칭됐는지. llm이 가장 값지다(로컬이 못 잡는 암시 개념).
export type MatchVia = 'chip' | 'keyword' | 'llm'

export interface Match {
  nodeId: string
  via: MatchVia
  evidence: string   // 칩 이름, 매칭된 토큰, 또는 LLM이 준 사유
}

export interface Project {
  id: string
  name: string
  period: string
  role: string
  stack: string[]                    // 기술스택 칩. 마스킹 대상이 아니다
  lifecycle: Stage[]
  narrative: string                  // 자유 서술 원문 (평문, 금고 안에만 존재)
  maskDict: Record<string, string>   // "우리회사" → "[COMPANY_1]"
  matches: Match[]
  updatedAt: string                  // ISO8601
}

export interface VaultPayload {
  version: 1
  projects: Project[]
}
