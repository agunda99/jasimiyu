create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  service text not null,
  rating integer not null check (rating between 1 and 5),
  review text not null check (char_length(review) between 1 and 1500),
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

create policy "Anyone can read reviews"
  on public.reviews for select
  using (true);

create policy "Anyone can submit reviews"
  on public.reviews for insert
  with check (true);

create policy "Admins can remove reviews"
  on public.reviews for delete
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

grant select, insert on public.reviews to anon, authenticated;
grant delete on public.reviews to authenticated;