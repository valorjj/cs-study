import { useEffect, useRef } from 'react'
import { useAuth } from './useAuth'
import { useGraphStore } from '../store/graphStore'
import {
  loadStudied, saveStudied, mergeStudied,
  loadQuizStats, saveQuizStats, mergeQuizStats,
} from '../lib/cloudSync'

// Syncs studiedIds and quizStats with the cloud for the logged-in user. No-op
// when logged out or Supabase is unconfigured. `readyRef` gates the debounced
// saves so they cannot overwrite cloud data before the initial load+merge.
export function useCloudSync(): void {
  const { user } = useAuth()
  const studiedIds = useGraphStore((s) => s.studiedIds)
  const setStudiedIds = useGraphStore((s) => s.setStudiedIds)
  const quizStats = useGraphStore((s) => s.quizStats)
  const setQuizStats = useGraphStore((s) => s.setQuizStats)
  const readyRef = useRef(false)

  // On sign-in (user change): load cloud → merge with local → upload if needed.
  useEffect(() => {
    readyRef.current = false
    if (!user) return
    let cancelled = false
    void (async () => {
      const [cloudStudied, cloudStats] = await Promise.all([
        loadStudied(user.id),
        loadQuizStats(user.id),
      ])
      if (cancelled) return
      const { studiedIds: localStudied, quizStats: localStats } = useGraphStore.getState()

      // studied_ids: set-union (idempotent).
      if (cloudStudied === null) {
        await saveStudied(user.id, localStudied) // first login → migrate local up
      } else {
        const merged = mergeStudied(localStudied, cloudStudied)
        if (merged.length !== localStudied.length) setStudiedIds(merged)
        if (merged.length !== cloudStudied.length) await saveStudied(user.id, merged)
      }

      // quiz_stats: per-domain field-wise max (idempotent). Always push the
      // merged result on login — cheap, and keeps both sides converged.
      if (cloudStats === null) {
        await saveQuizStats(user.id, localStats) // first login → migrate local up
      } else {
        const merged = mergeQuizStats(localStats, cloudStats)
        setQuizStats(merged)
        await saveQuizStats(user.id, merged)
      }

      if (!cancelled) readyRef.current = true
    })()
    return () => { cancelled = true }
  }, [user, setStudiedIds, setQuizStats])

  // While signed in and past the initial merge: debounce-save on every change.
  useEffect(() => {
    if (!user || !readyRef.current) return
    const t = setTimeout(() => { void saveStudied(user.id, studiedIds) }, 800)
    return () => clearTimeout(t)
  }, [studiedIds, user])

  useEffect(() => {
    if (!user || !readyRef.current) return
    const t = setTimeout(() => { void saveQuizStats(user.id, quizStats) }, 800)
    return () => clearTimeout(t)
  }, [quizStats, user])
}
