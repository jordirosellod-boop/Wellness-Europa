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
