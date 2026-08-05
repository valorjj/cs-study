-- 이력 금고. 서버는 blob을 해독할 수 없다(클라이언트 E2E 암호화). salt는 비밀이
-- 아니므로 함께 보관하며, 새 기기가 salt + 패스프레이즈로 같은 키를 재파생한다.
create table if not exists public.resume_vault (
  user_id uuid primary key references auth.users(id) on delete cascade,
  salt text not null,
  blob jsonb not null,              -- { iv, ct } base64
  updated_at timestamptz not null default now()
);

alter table public.resume_vault enable row level security;

-- 본인 행만 읽기. 쓰기 정책은 두지 않는다 → 아래 SECURITY DEFINER 함수로만 갱신.
drop policy if exists resume_vault_select_own on public.resume_vault;
create policy resume_vault_select_own on public.resume_vault
  for select using (auth.uid() = user_id);

-- 낙관적 동시성 저장. last-write-wins를 쓰지 않는 이유: 손으로 쓴 서술문은 오래된
-- blob을 든 다른 기기가 덮어쓰면 조용히 사라지고, 암호문이라 병합도 불가능하다.
--
-- p_baseline = 클라이언트가 마지막으로 읽은 updated_at. NULL이면 "행이 없다고 믿는다"는 뜻.
-- 반환값: 새 updated_at, 또는 충돌 시 NULL.
create or replace function public.save_resume_vault(
  p_salt text, p_blob jsonb, p_baseline timestamptz
) returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_new timestamptz := now();
begin
  if p_baseline is null then
    insert into public.resume_vault(user_id, salt, blob, updated_at)
    values (auth.uid(), p_salt, p_blob, v_new)
    on conflict (user_id) do nothing;
    if not found then
      return null;                  -- 이미 행이 있다 → 다른 기기가 먼저 만들었다
    end if;
    return v_new;
  end if;

  update public.resume_vault
     set salt = p_salt, blob = p_blob, updated_at = v_new
   where user_id = auth.uid() and updated_at = p_baseline;
  if not found then
    return null;                    -- 다른 기기가 먼저 썼다 → 덮지 않는다
  end if;
  return v_new;
end $$;
