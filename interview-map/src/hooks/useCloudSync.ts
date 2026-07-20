import { useEffect, useRef } from 'react'
import { useAuth } from './useAuth'
import { useGraphStore } from '../store/graphStore'
import { loadStudied, saveStudied, mergeStudied } from '../lib/cloudSync'

// Syncs studiedIds with the cloud for the logged-in user. No-op when logged out
// or Supabase is unconfigured. `readyRef` gates the debounced save so it cannot
// overwrite cloud data before the initial load+merge finishes.
export function useCloudSync(): void {
  const { user } = useAuth()
  const studiedIds = useGraphStore((s) => s.studiedIds)
  const setStudiedIds = useGraphStore((s) => s.setStudiedIds)
  const readyRef = useRef(false)

  // On sign-in (user change): load cloud → merge with local → upload if needed.
  useEffect(() => {
    readyRef.current = false
    if (!user) return
    let cancelled = false
    void (async () => {
      const cloud = await loadStudied(user.id)
      if (cancelled) return
      const local = useGraphStore.getState().studiedIds
      if (cloud === null) {
        await saveStudied(user.id, local) // first login → migrate local up
      } else {
        const merged = mergeStudied(local, cloud)
        if (merged.length !== local.length) setStudiedIds(merged)
        if (merged.length !== cloud.length) await saveStudied(user.id, merged)
      }
      if (!cancelled) readyRef.current = true
    })()
    return () => { cancelled = true }
  }, [user, setStudiedIds])

  // While signed in and past the initial merge: debounce-save on every change.
  useEffect(() => {
    if (!user || !readyRef.current) return
    const t = setTimeout(() => { void saveStudied(user.id, studiedIds) }, 800)
    return () => clearTimeout(t)
  }, [studiedIds, user])
}
