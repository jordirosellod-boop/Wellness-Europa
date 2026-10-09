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
 ('11111111-0000-0000-0000-000000000001', (now() at time zone 'Europe/Madrid')::date, 'Partit', 'Avui'),
 ('11111111-0000-0000-0000-000000000002', (now() at time zone 'Europe/Madrid')::date - 2, 'Partit', 'Abans d''ahir'),
 ('11111111-0000-0000-0000-000000000003', (now() at time zone 'Europe/Madrid')::date - 1, 'Partit', 'Ahir');

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
select pg_temp.check(count(*) = 0, 'B no pot editar un RPE de fa 2 dies') from u;
insert into public.rpe (session_id, rpe) values ('11111111-0000-0000-0000-000000000003', 6);
select pg_temp.check(true, 'B pot fer l''RPE d''ahir fora de termini');
select pg_temp.expect_error($$insert into public.wellness (session_id, sleep, fatigue, mood) values ('11111111-0000-0000-0000-000000000003', 5,5,5)$$, 'B no pot fer el wellness d''ahir');
select pg_temp.expect_error($$insert into public.rpe (session_id, rpe) values ('11111111-0000-0000-0000-000000000002', 6)$$, 'B no pot fer l''RPE de fa 2 dies');

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

-- =============== CALENDARI I PROGRAMACIONS ===============
reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000d4','d@jug');
insert into public.profiles values ('00000000-0000-0000-0000-0000000000d4','player','Dana');
create temp table vars as select (now() at time zone 'Europe/Madrid')::date as today;
grant select on vars to authenticated, anon;

-- Entrenador crea una programació per a tots els dies de la setmana
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); set role authenticated;
insert into public.session_rules (id, name, kind, weekdays, start_time, duration_min, start_date)
  values ('22222222-0000-0000-0000-000000000001', 'Força', 'Entrenament', '{1,2,3,4,5,6,7}', '19:00', 90, (select today from vars) - 10);
select pg_temp.check(public.generate_rule_sessions() = 43, 'Programació diària genera 43 sessions (avui + 42 dies; res al passat)');
select pg_temp.check(public.generate_rule_sessions() = 0, 'Tornar a generar no crea duplicats');
select pg_temp.check((select min(session_date) from public.sessions where rule_id = '22222222-0000-0000-0000-000000000001') = (select today from vars)
  and (select bool_and(duration_min = 90 and start_time = '19:00') from public.sessions where rule_id = '22222222-0000-0000-0000-000000000001'),
  'Les sessions generades comencen avui i hereten hora i durada');
select pg_temp.expect_error($$insert into public.session_rules (name, kind, weekdays, start_date) values ('x','Entrenament','{8}', current_date)$$, 'Dia de la setmana 8 rebutjat');
select pg_temp.expect_error($$insert into public.session_rules (name, kind, weekdays, start_date, end_date) values ('x','Entrenament','{1}', current_date, current_date - 1)$$, 'Data final anterior a la inicial rebutjada');

-- Programació només dilluns i dimecres durant 3 setmanes
insert into public.session_rules (id, name, kind, weekdays, start_date, end_date)
  values ('22222222-0000-0000-0000-000000000002', 'Dl i Dc', 'Entrenament', '{1,3}', (select today from vars), (select today from vars) + 20);
select public.generate_rule_sessions();
select pg_temp.check((select bool_and(extract(isodow from session_date) in (1,3)) and count(*) between 5 and 7 from public.sessions where rule_id = '22222222-0000-0000-0000-000000000002'),
  'Dl i Dc durant 3 setmanes: només dilluns i dimecres, dins del període');

-- La jugadora Dana omple la sessió d'avui (generada) amb durada
reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d4', false); set role authenticated;
insert into public.rpe (session_id, rpe, duration_min)
  select id, 7, 85 from public.sessions where rule_id = '22222222-0000-0000-0000-000000000001' and session_date = (select today from vars);
