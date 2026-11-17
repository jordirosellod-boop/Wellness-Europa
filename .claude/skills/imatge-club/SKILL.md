---
name: imatge-club
description: Fa imatges amb l'estètica del CE Europa (escut, blau marí i daurat, lletra Escapulada) per a llistes, horaris, reunions o avisos del Juvenil C, i les passa només per xat. Fes-lo servir quan l'usuari demani una «imatge», «llista bonica», «cartell» o similar.
---

# Imatge del club

1. Treballa al scratchpad (mai dins del repositori: pot portar noms de jugadores). Copia-hi `public/escut.png`, `app/fonts/Escapulada.ttf` i, si cal, `public/kits/*.webp` i `public/fons-grada.webp`.
2. Escriu un HTML de 1080 px d'ample:
   - `@font-face { font-family: Esc; src: url(Escapulada.ttf) }` per als títols, noms i números;
   - fons blau marí (`#071a52 → #030a24`) amb la V del club molt suau (svg `M0 0 L100 62 L200 0 L200 22 L100 84 L0 22 Z`, opacitat .04) i una barra daurada a dalt (`#dbb34d → #f6d77a`);
   - targetes `rgba(255,255,255,.06)` amb vora fina, títol de dia amb data en una caixa daurada, hores en daurat clar;
   - dorsals dins una medalla rodona blava amb vora daurada (no damunt de samarretes: el número tapa el patrocinador).
3. Renderitza amb Playwright (`deviceScaleFactor: 2`, `fullPage`) i revisa'n un retall a mida real.
4. Si fa més de 8000 px d'alt, redueix-la (p. ex. 1900 px d'ample) abans d'enviar-la.
5. Envia-la amb `SendUserFile`. **No la publiquis enlloc** ni la posis al repositori. Explica com s'ha muntat (ordre, horaris) i pregunta si cal canviar res.
