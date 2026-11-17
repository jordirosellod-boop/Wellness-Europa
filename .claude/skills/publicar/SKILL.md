---
name: publicar
description: Publica l'app Wellness Europa (branca claude/wellness-app → main → Vercel) amb reintents i comprova que la versió nova és a la web. Fes-lo servir quan l'usuari digui «publica», «puja-ho» o similar, i només després que hagi aprovat els canvis visuals.
---

# Publicar

1. Comprova abans: `./node_modules/.bin/tsc --noEmit -p .`, `./node_modules/.bin/eslint .` i, si s'ha tocat la base de dades, `sh supabase/tests/run.sh` (cap `FALLA` ni `ERROR`).
2. Commit a `claude/wellness-app` (missatge en català, sense identificadors de models) acabat amb:
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: <enllaç de la sessió>
   ```
3. Push amb reintents (GitHub de vegades torna 503):
   ```sh
   ok=0; for i in 3 6 12 24; do if git push -q -u origin claude/wellness-app 2>/dev/null; then ok=1; break; fi; sleep $i; done
   git fetch -q origin main && git checkout -q main && git merge -q --ff-only origin/main && git merge -q --ff-only claude/wellness-app \
     && for i in 3 6 12; do git push -q origin main 2>/dev/null && break; sleep $i; done; git checkout -q claude/wellness-app
   ```
4. Si el classificador no deixa publicar `main`, deixa-ho a la branca i demana a l'usuari que digui «publica».
5. Comprova la web real (https://wellness-europa.vercel.app): espera amb un bucle `until` (no `sleep` llargs) que surti el canvi, p. ex. una capçalera o una ruta nova que torni 401 sense sessió.
6. Explica-ho en català senzill: què ha canviat, on ho trobarà i que si no ho veu tanqui i torni a obrir l'app.

Si hi ha un canvi de base de dades pendent, **no publiquis** fins que l'usuari hagi fet el «pas 2b» i digui «fet» (skill `canvi-base-dades`).
