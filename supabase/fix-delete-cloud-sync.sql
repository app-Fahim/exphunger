-- Safe additive migration for All Items Stock & Expiry Tracker.
-- This creates a per-user tombstone table so stale devices cannot re-create
-- products that another device has deleted. It does not modify or delete
-- any existing rows in public.products.
create table if not exists public.product_deletions (
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (owner_id, product_id)
);

alter table public.product_deletions enable row level security;

drop policy if exists "Users can view their own product deletions" on public.product_deletions;
create policy "Users can view their own product deletions"
  on public.product_deletions for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Users can record their own product deletions" on public.product_deletions;
create policy "Users can record their own product deletions"
  on public.product_deletions for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Users can update their own product deletions" on public.product_deletions;
create policy "Users can update their own product deletions"
  on public.product_deletions for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Users can remove their own product deletion markers" on public.product_deletions;
create policy "Users can remove their own product deletion markers"
  on public.product_deletions for delete
  to authenticated
  using (owner_id = auth.uid());

grant select, insert, update, delete on public.product_deletions to authenticated;
