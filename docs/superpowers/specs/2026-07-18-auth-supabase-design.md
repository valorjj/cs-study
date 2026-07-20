# Supabase Auth + Guest/Login Sync — Design Spec

**Date:** 2026-07-18
**Status:** Approved (pending user review)

## Goal

Add optional Google/GitHub login so study progress persists per-account and
syncs across devices, while keeping the current localStorage experience as a
zero-friction **guest mode**. No custom backend and no Next.js migration — the
app stays a Vite SPA and uses Supabase (BaaS) for auth + a per-user row.

## Architecture

```
Vite SPA ──(@supabase/supabase-js)──▶ Supabase
                                        ├─ Auth: Google / GitHub OAuth (redirect)
                                        └─ Postgres: user_state (RLS per user)
```

- **Guest mode (default):** all state in localStorage, exactly as today.
- **Login mode:** on sign-in, cloud state is loaded/merged; subsequent changes
  write through to the cloud (debounced); localStorage stays as an offline cache.
- **Sync scope:** study data only — `studiedIds` and `quizStats`. Theme and
  viewMode remain device-local preferences.

## Data model (Supabase)

```sql
create table public.user_state (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  studied_ids text[]       not null default '{}',
  quiz_stats  jsonb        not null default '{}',
  updated_at  timestamptz  not null default now()
);
alter table public.user_state enable row level security;
create policy "own row - select" on public.user_state for select using (auth.uid() = user_id);
create policy "own row - upsert" on public.user_state for insert with check (auth.uid() = user_id);
create policy "own row - update" on public.user_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## Setup (user-performed — cannot be automated from here)

A `docs/SUPABASE_SETUP.md` will spell these out exactly:

1. Create a Supabase project (free tier).
2. **Auth → Providers**: enable **GitHub** and **Google**; paste each provider's
   OAuth client id/secret (created in GitHub Developer Settings / Google Cloud
   console). Provider secrets live in Supabase, **never in this repo**.
3. **Auth → URL config**: set Site URL (`http://localhost:5173` for dev; the
   deployed URL for prod) and add both to the redirect allowlist.
4. Run the SQL above (SQL editor).
5. Copy Project URL + anon key into `interview-map/.env.local` (gitignored):
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```

The anon key is publishable (safe in shipped JS); RLS is what protects data.

## Phase 1 — Auth foundation

**Deliverable:** users can sign in/out with Google/GitHub and see their status;
guest mode is unchanged. No cloud data yet.

- `interview-map/src/lib/supabase.ts`
  - `export const supabase = (url && anon) ? createClient(url, anon) : null`
  - Reads `import.meta.env.VITE_SUPABASE_URL` / `_ANON_KEY`. When unset →
    `null` → the whole app runs guest-only and never crashes.
- `interview-map/src/hooks/useAuth.ts`
  - Returns `{ user, loading, signIn(provider), signOut }`. `user` is `null`
    when guest or unconfigured. Subscribes to `onAuthStateChange`; `signIn` uses
    `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin } })`.
    All no-ops when `supabase === null`.
- `interview-map/src/components/AuthButton.tsx` (+ `AuthButton.css`)
  - Guest: a "로그인" button opening a small popover with **GitHub** / **Google**.
  - Logged in: avatar/email + "로그아웃".
  - Hidden entirely when `supabase === null` (guest-only build).
  - Placed next to `ThemeSwitcher` (top-right).
- Add dependency `@supabase/supabase-js`. Create `.env.example` (committed) with
  the two var names; `.env.local` stays gitignored.

**Testable now:** app builds and runs guest-only without env (AuthButton hidden,
nothing breaks). With env + provider setup, the OAuth round-trip signs in/out.

## Phase 2 — Cloud sync

**Deliverable:** a logged-in user's `studiedIds`/`quizStats` load on login,
merge with any local guest data, and persist to the cloud on change.

- `interview-map/src/lib/cloudSync.ts`
  - `loadState(userId): Promise<{ studiedIds, quizStats } | null>`
  - `saveState(userId, state): Promise<void>` (upsert)
  - `mergeState(local, cloud)`: **pure, unit-tested** — `studiedIds` = union;
    `quizStats` = per-domain sum of `correct`/`seen` when merging guest→first
    login, else cloud is source of truth. (Exact rule fixed in the plan.)
- Sync glue (a `useCloudSync()` hook wired in `App`):
  - On `SIGNED_IN`: `loadState`; if no row → upload current local state
    (migration); else set store to `mergeState(local, cloud)` and upsert back.
  - While logged in: subscribe to store `studiedIds`/`quizStats`; debounce
    (~800ms) `saveState`. localStorage writes continue (offline cache).
  - On `SIGNED_OUT`: keep last state locally (seamless return to guest).
- Store: no schema change needed (existing `studiedIds`; `quizStats` arrives
  with the parked quiz-weak-domains work — until then sync `studiedIds` only,
  `quizStats` optional/absent-safe).

**Testable:** with a configured project — sign in on a fresh browser with local
progress → it uploads; sign in elsewhere → same progress appears; toggle a
concept → row updates.

## Security (public repo)

- Only the **anon key** and OAuth **client ids** reach the client (all
  publishable). **No secrets committed** — provider secrets live in Supabase;
  `.env.local` is gitignored; `.env.example` documents names only.
- RLS ensures a user can read/write only their own `user_state` row.

## Testing

- **Unit:** `mergeState` (Phase 2) — union of ids, quizStats merge rule,
  empty/である cases.
- **Runtime (verify skill):**
  - Phase 1: guest-only build runs with no env (AuthButton absent, app intact);
    with env, OAuth sign-in/out works and shows identity.
  - Phase 2: login loads/merges/persists; cross-browser reflects the same state.
- Guest mode regression: all existing localStorage behavior unchanged when
  logged out / unconfigured.

## Out of scope

- Server-side session / Next.js / standalone backend.
- Syncing theme & viewMode (device-local by design).
- Realtime multi-tab live sync, conflict UI (last-write-wins is enough).
- Account deletion UI (Supabase dashboard / cascade handles data).
