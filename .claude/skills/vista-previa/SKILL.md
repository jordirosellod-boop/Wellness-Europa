---
name: vista-previa
description: Ensenya un canvi visual de Wellness Europa abans de publicar-lo, amb un vídeo o captures fets amb Playwright i dades d'exemple. Fes-lo servir per a qualsevol canvi estètic o pantalla nova (l'usuari vol veure-ho abans de dir «publica»).
---

# Vista prèvia

1. Fes el canvi i desa'l a la branca `claude/wellness-app` (no publiquis a main).
2. Crea una pàgina temporal `app/zz-preview/page.tsx` amb les peces reals (components i classes CSS) i **dades inventades**: noms d'exemple (Laia M., Núria P.…), escuts del club o cercles amb inicials, i samarretes (`/kits/*.webp`) en lloc de fotos. **Mai** fotos ni noms reals de jugadores.
   - Si ha d'avançar per escenes, fes servir `setTimeout` i posa `window.__done = true` al final.
   - Els elements que van a `document.body` amb portal, embolica'ls amb un `<div>` dins la pàgina (si no, el `main > *` els canvia el retard d'animació).
3. Engega `./node_modules/.bin/next dev -p 3310` en segon pla i espera que `curl localhost:3310/zz-preview` torni 200.
4. Grava amb Playwright (Chromium ja instal·lat):
   - mida de mòbil: finestra 780×1688 i `html{zoom:2}` amb `addStyleTag` (també `nextjs-portal{display:none}` i `.splash{display:none}`), `sessionStorage.setItem('skip-splash','1')`;
   - `recordVideo` de la mateixa mida; espera `window.__done` i uns segons més;
   - passa-ho a MP4: `ffmpeg -ss 0.8 -i vid.webm -vf fps=30 -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart`.
5. Mira'n fotogrames (`ffmpeg -ss T -frames:v 1`) en una sola imatge per detectar errors abans d'enviar-lo. Arregla el que no quedi bé i torna a gravar.
6. Esborra `app/zz-preview`, atura el servidor, comprova `tsc` i `eslint`, fes commit a la branca.
7. Envia el vídeo amb `SendUserFile` (display render) i explica cada detall en català. Acaba amb: «Si t'agrada, digues **publica**».