select pg_temp.check((select load from public.rpe where player_id = '00000000-0000-0000-0000-0000000000d4') = 595, 'Càrrega calculada per la base de dades: 7 x 85 = 595');
select pg_temp.expect_error($$update public.rpe set duration_min = 0 where player_id = '00000000-0000-0000-0000-0000000000d4'$$, 'Durada 0 rebutjada');
select pg_temp.expect_error($$update public.rpe set load = 1 where player_id = '00000000-0000-0000-0000-0000000000d4'$$, 'La jugadora no pot posar la càrrega a mà');
select pg_temp.expect_error($$insert into public.session_rules (name, kind, weekdays, start_date) values ('x','Entrenament','{1}', current_date)$$, 'Una jugadora no pot crear programacions');
select pg_temp.check((select count(*) from public.session_rules) = 0, 'Una jugadora no veu les programacions');
select pg_temp.expect_error($$select public.refresh_rule('22222222-0000-0000-0000-000000000001')$$, 'Una jugadora no pot esborrar sessions programades');
select pg_temp.check(public.generate_rule_sessions() = 0, 'La jugadora pot activar la generació (sense duplicats)');

-- Cancel·lar: la jugadora deixa de veure la sessió i no la pot omplir
reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); set role authenticated;
update public.sessions set cancelled = true where rule_id = '22222222-0000-0000-0000-000000000002' and session_date = (select min(session_date) from public.sessions where rule_id = '22222222-0000-0000-0000-000000000002');
reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d4', false); set role authenticated;
select pg_temp.check((select count(*) from public.sessions where cancelled) = 0, 'La jugadora no veu les sessions cancel·lades');

-- Esborrar programació: treu les futures sense respostes, conserva la que té dades
reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); set role authenticated;
select pg_temp.check(public.refresh_rule('22222222-0000-0000-0000-000000000001', true) = 42, 'Esborrar programació treu les 42 sessions futures sense respostes');
select pg_temp.check((select count(*) from public.sessions s join public.rpe r on r.session_id = s.id where r.player_id = '00000000-0000-0000-0000-0000000000d4') = 1
  and (select count(*) from public.session_rules where id = '22222222-0000-0000-0000-000000000001') = 0,
  'La sessió amb respostes es conserva (sense programació)');
-- Pausar: les futures sense respostes desapareixen i no es tornen a generar
update public.session_rules set active = false where id = '22222222-0000-0000-0000-000000000002';
select public.refresh_rule('22222222-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from public.sessions where rule_id = '22222222-0000-0000-0000-000000000002' and not cancelled) = 0, 'Programació pausada: no queden sessions futures pendents');

-- =============== MULTES ===============
-- Jugadores disponibles: B (...b2) i Dana (...d4). Staff: ...0a
reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); set role authenticated;
insert into public.fine_rules (id, name, amount_cents) values
  ('33333333-0000-0000-0000-000000000001', 'Arribar tard', 200),
  ('33333333-0000-0000-0000-000000000002', 'Oblidar l''equipació', 500);
insert into public.fines (id, person_id, rule_id, reason, amount_cents) values
  ('44444444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', '33333333-0000-0000-0000-000000000001', 'Arribar tard', 200),
  ('44444444-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', '33333333-0000-0000-0000-000000000002', 'Oblidar l''equipació', 500),
  ('44444444-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000d4', '33333333-0000-0000-0000-000000000001', 'Arribar tard', 200),
  ('44444444-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', '33333333-0000-0000-0000-000000000002', 'Oblidar l''equipació', 500);
select pg_temp.check(true, 'El staff posa multes a jugadores i a staff');
with u as (update public.fines set paid = true where id = '44444444-0000-0000-0000-000000000001' returning paid_at)
select pg_temp.check(bool_and(paid_at is not null), 'Marcar pagada guarda l''hora de pagament (servidor)') from u;
with u as (update public.fines set paid = false where id = '44444444-0000-0000-0000-000000000001' returning paid_at)
select pg_temp.check(bool_and(paid_at is null), 'Desfer el pagament treu l''hora') from u;
update public.fines set paid = true where id in ('44444444-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000004');
select pg_temp.check(total_cents = 1400 and paid_cents = 700 and pending_cents = 700 and fines_count = 4, 'Pot per al staff: total 14 €, pagat 7 €, pendent 7 €') from public.fines_summary();
select pg_temp.expect_error($$insert into public.fines (person_id, reason, amount_cents) values ('00000000-0000-0000-0000-0000000000b2', 'x', 0)$$, 'Multa de 0 € rebutjada');
select pg_temp.expect_error($$insert into public.fine_rules (name, amount_cents) values ('x', -100)$$, 'Norma amb import negatiu rebutjada');

