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

-- MULTES: normes de l'equip amb el seu import, i les multes posades a cada persona
-- (jugadores o staff). Els imports es guarden en cèntims per evitar errors d'arrodoniment.
create table if not exists public.fine_rules (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(trim(name)) between 1 and 80),
  amount_cents integer not null check (amount_cents between 1 and 100000),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.fines (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.profiles(id) on delete cascade,
  rule_id      uuid references public.fine_rules(id) on delete set null,
  reason       text not null check (char_length(trim(reason)) between 1 and 120),  -- es conserva encara que s'esborri la norma
  amount_cents integer not null check (amount_cents between 1 and 100000),
  fine_date    date not null default ((now() at time zone 'Europe/Madrid')::date),
  notes        text check (notes is null or char_length(notes) <= 300),
  paid         boolean not null default false,
  paid_at      timestamptz,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists fines_person_idx on public.fines (person_id);

-- RECORDATORIS: on enviar les notificacions de cada jugadora (un registre per mòbil).
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint   text not null unique check (char_length(endpoint) <= 1000),
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);

-- MULTES AUTOMÀTIQUES: quina norma s'aplica si no es fa el wellness (14:00) o l'RPE (00:00)
-- els dies d'entrenament. Una sola fila. "*_since": només s'apliquen a partir d'aquell moment.
create table if not exists public.auto_fine_settings (
  id               boolean primary key default true check (id),
  wellness_rule_id uuid references public.fine_rules(id) on delete set null,
  rpe_rule_id      uuid references public.fine_rules(id) on delete set null,
  wellness_since   timestamptz,
  rpe_since        timestamptz
);
insert into public.auto_fine_settings (id) values (true) on conflict do nothing;

-- Registre de multes automàtiques ja revisades: així, si el staff n'esborra una, no es torna a posar.
create table if not exists public.auto_fine_log (
  session_id uuid not null references public.sessions(id) on delete cascade,
  person_id  uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('wellness', 'rpe')),
  created_at timestamptz not null default now(),
  primary key (session_id, person_id, kind)
);

-- Secrets interns (clau de les tasques programades i claus de les notificacions).
-- Ningú hi té accés des del navegador; només el servidor de l'app i la base de dades.
create table if not exists public.app_secrets (
  name  text primary key,
  value text not null
);
insert into public.app_secrets (name, value)
values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- ESTADÍSTIQUES DE LA FEDERACIÓ (FCF): equip, partits, jugadores i aparicions.
-- Les omple el servidor de l'app (dades públiques de fcf.cat); ningú les escriu des del navegador.
create table if not exists public.fcf_config (
  id         boolean primary key default true check (id),
  temporada  text not null default '22',        -- 2026-2027
  grup_id    text not null default '58162336',  -- Primera Divisió Femení Juvenil, Grup 1
  team_id    text not null default '44099634',  -- EUROPA, C.E. C
  team_match text not null default 'EUROPA',    -- com surt el nom de l'equip a les actes
  last_sync  timestamptz,
  last_error text
);
insert into public.fcf_config (id) values (true) on conflict do nothing;

create table if not exists public.fcf_matches (
  acta_id    text primary key,
  jornada    integer not null,
  kickoff    timestamp,
  home       text not null,
  away       text not null,
  home_goals integer,
  away_goals integer,
  is_home    boolean not null,
  closed     boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.fcf_players (
  fcf_id     text primary key,
  full_name  text not null,
  dorsal     text,
  profile_id uuid references public.profiles(id) on delete set null,   -- jugadora de l'app (si s'ha relacionat)
  matches    integer not null default 0,
  starts     integer not null default 0,
  goals      integer not null default 0,
  sanctions  integer not null default 0,
  updated_at timestamptz not null default now()
);
create unique index if not exists fcf_players_profile_uq on public.fcf_players (profile_id) where profile_id is not null;

create table if not exists public.fcf_appearances (
  acta_id text not null references public.fcf_matches(acta_id) on delete cascade,
  fcf_id  text not null references public.fcf_players(fcf_id) on delete cascade,
  titular boolean not null,
  dorsal  text,
  goals   integer not null default 0,
  primary key (acta_id, fcf_id)
);

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

-- Multes: l'hora de pagament la posa el servidor quan es marca com a pagada.
create or replace function public.stamp_fine()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.paid_at := case when new.paid then now() end;
  elsif new.paid is distinct from old.paid then
    new.paid_at := case when new.paid then now() end;
  else
    new.paid_at := old.paid_at;
  end if;
  return new;
