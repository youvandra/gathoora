alter table if exists public.marketplace_listings enable row level security;

create policy "read_listings_authenticated"
on public.marketplace_listings for select
to authenticated
using (true);

create policy "insert_listing_owner"
on public.marketplace_listings for insert
to authenticated
with check (owner_account_id = auth.uid()::text);

create policy "update_listing_owner"
on public.marketplace_listings for update
to authenticated
using (owner_account_id = auth.uid()::text)
with check (owner_account_id = auth.uid()::text);

create policy "delete_listing_owner"
on public.marketplace_listings for delete
to authenticated
using (owner_account_id = auth.uid()::text);

alter table if exists public.marketplace_rentals enable row level security;

create policy "read_rentals_renter_or_owner"
on public.marketplace_rentals for select
to authenticated
using (
  renter_account_id = auth.uid()::text
  or exists (
    select 1 from public.marketplace_listings ml
    where ml.id = marketplace_rentals.listing_id
      and ml.owner_account_id = auth.uid()::text
  )
);

create policy "insert_rental_renter"
on public.marketplace_rentals for insert
to authenticated
with check (renter_account_id = auth.uid()::text);

create policy "update_rental_renter_or_owner"
on public.marketplace_rentals for update
to authenticated
using (
  renter_account_id = auth.uid()::text
  or exists (
    select 1 from public.marketplace_listings ml
    where ml.id = marketplace_rentals.listing_id
      and ml.owner_account_id = auth.uid()::text
  )
)
with check (
  renter_account_id = auth.uid()::text
  or exists (
    select 1 from public.marketplace_listings ml
    where ml.id = marketplace_rentals.listing_id
      and ml.owner_account_id = auth.uid()::text
  )
);

create policy "delete_rental_owner"
on public.marketplace_rentals for delete
to authenticated
using (
  exists (
    select 1 from public.marketplace_listings ml
    where ml.id = marketplace_rentals.listing_id
      and ml.owner_account_id = auth.uid()::text
  )
);
