---
name: canvi-base-dades
description: Canvis a l'estructura de la base de dades de Wellness Europa (taules, columnes, polítiques RLS, funcions) amb proves, actualització des de la versió anterior i la pàgina del SQL per a l'usuari («pas 2b»). Fes-lo servir sempre que calgui tocar supabase/schema.sql.
---

# Canvi de base de dades

L'usuari no és tècnic: ell executa el SQL a Supabase (pas 2b) i diu «fet». **Mai** demanis la Secret key ni la contrasenya de la base de dades.

1. Edita `supabase/schema.sql` perquè es pugui tornar a executar sense perdre dades (`create table if not exists`, `alter table … add column if not exists`, `drop policy if exists` + `create policy`, `drop constraint if exists` + `add constraint`).
2. Regles: RLS a totes les taules; límits a la base de dades (`check`); dades de salut només staff; dades mínimes de menors; afegeix la taula al `revoke all … from anon, authenticated` i dona només els permisos justos. Si una política d'una taula consulta una altra amb RLS, fes servir una funció `security definer` per evitar bucles.
3. Afegeix proves a `supabase/tests/rls_test.sql` (què pot fer el staff, què no pot fer una jugadora, què no veu un anònim). Fes servir noms inventats, mai noms reals.
4. Executa:
   ```sh
   sh supabase/tests/run.sh 2>&1 | grep -E "FALLA|ERROR"; sh supabase/tests/run.sh | grep -c "^OK"
   git show HEAD:supabase/schema.sql > /tmp/old.sql   # al scratchpad
   sh supabase/tests/run.sh /tmp/old.sql | grep -c "^OK"   # actualització des de la versió anterior
   ```
   Tot ha de passar (cap `FALLA` ni `ERROR`, el mateix nombre d'OK).
5. Pàgina del SQL (artifact https://claude.ai/artifact/G3cvaNy3ZoJfLpJCVsvvj5): llegeix-la amb `Artifact read` si no tens la còpia local, treu-ne l'embolcall de publicació (tot el que hi ha abans de `<title>` i el `</body></html>` final), substitueix la línia que comença per `const SQL = ` per `const SQL = <JSON del schema.sql>;` i torna-la a publicar al mateix enllaç.
6. Fes commit a la branca (sense publicar a main) i digues a l'usuari: «Pas 2b: a l'enllaç toca "2b. Copiar tot el SQL", enganxa-ho a Supabase i fes Run. Digues "fet" i ho publico.»
7. Quan digui «fet», segueix el skill `publicar`.