end $$;

drop trigger if exists fines_stamp on public.fines;
create trigger fines_stamp before insert or update on public.fines
  for each row execute function public.stamp_fine();

-- Multes automàtiques: quan es tria (o es canvia) la norma, es comença a comptar des d'ara,
-- perquè no es multin dies anteriors.
create or replace function public.stamp_auto_fine_settings()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.wellness_rule_id is distinct from old.wellness_rule_id then
    new.wellness_since := case when new.wellness_rule_id is null then null else now() end;
  else
    new.wellness_since := old.wellness_since;
  end if;
  if new.rpe_rule_id is distinct from old.rpe_rule_id then
    new.rpe_since := case when new.rpe_rule_id is null then null else now() end;
  else
    new.rpe_since := old.rpe_since;
  end if;
  return new;
end $$;

drop trigger if exists auto_fine_settings_stamp on public.auto_fine_settings;
create trigger auto_fine_settings_stamp before update on public.auto_fine_settings
  for each row execute function public.stamp_auto_fine_settings();

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

-- WELLNESS: els dies d'ENTRENAMENT es pot omplir fins a les 14:00 (hora de Barcelona).
-- Els dies de partit, fins a les 23:59 com l'RPE.
create or replace function public.wellness_open_at(sid uuid, at_local timestamp)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions
    where id = sid and not cancelled and session_date = at_local::date
      and (kind <> 'Entrenament' or at_local::time < time '14:00')
  );
$$;

create or replace function public.wellness_is_open(sid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.wellness_open_at(sid, (now() at time zone 'Europe/Madrid'));
$$;

-- GENERACIÓ AUTOMÀTICA: crea les sessions de les programacions actives per als
-- propers 42 dies. L'app la crida cada vegada que algú obre el calendari, així no
-- cal cap tasca programada. Mai crea duplicats (índex únic programació + dia).
create or replace function public.generate_rule_sessions_internal()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Madrid')::date;
  horizon date := today + 42;
  n integer;
begin
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

create or replace function public.generate_rule_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not ((select public.is_coach()) or (select public.is_player())) then
    return 0;
  end if;
  return public.generate_rule_sessions_internal();
end $$;

-- Pot de multes de l'equip: només totals, sense dir de qui són.
-- Així una jugadora pot veure el total sense veure les multes de les altres.
create or replace function public.fines_summary()
returns table (total_cents bigint, paid_cents bigint, pending_cents bigint, fines_count bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_cents), 0),
         coalesce(sum(amount_cents) filter (where paid), 0),
         coalesce(sum(amount_cents) filter (where not paid), 0),
         count(*)
  from public.fines
  where (select public.is_coach()) or (select public.is_player());
$$;

-- MULTES AUTOMÀTIQUES. La crida la base de dades sola cada 15 minuts.
-- Per a cada sessió d'ENTRENAMENT dels últims dies (no cancel·lada) i cada jugadora:
--   · sense wellness a les 14:00 del dia de la sessió  -> multa de la norma triada
--   · sense RPE a les 00:00 (final del dia de la sessió) -> multa de la norma triada
-- Mai multa: sessions o jugadores creades després del límit, ni límits anteriors a
-- quan es va activar la norma. Cada cas es revisa una sola vegada (auto_fine_log).
create or replace function public.apply_auto_fines()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  now_local timestamp := now() at time zone 'Europe/Madrid';
  cfg public.auto_fine_settings;
  rule public.fine_rules;
  k text;
  n integer := 0;
  added integer;
