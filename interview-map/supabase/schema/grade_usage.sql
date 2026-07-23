-- AI 채점 일일 사용량. 유저당 하루 한 행. 카운트 증가는 SECURITY DEFINER 함수로만.
create table if not exists public.grade_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);

alter table public.grade_usage enable row level security;

-- 본인 행만 읽기(상한 표시용). 쓰기는 정책 없음 → 아래 함수(정의자 권한)로만 증가.
drop policy if exists grade_usage_select_own on public.grade_usage;
create policy grade_usage_select_own on public.grade_usage
  for select using (auth.uid() = user_id);

-- 오늘 카운트를 원자적으로 +1 하고 새 값을 반환. Edge Function이 user JWT로 호출.
create or replace function public.increment_grade_usage()
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into public.grade_usage(user_id, day, count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = grade_usage.count + 1
  returning count into v;
  return v;
end $$;
