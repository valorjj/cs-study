import { useEffect, useRef } from 'react'
import { useAuth } from './useAuth'
import {
  useGraphStore, PROGRESS_KEY, QUIZSTATS_KEY, SRS_KEY,
  readGuestStudied, readGuestQuizStats, readGuestSrs,
  type QuizStat,
} from '../store/graphStore'
import { loadStudied, saveStudied, loadQuizStats, saveQuizStats, loadSrs, saveSrs } from '../lib/cloudSync'
import type { SrsState } from '../lib/srs'

// Single persistence orchestrator for studiedIds + quizStats. Guest mode and
// logged-in mode keep COMPLETELY SEPARATE progress — switching account never
// merges the two:
//   - Guest (logged out): state is persisted to localStorage only.
//   - Logged in: state mirrors the user's cloud row; localStorage is left
//     untouched so the guest copy is preserved and restored on logout.
//   - On login  → load cloud and REPLACE the in-memory state (no merge).
//   - On logout → restore the preserved guest snapshot.
// Works in guest-only builds too (Supabase unconfigured → user always null →
// the guest/localStorage branch runs; the cloud calls are no-ops).
export function useCloudSync(): void {
  const { user } = useAuth()
  const setStudiedIds = useGraphStore((s) => s.setStudiedIds)
  const setQuizStats = useGraphStore((s) => s.setQuizStats)
  const studiedIds = useGraphStore((s) => s.studiedIds)
  const quizStats = useGraphStore((s) => s.quizStats)
  const setSrs = useGraphStore((s) => s.setSrs)
  const srs = useGraphStore((s) => s.srs)

  // Current user, read from the write-through effects. Those effects deliberately
  // do NOT depend on `user`, so a login/logout alone can't fire them with the
  // outgoing mode's stale value — only an actual data change triggers a write.
  const userRef = useRef(user)
  userRef.current = user
  // Guest snapshot to restore on logout; kept current on every guest-mode write.
  const guestStudiedRef = useRef<string[]>(readGuestStudied())
  const guestQuizRef = useRef<Record<string, QuizStat>>(readGuestQuizStats())
  const guestSrsRef = useRef<SrsState>(readGuestSrs())
  // Gates write-through until the initial load/restore for the current mode is done.
  const readyRef = useRef(false)
  // Whether the previous state was logged-in — so we only restore guest on a
  // real login→logout transition, not on the initial guest mount.
  const wasLoggedInRef = useRef(false)

  // Mode switch. On login: load cloud, replace (no merge). On logout: restore the
  // guest snapshot. readyRef is dropped first so no stale write races the switch.
  useEffect(() => {
    readyRef.current = false
    if (!user) {
      if (wasLoggedInRef.current) {
        setStudiedIds(guestStudiedRef.current)
        setQuizStats(guestQuizRef.current)
        setSrs(guestSrsRef.current)
        wasLoggedInRef.current = false
      }
      readyRef.current = true
      return
    }
    let cancelled = false
    void (async () => {
      const [cloudStudied, cloudStats, cloudSrs] = await Promise.all([
        loadStudied(user.id),
        loadQuizStats(user.id),
        loadSrs(user.id),
      ])
      if (cancelled) return
      setStudiedIds(cloudStudied ?? [])
      setQuizStats(cloudStats ?? {})
      setSrs(cloudSrs ?? {})
      wasLoggedInRef.current = true
      readyRef.current = true
    })()
    return () => { cancelled = true }
  }, [user, setStudiedIds, setQuizStats, setSrs])

  // Write-through on data change. Keyed on the data only (user via ref) so a mode
  // switch fires this exactly once — with the new mode's value set by the effect
  // above — never with the outgoing value.
  useEffect(() => {
    if (!readyRef.current) return
    const u = userRef.current
    if (u) { void saveStudied(u.id, studiedIds); return }
    guestStudiedRef.current = studiedIds
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(studiedIds)) } catch { /* ignore */ }
  }, [studiedIds])

  useEffect(() => {
    if (!readyRef.current) return
    const u = userRef.current
    if (u) { void saveQuizStats(u.id, quizStats); return }
    guestQuizRef.current = quizStats
    try { localStorage.setItem(QUIZSTATS_KEY, JSON.stringify(quizStats)) } catch { /* ignore */ }
  }, [quizStats])

  useEffect(() => {
    if (!readyRef.current) return
    const u = userRef.current
    if (u) { void saveSrs(u.id, srs); return }
    guestSrsRef.current = srs
    try { localStorage.setItem(SRS_KEY, JSON.stringify(srs)) } catch { /* ignore */ }
  }, [srs])
}
