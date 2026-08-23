-- =====================================================================
--  TeamSport — schéma Supabase
--  À coller dans : Supabase Dashboard > SQL Editor > New query > Run
--  Ré-exécutable sans risque (idempotent).
-- =====================================================================

-- Fuseau utilisé pour découper les journées / semaines
-- (change 'Europe/Paris' si vous n'êtes pas en France)
create or replace function public.app_timezone() returns text
language sql immutable as $$ select 'Europe/Paris'::text $$;

create or replace function public.today_local() returns date
language sql stable as $$ select (now() at time zone public.app_timezone())::date $$;

-- ---------------------------------------------------------------------
-- 1. PROFILS
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  pseudo      text not null check (char_length(pseudo) between 1 and 20),
  emoji       text not null default '💪',
  created_at  timestamptz not null default now()
);

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, pseudo, emoji)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'pseudo', ''), split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data->>'emoji', ''), '💪')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. SÉANCES (la « preuve »)
-- ---------------------------------------------------------------------
create table if not exists public.workouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  sport         text not null check (char_length(sport) between 1 and 30),
  duration_min  int  not null check (duration_min between 5 and 600),
  note          text check (char_length(note) <= 200),
  photo_path    text not null,
  points        int  not null default 0,
  streak_at     int  not null default 0,   -- série (en jours) au moment de la séance
  done_on       date not null default public.today_local(),
  created_at    timestamptz not null default now()
);

create index if not exists workouts_created_idx on public.workouts (created_at desc);
create index if not exists workouts_user_day_idx on public.workouts (user_id, done_on);

-- ---------------------------------------------------------------------
-- 3. CALCUL DES POINTS (côté serveur : impossible à truquer depuis le tel)
--
--    10 pts   par séance
--    +1 pt    par tranche de 10 min au-delà de 30 min (max +10)
--    +2 pts   par jour de série en cours (max +10)
--    3e séance du même jour et suivantes : 0 pt (mais elle reste dans le feed)
-- ---------------------------------------------------------------------
create or replace function public.compute_workout_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  already_today int;
  streak        int := 0;
  cursor_day    date;
  duration_bonus int;
begin
  -- La date est décidée par le serveur, pas par le téléphone
  new.done_on := public.today_local();

  select count(*) into already_today
    from public.workouts w
   where w.user_id = new.user_id
     and w.done_on = new.done_on;

  -- Série : nombre de jours consécutifs terminés juste avant aujourd'hui
  cursor_day := new.done_on - 1;
  while streak < 365 and exists (
    select 1 from public.workouts w
     where w.user_id = new.user_id and w.done_on = cursor_day
  ) loop
    streak     := streak + 1;
    cursor_day := cursor_day - 1;
  end loop;
  new.streak_at := streak + 1;  -- aujourd'hui compris

  if already_today >= 2 then
    new.points := 0;            -- anti-spam
    return new;
  end if;

  duration_bonus := least(greatest((new.duration_min - 30) / 10, 0), 10);
  new.points := 10 + duration_bonus + 2 * least(streak, 5);
  return new;
end $$;

drop trigger if exists workouts_points on public.workouts;
create trigger workouts_points
  before insert on public.workouts
  for each row execute function public.compute_workout_points();

-- ---------------------------------------------------------------------
-- 4. RÉACTIONS (le « validé par les potes »)
-- ---------------------------------------------------------------------
create table if not exists public.reactions (
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) <= 8),
  created_at timestamptz not null default now(),
  primary key (workout_id, user_id)
);

-- ---------------------------------------------------------------------
-- 5. ABONNEMENTS PUSH (notifications)
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. SÉCURITÉ (RLS)
--    Groupe privé : tout membre connecté voit tout, mais n'écrit que pour lui.
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.workouts           enable row level security;
alter table public.reactions          enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "profiles: lecture groupe"  on public.profiles;
drop policy if exists "profiles: maj perso"       on public.profiles;
drop policy if exists "profiles: creation perso"  on public.profiles;
create policy "profiles: lecture groupe" on public.profiles
  for select to authenticated using (true);
create policy "profiles: creation perso" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "profiles: maj perso" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "workouts: lecture groupe" on public.workouts;
drop policy if exists "workouts: ajout perso"    on public.workouts;
drop policy if exists "workouts: suppr perso"    on public.workouts;
create policy "workouts: lecture groupe" on public.workouts
  for select to authenticated using (true);
create policy "workouts: ajout perso" on public.workouts
  for insert to authenticated with check (auth.uid() = user_id);
create policy "workouts: suppr perso" on public.workouts
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "reactions: lecture groupe" on public.reactions;
drop policy if exists "reactions: ecriture perso" on public.reactions;
drop policy if exists "reactions: suppr perso"    on public.reactions;
create policy "reactions: lecture groupe" on public.reactions
  for select to authenticated using (true);
create policy "reactions: ecriture perso" on public.reactions
  for insert to authenticated with check (auth.uid() = user_id);
create policy "reactions: suppr perso" on public.reactions
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "push: perso" on public.push_subscriptions;
create policy "push: perso" on public.push_subscriptions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 7. TEMPS RÉEL (le feed se met à jour tout seul)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.workouts;
alter publication supabase_realtime add table public.reactions;

-- ---------------------------------------------------------------------
-- 8. STOCKAGE DES PHOTOS (bucket privé « proofs »)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "proofs: lecture groupe" on storage.objects;
drop policy if exists "proofs: upload perso"   on storage.objects;
drop policy if exists "proofs: suppr perso"    on storage.objects;

create policy "proofs: lecture groupe" on storage.objects
  for select to authenticated
  using (bucket_id = 'proofs');

-- chaque membre écrit uniquement dans son dossier : <user_id>/xxx.jpg
create policy "proofs: upload perso" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "proofs: suppr perso" on storage.objects
  for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
