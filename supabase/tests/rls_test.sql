-- Proves de seguretat. Cada prova escriu OK o FALLA.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a','coach@test'),
 ('00000000-0000-0000-0000-0000000000a1','a@jug'),
 ('00000000-0000-0000-0000-0000000000b2','b@jug'),
 ('00000000-0000-0000-0000-0000000000cc','sense-perfil@test');
insert into public.profiles (id, role, display_name) values
 ('00000000-0000-0000-0000-0000000000a1','player','Anna'),
 ('00000000-0000-0000-0000-0000000000b2','player','Berta');
-- el bloc final de schema.sql converteix el correu en entrenador:
insert into public.profiles (id, role, display_name)
select id, 'coach', 'Entrenador' from auth.users where email = 'coach@test'
on conflict (id) do update set role = 'coach';
insert into public.sessions (id, session_date, kind, name) values
 ('11111111-0000-0000-0000-000000000001', (now() at time zone 'Europe/Madrid')::date, 'Entrenament', 'Avui'),
 ('11111111-0000-0000-0000-000000000002', (now() at time zone 'Europe/Madrid')::date - 1, 'Partit', 'Ahir');

create function pg_temp.expect_error(q text, label text) returns text language plpgsql as $$
begin
  execute q;
  return 'FALLA  ' || label || ' (s''ha acceptat i no havia de ser així)';
exception when others then
  return 'OK     ' || label || '  -> ' || left(sqlerrm, 70);
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated, anon;
create function pg_temp.check(cond boolean, label text) returns text language sql as $$
  select case when cond then 'OK     ' else 'FALLA  ' end || label $$;
grant execute on function pg_temp.check(boolean, text) to authenticated, anon;

-- ---------------- JUGADORA A ----------------
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1', false);
insert into public.wellness (session_id, sleep, fatigue, mood, notes, submitted_at)
 values ('11111111-0000-0000-0000-000000000001', 7, 4, 8, 'nota A', '2000-01-01');
select pg_temp.check(score = 6.3 and submitted_at > now() - interval '1 minute', 'A desa wellness d''avui; puntuació 6.3 i hora posada pel servidor (no la seva)') from public.wellness;
insert into public.rpe (session_id, rpe) values ('11111111-0000-0000-0000-000000000001', 0);
select pg_temp.check(true, 'A desa RPE = 0 (vàlid)');
select pg_temp.expect_error($$insert into public.wellness (session_id, sleep, fatigue, mood) values ('11111111-0000-0000-0000-000000000001', 5,5,5)$$, 'A no pot fer un segon wellness a la mateixa sessió');
select pg_temp.expect_error($$insert into public.wellness (session_id, sleep, fatigue, mood) values ('11111111-0000-0000-0000-000000000002', 5,5,5)$$, 'A no pot omplir una sessió d''un altre dia');
select pg_temp.expect_error($$insert into public.wellness (session_id, player_id, sleep, fatigue, mood) values ('11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2', 5,5,5)$$, 'A no pot crear un registre en nom de B');
reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2', false); set role authenticated;
select pg_temp.expect_error($$insert into public.wellness (session_id, sleep, fatigue, mood) values ('11111111-0000-0000-0000-000000000001', 11,5,5)$$, 'Valor 11 rebutjat');
select pg_temp.expect_error($$insert into public.wellness (session_id, sleep, fatigue, mood) values ('11111111-0000-0000-0000-000000000001', 0,5,5)$$, 'Valor 0 al wellness rebutjat');
select pg_temp.expect_error($$insert into public.rpe (session_id, rpe) values ('11111111-0000-0000-0000-000000000001', 11)$$, 'RPE 11 rebutjat');
select pg_temp.expect_error($$insert into public.wellness (session_id, sleep, fatigue, mood, has_pain) values ('11111111-0000-0000-0000-000000000001', 5,5,5, true)$$, 'Molèstia marcada sense descripció rebutjada');
select pg_temp.expect_error($$insert into public.wellness (session_id, sleep, fatigue, mood, has_pain, pain_description) values ('11111111-0000-0000-0000-000000000001', 5,5,5, true, '   ')$$, 'Descripció només amb espais rebutjada');

-- ---------------- JUGADORA B ----------------
insert into public.wellness (session_id, sleep, fatigue, mood, has_pain, pain_description)
 values ('11111111-0000-0000-0000-000000000001', 3, 9, 9, true, 'Turmell dret');
