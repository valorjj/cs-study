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

-- 슬롯 예약(reserve): 상한 판단과 +1을 "하나의 원자적 문장"으로 합친다.
-- Edge Function이 LLM 호출 "전에" user JWT로 호출한다.
--   · 오늘 행이 없으면 INSERT count=1 → 예약 성공(true).
--   · 있고 count < p_cap 이면 UPDATE count+1 → 예약 성공(true).
--   · 있고 count >= p_cap 이면 ON CONFLICT ... WHERE 가 거짓 → INSERT/UPDATE 모두 안 일어남
--     → RETURNING이 아무 행도 안 내놓음 → v_count = null → 예약 실패(false, 429).
-- 이렇게 check+increment가 한 문장이라 동시 요청이 상한을 넘겨 예약할 수 없다(TOCTOU 없음).
create or replace function public.reserve_grade_slot(p_cap int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into public.grade_usage(user_id, day, count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = grade_usage.count + 1
    where grade_usage.count < p_cap
  returning count into v_count;
  return v_count is not null;
end $$;

-- 환불(refund): 채점이 실패(LLM 다운·파싱 실패)했을 때 예약한 슬롯을 되돌린다.
-- spec §4 "실패는 무료" 보장. 0 미만으로는 안 내려간다(방어적).
create or replace function public.refund_grade_slot()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.grade_usage set count = greatest(count - 1, 0)
  where user_id = auth.uid() and day = current_date;
end $$;
