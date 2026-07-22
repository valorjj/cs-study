// User-tunable quiz preferences. Device-local (localStorage), NOT cloud-synced —
// these are ergonomics, not learning data. Merged over defaults on read so a
// partial or older stored blob still yields a complete, valid object.
export interface QuizSettings {
  order: 'daily' | 'random' | 'sequential' | 'weak' // 플래시카드 카드 순서
  newCardCap: number   // 하루 새 카드 상한. 0 = 무제한
  gradeButtons: 2 | 3 | 5 // 복습 난이도 버튼 개수
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  order: 'daily',
  newCardCap: 15,
  gradeButtons: 3,
}

export const QUIZSETTINGS_KEY = 'interview-map.quizsettings.v1'

export function readQuizSettings(): QuizSettings {
  try {
    const s = localStorage.getItem(QUIZSETTINGS_KEY)
    if (!s) return { ...DEFAULT_QUIZ_SETTINGS }
    const parsed = JSON.parse(s) as Partial<QuizSettings>
    return { ...DEFAULT_QUIZ_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_QUIZ_SETTINGS }
  }
}
