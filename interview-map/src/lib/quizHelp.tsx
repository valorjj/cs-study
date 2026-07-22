import type { ReactNode } from 'react'
import type { QuizSettings } from './quizSettings'

// Short Korean explanations shown in ℹ️ popovers. Kept as JSX so lists render.
export const ORDER_LABELS: Record<QuizSettings['order'], string> = {
  daily: '날짜 셔플',
  random: '완전 랜덤',
  sequential: '순차',
  weak: '약점·오답 우선',
}

export const MODE_HELP: ReactNode = (
  <ul>
    <li><b>플래시카드</b> — 질문을 보고 스스로 답한 뒤 정답을 확인합니다. “알았음/몰랐음”은 복습 일정에도 반영돼요.</li>
    <li><b>드릴다운</b> — 메인 질문 + 꼬리 질문을 이어서, 면접관이 파고드는 상황을 연습합니다.</li>
    <li><b>복습</b> — 간격 반복(SM-2). 복습할 때가 된 카드와 새 카드를 오늘 분량만큼 뽑아줍니다.</li>
  </ul>
)

export const ORDER_HELP: ReactNode = (
  <ul>
    <li><b>날짜 셔플</b> — 오늘 하루 고정된 랜덤 순서. 새로고침해도 같고, 자정이 지나면 새 순서가 됩니다.</li>
    <li><b>완전 랜덤</b> — 들어올 때마다 새로 섞습니다. “다시 섞기”로 즉시 다시 섞을 수 있어요. 순서 암기를 막습니다.</li>
    <li><b>순차</b> — 노트에 적힌 순서대로. 체계적으로 훑을 때 좋습니다.</li>
    <li><b>약점·오답 우선</b> — 전에 틀린 카드를 먼저, 그다음 정답률이 낮은 도메인 순으로 보여줍니다.</li>
  </ul>
)

export const SRS_HELP = {
  cap: '복습에서 하루에 새로 소개할 카드 수의 상한입니다. 복습할 때가 된(밀린) 카드는 상한과 무관하게 모두 나옵니다.',
  buttons: '복습에서 정답을 확인한 뒤 누르는 난이도 버튼 수입니다. 버튼이 많을수록 SM-2가 다음 복습 간격을 더 세밀하게 조절합니다.',
}
