# Wellness CE Europa

App web (mòbil primer) perquè les jugadores omplin el **wellness** (abans de la sessió) i l'**RPE** (després), i el staff vegi els resultats.

- `supabase/schema.sql` — tota la base de dades i la seguretat (enganxar a Supabase > SQL Editor).
- `supabase/tests/` — proves de seguretat (Row Level Security) amb un Postgres local.
- `app/` — pantalles (Next.js). `/j` jugadora, `/entrenador` staff, `/api/admin` accions amb la clau secreta.

Variables d'entorn: vegeu `.env.example`.

## Publicació

Vercel publica automàticament cada canvi a la branca `main`.