-- Jugadora B: veu les seves, les normes i el pot; res més
reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2', false); set role authenticated;
select pg_temp.check(count(*) = 2 and bool_and(person_id = '00000000-0000-0000-0000-0000000000b2'), 'B només veu les seves 2 multes') from public.fines;
select pg_temp.check(count(*) = 0, 'B no veu la multa de Dana ni la del staff, ni demanant-les per ID')
  from public.fines where id in ('44444444-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000004');
select pg_temp.check(count(*) = 2, 'B veu la llista de normes') from public.fine_rules;
select pg_temp.check(total_cents = 1400 and paid_cents = 700, 'B veu el pot de tot l''equip (només totals)') from public.fines_summary();
with u as (update public.fines set paid = true returning 1)
select pg_temp.check(count(*) = 0, 'B no es pot marcar les multes com a pagades') from u;
with d as (delete from public.fines returning 1)
select pg_temp.check(count(*) = 0, 'B no es pot esborrar multes') from d;
select pg_temp.expect_error($$insert into public.fines (person_id, reason, amount_cents) values ('00000000-0000-0000-0000-0000000000d4', 'x', 100)$$, 'B no pot posar multes a ningú');
with u as (update public.fine_rules set amount_cents = 1 returning 1)
select pg_temp.check(count(*) = 0, 'B no pot canviar l''import de les normes') from u;

-- Anònim: res
reset role; select set_config('request.jwt.claim.sub','', false); set role anon;
select pg_temp.expect_error($$select * from public.fines$$, 'Anònim no pot llegir multes');
select pg_temp.expect_error($$select * from public.fines_summary()$$, 'Anònim no pot veure el pot');

-- Esborrar una norma conserva les multes (amb el motiu); esborrar una persona esborra les seves multes
reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); set role authenticated;
delete from public.fine_rules where id = '33333333-0000-0000-0000-000000000001';
select pg_temp.check(count(*) = 2 and bool_and(rule_id is null and reason = 'Arribar tard'), 'Esborrar una norma conserva les multes i el motiu')
  from public.fines where id in ('44444444-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000003');
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000d4';
select pg_temp.check(count(*) = 0, 'Esborrar una jugadora esborra també les seves multes') from public.fines where person_id = '00000000-0000-0000-0000-0000000000d4';

-- =============== LÍMITS, MULTES AUTOMÀTIQUES I RECORDATORIS ===============
reset role;
insert into public.sessions (id, session_date, kind, name) values
  ('55555555-0000-0000-0000-000000000001', '2026-03-10', 'Entrenament', 'Entreno límit'),
  ('55555555-0000-0000-0000-000000000002', '2026-03-10', 'Partit', 'Partit límit');
select pg_temp.check(public.wellness_open_at('55555555-0000-0000-0000-000000000001', '2026-03-10 13:59'), 'Entrenament: wellness obert a les 13:59');
select pg_temp.check(public.wellness_open_at('55555555-0000-0000-0000-000000000001', '2026-03-10 23:59'), 'Entrenament: wellness encara es pot fer a les 23:59 (fora de termini, amb multa)');
select pg_temp.check(public.wellness_open_at('55555555-0000-0000-0000-000000000002', '2026-03-10 20:00'), 'Partit: wellness obert a les 20:00 (sense límit de 14:00)');
select pg_temp.check(not public.wellness_open_at('55555555-0000-0000-0000-000000000001', '2026-03-11 09:00'), 'L''endemà el wellness està tancat');
select pg_temp.check(not public.wellness_open_at('55555555-0000-0000-0000-000000000001', '2026-03-09 23:00'), 'El dia abans el wellness encara no està obert');
select pg_temp.check(public.rpe_open_at('55555555-0000-0000-0000-000000000001', '2026-03-10 22:00'), 'RPE obert el dia de la sessió');
select pg_temp.check(public.rpe_open_at('55555555-0000-0000-0000-000000000001', '2026-03-11 23:59'), 'RPE fora de termini: l''endemà encara es pot fer');
select pg_temp.check(not public.rpe_open_at('55555555-0000-0000-0000-000000000001', '2026-03-12 00:00'), 'RPE tancat dos dies després');
select pg_temp.check(not public.rpe_open_at('55555555-0000-0000-0000-000000000001', '2026-03-09 20:00'), 'RPE no obert abans del dia de la sessió');

