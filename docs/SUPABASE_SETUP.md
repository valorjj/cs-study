# Supabase Setup

The app runs in **guest mode** (localStorage) with no setup. To enable
Google/GitHub login + cross-device sync, do this once.

## 1. Create a project
supabase.com → New project (Region: Northeast Asia (Seoul) 권장, Asia-Pacific 도 무방).
Note the Project URL and `anon` public key (Project Settings → API).
At project creation, tick **Enable automatic RLS** (safety net; the SQL below
also enables RLS explicitly).

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
