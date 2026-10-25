-- All Items Stock & Expiry Tracker: safe Supabase setup
-- Run this in Supabase Dashboard > SQL Editor > New query.
-- This script does not delete product rows.

create table if not exists public.products (
  id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  barcode text not null default '',
  sku text not null default '',
  stock numeric not null default 0,
  min_stock numeric not null default 0,
  expiry date,
  batch text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Add any missing columns to an existing products table without dropping data.
alter table public.products add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.products add column if not exists name text not null default '';
alter table public.products add column if not exists barcode text not null default '';
alter table public.products add column if not exists sku text not null default '';
alter table public.products add column if not exists stock numeric not null default 0;
alter table public.products add column if not exists min_stock numeric not null default 0;
alter table public.products add column if not exists expiry date;
alter table public.products add column if not exists batch text not null default '';
alter table public.products add column if not exists notes text not null default '';
alter table public.products add column if not exists updated_at timestamptz not null default now();
alter table public.products add column if not exists created_at timestamptz not null default now();

-- Each product ID is unique only within its owner's account.
create unique index if not exists products_owner_id_id_uidx
  on public.products (owner_id, id);

alter table public.products enable row level security;

drop policy if exists "Users can read their own products" on public.products;
create policy "Users can read their own products"
  on public.products for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Users can insert their own products" on public.products;
create policy "Users can insert their own products"
  on public.products for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Users can update their own products" on public.products;
create policy "Users can update their own products"
  on public.products for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Users can delete their own products" on public.products;
create policy "Users can delete their own products"
  on public.products for delete to authenticated
  using (owner_id = auth.uid());

grant select, insert, update, delete on public.products to authenticated;
