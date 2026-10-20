-- CRITIEAT 團隊通關碼：只擋「改」，不擋「看」。
-- 在 SQL Editor 整份貼上執行一次（可重複執行），再執行最下面那行設定通關碼。
-- 之後新增／修改店家、存菜單、上傳照片都要帶正確的通關碼（網站第一次修改時會問）；讀取不受影響；刪除一直都不開放。

-- ── 通關碼本身：只有資料庫裡的函式讀得到，網站讀不到 ──
create table if not exists team_secret (
  id    int primary key default 1 check (id = 1),
  code  text not null check (code ~ '^[!-~]+$')   -- 只收英數與一般符號（要放進 HTTP header）
);
alter table team_secret enable row level security;
revoke all on team_secret from anon, authenticated;

create or replace function check_team_code(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(c, '') <> '' and exists (select 1 from team_secret where code = c);
$$;
revoke all on function check_team_code(text) from public;
grant execute on function check_team_code(text) to anon, authenticated;

-- 這次請求帶的 x-team-code header
create or replace function request_team_code() returns text
language sql stable as $$
  select coalesce(current_setting('request.headers', true)::json ->> 'x-team-code', '');
$$;

-- ── 店家、菜單：新增與修改要通關碼 ──
drop policy if exists stores_insert on stores;
drop policy if exists stores_update on stores;
create policy stores_insert on stores for insert with check (check_team_code(request_team_code()));
create policy stores_update on stores for update using (check_team_code(request_team_code())) with check (check_team_code(request_team_code()));

drop policy if exists menus_insert on menus;
drop policy if exists menus_update on menus;
create policy menus_insert on menus for insert with check (check_team_code(request_team_code()));
create policy menus_update on menus for update using (check_team_code(request_team_code())) with check (check_team_code(request_team_code()));

-- ── 菜單照片：上傳要通關碼 ──
drop policy if exists menu_photos_insert on storage.objects;
create policy menu_photos_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'menu-photos' and check_team_code(request_team_code()));

-- ── 設定／更換通關碼：把 換成你的通關碼 改掉後，單獨選取這一行執行 ──
-- insert into team_secret (id, code) values (1, '換成你的通關碼') on conflict (id) do update set code = excluded.code;
