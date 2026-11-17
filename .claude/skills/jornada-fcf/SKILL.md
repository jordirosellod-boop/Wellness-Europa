---
name: jornada-fcf
description: Posa a l'app Wellness Europa els resultats, dates, hores i camps d'una jornada (o de l'acta d'un partit) que l'usuari ha copiat de la web de la FCF, comprova que la classificació quadri i ho publica. Fes-lo servir quan l'usuari enganxi text de la FCF (pestanya Resultats, Calendari o Classificació).
---

# Jornada de la FCF

La FCF no deixa que l'app llegeixi les dades sola (el seu servei bloqueja els programes). **No ho forcis** (ni fent veure que som un navegador ni amb capçaleres falses): l'usuari copia la web com un espectador i nosaltres ho posem a l'app.

## Resultats d'una jornada (text amb «INFORMACIÓ DEL CAMP»)
1. Desa el text al scratchpad i llegeix-lo amb `parseResultsText` de `lib/fcf-paste.ts` (node `--experimental-strip-types`).
2. Relaciona cada partit amb el calendari del grup (`lib/fcf-snapshot.json`, camp `matches`) pels dos equips. Si la FCF ha girat local i visitant, tria el partit de la mateixa jornada (el més proper en data) i gira els gols.
3. Afegeix-ho a `lib/fcf-manual-seed.json`:
   - `manual[acta_id] = { kickoff: "AAAA-MM-DDTHH:MM:00", home_goals, away_goals, closed: true }` (sense gols ni `closed` si encara no s'ha jugat);
   - `venues[acta_id] = nom del camp` (amb majúscules normals).
   **Només dades dels clubs. Mai noms de jugadores.**
4. Calcula la classificació amb el calendari + `manual` i compara-la amb la de la FCF si l'usuari l'ha passada. Si no quadra, avisa de quin partit falta o està malament.
5. `tsc`, commit i skill `publicar`. Digues a l'usuari que toqui «↻ Actualitzar ara» a Estadístiques si ho vol veure de seguida.

## Acta d'un partit (text amb «DATA:» i «TITULARS»)
Porta noms de jugadores: **no la posis al codi**. Digues a l'usuari que l'enganxi ell a l'app (Estadístiques › «📋 Enganxar de la FCF»), que ho desa a la base de dades protegida. Només el resultat, la data i el camp del partit es poden posar al `fcf-manual-seed.json`.
