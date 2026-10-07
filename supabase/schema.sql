-- =====================================================================
--  WELLNESS CE EUROPA · Base de dades
--  On s'enganxa: Supabase > SQL Editor > "New query" > enganxar-ho TOT > Run
--  Es pot tornar a executar sense perdre dades (no esborra res).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TAULES
-- ---------------------------------------------------------------------

-- Persones de l'app (jugadores i staff). Només el nom visible: res més.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null check (role in ('coach', 'player')),
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  created_at   timestamptz not null default now()
);

-- Enllaç personal de cada jugadora (només el staff el pot llegir).
create table if not exists public.player_links (
  player_id  uuid primary key references public.profiles(id) on delete cascade,
  link_key   text not null,
  updated_at timestamptz not null default now()
);

-- Sessions (entrenaments i partits).
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  session_date date not null,
  start_time   time,
  kind         text not null check (kind in ('Entrenament', 'Partit')),
  name         text not null check (char_length(trim(name)) between 1 and 80),
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists sessions_date_idx on public.sessions (session_date desc, id);

-- Wellness: un per jugadora i sessió. La puntuació la calcula la base de dades.
create table if not exists public.wellness (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.sessions(id) on delete cascade,
  player_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  sleep            smallint not null check (sleep between 1 and 10),
  fatigue          smallint not null check (fatigue between 1 and 10),
  mood             smallint not null check (mood between 1 and 10),
  score            numeric(3,1) generated always as (round((sleep + fatigue + mood)::numeric / 3, 1)) stored,
  has_pain         boolean not null default false,
  pain_description text check (pain_description is null or char_length(pain_description) <= 500),
  notes            text check (notes is null or char_length(notes) <= 500),
  submitted_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint wellness_one_per_session unique (session_id, player_id),
  constraint wellness_pain_needs_text check (
    (has_pain and pain_description is not null and char_length(trim(pain_description)) > 0)
    or (not has_pain and pain_description is null)
  )
);
create index if not exists wellness_player_idx on public.wellness (player_id);

-- RPE: un per jugadora i sessió, de 0 a 10.
create table if not exists public.rpe (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  player_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  rpe          smallint not null check (rpe between 0 and 10),
  notes        text check (notes is null or char_length(notes) <= 500),
  submitted_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint rpe_one_per_session unique (session_id, player_id)
);
create index if not exists rpe_player_idx on public.rpe (player_id);

-- PROGRAMACIONS: regles de repetició ("Entrenament dilluns i dimecres a les 19:00").
-- Les sessions concretes es generen automàticament a partir d'aquestes regles.
create table if not exists public.session_rules (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(trim(name)) between 1 and 80),
  kind         text not null check (kind in ('Entrenament', 'Partit')),
  weekdays     smallint[] not null check (
                 cardinality(weekdays) between 1 and 7
                 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),   -- 1 = dilluns ... 7 = diumenge
  start_time   time,
  duration_min smallint check (duration_min between 1 and 300),
  start_date   date not null,
  end_date     date,
  active       boolean not null default true,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint session_rules_dates check (end_date is null or end_date >= start_date)
);

-- Sessions: durada prevista, de quina programació ve, i si s'ha cancel·lat.
alter table public.sessions add column if not exists duration_min smallint check (duration_min between 1 and 300);
alter table public.sessions add column if not exists rule_id uuid references public.session_rules(id) on delete set null;
alter table public.sessions add column if not exists cancelled boolean not null default false;
-- Una programació no pot generar dues sessions el mateix dia.
create unique index if not exists sessions_rule_date_uq on public.sessions (rule_id, session_date) where rule_id is not null;

-- RPE: durada real i càrrega (RPE x minuts, en unitats arbitràries) calculada per la base de dades.
alter table public.rpe add column if not exists duration_min smallint check (duration_min between 1 and 300);
alter table public.rpe add column if not exists load integer generated always as (rpe * duration_min) stored;

