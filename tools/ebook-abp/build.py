import html, json, os
# Ús: python3 -I build.py <carpeta>  (la carpeta té data.json, img/, escut.png i Escapulada.ttf)
import sys
D = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")

# Totes les dades (jugades, senyals, rols, responsabilitats) són a data.json, al costat de les imatges.
_d = json.load(open(os.path.join(D, "data.json"), encoding="utf-8"))
PLAYS = [(p["cat"], p["name"], p.get("signal"), p["img"]) for p in _d["plays"]]
CAT = {k: (v["label"], v["code"], "", "") for k, v in _d["categories"].items()}
SECTS = [(tuple(x["cats"]), x["title"], x["em"], x["big"]) for x in _d["sections"]]
DEF = tuple(_d["defensive_cats"])
POS = _d["positions"]
MEAN = _d["position_meaning"]
SEQ = {}
for _k, _p in enumerate(PLAYS, 1):
    SEQ[_k] = sum(1 for q in PLAYS[:_k] if q[0] == _p[0])
def label(k): return CAT[PLAYS[k-1][0]][0] if PLAYS[k-1][0] in DEF else f"{CAT[PLAYS[k-1][0]][0]} {SEQ[k]}"
def code(k): return CAT[PLAYS[k-1][0]][1] if PLAYS[k-1][0] in DEF else f"{CAT[PLAYS[k-1][0]][1]}{SEQ[k]}"
RESP = [tuple(x) for x in _d["responsibilities"]]
RESP_OF = _d["responsibility_of_position"]
BARRERA = _d["barrier"]
def resp_html(cls=""):
    rows = "".join(f'<tr><td class="c">{e(a)}</td><td class="n">{e(b.upper())}</td></tr>' for a, b in RESP)
    bar = "".join(f'<li><span>{i}</span>{e(n.upper())}</li>' for i, n in enumerate(BARRERA, 1))
    return (f'<div class="resp {cls}"><div><div class="k">RESPONSABILITATS · REFERÈNCIES</div><table class="sig">{rows}</table></div>'
            f'<div><div class="k">BARRERA · ORDRE A LES FALTES DIRECTES</div><ol class="barrera">{bar}</ol></div></div>')
def pos_html(k):
    cat = PLAYS[k-1][0]
    rows = "".join(f'<li><b>{e(p)}</b><span>{e(MEAN.get(p, ""))}{f"<em>{e(RESP_OF[p])}</em>" if p in RESP_OF else ""}</span></li>' for p in POS[cat])
    return f'<div class="pos"><div class="k">POSICIONS</div><ul>{rows}</ul></div>'
def box(k):
    sig = PLAYS[k-1][2]
    if sig is None: return pos_html(k)
    return f'<div class="signal"><div class="hand" aria-hidden="true">✋</div><div><div class="k">SENYAL</div><b>{e(sig.upper())}</b></div></div>'
ROLES = [(r["name"], r["icon"], r["what"], r["players"]) for r in _d["roles"]]
e = html.escape

PATTERN = ("url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='16'%3E%3Cpath d='M0 3 L7 9 L14 3 L21 9 L28 3' "
           "fill='none' stroke='%232b5bd0' stroke-opacity='.55' stroke-width='2.2'/%3E%3C/svg%3E\")")

BASE_CSS = """
@font-face { font-family: Esc; src: url(Escapulada.ttf) format("truetype"); font-display: block; }
:root { --navy: #061847; --navy2: #0b2a6e; --royal: #0a2ea0; --gold: #d9b25a; --goldl: #f6d77a; --ice: #eef3fb; --ink: #0b1846; --green: #87af35; --muted: #5a6690;
  --display: Esc, Impact, "Arial Narrow", sans-serif; --body: "Helvetica Neue", Arial, system-ui, sans-serif; --pattern: %s; }
""" % PATTERN

def roles_html(cls=""):
    out = []
    for name, icon, what, people in ROLES:
        out.append(f'<div class="role {cls}"><div class="role-h"><span class="role-i" aria-hidden="true">{icon}</span><b>{e(name.upper())}</b></div>'
                   f'<p>{e(what)}</p><div class="names">' + "".join(f"<span>{e(p.upper())}</span>" for p in people) + "</div></div>")
    return "".join(out)

