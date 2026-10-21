-- CRITIEAT 第二階段：開團單（卡片、+1、點餐列）與評分（店家、品項）。
-- 先跑過 001_phase1.sql 與 002_passcode.sql 再跑這份。在 SQL Editor 整份貼上執行；可重複執行，不會動到通關碼。
-- 權限：任何人可讀；新增、修改、刪除都要通關碼（取消這團、刪自己的點餐列、取消 +1、刪評分都是真的刪除）。

-- ── 開團單 ──
create table if not exists lunch_cards (
  id                   text primary key,
  date                 date not null,                        -- 台灣時間的日期
  store_id             text not null references stores(id),
  store_name           text not null default '',             -- 建立時的店名
  status               text not null check (status in ('proposed', 'ordering', 'closed')),
  proposer             text not null,
  owner                text not null default '',
  note                 text not null default '',
  close_at             text not null default '',             -- 'HH:MM'
  pickup_at            text not null default '',             -- 'HH:MM'
  payer                text not null default '',
  created_at           timestamptz not null default now(),
  closed_at            timestamptz,
  changed_after_close  boolean not null default false
);

create table if not exists lunch_votes (
  card_id     text not null references lunch_cards(id) on delete cascade,
  member      text not null,
  created_at  timestamptz not null default now(),
  primary key (card_id, member)
);

create table if not exists lunch_items (
  id            text primary key,
  card_id       text not null references lunch_cards(id) on delete cascade,
  member        text not null,
  name          text not null check (name <> ''),
  price         int check (price >= 0),                      -- 選填
  note          text not null default '',
  menu_item_id  text,                                        -- 從菜單選的品項
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  after_close   boolean not null default false
);
create index if not exists lunch_items_card on lunch_items(card_id);

-- ── 評分（一人對一個對象一筆；0.5～5 星、每 0.5 一級；留言最多 50 字） ──
create table if not exists store_ratings (
  store_id    text not null references stores(id),
  member      text not null,
  stars       numeric(2,1) not null check (stars between 0.5 and 5 and stars * 2 = floor(stars * 2)),
  comment     text not null default '' check (char_length(comment) <= 50),
  updated_at  timestamptz not null default now(),
  primary key (store_id, member)
);

create table if not exists item_ratings (
  item_id     text not null,                               -- 菜單品項 ID（R001-01…）
  member      text not null,
  store_id    text not null references stores(id),
  item_name   text not null default '',                    -- 評分當時的品名、備註
  item_note   text not null default '',
  stars       numeric(2,1) not null check (stars between 0.5 and 5 and stars * 2 = floor(stars * 2)),
  comment     text not null default '' check (char_length(comment) <= 50),
  updated_at  timestamptz not null default now(),
  primary key (item_id, member)
);

-- ── 權限：讀開放；寫（新增、修改、刪除）要通關碼 ──
alter table lunch_cards   enable row level security;
alter table lunch_votes   enable row level security;
alter table lunch_items   enable row level security;
alter table store_ratings enable row level security;
alter table item_ratings  enable row level security;

revoke all on lunch_cards, lunch_votes, lunch_items, store_ratings, item_ratings from anon, authenticated;
grant select, insert, update, delete on lunch_cards, lunch_votes, lunch_items, store_ratings, item_ratings to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['lunch_cards', 'lunch_votes', 'lunch_items', 'store_ratings', 'item_ratings'] loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format('create policy %I on %I for select using (true)', t || '_read', t);
    execute format('create policy %I on %I for insert with check (check_team_code(request_team_code()))', t || '_insert', t);
    execute format('create policy %I on %I for update using (check_team_code(request_team_code())) with check (check_team_code(request_team_code()))', t || '_update', t);
    execute format('create policy %I on %I for delete using (check_team_code(request_team_code()))', t || '_delete', t);
  end loop;
end $$;

-- Realtime：開團單三張表的變動推給網頁（已加過會報錯，所以先檢查）
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'lunch_cards') then
    alter publication supabase_realtime add table lunch_cards, lunch_votes, lunch_items;
  end if;
end $$;
