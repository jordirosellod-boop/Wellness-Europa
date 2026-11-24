---
name: ebook-abp
description: Manté l'e-book i el llibre en PDF de les accions a pilota aturada (ABP) del CE Europa: afegir o treure jugades, canviar senyals, rols, posicions, responsabilitats defensives o la barrera, i tornar-lo a publicar al mateix enllaç. Fes-lo servir quan l'usuari parli de l'e-book, el llibre d'ABP, les jugades a pilota aturada o en passi un PDF amb dibuixos d'ABP.
---

# E-book d'ABP

- **E-book (el que tenen les jugadores):** https://claude.ai/artifact/6KRXLKistxRC6UK5TSBM1p, compartit amb «qualsevol amb l'enllaç». Sempre es republica **al mateix enllaç** (així les jugadores el veuen actualitzat sense fer res).
- **Llibre:** PDF A5 (`Llibre_ABP_CE_Europa.pdf`) que es passa per xat. Un PDF no s'actualitza sol: cal tornar-lo a enviar.
- **Programa:** `tools/ebook-abp/build.py` (fa `ebook.html` i `llibre.html`) i `tools/ebook-abp/render.js` (fa el PDF i una captura del mòbil).
- **Dades:** `data.json` **no és al repositori** (porta noms de jugadores). Viu publicat amb l'e-book, igual que les imatges `img/*.jpg`.

**Mai** posis `data.json`, imatges de les jugades ni noms de jugadores al repositori. Tot es treballa al scratchpad.

## Passos

1. **Recupera el que hi ha publicat** al scratchpad (carpeta nova, p. ex. `…/scratchpad/ebook`):
   - Artifact `read` amb `url` de l'e-book i `paths`: `["data.json", "escut.png", "Escapulada.ttf", "img/abp-01.jpg", …]` (fes primer un `list` amb `scope: "files"` per veure-les totes), amb `out_dir` = aquesta carpeta.
   - Si no hi ha `escut.png` o `Escapulada.ttf`: copia `public/escut.png` (reduït a ~420 px) i `app/fonts/Escapulada.ttf`.
2. **Canvia `data.json`** segons el que demani l'usuari:
   - `plays`: `{cat, name, signal, img}` en l'ordre del llibre. `cat`: `C` còrner ofensiu, `F` falta lateral, `D` còrner defensiu, `E` falta lateral defensiva. Les defensives van amb `signal: null` (mostren les posicions en lloc de la senyal). La numeració (C1…C9, FL1…) surt sola.
   - `sections`: les seccions i quines categories hi van.
   - `roles`, `positions`, `position_meaning`, `responsibilities`, `responsibility_of_position`, `barrier`.
   - Respecta el vocabulari del míster: **contra defensiva** = a l'ABP ofensiva (les que es queden enrere); **contra ofensiva** = a l'ABP defensiva (les que es queden a dalt). **I** = interval. Si no saps què vol dir una lletra, pregunta-ho; no l'inventis.
   - Les senyals, en català correcte (p. ex. «Dues mans», «Mà estesa cap avall»).
3. **Dibuixos nous** (d'un PDF de l'usuari): `pdftoppm -scale-to-x 1600 -scale-to-y -1 -png`, retalla la franja blava de baix (a 1600 px d'ample comença cap a y = 1004) i, si hi ha el nom de la jugada escrit dins el camp, tapa'l amb el verd del camp (135,175,53). Desa com a `img/abp-NN.jpg` (qualitat ~84).
4. **Fes-lo:** `python3 -I tools/ebook-abp/build.py <carpeta>` i `node tools/ebook-abp/render.js <carpeta>`. Mira les pàgines noves del PDF (`pdftoppm -r 45 -f N -l M`) i `ebook-mobil.png`: res tallat ni amuntegat.
5. **Publica al mateix enllaç:** Artifact `publish` amb `url` de l'e-book, `file_path` = `<carpeta>/ebook.html`, `root` = `<carpeta>` i `files` amb `data.json` i les imatges noves o canviades. Envia el PDF amb `SendUserFile`.
6. **Explica-ho en català senzill:** què ha canviat, que l'enllaç ja es veu actualitzat (si el tenen obert, que el tornin a obrir) i que el PDF s'ha de tornar a enviar. Si alguna explicació l'has escrit tu (no te l'ha donada l'usuari), digues-ho perquè la revisi.
