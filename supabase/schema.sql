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

-- Ajoute une table à la publication seulement si elle n'y est pas déjà
-- (sinon relancer ce fichier échouerait).
create or replace function public.add_to_realtime(p_table text)
returns void language plpgsql as $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = p_table
  ) then
    execute format('alter publication supabase_realtime add table public.%I', p_table);
  end if;
end $$;

select public.add_to_realtime('workouts');
select public.add_to_realtime('reactions');

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

-- =====================================================================
--  PARTIE 2 — OBJECTIFS PERSONNELS & SYSTÈME DE GAGES
--  (ré-exécutable : tu peux relancer tout le fichier sans rien casser)
-- =====================================================================

-- Distance parcourue, pour les objectifs en km (course, vélo, marche…)
alter table public.workouts
  add column if not exists distance_km numeric(6,2)
  check (distance_km is null or (distance_km > 0 and distance_km <= 500));

-- Lundi de la semaine contenant `d`
create or replace function public.week_start_of(d date) returns date
language sql immutable as $$ select d - (extract(isodow from d)::int - 1) $$;

create or replace function public.current_week_start() returns date
language sql stable as $$ select public.week_start_of(public.today_local()) $$;

-- ---------------------------------------------------------------------
-- 9. OBJECTIF HEBDOMADAIRE DE CHACUN
-- ---------------------------------------------------------------------
create table if not exists public.goals (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  sessions_target int not null default 3 check (sessions_target between 0 and 21),
  km_target       numeric(6,2) not null default 0 check (km_target between 0 and 500),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 10. OBJECTIF LONG TERME (poids, ou objectif libre sur plusieurs mois)
-- ---------------------------------------------------------------------
create table if not exists public.long_goals (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  kind         text not null default 'poids' check (kind in ('poids', 'libre')),
  title        text not null check (char_length(title) between 1 and 60),
  start_value  numeric(8,2) not null,
  target_value numeric(8,2) not null,
  unit         text not null default 'kg' check (char_length(unit) <= 10),
  deadline     date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Relevés (pesées, ou toute mesure liée à l'objectif long terme)
create table if not exists public.measurements (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  taken_on date not null default public.today_local(),
  value    numeric(8,2) not null,
  primary key (user_id, taken_on)
);

-- ---------------------------------------------------------------------
-- 11. LES GAGES
-- ---------------------------------------------------------------------
create table if not exists public.forfeits (
  id         uuid primary key default gen_random_uuid(),
  label      text not null check (char_length(label) between 2 and 120),
  created_by uuid references public.profiles(id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Une liste de départ, uniquement si le groupe n'en a pas encore
insert into public.forfeits (label)
select v.label from (values
  ('Payer le prochain resto du groupe'),
  ('Photo de profil imposée par les autres pendant 1 semaine'),
  ('Story publique : « j''ai lâché ma semaine de sport »'),
  ('50 pompes filmées, à envoyer dans le feed'),
  ('Séance suivante choisie par les autres (sport + durée)'),
  ('Payer les cafés pendant une semaine'),
  ('Double séance obligatoire la semaine suivante')
) as v(label)
where not exists (select 1 from public.forfeits);

-- Bilan hebdomadaire figé : ce qui a été fait, et le gage tiré si c'est raté
create table if not exists public.week_results (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  week_start      date not null,
  sessions_done   int  not null,
  sessions_target int  not null,
  km_done         numeric(6,2) not null,
  km_target       numeric(6,2) not null,
  success         boolean not null,
  forfeit_id      uuid references public.forfeits(id) on delete set null,
  forfeit_label   text,       -- figé : supprimer un gage n'efface pas l'historique
  status          text not null default 'pending' check (status in ('none', 'pending', 'done')),
  done_at         timestamptz,
  created_at      timestamptz not null default now(),
  primary key (user_id, week_start)
);

create index if not exists week_results_week_idx on public.week_results (week_start desc);

-- La roue : chacun tire un gage candidat le samedi ou le dimanche.
-- Lundi, celui qui a raté son contrat reçoit l'un de ces candidats.
create table if not exists public.wheel_spins (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  week_start    date not null,
  forfeit_id    uuid references public.forfeits(id) on delete set null,
  forfeit_label text not null,
  spun_at       timestamptz not null default now(),
  primary key (user_id, week_start)
);

create index if not exists wheel_spins_week_idx on public.wheel_spins (week_start desc);

-- ---------------------------------------------------------------------
-- 12. CLÔTURE DES SEMAINES (calcul du bilan + tirage du gage)
--
--     Fait côté serveur, donc identique pour tout le monde et impossible
--     à influencer depuis un téléphone. Idempotent : une semaine déjà
--     clôturée n'est jamais recalculée.
-- ---------------------------------------------------------------------
create or replace function public._settle_pending_weeks()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur_week   date := public.current_week_start();
  w          date;
  oldest     date;
  p          record;
  v_sessions int;
  v_km       numeric(6,2);
  v_st       int;
  v_kt       numeric(6,2);
  v_ok       boolean;
  v_fid      uuid;
  v_flabel   text;
  n          int;
  created    int := 0;
  results    jsonb := '[]'::jsonb;
begin
  select public.week_start_of(min((created_at at time zone public.app_timezone())::date))
    into oldest from public.profiles;
  if oldest is null then
    return jsonb_build_object('created', 0, 'results', results);
  end if;

  -- on ne remonte jamais au-delà de 26 semaines
  oldest := greatest(oldest, cur_week - 182);
  w := oldest;

  while w < cur_week loop
    for p in select pr.id, pr.pseudo, pr.created_at from public.profiles pr loop
      -- On ne juge personne avant son arrivée, et la semaine d'inscription
      -- est offerte (elle est presque toujours incomplète).
      continue when w < public.week_start_of(
        (p.created_at at time zone public.app_timezone())::date) + 7;
      continue when exists (
        select 1 from public.week_results r
         where r.user_id = p.id and r.week_start = w);

      v_st := null; v_kt := null;
      select g.sessions_target, g.km_target into v_st, v_kt
        from public.goals g where g.user_id = p.id;
      v_st := coalesce(v_st, 3);
      v_kt := coalesce(v_kt, 0);

      select count(distinct wo.done_on), coalesce(sum(wo.distance_km), 0)
        into v_sessions, v_km
        from public.workouts wo
       where wo.user_id = p.id
         and wo.done_on between w and w + 6;

      v_ok := (v_sessions >= v_st) and (v_km >= v_kt);

      v_fid := null; v_flabel := null;
      if not v_ok then
        -- On tire parmi les gages sortis à la roue ce week-end-là (un par
        -- personne, donc jusqu'à 3 candidats)…
        select s.forfeit_id, s.forfeit_label into v_fid, v_flabel
          from public.wheel_spins s where s.week_start = w
         order by random() limit 1;
        -- …et si personne n'a tourné sa roue, on tire dans la liste complète.
        if v_flabel is null then
          select f.id, f.label into v_fid, v_flabel
            from public.forfeits f where f.active
           order by random() limit 1;
        end if;
      end if;

      insert into public.week_results (
        user_id, week_start, sessions_done, sessions_target,
        km_done, km_target, success, forfeit_id, forfeit_label, status)
      values (
        p.id, w, v_sessions, v_st, v_km, v_kt, v_ok, v_fid, v_flabel,
        case when v_ok then 'none' else 'pending' end)
      on conflict do nothing;

      get diagnostics n = row_count;
      if n > 0 then
        created := created + 1;
        results := results || jsonb_build_object(
          'user_id', p.id, 'pseudo', p.pseudo, 'week_start', w,
          'success', v_ok, 'forfeit_label', v_flabel,
          'sessions_done', v_sessions, 'sessions_target', v_st);
      end if;
    end loop;
    w := w + 7;
  end loop;

  return jsonb_build_object('created', created, 'results', results);
end $$;

-- Version appelée par l'app (exige d'être connecté)
create or replace function public.settle_pending_weeks()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'authentification requise';
  end if;
  return public._settle_pending_weeks();
end $$;

grant execute on function public.settle_pending_weeks() to authenticated;

-- Marquer son propre gage comme fait (ou revenir en arrière)
create or replace function public.set_forfeit_done(p_week date, p_done boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'authentification requise';
  end if;
  update public.week_results
     set status  = case when p_done then 'done' else 'pending' end,
         done_at = case when p_done then now() else null end
   where user_id = auth.uid()
     and week_start = p_week
     and status <> 'none';
end $$;

grant execute on function public.set_forfeit_done(date, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 12 bis. LA ROUE
--
--     Le tirage est fait ICI, côté serveur. La roue affichée dans l'app
--     ne fait que s'arrêter sur le résultat déjà décidé : impossible de
--     se choisir un gage tranquille depuis son téléphone.
-- ---------------------------------------------------------------------

-- Ouverte le samedi et le dimanche (heure locale du groupe)
create or replace function public.wheel_is_open() returns boolean
language sql stable as $$
  select extract(isodow from public.today_local())::int in (6, 7)
$$;

grant execute on function public.wheel_is_open() to authenticated;

create or replace function public.spin_wheel()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_week  date := public.current_week_start();
  v_id    uuid;
  v_label text;
begin
  if auth.uid() is null then
    raise exception 'authentification requise';
  end if;

  -- Déjà tourné cette semaine ? On renvoie le même résultat, sans re-tirer.
  select ws.forfeit_id, ws.forfeit_label into v_id, v_label
    from public.wheel_spins ws
   where ws.user_id = auth.uid() and ws.week_start = v_week;
  if found then
    return jsonb_build_object(
      'already', true, 'forfeit_id', v_id, 'forfeit_label', v_label);
  end if;

  if not public.wheel_is_open() then
    raise exception 'la roue n''est ouverte que le samedi et le dimanche';
  end if;

  select f.id, f.label into v_id, v_label
    from public.forfeits f where f.active
   order by random() limit 1;
  if v_label is null then
    raise exception 'la liste des gages est vide';
  end if;

  insert into public.wheel_spins (user_id, week_start, forfeit_id, forfeit_label)
  values (auth.uid(), v_week, v_id, v_label)
  on conflict (user_id, week_start) do nothing;

  -- On relit ce qui est réellement stocké : si deux appels partent en même
  -- temps, tout le monde voit le même gage.
  select ws.forfeit_id, ws.forfeit_label into v_id, v_label
    from public.wheel_spins ws
   where ws.user_id = auth.uid() and ws.week_start = v_week;

  return jsonb_build_object(
    'already', false, 'forfeit_id', v_id, 'forfeit_label', v_label);
end $$;

grant execute on function public.spin_wheel() to authenticated;

-- ---------------------------------------------------------------------
-- 13. SÉCURITÉ (RLS) POUR LA PARTIE 2
-- ---------------------------------------------------------------------
alter table public.goals         enable row level security;
alter table public.long_goals    enable row level security;
alter table public.measurements  enable row level security;
alter table public.forfeits      enable row level security;
alter table public.week_results  enable row level security;
alter table public.wheel_spins   enable row level security;

drop policy if exists "goals: lecture groupe" on public.goals;
drop policy if exists "goals: ecriture perso" on public.goals;
create policy "goals: lecture groupe" on public.goals
  for select to authenticated using (true);
create policy "goals: ecriture perso" on public.goals
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "long_goals: lecture groupe" on public.long_goals;
drop policy if exists "long_goals: ecriture perso" on public.long_goals;
create policy "long_goals: lecture groupe" on public.long_goals
  for select to authenticated using (true);
create policy "long_goals: ecriture perso" on public.long_goals
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "measurements: lecture groupe" on public.measurements;
drop policy if exists "measurements: ecriture perso" on public.measurements;
create policy "measurements: lecture groupe" on public.measurements
  for select to authenticated using (true);
create policy "measurements: ecriture perso" on public.measurements
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Liste de gages partagée : chacun ajoute, et le groupe peut faire le ménage
drop policy if exists "forfeits: lecture groupe" on public.forfeits;
drop policy if exists "forfeits: ajout membre"   on public.forfeits;
drop policy if exists "forfeits: maj groupe"     on public.forfeits;
drop policy if exists "forfeits: suppr groupe"   on public.forfeits;
create policy "forfeits: lecture groupe" on public.forfeits
  for select to authenticated using (true);
create policy "forfeits: ajout membre" on public.forfeits
  for insert to authenticated with check (auth.uid() = created_by);
create policy "forfeits: maj groupe" on public.forfeits
  for update to authenticated using (true) with check (true);
create policy "forfeits: suppr groupe" on public.forfeits
  for delete to authenticated using (true);

-- Bilans : lecture par tout le groupe, écriture uniquement par les fonctions
-- ci-dessus (aucune policy insert/update/delete = personne ne peut trafiquer).
drop policy if exists "week_results: lecture groupe" on public.week_results;
create policy "week_results: lecture groupe" on public.week_results
  for select to authenticated using (true);

-- Roue : tout le groupe voit les tirages, mais seule spin_wheel() écrit.
drop policy if exists "wheel_spins: lecture groupe" on public.wheel_spins;
create policy "wheel_spins: lecture groupe" on public.wheel_spins
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 14. TEMPS RÉEL POUR LA PARTIE 2
-- ---------------------------------------------------------------------
select public.add_to_realtime('week_results');
select public.add_to_realtime('goals');
select public.add_to_realtime('forfeits');
select public.add_to_realtime('wheel_spins');

-- ---------------------------------------------------------------------
-- 15. (FACULTATIF) CLÔTURE AUTOMATIQUE CHAQUE LUNDI
--
--     L'app clôture déjà les semaines à l'ouverture, donc ceci n'est pas
--     nécessaire. Si tu veux que ça tombe tout seul le lundi à 8h même
--     sans ouvrir l'app, active l'extension pg_cron (Database > Extensions)
--     puis décommente :
--
--  select cron.schedule(
--    'cloture-semaine-teamsport',
--    '0 6 * * 1',                       -- 6h UTC = 8h à Paris (heure d'été)
--    $$ select public._settle_pending_weeks() $$
--  );
-- ---------------------------------------------------------------------