def signals_rows(link=False):
    rows = []
    for i, (s, n, sig, _img) in enumerate(PLAYS, 1):
        if sig is None: continue
        name = f'<a href="#jugada-{i}" data-go="jugada-{i}">{e(n.upper())}</a>' if link else e(n.upper())
        rows.append(f'<tr><td class="c">{code(i)}</td><td class="n">{name}</td><td class="s">{e(sig)}</td></tr>')
    return "".join(rows)

LEGEND = """
<div class="legend">
  <div><svg viewBox="0 0 60 16" aria-hidden="true"><path d="M2 8 H50" stroke="#fff" stroke-width="3"/><path d="M44 3 L52 8 L44 13" fill="none" stroke="#fff" stroke-width="3"/></svg><span><b>PILOTA</b> Línia blanca contínua: el camí de la pilota.</span></div>
  <div><svg viewBox="0 0 60 16" aria-hidden="true"><path d="M2 8 H50" stroke="#0b1846" stroke-width="3" stroke-dasharray="3 3"/><path d="M44 3 L52 8 L44 13" fill="none" stroke="#0b1846" stroke-width="3"/></svg><span><b>MOVIMENT</b> Línia de punts blau marí: on corre la jugadora.</span></div>
  <div><svg viewBox="0 0 60 30" aria-hidden="true"><circle cx="30" cy="15" r="12" fill="#fff" stroke="#0b1846" stroke-width="2"/><path d="M24 4 L30 10 L36 4" fill="none" stroke="#0b1846" stroke-width="3"/></svg><span><b>JUGADORA</b> Cada cercle és una de nosaltres.</span></div>
</div>"""