-- ---------------------------------------------------------------------
-- 2. HORES AUTOMÀTIQUES: la jugadora no les pot posar ni canviar
-- ---------------------------------------------------------------------
create or replace function public.stamp_submission()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_at := now();
    new.updated_at   := now();
  else
    new.submitted_at := old.submitted_at;
    new.updated_at   := now();
    new.player_id    := old.player_id;   -- no es pot "regalar" el registre a una altra
    new.session_id   := old.session_id;  -- ni moure'l d'una sessió a una altra
  end if;
  return new;
end $$;

drop trigger if exists wellness_stamp on public.wellness;
create trigger wellness_stamp before insert or update on public.wellness
  for each row execute function public.stamp_submission();

drop trigger if exists rpe_stamp on public.rpe;
create trigger rpe_stamp before insert or update on public.rpe
  for each row execute function public.stamp_submission();

-- ---------------------------------------------------------------------
-- 3. FUNCIONS D'AJUDA PER A LA SEGURETAT
-- ---------------------------------------------------------------------
create or replace function public.is_coach()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'coach');
$$;

create or replace function public.is_player()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'player');
$$;

-- Una sessió només es pot omplir/editar el mateix dia (hora d'Europa/Madrid).
create or replace function public.session_is_open(sid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions
    where id = sid and not cancelled and session_date = (now() at time zone 'Europe/Madrid')::date
  );
$$;

-- GENERACIÓ AUTOMÀTICA: crea les sessions de les programacions actives per als
-- propers 42 dies. L'app la crida cada vegada que algú obre el calendari, així no
-- cal cap tasca programada. Mai crea duplicats (índex únic programació + dia).
create or replace function public.generate_rule_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Madrid')::date;
  horizon date := today + 42;
  n integer;
begin
  if not ((select public.is_coach()) or (select public.is_player())) then
    return 0;
  end if;
  insert into public.sessions (session_date, start_time, kind, name, duration_min, rule_id, created_by)
  select d::date, r.start_time, r.kind, r.name, r.duration_min, r.id, r.created_by
  from public.session_rules r
  cross join lateral generate_series(
    greatest(r.start_date, today)::timestamp,
    least(coalesce(r.end_date, horizon), horizon)::timestamp,
    interval '1 day') as d
  where r.active and extract(isodow from d)::smallint = any (r.weekdays)
  on conflict (rule_id, session_date) where rule_id is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Quan es canvia, pausa o esborra una programació: treu les sessions futures que
-- encara no tenen cap resposta (les que en tenen es queden) i torna a generar.
create or replace function public.refresh_rule(rid uuid, remove_rule boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Madrid')::date;
  removed integer;
begin
  if not (select public.is_coach()) then
    raise exception 'Només el staff pot canviar programacions' using errcode = '42501';
  end if;
  delete from public.sessions s
  where s.rule_id = rid and s.session_date >= today and (remove_rule or not s.cancelled)
    and not exists (select 1 from public.wellness w where w.session_id = s.id)
    and not exists (select 1 from public.rpe r where r.session_id = s.id);
  get diagnostics removed = row_count;
  if remove_rule then
    delete from public.session_rules where id = rid;
  else
    perform public.generate_rule_sessions();
  end if;
  return removed;
end $$;

-- Tanca totes les sessions obertes d'un usuari (per anul·lar un enllaç antic).
-- Només la pot cridar el servidor de l'app (clau secreta), mai el navegador.
create or replace function public.revoke_user_sessions(uid uuid)
returns void language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = uid;
$$;
revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (la seguretat de veritat, dins la base de dades)
-- ---------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.player_links enable row level security;
alter table public.sessions     enable row level security;
alter table public.wellness     enable row level security;
alter table public.rpe          enable row level security;
alter table public.session_rules enable row level security;

-- Permisos mínims, explícits (funciona tant si Supabase exposa les taules
-- automàticament com si no). Els visitants sense sessió iniciada no poden tocar res.
revoke all on public.profiles, public.player_links, public.sessions, public.wellness, public.rpe, public.session_rules from anon, authenticated;
grant select                         on public.profiles, public.player_links to authenticated;
grant select, insert, update, delete on public.sessions                      to authenticated;
grant select, insert, update         on public.wellness, public.rpe          to authenticated;
grant select, insert, update, delete on public.session_rules                 to authenticated;
grant all on public.profiles, public.player_links, public.sessions, public.wellness, public.rpe, public.session_rules to service_role;
grant execute on function public.is_coach(), public.is_player(), public.session_is_open(uuid) to authenticated;
revoke all on function public.generate_rule_sessions(), public.refresh_rule(uuid, boolean) from public, anon;
grant execute on function public.generate_rule_sessions(), public.refresh_rule(uuid, boolean) to authenticated;

-- PROFILES: cadascú es veu a si mateix; el staff ho veu tot. Ningú en crea des del navegador.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_coach()));