begin
  perform public.generate_rule_sessions_internal();
  select * into cfg from public.auto_fine_settings where id;
  foreach k in array array['wellness', 'rpe'] loop
    select * into rule from public.fine_rules
      where id = case k when 'wellness' then cfg.wellness_rule_id else cfg.rpe_rule_id end;
    continue when rule.id is null;
    with due as (
      select s.id as sid, s.name, s.session_date, p.id as pid,
             case k when 'wellness' then (s.session_date + time '14:00') else (s.session_date + 1)::timestamp end as deadline
      from public.sessions s
      cross join public.profiles p
      where s.kind = 'Entrenament' and not s.cancelled
        and s.session_date between now_local::date - 3 and now_local::date
        and p.role = 'player'
    ), missing as (
      select d.* from due d
      where d.deadline <= now_local
        and d.deadline > (case k when 'wellness' then cfg.wellness_since else cfg.rpe_since end at time zone 'Europe/Madrid')
        and (select created_at from public.sessions where id = d.sid) < (d.deadline at time zone 'Europe/Madrid')
        and (select created_at from public.profiles where id = d.pid) < (d.deadline at time zone 'Europe/Madrid')
        and (k <> 'wellness' or not exists (select 1 from public.wellness w where w.session_id = d.sid and w.player_id = d.pid))
        and (k <> 'rpe' or not exists (select 1 from public.rpe r where r.session_id = d.sid and r.player_id = d.pid))
    ), logged as (
      insert into public.auto_fine_log (session_id, person_id, kind)
      select sid, pid, k from missing
      on conflict do nothing
      returning session_id, person_id
    )
    insert into public.fines (person_id, rule_id, reason, amount_cents, fine_date, notes)
    select l.person_id, rule.id, rule.name, rule.amount_cents, m.session_date,
           'Automàtica · ' || case k when 'wellness' then 'wellness' else 'RPE' end || ' no fet · ' || m.name
    from logged l join missing m on m.sid = l.session_id and m.pid = l.person_id;
    get diagnostics added = row_count;
    n := n + added;
  end loop;
  return n;
end $$;

-- RECORDATORI DE LES 7:30. La base de dades la crida a les 5:30 i a les 6:30 (UTC) i
-- només actua quan a Barcelona són les 7 (així funciona a l'hivern i a l'estiu).
-- Si avui hi ha entrenament, demana a l'app que enviï les notificacions.
create or replace function public.send_wellness_reminder()
returns void language plpgsql security definer set search_path = '' as $$
declare
  secret text;
begin
  if extract(hour from (now() at time zone 'Europe/Madrid')) <> 7 then
    return;
  end if;
  perform public.generate_rule_sessions_internal();
  if not exists (
    select 1 from public.sessions
    where session_date = (now() at time zone 'Europe/Madrid')::date and kind = 'Entrenament' and not cancelled
  ) then
    return;
  end if;
  select value into secret from public.app_secrets where name = 'cron_secret';
  perform net.http_post(
    url := 'https://wellness-europa.vercel.app/api/cron/reminders',   -- si canvieu d'adreça, canvieu-la aquí
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret)
  );
end $$;

-- ESTADÍSTIQUES FCF: la base de dades demana al servidor de l'app que les actualitzi.
create or replace function public.trigger_fcf_sync()
returns void language plpgsql security definer set search_path = '' as $$
declare
  secret text;
begin
  select value into secret from public.app_secrets where name = 'cron_secret';
  perform net.http_post(
    url := 'https://wellness-europa.vercel.app/api/cron/fcf',   -- si canvieu d'adreça, canvieu-la aquí
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    timeout_milliseconds := 60000
  );
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
alter table public.fine_rules   enable row level security;
alter table public.fines        enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.auto_fine_settings enable row level security;
alter table public.auto_fine_log      enable row level security;
alter table public.app_secrets        enable row level security;
alter table public.fcf_config         enable row level security;
alter table public.fcf_matches        enable row level security;
alter table public.fcf_players        enable row level security;
alter table public.fcf_appearances    enable row level security;

-- Permisos mínims, explícits (funciona tant si Supabase exposa les taules
-- automàticament com si no). Els visitants sense sessió iniciada no poden tocar res.
revoke all on public.profiles, public.player_links, public.sessions, public.wellness, public.rpe, public.session_rules, public.fine_rules, public.fines,
  public.push_subscriptions, public.auto_fine_settings, public.auto_fine_log, public.app_secrets,
  public.fcf_config, public.fcf_matches, public.fcf_players, public.fcf_appearances from anon, authenticated;
grant select                         on public.profiles, public.player_links to authenticated;
grant select, insert, update, delete on public.sessions                      to authenticated;
grant select, insert, update         on public.wellness, public.rpe          to authenticated;
grant select, insert, update, delete on public.session_rules                 to authenticated;
grant select, insert, update, delete on public.fine_rules, public.fines      to authenticated;
grant select, insert, update, delete on public.push_subscriptions            to authenticated;
grant select, update                 on public.auto_fine_settings            to authenticated;
grant select                         on public.fcf_config, public.fcf_matches, public.fcf_appearances to authenticated;
grant select, update (profile_id)    on public.fcf_players                   to authenticated;
grant all on public.profiles, public.player_links, public.sessions, public.wellness, public.rpe, public.session_rules, public.fine_rules, public.fines,
  public.push_subscriptions, public.auto_fine_settings, public.auto_fine_log, public.app_secrets,
  public.fcf_config, public.fcf_matches, public.fcf_players, public.fcf_appearances to service_role;