# ---------------- LLIBRE (PDF A5) ----------------
def book():
    css = BASE_CSS + """
@page { size: 148mm 210mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: var(--ink); font-family: var(--body); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pg { width: 148mm; height: 210mm; position: relative; overflow: hidden; page-break-after: always; break-after: page; }
.pg:last-child { page-break-after: auto; }
.pad { position: absolute; inset: 14mm 12mm 18mm; }
h2 { font-family: var(--display); font-weight: 400; color: var(--navy); font-size: 30pt; line-height: .95; letter-spacing: .01em; }
h2 em { font-style: normal; color: var(--royal); }
.k { font-family: var(--display); letter-spacing: .25em; color: var(--gold); font-size: 9pt; }
.band { position: absolute; left: 0; right: 0; bottom: 0; height: 13mm; background: var(--navy) var(--pattern); display: flex; align-items: center; justify-content: space-between; padding: 0 9mm; color: #fff; }
.band img { height: 8mm; }
.band .brand { display: flex; align-items: center; gap: 2.5mm; font-family: var(--display); font-size: 9pt; line-height: 1; letter-spacing: .04em; }
.band .num { font-family: var(--display); font-size: 12pt; color: var(--goldl); }
.goldline { height: 1.2mm; background: linear-gradient(90deg, var(--gold), var(--goldl), var(--gold)); }
/* Coberta */
.cover { background: radial-gradient(120% 70% at 70% 10%, #12307a, #061847 60%, #030a24); color: #fff; }
.cover::before { content: ""; position: absolute; inset: 0; background: var(--pattern); opacity: .35; }
.cover .v { position: absolute; left: -10mm; right: -10mm; top: -20mm; height: 120mm; background: linear-gradient(#fff, #fff) ; clip-path: polygon(0 0, 18% 0, 50% 72%, 82% 0, 100% 0, 100% 0, 50% 100%, 0 0); opacity: .06; }
.cover .crest { position: absolute; left: 50%; top: 30mm; width: 52mm; margin-left: -26mm; filter: drop-shadow(0 6mm 8mm rgba(0,0,0,.5)); }
.cover .t { position: absolute; left: 0; right: 0; top: 92mm; text-align: center; }
.cover .t .k { font-size: 10pt; }
.cover h1 { font-family: var(--display); font-weight: 400; font-size: 56pt; line-height: .88; margin-top: 3mm; }
.cover h1 em { font-style: normal; color: var(--goldl); }
.cover .sub { font-family: var(--display); letter-spacing: .12em; font-size: 11pt; margin-top: 6mm; color: #d8e1ff; }
.cover .foot { position: absolute; left: 0; right: 0; bottom: 16mm; text-align: center; font-family: var(--display); letter-spacing: .3em; font-size: 9pt; color: var(--goldl); }
.cover .goldline { position: absolute; left: 0; right: 0; top: 0; }
/* Pàgines de text */
.intro p { font-size: 10pt; line-height: 1.5; color: #2a3558; margin-top: 4mm; }
.legend { display: grid; gap: 3mm; margin-top: 6mm; }
.legend > div { display: grid; grid-template-columns: 16mm 1fr; gap: 3mm; align-items: center; background: var(--green); border-radius: 3mm; padding: 2.5mm 3mm; color: #fff; font-size: 9pt; }
.legend svg { width: 16mm; height: 6mm; }
.legend b { font-family: var(--display); font-weight: 400; letter-spacing: .06em; font-size: 10pt; margin-right: 1.5mm; }
.roles { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm; margin-top: 6mm; }
.role { background: var(--ice); border-radius: 3mm; padding: 3mm; border-top: 1.2mm solid var(--royal); }
.role-h { display: flex; align-items: center; gap: 2mm; }
.role-h b { font-family: var(--display); font-weight: 400; font-size: 13pt; color: var(--navy); letter-spacing: .02em; }
.role-i { font-size: 11pt; }
.role p { font-size: 7.6pt; color: var(--muted); margin-top: 1mm; line-height: 1.3; }
.names { display: flex; flex-wrap: wrap; gap: 1.4mm; margin-top: 2mm; }
.names span { font-family: var(--display); font-size: 10pt; letter-spacing: .04em; background: var(--navy); color: #fff; border-radius: 5mm; padding: .6mm 2.4mm .2mm; }
table.sig { width: 100%; border-collapse: collapse; margin-top: 6mm; }
table.sig td { padding: 2.6mm 2mm; border-bottom: .3mm solid #d9e0ef; font-size: 10pt; }
table.sig tr:nth-child(odd) td { background: var(--ice); }
table.sig .c { font-family: var(--display); color: var(--gold); width: 10mm; font-size: 11pt; }
table.sig .n { font-family: var(--display); font-size: 14pt; color: var(--navy); letter-spacing: .02em; }
table.sig .s { text-align: right; color: #2a3558; }
/* Separador de secció */
.sect { background: var(--navy); color: #fff; }
.sect::before { content: ""; position: absolute; inset: 0; background: var(--pattern); opacity: .5; }
.sect .big { position: absolute; right: -6mm; bottom: 8mm; font-family: var(--display); font-size: 200pt; line-height: .8; color: rgba(255,255,255,.07); }
.sect .t { position: absolute; left: 12mm; top: 60mm; }
.sect h2 { color: #fff; font-size: 44pt; }
.sect h2 em { color: var(--goldl); }
.sect ul { list-style: none; margin-top: 8mm; display: grid; gap: 2.5mm; }
.sect li { font-family: var(--display); font-size: 16pt; letter-spacing: .03em; display: flex; gap: 3mm; align-items: baseline; }
.sect li span { color: var(--goldl); font-size: 11pt; }
/* Jugada */
.play .head { display: flex; justify-content: space-between; align-items: flex-end; }
.play .head .num { font-family: var(--display); font-size: 40pt; line-height: .8; color: var(--ice); -webkit-text-stroke: .5mm var(--navy); }
.play h2 { font-size: 34pt; margin-top: 1mm; }
.play .dia { margin-top: 5mm; border-radius: 3mm; overflow: hidden; box-shadow: 0 2mm 5mm rgba(6,24,71,.25); border: .8mm solid var(--navy); }
.play .dia img { display: block; width: 100%; }
.signal { margin-top: 5mm; display: grid; grid-template-columns: auto 1fr; gap: 4mm; align-items: center; background: var(--navy); color: #fff; border-radius: 3mm; padding: 3.5mm 4mm; }
.signal .k { font-size: 8.5pt; }
.signal b { font-family: var(--display); font-weight: 400; font-size: 20pt; color: var(--goldl); letter-spacing: .02em; display: block; line-height: 1; margin-top: 1mm; }
.signal .hand { width: 13mm; height: 13mm; border-radius: 50%; background: var(--goldl); display: grid; place-items: center; font-size: 16pt; }
.pos { margin-top: 4mm; background: var(--navy); color: #fff; border-radius: 3mm; padding: 3mm 4mm; }
.pos ul { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 1.6mm 4mm; margin-top: 1.5mm; }
.pos li { display: flex; gap: 2mm; align-items: baseline; font-size: 8pt; color: #d8e1ff; }
.pos li b { font-family: var(--display); font-weight: 400; font-size: 11pt; color: var(--goldl); min-width: 17mm; letter-spacing: .03em; }
.pos li em { display: block; font-style: normal; font-family: var(--display); color: #fff; font-size: 9.5pt; letter-spacing: .03em; }
.resp { display: grid; gap: 5mm; margin-top: 4mm; }
.resp table.sig td { padding: 1.8mm 2mm; }
.pos + .notes { display: none; }
.resp table.sig { margin-top: 2mm; }
.resp table.sig .c { width: 30mm; font-size: 12pt; }
ol.barrera { list-style: none; margin-top: 2mm; display: grid; gap: 1.5mm; }
ol.barrera li { display: flex; gap: 3mm; align-items: center; font-family: var(--display); font-size: 12pt; color: var(--navy); background: var(--ice); border-radius: 2mm; padding: 1.3mm 3mm; }
ol.barrera li span { width: 7mm; height: 7mm; border-radius: 50%; background: var(--navy); color: var(--goldl); display: grid; place-items: center; font-size: 11pt; }
.notes { margin-top: 5mm; }
.notes .k { color: var(--muted); letter-spacing: .2em; }
.notes i { display: block; height: 7.5mm; border-bottom: .3mm dashed #b9c4de; }
.back { background: var(--navy); color: #fff; }
.back::before { content: ""; position: absolute; inset: 0; background: var(--pattern); opacity: .4; }
.back .c { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; text-align: center; gap: 5mm; }
.back img { width: 34mm; }
.back p { font-family: var(--display); font-size: 22pt; line-height: 1; }
.back p em { font-style: normal; color: var(--goldl); }
.back small { font-family: var(--display); letter-spacing: .3em; font-size: 8pt; color: #c9d5ff; }
"""
    pages = []
    pn = [0]
    def band():
        pn[0] += 1
        return f'<div class="band"><span class="brand"><img src="escut.png" alt="">CLUB ESPORTIU<br>EUROPA</span><span class="num">{pn[0]}</span></div>'
    pages.append("""<section class="pg cover"><div class="goldline"></div><div class="v"></div><img class="crest" src="escut.png" alt="">
      <div class="t"><div class="k">FUTBOL FEMENÍ · 2a RFEF</div><h1>LLIBRE<br><em>D'ABP</em></h1><div class="sub">ACCIONS A PILOTA ATURADA · 2026/27</div></div>
      <div class="foot">CE EUROPA</div></section>""")
    pn[0] += 1
    pages.append(f"""<section class="pg"><div class="pad intro"><div class="k">ABANS DE COMENÇAR</div><h2>COM LLEGIR<br><em>ELS DIBUIXOS</em></h2>
      <p>Aquí tens totes les nostres jugades d'ABP: còrners i faltes laterals en atac, i com ens col·loquem en defensa. Cada jugada té un nom i una senyal: quan la llançadora la fa, totes sabem què toca. Mira el dibuix, aprèn-te la senyal i escriu a les notes el que t'expliqui el cos tècnic.</p>
      {LEGEND}
      <p>Atacar o defensar a pilota aturada és un moment on tot l'equip ha de pensar igual. Si cadascuna fa la seva feina, la pilota acaba dins.</p></div>{band()}</section>""")
    pages.append(f"""<section class="pg"><div class="pad"><div class="k">QUI FA QUÈ</div><h2>ELS NOSTRES<br><em>ROLS</em></h2>
      <div class="roles">{roles_html()}</div></div>{band()}</section>""")
    pages.append(f"""<section class="pg"><div class="pad"><div class="k">LA CHULETA</div><h2>TOTES LES<br><em>SENYALS</em></h2>
      <table class="sig">{signals_rows()}</table></div>{band()}</section>""")
    i = 0
    for si, (cats, t1, t2, big) in enumerate(SECTS, 1):
        plays = [(k, p) for k, p in enumerate(PLAYS, 1) if p[0] in cats]
        lis = "".join(f"<li><span>{code(k)}</span>{e(p[1].upper())}</li>" for k, p in plays)
        pages.append(f"""<section class="pg sect"><div class="big">{big}</div><div class="t"><div class="k">SECCIÓ {si}</div><h2>{t1}<br><em>{t2}</em></h2><ul>{lis}</ul></div>{band()}</section>""")
        if "D" in cats:
            pages.append(f"""<section class="pg"><div class="pad"><div class="k">ABP DEFENSIVA</div><h2>QUI DEFENSA<br><em>CADA ZONA</em></h2>{resp_html()}</div>{band()}</section>""")
        for k, (ss, n, sig, img) in plays:
            pages.append(f"""<section class="pg play"><div class="pad"><div class="head"><div><div class="k">{label(k)}</div><h2>{e(n.upper())}</h2></div><div class="num">{code(k)}</div></div>
              <div class="dia"><img src="img/{img}" alt="Dibuix de la jugada {e(n)}"></div>
              {box(k)}
              <div class="notes"><div class="k">NOTES</div><i></i><i></i><i></i><i></i></div></div>{band()}</section>""")
    pages.append("""<section class="pg back"><div class="c"><img src="escut.png" alt=""><p>JUNTES,<br><em>A PILOTA ATURADA</em></p><small>CE EUROPA · 2026/27 · DOCUMENT INTERN</small></div></section>""")
    doc = f'<!doctype html><html lang="ca"><head><meta charset="utf-8"><title>Llibre d\'ABP</title><style>{css}</style></head><body>{"".join(pages)}</body></html>'
    open(os.path.join(D, "llibre.html"), "w").write(doc)