select pg_temp.check(count(*) = 1 and bool_and(player_id = '00000000-0000-0000-0000-0000000000b2'), 'B només veu el seu wellness (no el d''A)') from public.wellness;
select pg_temp.check(count(*) = 0, 'B no veu l''RPE d''A ni demanant-lo pel seu ID') from public.rpe where player_id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check(count(*) = 1, 'B només veu el seu propi perfil') from public.profiles;
select pg_temp.check(count(*) = 0, 'B no veu cap enllaç personal') from public.player_links;
with u as (update public.wellness set sleep = 1 where player_id = '00000000-0000-0000-0000-0000000000a1' returning 1)
select pg_temp.check(count(*) = 0, 'B no pot modificar el wellness d''A (0 files canviades)') from u;
with u as (update public.wellness set mood = 6, submitted_at = '2000-01-01', player_id = '00000000-0000-0000-0000-0000000000a1' returning *)
select pg_temp.check(count(*) = 1 and bool_and(player_id = '00000000-0000-0000-0000-0000000000b2' and submitted_at > '2001-01-01' and score = 6.0), 'B edita el seu registre; no pot canviar l''hora ni passar-lo a A') from u;
select pg_temp.expect_error($$delete from public.wellness$$, 'B no pot esborrar registres');
select pg_temp.expect_error($$insert into public.sessions (session_date, kind, name) values (current_date, 'Partit', 'x')$$, 'Una jugadora no pot crear sessions');
with d as (delete from public.sessions returning 1)
select pg_temp.check(count(*) = 0, 'Una jugadora no pot esborrar sessions') from d;
select pg_temp.expect_error($$select public.revoke_user_sessions('00000000-0000-0000-0000-0000000000a1')$$, 'Una jugadora no pot tancar sessions d''altres');

-- Edició fora de termini: la sessió d'ahir
reset role;
insert into public.rpe (session_id, player_id, rpe) values ('11111111-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000b2', 5);
set role authenticated;
with u as (update public.rpe set rpe = 9 where session_id = '11111111-0000-0000-0000-000000000002' returning 1)
select pg_temp.check(count(*) = 0, 'B no pot editar un RPE d''un dia passat') from u;

-- ---------------- USUARI SENSE PERFIL ----------------
reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000cc', false); set role authenticated;
select pg_temp.check((select count(*) from public.sessions) + (select count(*) from public.wellness) = 0, 'Un compte que no és ni staff ni jugadora no veu res');
select pg_temp.expect_error($$insert into public.wellness (session_id, sleep, fatigue, mood) values ('11111111-0000-0000-0000-000000000001', 5,5,5)$$, 'Un compte sense perfil no pot escriure');

-- ---------------- ANÒNIM (sense iniciar sessió) ----------------
reset role; select set_config('request.jwt.claim.sub','', false); set role anon;
select pg_temp.expect_error($$select * from public.wellness$$, 'Anònim no pot llegir wellness');
select pg_temp.expect_error($$select * from public.sessions$$, 'Anònim no pot llegir sessions');

-- ---------------- ENTRENADOR ----------------
reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); set role authenticated;
select pg_temp.check(count(*) = 2, 'L''entrenador veu el wellness de totes') from public.wellness;
select pg_temp.check(count(*) = 3, 'L''entrenador veu tots els perfils') from public.profiles;
insert into public.sessions (session_date, kind, name) values (current_date + 1, 'Partit', 'Demà');
select pg_temp.check(true, 'L''entrenador pot crear sessions');
with u as (update public.wellness set sleep = 10 returning 1)
select pg_temp.check(count(*) = 0, 'L''entrenador no pot modificar respostes de jugadores') from u;
select pg_temp.expect_error($$insert into public.sessions (session_date, kind, name) values (current_date, 'Amistós', 'x')$$, 'Tipus de sessió invàlid rebutjat');

-- Esborrar una jugadora esborra totes les seves dades (dret de supressió)
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check((select count(*) from public.wellness where player_id='00000000-0000-0000-0000-0000000000a1') + (select count(*) from public.rpe where player_id='00000000-0000-0000-0000-0000000000a1') = 0, 'Esborrar una jugadora elimina totes les seves dades');