grant execute on function public.is_coach(), public.is_player(), public.session_is_open(uuid), public.wellness_is_open(uuid) to authenticated;
revoke all on function public.wellness_open_at(uuid, timestamp), public.generate_rule_sessions_internal(),
  public.apply_auto_fines(), public.send_wellness_reminder(), public.trigger_fcf_sync() from public, anon, authenticated;
revoke all on function public.generate_rule_sessions(), public.refresh_rule(uuid, boolean), public.fines_summary() from public, anon;
grant execute on function public.generate_rule_sessions(), public.refresh_rule(uuid, boolean), public.fines_summary() to authenticated;

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

-- NORMES DE MULTES: tot l'equip les pot llegir; només el staff les gestiona.
drop policy if exists fine_rules_select on public.fine_rules;
create policy fine_rules_select on public.fine_rules for select to authenticated
  using ((select public.is_coach()) or (select public.is_player()));
drop policy if exists fine_rules_write on public.fine_rules;
create policy fine_rules_write on public.fine_rules for all to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));

-- MULTES: cadascú veu només les seves; el staff les veu i gestiona totes.
drop policy if exists fines_select on public.fines;
create policy fines_select on public.fines for select to authenticated
  using (person_id = (select auth.uid()) or (select public.is_coach()));
drop policy if exists fines_write on public.fines;
create policy fines_write on public.fines for all to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));

-- RECORDATORIS: cada jugadora gestiona només els seus mòbils.
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (player_id = (select auth.uid()))
  with check (player_id = (select auth.uid()) and (select public.is_player()));

-- CONFIGURACIÓ DE MULTES AUTOMÀTIQUES: només el staff.
drop policy if exists auto_fine_settings_coach on public.auto_fine_settings;
create policy auto_fine_settings_coach on public.auto_fine_settings for all to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
-- (auto_fine_log i app_secrets no tenen cap política: des del navegador no s'hi pot accedir.)

-- ESTADÍSTIQUES FCF: dades públiques; les veu tot l'equip. Només el staff pot canviar
-- a quina jugadora de l'app correspon cada fitxa de la FCF.
drop policy if exists fcf_config_read on public.fcf_config;
create policy fcf_config_read on public.fcf_config for select to authenticated
  using ((select public.is_coach()) or (select public.is_player()));
drop policy if exists fcf_matches_read on public.fcf_matches;
create policy fcf_matches_read on public.fcf_matches for select to authenticated
  using ((select public.is_coach()) or (select public.is_player()));
drop policy if exists fcf_appearances_read on public.fcf_appearances;
create policy fcf_appearances_read on public.fcf_appearances for select to authenticated
  using ((select public.is_coach()) or (select public.is_player()));
drop policy if exists fcf_players_read on public.fcf_players;
create policy fcf_players_read on public.fcf_players for select to authenticated
  using ((select public.is_coach()) or (select public.is_player()));
drop policy if exists fcf_players_link on public.fcf_players;
create policy fcf_players_link on public.fcf_players for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));

-- WELLNESS: la jugadora només llegeix/escriu les seves files, i només el dia de la sessió.
-- El staff ho llegeix tot però no ho modifica. Ningú no pot esborrar des del navegador.
drop policy if exists wellness_select on public.wellness;
create policy wellness_select on public.wellness for select to authenticated
  using (player_id = (select auth.uid()) or (select public.is_coach()));
drop policy if exists wellness_insert on public.wellness;
create policy wellness_insert on public.wellness for insert to authenticated
  with check (player_id = (select auth.uid()) and (select public.is_player()) and public.wellness_is_open(session_id));
drop policy if exists wellness_update on public.wellness;
create policy wellness_update on public.wellness for update to authenticated
  using (player_id = (select auth.uid()) and public.wellness_is_open(session_id))
  with check (player_id = (select auth.uid()) and (select public.is_player()) and public.wellness_is_open(session_id));

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
-- 6. TASQUES PROGRAMADES (dins la mateixa base de dades)
--    · cada 15 minuts: multes automàtiques
--    · 5:30 i 6:30 UTC: recordatori de les 7:30 (només actua a les 7 de Barcelona)
--    · cada 6 hores: estadístiques de la Federació
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('multes-automatiques', '*/15 * * * *', 'select public.apply_auto_fines()');
select cron.schedule('recordatori-wellness', '30 5,6 * * *', 'select public.send_wellness_reminder()');
select cron.schedule('estadistiques-fcf', '20 */6 * * *', 'select public.trigger_fcf_sync()');

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
