-- 질문 캐시(전체 사용자 공유). 계단 질문은 노트만 근거라 사용자와 무관 → 공유 가능.
-- 키에 note_hash를 넣어, 노트가 보강되면 해시가 바뀌어 자동으로 새 질문이 생성된다.
-- question='' 인 행은 "이 계단은 재료 부족으로 스킵"을 뜻한다(reader가 해석).
create table if not exists public.question_cache (
  node_id    text     not null,
  rung       smallint not null,
  note_hash  text     not null,
  question   text     not null,
  reference  text     not null,
  grounded   boolean  not null default true,
  created_at timestamptz not null default now(),
  primary key (node_id, rung, note_hash)
);

alter table public.question_cache enable row level security;

-- 읽기: 로그인 사용자 누구나(공유 캐시). 쓰기 정책 없음 → 아래 SECURITY DEFINER 함수로만.
drop policy if exists question_cache_select_auth on public.question_cache;
create policy question_cache_select_auth on public.question_cache
  for select using (auth.uid() is not null);

create or replace function public.upsert_question_cache(
  p_node_id text, p_rung smallint, p_note_hash text,
  p_question text, p_reference text, p_grounded boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.question_cache(node_id, rung, note_hash, question, reference, grounded)
  values (p_node_id, p_rung, p_note_hash, p_question, p_reference, p_grounded)
  on conflict (node_id, rung, note_hash) do nothing;
end $$;
