# Supabase Auth — Phase 1 (Auth Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Users can sign in/out with Google/GitHub and see their identity; guest mode is unchanged; the app runs guest-only and never crashes when Supabase env is unset.

**Architecture:** A guest-safe Supabase client (`null` without env), a `useAuth` hook wrapping `supabase.auth`, and an `AuthButton` in the top-right (hidden when unconfigured). No cloud data yet (Phase 2).

**Tech Stack:** Vite + React SPA, `@supabase/supabase-js`, zustand (existing), Vitest.

## Global Constraints
- Korean UI copy + English code (CLAUDE.md).
- **No secrets in the repo.** `.env.local` is gitignored (`*.local`); only `.env.example` (names only) is committed. Only the anon key + OAuth client ids ever reach the client.
- App MUST run guest-only when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are unset (client `= null`, AuthButton hidden). Never crash.
- Public repo commit rules: email `30681841+valorjj@users.noreply.github.com`, Co-Authored-By.

---

### Task 1: Supabase client (guest-safe) + setup docs

**Files:**
- Add dep: `@supabase/supabase-js`
- Create: `interview-map/src/lib/supabase.ts`
- Test: `interview-map/src/lib/supabase.test.ts`
- Create: `interview-map/.env.example`
- Create: `docs/SUPABASE_SETUP.md`

**Interfaces:**
- Produces: `createSupabase(url?: string, anon?: string): SupabaseClient | null` and `export const supabase: SupabaseClient | null`.

- [ ] **Step 1: Install dependency**

Run: `cd interview-map && npm install @supabase/supabase-js`
Expected: added to `dependencies`.

- [ ] **Step 2: Write the failing test** — `interview-map/src/lib/supabase.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createSupabase } from './supabase'

describe('createSupabase', () => {
  it('returns null when url or anon key is missing (guest-only mode)', () => {
    expect(createSupabase(undefined, undefined)).toBeNull()
    expect(createSupabase('https://x.supabase.co', undefined)).toBeNull()
    expect(createSupabase('', '')).toBeNull()
  })
  it('returns a client when both are provided', () => {
    const c = createSupabase('https://x.supabase.co', 'anon-key')
    expect(c).not.toBeNull()
    expect(typeof c!.auth.signInWithOAuth).toBe('function')
  })
})
```

- [ ] **Step 3: Run — expect fail.** `cd interview-map && npx vitest run src/lib/supabase.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement** — `interview-map/src/lib/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Returns a client only when both credentials exist; otherwise null so the
// whole app degrades to guest-only (localStorage) mode and never crashes.
export function createSupabase(url?: string, anon?: string): SupabaseClient | null {
  if (!url || !anon) return null
  return createClient(url, anon)
}

export const supabase = createSupabase(
  import.meta.env.VITE_SUPABASE_URL as string | undefined,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
)
```

- [ ] **Step 5: Run — expect pass.** `cd interview-map && npx vitest run src/lib/supabase.test.ts` → PASS.

- [ ] **Step 6: Create `interview-map/.env.example`:**

```
# Copy to .env.local (gitignored) and fill from Supabase → Project Settings → API.
# The anon key is publishable (safe in shipped JS); RLS protects data.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 7: Create `docs/SUPABASE_SETUP.md`:**

````markdown
# Supabase Setup

The app runs in **guest mode** (localStorage) with no setup. To enable
Google/GitHub login + cross-device sync, do this once.

## 1. Create a project
supabase.com → New project (Region: Northeast Asia (Seoul) 권장). Note the
Project URL and `anon` public key (Project Settings → API).

## 2. Enable OAuth providers (Authentication → Providers)
For **GitHub** and **Google**, create an OAuth app and paste its client id/secret:

- GitHub: github.com/settings/developers → New OAuth App → Authorization
  callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
- Google: Google Cloud Console → APIs & Services → Credentials → OAuth client
  (Web) → Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`

Provider secrets live in Supabase only — never commit them.

## 3. URL configuration (Authentication → URL Configuration)
- Site URL: `http://localhost:5173` (dev). Add the deployed URL later.
- Redirect URLs: add `http://localhost:5173/**` (and the deployed URL).

## 4. Environment
Copy `interview-map/.env.example` → `interview-map/.env.local` and fill:
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```
Restart `npm run dev`. The 로그인 button appears when these are set.

## 5. Database (Phase 2 — for cross-device sync)
Run in the SQL editor:
```sql
create table public.user_state (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  studied_ids text[]       not null default '{}',
  quiz_stats  jsonb        not null default '{}',
  updated_at  timestamptz  not null default now()
);
alter table public.user_state enable row level security;
create policy "own row - select" on public.user_state for select using (auth.uid() = user_id);
create policy "own row - insert" on public.user_state for insert with check (auth.uid() = user_id);
create policy "own row - update" on public.user_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
````

- [ ] **Step 8: Commit**

```bash
git add interview-map/package.json interview-map/package-lock.json interview-map/src/lib/supabase.ts interview-map/src/lib/supabase.test.ts interview-map/.env.example docs/SUPABASE_SETUP.md
git commit -m "feat: guest-safe Supabase client + setup docs"
```

---

### Task 2: useAuth hook

**Files:**
- Create: `interview-map/src/hooks/useAuth.ts`

**Interfaces:**
- Consumes: `supabase` from `../lib/supabase`.
- Produces: `type AuthProvider = 'github' | 'google'`; `useAuth(): { user: User | null; loading: boolean; enabled: boolean; signIn: (p: AuthProvider) => void; signOut: () => void }`.

