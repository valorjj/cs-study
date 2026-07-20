# Supabase Auth — Phase 2 (Cloud Sync) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A logged-in user's study progress (`studiedIds`) loads on login, merges with any local guest progress, and persists to the cloud on change; guest mode and the unconfigured build are unchanged.

**Architecture:** A `cloudSync` lib (load/save the `user_state.studied_ids` column + a pure `mergeStudied` union) plus a `useCloudSync()` hook wired in `App`: on sign-in it loads → merges → uploads; while signed in it debounce-saves on change; a readiness gate prevents the debounce from clobbering cloud data before the initial merge completes.

**Tech Stack:** Vite + React SPA, `@supabase/supabase-js`, zustand (existing store), Vitest.

## Global Constraints
- Korean UI copy + English code. No secrets in repo (env only).
- Everything no-ops when `supabase === null` (guest-only build) or when logged out.
- localStorage persistence stays as-is (offline cache); cloud is additive for logged-in users.
- **Sync scope this phase: `studiedIds` only.** `quiz_stats` column exists (default `{}`) and is left untouched (preserved on upsert) — it wires in later when the parked quiz-weak-domains work merges.
- Public repo commit rules: email `30681841+valorjj@users.noreply.github.com`, Co-Authored-By.

## Prerequisite (user-performed, once)
Run the SQL in `docs/SUPABASE_SETUP.md` §5 to create `public.user_state` + RLS
policies. Without it, `loadStudied`/`saveStudied` fail gracefully (return
null / no-op) and the app stays guest-like for the logged-in user.

---

### Task 1: cloudSync lib (`loadStudied`, `saveStudied`, `mergeStudied`)

**Files:**
- Create: `interview-map/src/lib/cloudSync.ts`
- Test: `interview-map/src/lib/cloudSync.test.ts`

**Interfaces:**
- Consumes: `supabase` from `./supabase`.
- Produces:
  - `mergeStudied(local: string[], cloud: string[]): string[]` (pure — union)
  - `loadStudied(userId: string): Promise<string[] | null>` (null = no row yet)
  - `saveStudied(userId: string, studiedIds: string[]): Promise<void>` (upsert)

- [ ] **Step 1: Write the failing test** — `interview-map/src/lib/cloudSync.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mergeStudied } from './cloudSync'

describe('mergeStudied', () => {
  it('unions local and cloud ids without duplicates', () => {
    expect(mergeStudied(['a', 'b'], ['b', 'c']).sort()).toEqual(['a', 'b', 'c'])
  })
  it('handles empty sides', () => {
    expect(mergeStudied([], ['x']).sort()).toEqual(['x'])
    expect(mergeStudied(['y'], []).sort()).toEqual(['y'])
    expect(mergeStudied([], [])).toEqual([])
  })
  it('does not mutate inputs', () => {
    const local = ['a']; const cloud = ['b']
    mergeStudied(local, cloud)
    expect(local).toEqual(['a']); expect(cloud).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run — expect fail.** `cd interview-map && npx vitest run src/lib/cloudSync.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `interview-map/src/lib/cloudSync.ts`:

```ts
import { supabase } from './supabase'

// Pure union of local (guest) and cloud studied ids — no duplicates, no mutation.
export function mergeStudied(local: string[], cloud: string[]): string[] {
  return Array.from(new Set([...cloud, ...local]))
}

// Returns the user's studied ids, or null when there is no row yet (→ migrate
// local up) or Supabase is unconfigured/unreachable.
export async function loadStudied(userId: string): Promise<string[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('user_state')
    .select('studied_ids')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return (data.studied_ids as string[] | null) ?? []
}

// Upsert only studied_ids (+ updated_at); quiz_stats is left untouched.
export async function saveStudied(userId: string, studiedIds: string[]): Promise<void> {
  if (!supabase) return
  await supabase
    .from('user_state')
    .upsert({ user_id: userId, studied_ids: studiedIds, updated_at: new Date().toISOString() })
}
```

- [ ] **Step 4: Run — expect pass.** `cd interview-map && npx vitest run src/lib/cloudSync.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/lib/cloudSync.ts interview-map/src/lib/cloudSync.test.ts
git commit -m "feat: cloudSync lib — load/save studied_ids + pure mergeStudied"
```

---

### Task 2: useCloudSync hook + App wiring

**Files:**
- Create: `interview-map/src/hooks/useCloudSync.ts`
- Modify: `interview-map/src/App.tsx`

**Interfaces:**
- Consumes: `useAuth` (`../hooks/useAuth`), `useGraphStore` (`../store/graphStore`), `loadStudied`/`saveStudied`/`mergeStudied` (`../lib/cloudSync`).
- Produces: `useCloudSync(): void`.

- [ ] **Step 1: Create `interview-map/src/hooks/useCloudSync.ts`:**

```ts
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
```

- [ ] **Step 2: Wire into `App.tsx`** — call the hook alongside the others.

Add import:
```tsx
import { useCloudSync } from './hooks/useCloudSync'
```
Inside `App()` with the other hook calls:
```tsx
  useCloudSync()
```

- [ ] **Step 3: Typecheck + full tests** — `cd interview-map && npx tsc --noEmit && npx vitest run` → no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add interview-map/src/hooks/useCloudSync.ts interview-map/src/App.tsx
git commit -m "feat: useCloudSync — load/merge on login, debounced write-through"
```

---

## Final verification (verify skill)

- **Guest / unconfigured (verifiable now):** with no `.env.local`, `npm run dev`
  → app runs, no `.auth`, all views work, no console errors; `mergeStudied` unit
  tests pass. Nothing about sync fires when logged out.
- **Configured + logged in (user-assisted — needs the SQL run + real OAuth):**
  1. Sign in (guest had some 경로 checks) → row created / local uploaded.
  2. Check/uncheck a concept → after ~1s the `user_state` row's `studied_ids`
     updates (verify in Supabase Table editor).
  3. Sign in on another browser/device → same checks appear (map/list/path badges).
  4. Sign out → local state remains (seamless guest).
- Then `superpowers:finishing-a-development-branch`.

> Real cross-device sync verification requires the `user_state` table (SQL in
> SUPABASE_SETUP.md §5) and an interactive OAuth login, so that part is
> user-assisted; the merge logic and guest/unconfigured paths are verified here.