-- Escenari de multes automàtiques: sessions d'ahir
insert into auth.users values ('00000000-0000-0000-0000-0000000000e5','e@jug'), ('00000000-0000-0000-0000-0000000000f6','f@jug');
insert into public.profiles (id, role, display_name, created_at) values
  ('00000000-0000-0000-0000-0000000000e5','player','Elna', now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000000f6','player','Fiona (nova)', now());
update public.profiles set created_at = now() - interval '30 days' where id = '00000000-0000-0000-0000-0000000000b2';
insert into public.sessions (id, session_date, kind, name, created_at, cancelled) values
  ('66666666-0000-0000-0000-000000000001', (select today from vars) - 1, 'Entrenament', 'Entreno ahir', now() - interval '5 days', false),
  ('66666666-0000-0000-0000-000000000002', (select today from vars) - 1, 'Partit', 'Partit ahir', now() - interval '5 days', false),
  ('66666666-0000-0000-0000-000000000003', (select today from vars) - 1, 'Entrenament', 'Entreno cancel·lat', now() - interval '5 days', true),
  ('66666666-0000-0000-0000-000000000004', (select today from vars) - 1, 'Entrenament', 'Entreno creat tard', now(), false);
insert into public.wellness (session_id, player_id, sleep, fatigue, mood) values ('66666666-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 7, 7, 7);
-- B el va fer a temps (ahir a les 10:00)
alter table public.wellness disable trigger wellness_stamp;
update public.wellness set submitted_at = (((select today from vars) - 1) + time '10:00') at time zone 'Europe/Madrid'
  where session_id = '66666666-0000-0000-0000-000000000001' and player_id = '00000000-0000-0000-0000-0000000000b2';
alter table public.wellness enable trigger wellness_stamp;
-- Elna els fa fora de termini (ara): s'han de multar igualment
insert into public.wellness (session_id, player_id, sleep, fatigue, mood) values ('66666666-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e5', 6, 6, 6);
insert into public.rpe (session_id, player_id, rpe) values ('66666666-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e5', 6);
insert into public.fine_rules (id, name, amount_cents) values ('33333333-0000-0000-0000-000000000009', 'Wellness/RPE no fet', 100);

-- El staff tria la norma; la data d'inici la posa el servidor
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); set role authenticated;
with u as (update public.auto_fine_settings set wellness_rule_id = '33333333-0000-0000-0000-000000000009', rpe_rule_id = '33333333-0000-0000-0000-000000000009', wellness_since = '2000-01-01' returning wellness_since)
select pg_temp.check(bool_and(wellness_since > now() - interval '1 minute'), 'Activar multes automàtiques: compta des d''ara (no es pot posar una data antiga)') from u;
reset role;
select pg_temp.check(public.apply_auto_fines() = 0, 'Recent activades: no es multen els dies anteriors');
-- (simulem que es van activar fa 10 dies)
alter table public.auto_fine_settings disable trigger auto_fine_settings_stamp;
update public.auto_fine_settings set wellness_since = now() - interval '10 days', rpe_since = now() - interval '10 days';
alter table public.auto_fine_settings enable trigger auto_fine_settings_stamp;
select pg_temp.check(public.apply_auto_fines() = 3, 'Multes automàtiques: 3 (B sense RPE; Elna wellness i RPE fets fora de termini)');
select pg_temp.check((select count(*) from public.fines where notes like 'Automàtica%' and person_id = '00000000-0000-0000-0000-0000000000b2') = 1
  and (select count(*) from public.fines where notes like 'Automàtica%' and person_id = '00000000-0000-0000-0000-0000000000e5') = 2
  and (select bool_and(amount_cents = 100 and fine_date = (select today from vars) - 1) from public.fines where notes like 'Automàtica%'),
  'Les multes són d''1 €, a la persona i el dia correctes');
select pg_temp.check((select count(*) from public.fines where notes like 'Automàtica%' and (person_id = '00000000-0000-0000-0000-0000000000f6' or notes like '%Partit%' or notes like '%cancel%' or notes like '%creat tard%')) = 0,
  'No es multa: jugadora nova, partits, sessions cancel·lades ni creades després del límit');
select pg_temp.check(public.apply_auto_fines() = 0, 'Tornar-ho a executar no duplica multes');
delete from public.fines where person_id = '00000000-0000-0000-0000-0000000000e5' and notes like '%wellness%';
select pg_temp.check(public.apply_auto_fines() = 0, 'Si el staff esborra una multa automàtica, no es torna a posar');
select pg_temp.check((select count(*) from cron.job where jobname in ('multes-automatiques', 'recordatori-wellness')) = 2, 'Tasques programades creades (multes cada 15 min i recordatori)');

-- Seguretat de les parts noves
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2', false); set role authenticated;
select pg_temp.expect_error($$select public.apply_auto_fines()$$, 'Una jugadora no pot executar les multes automàtiques');
select pg_temp.expect_error($$select public.send_wellness_reminder()$$, 'Una jugadora no pot llançar recordatoris');
select pg_temp.expect_error($$select * from public.app_secrets$$, 'Una jugadora no pot llegir els secrets');
select pg_temp.expect_error($$select * from public.auto_fine_log$$, 'Una jugadora no pot llegir el registre de multes automàtiques');
select pg_temp.check((select count(*) from public.auto_fine_settings) = 0, 'Una jugadora no veu la configuració de multes automàtiques');
with u as (update public.auto_fine_settings set wellness_rule_id = null returning 1)
select pg_temp.check(count(*) = 0, 'Una jugadora no pot desactivar les multes automàtiques') from u;
insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/b', 'k', 'a');
select pg_temp.check((select count(*) from public.push_subscriptions) = 1, 'B activa els recordatoris al seu mòbil');
select pg_temp.expect_error($$insert into public.push_subscriptions (player_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-0000000000e5', 'https://push.example/x', 'k', 'a')$$, 'B no pot registrar un mòbil en nom d''una altra');
reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e5', false); set role authenticated;
select pg_temp.check((select count(*) from public.push_subscriptions) = 0, 'Elna no veu els mòbils de B');
reset role; select set_config('request.jwt.claim.sub','', false); set role anon;
select pg_temp.expect_error($$select * from public.push_subscriptions$$, 'Anònim no pot llegir subscripcions');

-- =============== ESTADÍSTIQUES FCF ===============
reset role;
insert into public.fcf_matches (acta_id, jornada, home, away, home_goals, away_goals, is_home, closed) values ('4132183', 1, 'OAR VIC A', 'EUROPA, C.E. C', 0, 10, false, true);
insert into public.fcf_players (fcf_id, full_name, goals) values ('54291437', 'PEREZ ORDOÑEZ, VERA', 4), ('44132866', 'AVILA GOMEZ, LAURA', 3);
insert into public.fcf_appearances (acta_id, fcf_id, titular, goals) values ('4132183', '54291437', true, 3);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2', false); set role authenticated;
select pg_temp.check((select count(*) from public.fcf_players) = 2 and (select count(*) from public.fcf_matches) = 1, 'Una jugadora veu les estadístiques de l''equip');
select pg_temp.expect_error($$update public.fcf_players set goals = 99$$, 'Una jugadora no pot canviar estadístiques');
with u as (update public.fcf_players set profile_id = '00000000-0000-0000-0000-0000000000b2' returning 1)
select pg_temp.check(count(*) = 0, 'Una jugadora no es pot assignar una fitxa de la FCF (0 files canviades)') from u;
select pg_temp.expect_error($$select public.trigger_fcf_sync()$$, 'Una jugadora no pot llançar l''actualització');
reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); set role authenticated;
with u as (update public.fcf_players set profile_id = '00000000-0000-0000-0000-0000000000b2' where fcf_id = '54291437' returning 1)
select pg_temp.check(count(*) = 1, 'El staff relaciona una fitxa FCF amb una jugadora de l''app') from u;
select pg_temp.expect_error($$update public.fcf_players set goals = 99$$, 'Ni el staff pot modificar a mà els números de la FCF');
select pg_temp.expect_error($$update public.fcf_players set profile_id = '00000000-0000-0000-0000-0000000000b2' where fcf_id = '44132866'$$, 'Una jugadora de l''app només pot tenir una fitxa FCF');
reset role; select set_config('request.jwt.claim.sub','', false); set role anon;
select pg_temp.expect_error($$select * from public.fcf_players$$, 'Anònim no pot llegir les estadístiques');

-- =============== NIVELL I LLIGA INTERNA ===============
-- Jugadores ara: Berta (...b2), Elna (...e5), Fiona (...f6). Mínim: 6 entrenaments.
reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); set role authenticated;
with u as (update public.team_settings set commitment_level = 2 returning commitment_level) select pg_temp.check(bool_and(commitment_level = 2), 'El staff posa l''equip al Nivell 2') from u;
select pg_temp.expect_error($$update public.team_settings set commitment_level = 4$$, 'Nivell 4 rebutjat (només 1, 2 o 3)');
select public.league_set('00000000-0000-0000-0000-0000000000b2', 12, 8);   -- 1,5 de promig
select public.league_set('00000000-0000-0000-0000-0000000000e5', 14, 7);   -- 2,0 de promig
select public.league_set('00000000-0000-0000-0000-0000000000f6', 20, 4);   -- 5,0 però només 4 entrenaments
select pg_temp.check((select string_agg(display_name || ':' || coalesce(rank::text, '-') || ':' || to_char(coalesce(average,0), 'FM0.00'), ', ' order by qualified desc, average desc) from public.league_table())
  = 'Elna:1:2.00, Berta:2:1.50, Fiona (nova):-:5.00', 'Classificació per promig; amb menys de 6 entrenaments no es classifica');
select pg_temp.check(public.league_change('00000000-0000-0000-0000-0000000000f6', 'trainings', 2) = 6, 'El staff suma entrenaments (+2 → 6)');
select pg_temp.check((select rank from public.league_table() where display_name = 'Fiona (nova)') = 1, 'Amb 6 entrenaments Fiona es classifica i, amb 3,33 de promig, és primera');
select pg_temp.check(public.league_change('00000000-0000-0000-0000-0000000000b2', 'points', -50) = 0, 'Restar mai deixa punts negatius');
select pg_temp.check(public.league_change('00000000-0000-0000-0000-0000000000b2', 'points', 12) = 12, 'Sumar punts d''un cop');
select pg_temp.expect_error($$select public.league_change('00000000-0000-0000-0000-00000000000a', 'points', 1)$$, 'No es poden donar punts al staff');
select pg_temp.expect_error($$select public.league_change('00000000-0000-0000-0000-0000000000b2', 'goals', 1)$$, 'Camp desconegut rebutjat');
-- Empat de promig: mana qui té més punts
select public.league_set('00000000-0000-0000-0000-0000000000b2', 14, 7);
select pg_temp.check((select string_agg(display_name || ':' || rank, ', ' order by rank, display_name) from public.league_table() where display_name in ('Berta','Elna'))
  = 'Berta:2, Elna:2', 'Mateix promig i mateixos punts: mateixa posició');
-- Final del dia: es desa la posició
reset role; select public.snapshot_league();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); set role authenticated;
select pg_temp.check((select string_agg(display_name || ':' || coalesce(prev_rank::text, '-'), ', ' order by display_name) from public.league_table())
  = 'Berta:2, Elna:2, Fiona (nova):1', 'Posició d''ahir desada');
