create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  service text not null,
  rating integer not null check (rating between 1 and 5),
  review text not null check (char_length(review) between 1 and 1500),
  created_at timestamptz not null default now(),
  status text not null default 'published' check (status in ('pending', 'published'))
);

create or replace function public.review_moderation_status(p_name text, p_review text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  moderation_text text;
begin
  moderation_text := translate(lower(coalesce(p_name, '') || ' ' || coalesce(p_review, '')), '013457@', 'oieasta');
  moderation_text := replace(replace(moderation_text, '’', ''''), '‘', '''');

  if moderation_text ~ $moderation_flags$(^|[^a-z])(ass|asshole|bastard|bitch|blowjob|boobs|cock|cunt|dick|fucker|fuckers|fucking|fucked|fuck|handjob|hentai|masturbate|orgasm|penis|porn|prick|pussy|shit|shits|shitty|tits|vagina|idiot|idiots|stupid|useless|liar|liars|scammer|scammers|fraudster|fraudsters|crook|crooks|thief|thieves|incompetent|moron|morons|fraud|fraudulent|scam|scammed|stole|stolen|theft|bribe|bribery|embezzl[a-z]*|corrupt|corruption|extort[a-z]*|blackmail[a-z]*|forgery|forged|counterfeit|launder[a-z]*|criminal|misconduct|malpractice|negligence|negligent|assault[a-z]*|harass[a-z]*|abuse|abused|abusive|discriminat[a-z]*|racist|racism|sexist|sexism)([^a-z]|$)|(^|[^a-z])(i([[:space:]]+am|'m)?[[:space:]]+going[[:space:]]+to|i[[:space:]]+will|i'll|we[[:space:]]+will|we're[[:space:]]+going[[:space:]]+to)[[:space:]]+(kill|hurt|attack|shoot|burn|bomb)([^a-z]|$)|(^|[^a-z])(kill|hurt|shoot|bomb)[[:space:]]+(you|him|her|them|staff|lawyer|advocate)([^a-z]|$)|(^|[^a-z])(burn[[:space:]]+down|blow[[:space:]]+up|destroy)[[:space:]]+(your|the)[[:space:]]+(office|building|firm)([^a-z]|$)$moderation_flags$
    or moderation_text ~ $moderation_attack$(^|[^a-z])(fat|ugly|disgusting)[[:space:]-]+(face|person|secretary|lawyer|advocate|staff|human)([^a-z]|$)$moderation_attack$
  then
    return 'pending';
  else
    return 'published';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.reviews'::regclass
      and attname = 'status'
      and not attisdropped
  ) then
    alter table public.reviews
      add column status text not null default 'published';
    update public.reviews
      set status = public.review_moderation_status(name, review)
      where public.review_moderation_status(name, review) = 'pending';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reviews'::regclass
      and conname = 'reviews_status_check'
  ) then
    alter table public.reviews
      add constraint reviews_status_check check (status in ('pending', 'published'));
  end if;
end
$$;

alter table public.reviews enable row level security;

create or replace function public.moderate_review_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.status := public.review_moderation_status(new.name, new.review);
  return new;
end;
$$;

grant execute on function public.review_moderation_status(text, text) to anon, authenticated;

drop trigger if exists reviews_moderate_submission on public.reviews;
create trigger reviews_moderate_submission
  before insert on public.reviews
  for each row execute function public.moderate_review_submission();

drop policy if exists "Anyone can read reviews" on public.reviews;
drop policy if exists "Anyone can read published reviews" on public.reviews;
create policy "Anyone can read published reviews"
  on public.reviews for select
  using (
    status = 'published'
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "Anyone can submit reviews" on public.reviews;
create policy "Anyone can submit reviews"
  on public.reviews for insert
  with check (true);

drop policy if exists "Admins can remove reviews" on public.reviews;
create policy "Admins can remove reviews"
  on public.reviews for delete
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'ja_admin@info.co',
      'simiyuadvocate@yahoo.com'
    )
  );

drop policy if exists "Admins can moderate pending reviews" on public.reviews;
create policy "Admins can moderate pending reviews"
  on public.reviews for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

grant select, insert on public.reviews to anon, authenticated;
grant delete on public.reviews to authenticated;
grant update (status) on public.reviews to authenticated;