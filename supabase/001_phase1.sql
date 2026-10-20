-- CRITIEAT 第一階段：店家、菜單、同事名單、菜單照片。
-- 在 Supabase Dashboard → SQL Editor 整份貼上執行一次。可重複執行（已存在的東西會略過）。
-- 權限：任何人可讀；可新增、修改店家與菜單（之後由 002_passcode.sql 加上通關碼）；任何人都不能刪除。

-- ── 店家 ──
create sequence if not exists store_seq;

create table if not exists stores (
  id          text primary key default ('R' || lpad(nextval('store_seq')::text, 3, '0')),
  name        text not null check (name <> ''),
  category    text not null check (category in ('飯', '麵', '便當', '小吃', '異國', '輕食', '其他')),
  area        text not null default '',
  address     text not null default '',
  phone       text not null default '',
  lat         double precision,
  lng         double precision,
  hours       jsonb not null default '{}'::jsonb,   -- { mon..sun: '11:00-14:00' }
  links       jsonb not null default '{}'::jsonb,   -- { googleMaps, foodpanda, ubereats, nidin }
  note        text not null default '',
  place_id    text unique,                          -- Google Place ID，可空、不可重複
  visible     boolean not null default true,        -- 移除＝false，不刪資料
  updated_by  text not null default '',
  updated_at  timestamptz not null default now()
);
alter sequence store_seq owned by stores.id;

-- ── 菜單（一家店一份；sections 內品項 ID 由前端維護） ──
create table if not exists menus (
  store_id    text primary key references stores(id),
  sections    jsonb not null default '[]'::jsonb,   -- [{ name, items: [{ id, name, price, note }] }]
  photos      jsonb not null default '[]'::jsonb,   -- 照片公開網址陣列
  updated_by  text not null default '',
  updated_at  date not null default current_date
);

-- ── 同事名單（在 Table Editor 直接增刪） ──
create table if not exists members (
  name  text primary key check (name <> ''),
  sort  int not null default 0
);
insert into members (name, sort) values
  ('David', 1), ('Mike', 2), ('雯雯', 3), ('Ivy', 4), ('Lexie', 5), ('Renee', 6), ('琬翎', 7), ('老闆', 8)
on conflict (name) do nothing;

-- ── 權限 ──
alter table stores  enable row level security;
alter table menus   enable row level security;
alter table members enable row level security;

revoke all on stores, menus, members from anon, authenticated;
grant select, insert, update on stores, menus to anon, authenticated;
grant select on members to anon, authenticated;
grant usage on sequence store_seq to anon, authenticated;

drop policy if exists stores_read   on stores;
drop policy if exists stores_insert on stores;
drop policy if exists stores_update on stores;
create policy stores_read   on stores for select using (true);
create policy stores_insert on stores for insert with check (true);
create policy stores_update on stores for update using (true) with check (true);

drop policy if exists menus_read   on menus;
drop policy if exists menus_insert on menus;
drop policy if exists menus_update on menus;
create policy menus_read   on menus for select using (true);
create policy menus_insert on menus for insert with check (true);
create policy menus_update on menus for update using (true) with check (true);

drop policy if exists members_read on members;
create policy members_read on members for select using (true);

-- ── 菜單照片（公開讀取；單檔 5MB、只收圖片） ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-photos', 'menu-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists menu_photos_insert on storage.objects;
create policy menu_photos_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'menu-photos');