-- Mesos anteriors: guanya el millor promig entre les classificades
reset role;
insert into public.league_points (profile_id, month, points, trainings) values
  ('00000000-0000-0000-0000-0000000000e5', date_trunc('month', now() at time zone 'Europe/Madrid')::date - interval '1 month', 20, 10),  -- 2,0
  ('00000000-0000-0000-0000-0000000000b2', date_trunc('month', now() at time zone 'Europe/Madrid')::date - interval '1 month', 30, 20),  -- 1,5 (més punts, però menys promig)
  ('00000000-0000-0000-0000-0000000000f6', date_trunc('month', now() at time zone 'Europe/Madrid')::date - interval '1 month', 25, 5);   -- 5,0 però només 5 entrenaments
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); set role authenticated;
select pg_temp.check((select string_agg(display_name || ':' || to_char(average, 'FM0.00'), ', ') from public.league_winners()) = 'Elna:2.00',
  'Guanyadora del mes passat: millor promig amb el mínim d''entrenaments (Elna)');
select pg_temp.check((select points from public.league_table() where display_name = 'Elna') = 14, 'Els punts del mes passat no compten aquest mes');
select pg_temp.expect_error($$insert into public.league_points (profile_id, month) values ('00000000-0000-0000-0000-0000000000b2', '2026-10-15')$$, 'El mes sempre és el dia 1');

reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e5', false); set role authenticated;
select pg_temp.check((select count(*) from public.league_table()) = 3, 'Una jugadora veu tota la classificació de la lliga');
select pg_temp.check((select count(*) from public.league_winners()) = 1, 'Una jugadora veu l''historial de guanyadores');
select pg_temp.check((select commitment_level from public.team_settings) = 2, 'Una jugadora veu el nivell de l''equip');
with u as (update public.team_settings set commitment_level = 3 returning 1) select pg_temp.check(count(*) = 0, 'Una jugadora no pot canviar el nivell') from u;
with u as (update public.team_settings set league_min_trainings = 1 returning 1) select pg_temp.check(count(*) = 0, 'Una jugadora no pot canviar el mínim d''entrenaments') from u;
select pg_temp.expect_error($$select public.league_change('00000000-0000-0000-0000-0000000000e5', 'points', 10)$$, 'Una jugadora no es pot sumar punts');
select pg_temp.expect_error($$select public.league_change('00000000-0000-0000-0000-0000000000e5', 'trainings', 10)$$, 'Una jugadora no es pot sumar entrenaments');
select pg_temp.expect_error($$select public.league_set('00000000-0000-0000-0000-0000000000e5', 99, 9)$$, 'Una jugadora no es pot posar punts');
select pg_temp.expect_error($$select * from public.league_points$$, 'Una jugadora no pot tocar la taula de punts directament');
select pg_temp.expect_error($$select public.snapshot_league()$$, 'Una jugadora no pot canviar les posicions');
reset role; select set_config('request.jwt.claim.sub','', false); set role anon;
select pg_temp.expect_error($$select * from public.league_table()$$, 'Anònim no pot veure la lliga');

