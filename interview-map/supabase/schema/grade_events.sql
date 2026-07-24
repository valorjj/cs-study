-- AI 호출 이벤트 로그(실시간 사용량 미터용). 일일 상한(grade_usage)과 별개.
create table if not exists public.grade_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,               -- 'generate' | 'grade'
  created_at timestamptz not null default now()
);
create index if not exists grade_events_user_time on public.grade_events (user_id, created_at desc);

alter table public.grade_events enable row level security;
drop policy if exists grade_events_select_own on public.grade_events;
create policy grade_events_select_own on public.grade_events
  for select using (auth.uid() = user_id);
-- 쓰기 정책 없음 → 아래 SECURITY DEFINER 함수로만 insert.

create or replace function public.log_grade_event(p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.grade_events(user_id, kind) values (auth.uid(), p_kind);
end $$;

-- 내 최근 호출 수(분/시간/일). auth.uid() 기준.
create or replace function public.grade_event_counts()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'per_min',  count(*) filter (where created_at > now() - interval '1 minute'),
    'per_hour', count(*) filter (where created_at > now() - interval '1 hour'),
    'per_day',  count(*) filter (where created_at > now() - interval '1 day')
  )
  from public.grade_events where user_id = auth.uid();
$$;
