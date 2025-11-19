create extension if not exists pgcrypto;

create table if not exists public.marketplace_rentals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  renter_account_id text not null,
  minutes integer not null check (minutes > 0),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + (interval '1 minute' * 60)),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists marketplace_rentals_listing_idx on public.marketplace_rentals(listing_id);
create index if not exists marketplace_rentals_renter_idx on public.marketplace_rentals(renter_account_id);