-- =============== ASSISTÈNCIA ===============
reset role;
insert into public.sessions (id, session_date, kind, name) values
  ('77777777-0000-0000-0000-000000000001', (select today from vars), 'Entrenament', 'Entreno llista'),
  ('77777777-0000-0000-0000-000000000002', (select today from vars), 'Partit', 'Partit llista'),
  ('77777777-0000-0000-0000-000000000003', (select today from vars), 'Entrenament', 'Entreno que s''esborrarà');
create temp table att0 as select trainings from public.league_points where profile_id = '00000000-0000-0000-0000-0000000000e5' and month = public.league_month();
grant select on att0 to authenticated, anon;
create function pg_temp.elna_tr() returns integer language sql security definer as $$
  select trainings from public.league_points where profile_id = '00000000-0000-0000-0000-0000000000e5' and month = public.league_month() $$;
grant execute on function pg_temp.elna_tr() to authenticated, anon;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); set role authenticated;
insert into public.attendance (session_id, player_id, present) values ('77777777-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e5', true);
select pg_temp.check(pg_temp.elna_tr() = (select trainings from att0) + 1, 'Present a un entrenament: +1 entrenament a la lliga');
insert into public.attendance (session_id, player_id, present) values ('77777777-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e5', true)
  on conflict (session_id, player_id) do update set present = excluded.present;
select pg_temp.check(pg_temp.elna_tr() = (select trainings from att0) + 1, 'Tornar a marcar present no suma dues vegades');
update public.attendance set present = false where session_id = '77777777-0000-0000-0000-000000000001' and player_id = '00000000-0000-0000-0000-0000000000e5';
select pg_temp.check(pg_temp.elna_tr() = (select trainings from att0), 'Canviar a absent el resta');
update public.attendance set present = true where session_id = '77777777-0000-0000-0000-000000000001' and player_id = '00000000-0000-0000-0000-0000000000e5';
insert into public.attendance (session_id, player_id, present) values ('77777777-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e5', true);
select pg_temp.check(pg_temp.elna_tr() = (select trainings from att0) + 1, 'Present a un partit no compta com a entrenament');
insert into public.attendance (session_id, player_id, present) values ('55555555-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e5', true);
insert into public.attendance (session_id, player_id, present) values ('77777777-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e5', true);
select pg_temp.check(pg_temp.elna_tr() = (select trainings from att0) + 2, 'Un segon entrenament avui: +1');
delete from public.sessions where id = '77777777-0000-0000-0000-000000000003';
select pg_temp.check(pg_temp.elna_tr() = (select trainings from att0) + 1, 'Esborrar la sessió treu també l''entrenament de la lliga');
select pg_temp.check((select marked_by from public.attendance where session_id = '77777777-0000-0000-0000-000000000001' and player_id = '00000000-0000-0000-0000-0000000000e5') = '00000000-0000-0000-0000-00000000000a', 'Queda guardat qui ha passat llista');
select pg_temp.expect_error($$insert into public.attendance (session_id, player_id, present) values ('77777777-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', true)$$, 'No es pot passar llista al staff');
insert into public.attendance (session_id, player_id, present) values ('77777777-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', false);
reset role;
select pg_temp.check((select trainings from public.league_points where profile_id = '00000000-0000-0000-0000-0000000000e5' and month = date_trunc('month', date '2026-03-10')::date) = 1,
  'Un entrenament d''un altre mes suma a la lliga d''aquell mes');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e5', false); set role authenticated;