# ---------------- E-BOOK (artifact) ----------------
def ebook():
    css = BASE_CSS + """
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: #030a24; color: #fff; font-family: var(--body); overflow: hidden; }
.book { height: 100%; display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; }
.book::-webkit-scrollbar { display: none; }
.page { flex: 0 0 100%; height: 100%; scroll-snap-align: start; overflow-y: auto; position: relative; background: radial-gradient(110% 60% at 80% 0%, #12307a, #071a52 55%, #030a24); }
.page::before { content: ""; position: absolute; inset: 0; background: var(--pattern); opacity: .18; pointer-events: none; }
.in { position: relative; max-width: 760px; margin: 0 auto; padding-left: max(18px, env(safe-area-inset-left, 0px)); padding-right: max(18px, env(safe-area-inset-right, 0px)); padding-block: 28px 110px; }
.k { font-family: var(--display); letter-spacing: .25em; color: var(--gold); font-size: 13px; }
h1, h2 { font-family: var(--display); font-weight: 400; margin: 6px 0 0; line-height: .92; letter-spacing: .01em; text-wrap: balance; }
h2 { font-size: clamp(40px, 11vw, 68px); }
h2 em, h1 em { font-style: normal; color: var(--goldl); }
p { color: #d8e1ff; line-height: 1.55; max-width: 60ch; }
/* coberta */
.cover .in { min-height: 100%; display: grid; place-content: center; justify-items: center; text-align: center; padding-bottom: 120px; }
.cover img { width: min(46vw, 220px); filter: drop-shadow(0 20px 30px rgba(0,0,0,.5)); animation: pop .9s cubic-bezier(.3,1.5,.5,1) both; }
.cover h1 { font-size: clamp(64px, 19vw, 120px); margin-top: 18px; }
.cover .sub { font-family: var(--display); letter-spacing: .14em; color: #c9d5ff; margin-top: 14px; font-size: 15px; }
.cover .go { margin-top: 28px; }
@keyframes pop { from { opacity: 0; transform: scale(.6) rotate(-8deg); } }
.btn { font: inherit; font-family: var(--display); letter-spacing: .08em; font-size: 18px; border: 0; border-radius: 99px; padding: 12px 26px; cursor: pointer; background: linear-gradient(135deg, #f6e3a8, var(--gold)); color: var(--ink); }
.btn:focus-visible, .nav button:focus-visible, a:focus-visible, .dia:focus-visible { outline: 3px solid var(--goldl); outline-offset: 3px; }
/* llegenda i rols */
.legend { display: grid; gap: 10px; margin-top: 18px; }
.legend > div { display: grid; grid-template-columns: 70px 1fr; gap: 12px; align-items: center; background: var(--green); border-radius: 14px; padding: 12px 14px; font-size: 15px; }
.legend svg { width: 64px; height: 22px; }
.legend b { font-family: var(--display); font-weight: 400; letter-spacing: .06em; margin-right: 6px; font-size: 17px; }
.roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; margin-top: 18px; }
.role { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); border-top: 4px solid var(--gold); border-radius: 16px; padding: 14px; }
.role-h { display: flex; gap: 8px; align-items: center; }
.role-h b { font-family: var(--display); font-weight: 400; font-size: 24px; letter-spacing: .02em; }
.role p { margin: 4px 0 0; font-size: 13px; color: #b9c6ee; }
.names { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.names span { font-family: var(--display); font-size: 17px; letter-spacing: .04em; background: #fff; color: var(--ink); border-radius: 99px; padding: 4px 12px 2px; }
table.sig { width: 100%; border-collapse: collapse; margin-top: 16px; }
table.sig td { padding: 12px 8px; border-bottom: 1px solid rgba(255,255,255,.1); }
table.sig .c { font-family: var(--display); color: var(--gold); width: 44px; font-size: 18px; }
table.sig .n a { font-family: var(--display); font-size: 24px; color: #fff; text-decoration: none; letter-spacing: .02em; }
table.sig .s { text-align: right; color: #d8e1ff; font-size: 14px; }
/* separador */
.sect .big { position: absolute; right: -10px; bottom: 70px; font-family: var(--display); font-size: 48vh; line-height: .8; color: rgba(255,255,255,.05); pointer-events: none; }
.sect ul { list-style: none; padding: 0; margin: 26px 0 0; display: grid; gap: 10px; }
.sect li a { display: flex; gap: 14px; align-items: baseline; font-family: var(--display); font-size: 30px; color: #fff; text-decoration: none; letter-spacing: .02em; }
.sect li span { color: var(--goldl); font-size: 18px; }
/* jugada */
.play .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
.play .num { font-family: var(--display); font-size: 64px; line-height: .8; color: transparent; -webkit-text-stroke: 2px var(--goldl); }
.dia { display: block; width: 100%; margin-top: 16px; padding: 0; border: 3px solid #fff; border-radius: 16px; overflow: hidden; background: var(--green); cursor: zoom-in; box-shadow: 0 20px 40px rgba(0,0,0,.45); }
.dia img { display: block; width: 100%; height: auto; }
.signal { margin-top: 14px; display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: center; background: #fff; color: var(--ink); border-radius: 16px; padding: 14px 16px; }
.signal .hand { width: 54px; height: 54px; border-radius: 50%; background: linear-gradient(135deg, #f6e3a8, var(--gold)); display: grid; place-items: center; font-size: 26px; }
.signal .k { color: #8a6412; }
.signal b { display: block; font-family: var(--display); font-weight: 400; font-size: 30px; line-height: 1; margin-top: 2px; }
.hint { font-size: 13px; color: #9fb0e0; margin-top: 10px; }
.pos { margin-top: 14px; background: #fff; color: var(--ink); border-radius: 16px; padding: 14px 16px; }
.pos .k { color: #8a6412; }
.pos ul { list-style: none; padding: 0; margin: 8px 0 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px 16px; }
.pos li { display: flex; gap: 10px; align-items: baseline; font-size: 14px; color: #2a3558; }
.pos li b { font-family: var(--display); font-weight: 400; font-size: 20px; color: var(--navy); min-width: 92px; letter-spacing: .02em; }
.pos li em { display: block; font-style: normal; font-family: var(--display); font-size: 17px; color: var(--royal); letter-spacing: .02em; }
.resp { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 22px; margin-top: 18px; }
.resp table.sig .c { width: 110px; }
.resp table.sig .n { font-family: var(--display); font-size: 22px; }
ol.barrera { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 8px; }
ol.barrera li { display: flex; gap: 12px; align-items: center; font-family: var(--display); font-size: 22px; background: rgba(255,255,255,.07); border-radius: 12px; padding: 8px 12px; }
ol.barrera li span { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #f6e3a8, var(--gold)); color: var(--ink); display: grid; place-items: center; font-size: 18px; }
/* fi */
.back .in { min-height: 100%; display: grid; place-content: center; justify-items: center; text-align: center; }
.back img { width: 150px; }
.back h2 { margin-top: 16px; }
/* navegació */
.nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 10px max(14px, env(safe-area-inset-right, 0px)) calc(10px + env(safe-area-inset-bottom, 0px)) max(14px, env(safe-area-inset-left, 0px));
  background: rgba(6,24,71,.92) var(--pattern); border-top: 2px solid var(--gold); backdrop-filter: blur(8px); }
.nav button { font: inherit; font-family: var(--display); font-size: 16px; letter-spacing: .06em; color: #fff; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); border-radius: 99px; padding: 8px 14px; cursor: pointer; min-width: 44px; }
.nav button:disabled { opacity: .35; cursor: default; }
.nav .mid { display: flex; align-items: center; gap: 10px; min-width: 0; }
.nav .count { font-family: var(--display); color: var(--goldl); font-size: 16px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.nav .bar { width: min(28vw, 180px); height: 4px; border-radius: 4px; background: rgba(255,255,255,.15); overflow: hidden; }
.nav .bar i { display: block; height: 100%; width: 0; background: var(--goldl); transition: width .25s; }
/* zoom */
.zoom { position: fixed; inset: 0; z-index: 10; background: rgba(3,10,36,.96); display: grid; place-items: center; padding: max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px)); cursor: zoom-out; }
.zoom img { max-width: 100%; max-height: 100%; border-radius: 10px; }
.zoom span { position: absolute; top: calc(14px + env(safe-area-inset-top, 0px)); right: 18px; font-family: var(--display); color: var(--goldl); letter-spacing: .1em; }
@media (orientation: landscape) and (max-height: 520px) { .play .in { display: grid; grid-template-columns: 1.5fr 1fr; gap: 0 18px; align-items: start; } .play .head, .play .signal, .play .hint { grid-column: 2; } .play .dia { grid-column: 1; grid-row: 1 / span 4; } }
@media (prefers-reduced-motion: reduce) { .book { scroll-behavior: auto; } .cover img { animation: none; } .nav .bar i { transition: none; } }
"""
    pages = []
    pages.append("""<section class="page cover" id="inici"><div class="in"><img src="escut.png" alt="Escut del CE Europa"><div class="k" style="margin-top:22px">FUTBOL FEMENÍ · 2a RFEF</div>
      <h1>LLIBRE<br><em>D'ABP</em></h1><div class="sub">ACCIONS A PILOTA ATURADA · 2026/27</div><button class="btn go" type="button" data-next>OBRE EL LLIBRE →</button></div></section>""")
    pages.append(f"""<section class="page" id="com-llegir"><div class="in"><div class="k">ABANS DE COMENÇAR</div><h2>COM LLEGIR<br><em>ELS DIBUIXOS</em></h2>
      <p>Aquí tens totes les nostres jugades d'ABP: còrners i faltes laterals en atac, i com ens col·loquem en defensa. Cada jugada té un nom i una senyal: quan la llançadora la fa, totes sabem què toca. Passa les pàgines amb el dit i toca un dibuix per veure'l en gran.</p>{LEGEND}</div></section>""")
    pages.append(f"""<section class="page" id="rols"><div class="in"><div class="k">QUI FA QUÈ</div><h2>ELS NOSTRES<br><em>ROLS</em></h2><div class="roles">{roles_html()}</div></div></section>""")
    pages.append(f"""<section class="page" id="senyals"><div class="in"><div class="k">LA CHULETA</div><h2>TOTES LES<br><em>SENYALS</em></h2>
      <table class="sig">{signals_rows(True)}</table><p class="hint">Toca el nom d'una jugada per anar-hi.</p></div></section>""")
    for si, (cats, t1, t2, big) in enumerate(SECTS, 1):
        plays = [(k, p) for k, p in enumerate(PLAYS, 1) if p[0] in cats]
        lis = "".join(f'<li><a href="#jugada-{k}" data-go="jugada-{k}"><span>{code(k)}</span>{e(p[1].upper())}</a></li>' for k, p in plays)
        pages.append(f"""<section class="page sect" id="seccio-{si}"><div class="big" aria-hidden="true">{big}</div><div class="in" style="padding-top:18vh"><div class="k">SECCIÓ {si}</div><h2>{t1}<br><em>{t2}</em></h2><ul>{lis}</ul></div></section>""")
        if "D" in cats:
            pages.append(f"""<section class="page" id="responsabilitats"><div class="in"><div class="k">ABP DEFENSIVA</div><h2>QUI DEFENSA<br><em>CADA ZONA</em></h2>{resp_html()}</div></section>""")
        for k, (ss, n, sig, img) in plays:
            pages.append(f"""<section class="page play" id="jugada-{k}"><div class="in"><div class="head"><div><div class="k">{label(k)}</div><h2>{e(n.upper())}</h2></div><div class="num" aria-hidden="true">{code(k)}</div></div>
              <button class="dia" type="button" aria-label="Veure el dibuix de {e(n)} en gran"><img src="img/{img}" alt="Dibuix de la jugada {e(n)}" loading="lazy" width="1600" height="1004"></button>
              {box(k)}</div></section>""")
    pages.append("""<section class="page back" id="final"><div class="in"><img src="escut.png" alt=""><h2>JUNTES,<br><em>A PILOTA ATURADA</em></h2><p>Repassa les senyals abans de cada partit.</p><button class="btn" type="button" data-first>TORNAR A L'INICI</button></div></section>""")
    js = """
const book = document.getElementById('book'), pages = [...book.querySelectorAll('.page')];
const prev = document.getElementById('prev'), next = document.getElementById('next'), count = document.getElementById('count'), bar = document.getElementById('bar');
let cur = 0;
const go = (i, smooth = true) => { i = Math.max(0, Math.min(pages.length - 1, i)); book.scrollTo({ left: i * book.clientWidth, behavior: smooth ? 'smooth' : 'auto' }); };
const update = () => {
  cur = Math.round(book.scrollLeft / Math.max(1, book.clientWidth));
  prev.disabled = cur === 0; next.disabled = cur === pages.length - 1;
  count.textContent = `${cur + 1} / ${pages.length}`; bar.style.width = `${((cur + 1) / pages.length) * 100}%`;
  const id = pages[cur].id; if (id && location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
};
let t; book.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(update, 60); });
prev.onclick = () => go(cur - 1); next.onclick = () => go(cur + 1);
document.getElementById('toc').onclick = () => go(pages.findIndex((p) => p.id === 'senyals'));
document.addEventListener('keydown', (e) => { if (document.querySelector('.zoom')) { if (e.key === 'Escape') closeZoom(); return; } if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); });
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-go]'); if (a) { e.preventDefault(); go(pages.findIndex((p) => p.id === a.dataset.go)); return; }
  if (e.target.closest('[data-next]')) go(1); if (e.target.closest('[data-first]')) go(0);
  const d = e.target.closest('.dia'); if (d) openZoom(d.querySelector('img'));
});
function openZoom(img) { const z = document.createElement('div'); z.className = 'zoom'; z.setAttribute('role', 'dialog'); z.setAttribute('aria-label', img.alt); z.innerHTML = `<img src="${img.src}" alt="${img.alt}"><span>TANCAR ✕</span>`; z.onclick = closeZoom; document.body.appendChild(z); }
function closeZoom() { document.querySelector('.zoom')?.remove(); }
const fromHash = () => { const i = pages.findIndex((p) => '#' + p.id === location.hash); if (i >= 0) { go(i, false); setTimeout(update, 80); } };
window.addEventListener('hashchange', fromHash);
new ResizeObserver(() => go(cur, false)).observe(book);
fromHash(); update();
"""
    doc = f"""<title>Llibre d'ABP</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>{css}</style>
<main class="book" id="book">{"".join(pages)}</main>
<nav class="nav" aria-label="Pàgines"><button id="prev" type="button" aria-label="Pàgina anterior">←</button>
<div class="mid"><button id="toc" type="button">SENYALS</button><span class="count" id="count">1 / 1</span><span class="bar" aria-hidden="true"><i id="bar"></i></span></div>
<button id="next" type="button" aria-label="Pàgina següent">→</button></nav>
<script>{js}</script>"""
    open(os.path.join(D, "ebook.html"), "w").write(doc)

book(); ebook(); print("ok")