- [ ] **Step 1: Implement** — `interview-map/src/hooks/useAuth.ts`:

```ts
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type AuthProvider = 'github' | 'google'

// Wraps supabase.auth. All actions no-op when Supabase is unconfigured
// (`supabase === null`), so callers work unchanged in guest-only mode.
export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState<boolean>(!!supabase)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = (provider: AuthProvider) => {
    supabase?.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
  }
  const signOut = () => { supabase?.auth.signOut() }

  return { user, loading, enabled: !!supabase, signIn, signOut }
}
```

- [ ] **Step 2: Typecheck** — `cd interview-map && npx tsc --noEmit` → no errors.

- [ ] **Step 3: Commit**

```bash
git add interview-map/src/hooks/useAuth.ts
git commit -m "feat: useAuth hook (guest-safe supabase.auth wrapper)"
```

---

### Task 3: AuthButton UI + App wiring

**Files:**
- Create: `interview-map/src/components/AuthButton.tsx`
- Create: `interview-map/src/components/AuthButton.css`
- Modify: `interview-map/src/App.tsx`

**Interfaces:**
- Consumes: `useAuth`, `AuthProvider`.

- [ ] **Step 1: Create `AuthButton.tsx`:**

```tsx
import { useState } from 'react'
import { LuLogIn, LuLogOut, LuGithub } from 'react-icons/lu'
import { useAuth } from '../hooks/useAuth'
import './AuthButton.css'

// Top-right auth control. Hidden entirely when Supabase is unconfigured
// (guest-only build). Guest → 로그인 popover (GitHub/Google); signed in → identity + 로그아웃.
export function AuthButton() {
  const { user, enabled, signIn, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  if (!enabled) return null

  if (user) {
    const meta = user.user_metadata as { user_name?: string; name?: string; avatar_url?: string }
    const label = meta.user_name || meta.name || user.email || '사용자'
    return (
      <div className="auth">
        <button className="auth-user" onClick={() => setOpen((o) => !o)} title={label}>
          {meta.avatar_url
            ? <img className="auth-avatar" src={meta.avatar_url} alt="" />
            : <span className="auth-avatar auth-avatar-fallback">{label[0]?.toUpperCase()}</span>}
          <span className="auth-name">{label}</span>
        </button>
        {open && (
          <div className="auth-pop">
            <button className="auth-opt" onClick={() => { signOut(); setOpen(false) }}>
              <LuLogOut size={15} /> 로그아웃
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="auth">
      <button className="auth-login" onClick={() => setOpen((o) => !o)}>
        <LuLogIn size={15} /> 로그인
      </button>
      {open && (
        <div className="auth-pop">
          <button className="auth-opt" onClick={() => signIn('github')}><LuGithub size={15} /> GitHub로 계속</button>
          <button className="auth-opt" onClick={() => signIn('google')}><span className="auth-g">G</span> Google로 계속</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `AuthButton.css`:**

```css
.auth { position: fixed; top: 14px; right: 62px; z-index: 30; font-family: system-ui, sans-serif; }
.auth-login, .auth-user { display: inline-flex; align-items: center; gap: 7px; cursor: pointer;
  background: var(--bg-panel); border: 1px solid var(--border); color: var(--text);
  border-radius: 999px; padding: 7px 13px; font-size: 13px; font-weight: 600; }
.auth-login:hover, .auth-user:hover { border-color: var(--accent); color: var(--text-strong); }
.auth-avatar { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; }
.auth-avatar-fallback { display: flex; align-items: center; justify-content: center;
  background: var(--accent); color: var(--node-studied-text); font-size: 11px; font-weight: 800; }
.auth-name { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.auth-pop { position: absolute; top: calc(100% + 6px); right: 0; display: flex; flex-direction: column;
  min-width: 168px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px;
  padding: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
.auth-opt { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  background: none; border: none; color: var(--text); border-radius: 8px; padding: 9px 11px;
  cursor: pointer; font-size: 13px; }
.auth-opt:hover { background: var(--bg-elev); color: var(--text-strong); }
.auth-g { width: 15px; text-align: center; font-weight: 800; color: #4285f4; }

@media (max-width: 768px) {
  .auth { top: 10px; right: 58px; }
  .auth-name { display: none; }
}
```

- [ ] **Step 3: Wire into `App.tsx`** — import and render next to `ThemeSwitcher`:

Add import:
```tsx
import { AuthButton } from './components/AuthButton'
```
Render it right before `<ThemeSwitcher />`:
```tsx
      <AuthButton />
      <ThemeSwitcher />
```

- [ ] **Step 4: Typecheck + full tests** — `cd interview-map && npx tsc --noEmit && npx vitest run` → no type errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/components/AuthButton.tsx interview-map/src/components/AuthButton.css interview-map/src/App.tsx
git commit -m "feat: AuthButton (login/logout, GitHub/Google), hidden in guest-only build"
```

---

## Final verification (verify skill — real browser)

- **Guest-only (no env):** `npm run dev` → app runs; `.auth` element absent; graph/list/quiz/path all work; no console errors. (This is fully verifiable without a Supabase project.)
- **Configured (needs your Supabase project + `.env.local`):** 로그인 button appears → GitHub/Google popover → OAuth round-trip → identity + avatar shown → 로그아웃 returns to guest. (Verified once your env is set.)
- Then `superpowers:finishing-a-development-branch`.

> Note: full OAuth verification requires the Supabase setup in `docs/SUPABASE_SETUP.md`. The guest-only path is verified now; the configured path is verified after your env is in place.
