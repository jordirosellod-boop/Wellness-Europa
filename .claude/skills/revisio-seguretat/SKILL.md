---
name: revisio-seguretat
description: Revisió de seguretat completa de Wellness Europa (rutes del servidor, base de dades, claus i noms dins del codi, dependències i capçaleres de la web real). Fes-la quan l'usuari demani «revisa la seguretat» o cada mes.
---

# Revisió de seguretat

1. **Rutes del servidor** (`app/api/**/route.ts`): cada una ha de comprovar la sessió i el rol (`role !== "coach"`, responsable de l'app) o la clau interna amb `sameSecret`. Les úniques obertes a propòsit: escuts (`/api/fcf/crest`, `/api/fcf/crests`), la clau pública de notificacions (`/api/push/key`), el calendari (amb el seu enllaç secret) i la tornada de Google (amb `state`).
2. **Base de dades**: `sh supabase/tests/run.sh` (totes OK) i l'actualització des de la versió anterior. Revisa que cada taula nova tingui RLS, sigui al `revoke all` i tingui proves.
3. **Claus i dades personals al codi**:
   ```sh
   git grep -nIE "(sb_secret_[A-Za-z0-9]|eyJhbGciOi|AIza[0-9A-Za-z_-]{20}|GOCSPX|-----BEGIN)" -- . ':!package-lock.json' ':!.env.example'
   ```
   i busca noms de jugadores (de la plantilla, de les actes) a `lib/`, `supabase/tests/` i fitxers JSON. Si n'hi ha, substitueix-los per noms inventats o treu-los.
4. **HTML perillós**: `git grep -n "dangerouslySetInnerHTML\|innerHTML"` només amb text fix.
5. **Dependències**: `npm audit` (també les eines). Si Next.js té un avís, actualitza'l en una branca a part, comprova `tsc`, `eslint`, `next build` i proves, i després publica.
6. **Web real** (https://wellness-europa.vercel.app): capçaleres `strict-transport-security`, `permissions-policy`, `x-frame-options: DENY`, `x-content-type-options: nosniff`; i que les rutes protegides tornin 401 sense sessió (p. ex. `POST /api/cron/avisos`, `POST /api/fcf/import`, `GET /api/fcf/bigdata`).
7. Explica en català què estava bé, què has arreglat i què ha de saber l'usuari. Arregla-ho a la branca i publica amb el skill `publicar`.
