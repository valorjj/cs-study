import { supabase } from './supabase'

export interface Usage { perMin: number; perHour: number; perDay: number }

// 내 최근 AI 호출 수(= Gemini에 가한 부하). grade_event_counts rpc가 auth.uid() 기준으로 집계.
export async function recentUsage(): Promise<Usage | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('grade_event_counts')
    if (error || !data) return null
    const d = data as { per_min?: number; per_hour?: number; per_day?: number }
    return { perMin: d.per_min ?? 0, perHour: d.per_hour ?? 0, perDay: d.per_day ?? 0 }
  } catch {
    return null
  }
}