-- PLAYER_LINKS: només staff.
drop policy if exists player_links_select on public.player_links;
create policy player_links_select on public.player_links for select to authenticated
  using ((select public.is_coach()));

-- SESSIONS: tothom de l'equip les veu (les jugadores, no les cancel·lades);
-- només el staff les crea, edita o esborra.
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions for select to authenticated
  using ((select public.is_coach()) or ((select public.is_player()) and not cancelled));
drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions for insert to authenticated
  with check ((select public.is_coach()));
drop policy if exists sessions_update on public.sessions;
create policy sessions_update on public.sessions for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
drop policy if exists sessions_delete on public.sessions;
create policy sessions_delete on public.sessions for delete to authenticated
  using ((select public.is_coach()));

-- PROGRAMACIONS: només el staff.
drop policy if exists session_rules_all on public.session_rules;
create policy session_rules_all on public.session_rules for all to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));

-- WELLNESS: la jugadora només llegeix/escriu les seves files, i només el dia de la sessió.
-- El staff ho llegeix tot però no ho modifica. Ningú no pot esborrar des del navegador.
drop policy if exists wellness_select on public.wellness;
create policy wellness_select on public.wellness for select to authenticated
  using (player_id = (select auth.uid()) or (select public.is_coach()));
drop policy if exists wellness_insert on public.wellness;
create policy wellness_insert on public.wellness for insert to authenticated
  with check (player_id = (select auth.uid()) and (select public.is_player()) and public.session_is_open(session_id));
drop policy if exists wellness_update on public.wellness;
create policy wellness_update on public.wellness for update to authenticated
  using (player_id = (select auth.uid()) and public.session_is_open(session_id))
  with check (player_id = (select auth.uid()) and (select public.is_player()) and public.session_is_open(session_id));

-- RPE: mateixes regles.
drop policy if exists rpe_select on public.rpe;
create policy rpe_select on public.rpe for select to authenticated
  using (player_id = (select auth.uid()) or (select public.is_coach()));
drop policy if exists rpe_insert on public.rpe;
create policy rpe_insert on public.rpe for insert to authenticated
  with check (player_id = (select auth.uid()) and (select public.is_player()) and public.session_is_open(session_id));
drop policy if exists rpe_update on public.rpe;
create policy rpe_update on public.rpe for update to authenticated
  using (player_id = (select auth.uid()) and public.session_is_open(session_id))
  with check (player_id = (select auth.uid()) and (select public.is_player()) and public.session_is_open(session_id));

-- =====================================================================
-- 5. EL TEU COMPTE D'ENTRENADOR (només la primera vegada)
--    Abans: Authentication > Users > "Add user" > "Create new user"
--    amb el teu correu i una contrasenya (marca "Auto Confirm User").
--    Després canvia EL_TEU_CORREU@exemple.com pel teu correu i executa-ho.
--    (La resta del staff la podràs afegir des de l'app.)
-- =====================================================================
insert into public.profiles (id, role, display_name)
select id, 'coach', 'Entrenador'
from auth.users
where email = lower('EL_TEU_CORREU@exemple.com')
on conflict (id) do update set role = 'coach';