select pg_temp.check((select count(*) from public.attendance) = 3 and (select bool_and(player_id = '00000000-0000-0000-0000-0000000000e5') from public.attendance), 'Una jugadora veu només la seva assistència');
select pg_temp.expect_error($$insert into public.attendance (session_id, player_id, present) values ('77777777-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', true)$$, 'Una jugadora no pot passar llista');
with u as (update public.attendance set present = true returning 1) select pg_temp.check(count(*) = 0, 'Una jugadora no pot canviar la seva assistència') from u;
with d as (delete from public.attendance returning 1) select pg_temp.check(count(*) = 0, 'Una jugadora no pot esborrar l''assistència') from d;
reset role; select set_config('request.jwt.claim.sub','', false); set role anon;
select pg_temp.expect_error($$select * from public.attendance$$, 'Anònim no pot veure l''assistència');

-- =============== ABSENT -> SENSE MULTA DE L'RPE ===============
reset role;
select pg_temp.check((select count(*) from public.fines where auto_session_id = '66666666-0000-0000-0000-000000000001' and auto_kind = 'rpe') = 2,
  'Les multes automàtiques saben de quina sessió i tipus són');
update public.fines set paid = true where auto_session_id = '66666666-0000-0000-0000-000000000001' and auto_kind = 'rpe' and person_id = '00000000-0000-0000-0000-0000000000e5';
insert into public.fines (person_id, reason, amount_cents, fine_date, notes, auto_session_id, auto_kind)
  values ('00000000-0000-0000-0000-0000000000b2', 'Wellness', 100, (select today from vars) - 1, 'Automàtica · wellness no fet · x', '66666666-0000-0000-0000-000000000001', 'wellness');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false); set role authenticated;
insert into public.attendance (session_id, player_id, present) values
  ('66666666-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', false),
  ('66666666-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e5', false);
reset role;
select pg_temp.check((select count(*) from public.fines where auto_session_id = '66666666-0000-0000-0000-000000000001' and person_id = '00000000-0000-0000-0000-0000000000b2' and auto_kind = 'rpe') = 0,
  'Absent a la llista: es treu la multa de l''RPE');
select pg_temp.check((select count(*) from public.fines where auto_session_id = '66666666-0000-0000-0000-000000000001' and person_id = '00000000-0000-0000-0000-0000000000b2' and auto_kind = 'wellness') = 1,
  'Absent a la llista: la multa del wellness es queda');
select pg_temp.check((select count(*) from public.fines where auto_session_id = '66666666-0000-0000-0000-000000000001' and person_id = '00000000-0000-0000-0000-0000000000e5' and auto_kind = 'rpe') = 1,
  'Una multa de l''RPE ja pagada no s''esborra');
select pg_temp.check(public.apply_auto_fines() = 0, 'Absent: no es torna a posar la multa de l''RPE');

-- Entrenament nou d'ahir: Berta consta com a absent abans que passi la revisió
insert into public.sessions (id, session_date, kind, name, created_at) values
  ('66666666-0000-0000-0000-000000000005', (select today from vars) - 1, 'Entrenament', 'Entreno ahir 2', now() - interval '5 days');
insert into public.attendance (session_id, player_id, present) values ('66666666-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000b2', false);
select pg_temp.check(public.apply_auto_fines() = 3, 'Revisió: Berta (absent) només multa de wellness; Elna wellness i RPE');
select pg_temp.check((select string_agg(auto_kind, ',' order by auto_kind) from public.fines where auto_session_id = '66666666-0000-0000-0000-000000000005' and person_id = '00000000-0000-0000-0000-0000000000b2') = 'wellness',
  'Absent: sense multa de l''RPE, però sí del wellness');
update public.attendance set present = true where session_id = '66666666-0000-0000-0000-000000000005' and player_id = '00000000-0000-0000-0000-0000000000b2';
update public.attendance set present = true where session_id = '66666666-0000-0000-0000-000000000001' and player_id = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.check(public.apply_auto_fines() = 2, 'Si es corregeix a present, la multa de l''RPE es torna a posar');
