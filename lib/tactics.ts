// Pissarra tàctica: tipus, geometria del camp, animació i el pla de partit automàtic.
// Coordenades en metres d'un camp de 105 x 68: x d'esquerra a dreta (nosaltres ataquem cap a la dreta),
// y de dalt a baix.

import { FORMATIONS, type Spot } from "@/lib/convo";

export const PW = 105;
export const PH = 68;

export type Side = "us" | "rival";
export type Token =
  | { id: string; t: "player"; side: Side; n: string; name?: string; gk?: boolean }
  | { id: string; t: "ball" }
  | { id: string; t: "cone"; c?: string };
export type XY = [number, number];
export type ShapeKind = "pass" | "run" | "dribble" | "line" | "zone" | "ellipse" | "free" | "text";
export type TShape = { id: string; k: ShapeKind; c: string; pts: XY[]; text?: string };
export type Frame = { id: string; pos: Record<string, XY>; shapes: TShape[]; note: string; dur: number };
export type Scene = { id: string; title: string; tokens: Token[]; frames: Frame[]; view: "full" | "half" };
export type PlanSection = { title: string; lines: string[] };
export type BoardData = { scenes: Scene[]; plan?: PlanSection[]; meta?: { rival?: string; ours?: string; theirs?: string } };

export const uid = () => Math.random().toString(36).slice(2, 10);
export const COLORS = { us: "#0a2ea0", usGk: "#dbb34d", rival: "#d32f2f", rivalGk: "#212121" };
export const DRAW_COLORS = ["#ffd400", "#ffffff", "#ff3b30", "#2f7bff", "#34c759", "#111111"];

// ---------------------------------------------------------------------------
// Animació
// ---------------------------------------------------------------------------

export const HOLD = 0.9; // segons quiet a cada fotograma abans de moure's

/** Durada total de l'animació d'una escena. */
export function sceneLength(s: Scene): number {
  if (s.frames.length <= 1) return HOLD;
  return s.frames.slice(1).reduce((a, f) => a + HOLD + f.dur, 0) + HOLD;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Estat de l'escena al segon `t`: posicions (interpolades) i quins dibuixos es veuen. */
export function sceneAt(s: Scene, t: number): { pos: Record<string, XY>; frame: number; moving: number | null; k: number } {
  const fr = s.frames;
  let acc = 0;
  for (let i = 0; i < fr.length; i++) {
    // quiet al fotograma i
    if (t < acc + HOLD || i === fr.length - 1) return { pos: fr[i].pos, frame: i, moving: null, k: 0 };
    acc += HOLD;
    const next = fr[i + 1];
    if (t < acc + next.dur) {
      const k = ease(Math.max(0, Math.min(1, (t - acc) / next.dur)));
      const pos: Record<string, XY> = {};
      for (const tok of s.tokens) {
        const a = fr[i].pos[tok.id];
        const b = next.pos[tok.id] ?? a;
        if (!a && !b) continue;
        const A = a ?? b!, B = b ?? a!;
        pos[tok.id] = [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k];
      }
      return { pos, frame: i, moving: i + 1, k };
    }
    acc += next.dur;
  }
  return { pos: fr[fr.length - 1].pos, frame: fr.length - 1, moving: null, k: 0 };
}

// ---------------------------------------------------------------------------
// Sistemes al camp
// ---------------------------------------------------------------------------

/** Dorsals habituals per posició (per al rival, si no en sabem el número). */
const DEFAULT_N: Record<string, string[]> = {
  POR: ["1"], LD: ["2"], LI: ["3"], DFC: ["4", "5", "14"], CD: ["2"], CI: ["3"], MCD: ["6", "16"], MC: ["8", "10", "15"],
  MI: ["11"], MD: ["7"], MCO: ["10"], MP: ["10"], EI: ["11"], ED: ["7"], DC: ["9", "19"],
};

type Block = { a: number; span: number; wf: number; shift: number };
/** Línies segons la fase: on comença el bloc (a), quant ocupa (span), amplada (wf) i desplaçament a una banda. */
export const BLOCKS = {
  neutral: { a: 3, span: 48, wf: 1, shift: 0 },
  highPress: { a: 22, span: 70, wf: 0.95, shift: 0 },
  midBlock: { a: 10, span: 40, wf: 0.78, shift: 0 },
  lowBlock: { a: 4, span: 30, wf: 0.82, shift: 0 },
  buildUp: { a: 2, span: 62, wf: 1.12, shift: 0 },
  attack: { a: 30, span: 66, wf: 1.1, shift: 0 },
} satisfies Record<string, Block>;

const clampY = (y: number) => Math.max(2, Math.min(PH - 2, y));
const clampX = (x: number) => Math.max(1.5, Math.min(PW - 1.5, x));

/** On va cada posició d'un sistema, per a un equip i una fase. */
export function place(spots: Spot[], side: Side, b: Block): XY[] {
  return spots.map((sp, i) => {
    const depth = i === 0 ? Math.min(b.a + 2, 6) : b.a + (sp.y / 100) * b.span;
    const across = 50 + (sp.x - 50) * (i === 0 ? 1 : b.wf) + b.shift;
    const x = side === "us" ? depth : PW - depth;
    const y = side === "us" ? (across / 100) * PH : PH - (across / 100) * PH;
    return [Math.round(clampX(x) * 10) / 10, Math.round(clampY(y) * 10) / 10];
  });
}

export const formationOf = (name: string | null | undefined) => FORMATIONS[name ?? ""] ?? FORMATIONS["4-4-2"];

export type Squad = { n: string; name?: string }[]; // en l'ordre de les posicions del sistema

/** Fitxes de les dues onzes. Els ids són fixos per posició (u0..u10, r0..r10) i la pilota és «ball». */
export function makeTokens(ours: Squad, theirs: Squad): Token[] {
  return [
    ...ours.map((p, i): Token => ({ id: `u${i}`, t: "player", side: "us", n: p.n, name: p.name, gk: i === 0 })),
    ...theirs.map((p, i): Token => ({ id: `r${i}`, t: "player", side: "rival", n: p.n, name: p.name, gk: i === 0 })),
    { id: "ball", t: "ball" },
  ];
}

/** Dorsals del rival: els de les jugadores clau a la seva posició, la resta els habituals. */
export function rivalSquad(system: string, keys: { dorsal: string; name: string; pos: string }[]): Squad {
  const spots = formationOf(system);
  const used = new Set<string>();
  const pool = keys.filter((k) => k.dorsal || k.name).map((k) => ({ ...k, pos: normPos(k.pos) }));
  const out: Squad = spots.map(() => ({ n: "" }));
  // 1) jugadores clau a la seva posició
  for (const k of pool) {
    const i = spots.findIndex((s, j) => !out[j].n && posMatch(s.label, k.pos));
    if (i >= 0) {
      out[i] = { n: k.dorsal || "?", name: k.name || undefined };
      used.add(k.dorsal);
    }
  }
  // 2) la resta, dorsals habituals que no estiguin agafats
  spots.forEach((s, i) => {
    if (out[i].n) return;
    const cand = (DEFAULT_N[s.label] ?? ["?"]).find((n) => !used.has(n)) ?? String(12 + i);
    used.add(cand);
    out[i] = { n: cand };
  });
  return out;
}

const normPos = (p: string) => p.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");
const POS_ALIASES: Record<string, string[]> = {
  POR: ["POR", "PO", "GK", "PORTERA", "1"], DC: ["DC", "PT", "PUNTA", "9", "DEL", "ST"], DFC: ["DFC", "CT", "CENTRAL", "4", "5"],
  LD: ["LD", "LATD", "2"], LI: ["LI", "LATI", "3"], MCD: ["MCD", "PIVOT", "6"], MC: ["MC", "INT", "INTERIOR", "8"],
  MCO: ["MCO", "MP", "MEDIAPUNTA", "10"], MP: ["MP", "MCO", "10"], ED: ["ED", "EXTD", "7"], EI: ["EI", "EXTI", "11"],
  MD: ["MD", "ED", "7"], MI: ["MI", "EI", "11"], CD: ["CD", "CARRILERD", "LD"], CI: ["CI", "CARRILERI", "LI"],
};
const posMatch = (label: string, pos: string) => !!pos && (label === pos || (POS_ALIASES[label] ?? []).includes(pos));

function framePos(spotsU: Spot[], spotsR: Spot[], bu: Block, br: Block, ball: XY): Record<string, XY> {
  const pos: Record<string, XY> = { ball };
  place(spotsU, "us", bu).forEach((p, i) => (pos[`u${i}`] = p));
  place(spotsR, "rival", br).forEach((p, i) => (pos[`r${i}`] = p));
  return pos;
}

const shape = (k: ShapeKind, c: string, pts: XY[], text?: string): TShape => ({ id: uid(), k, c, pts, text });
const frame = (pos: Record<string, XY>, note: string, shapes: TShape[] = [], dur = 1.4): Frame => ({ id: uid(), pos, shapes, note, dur });
const near = (p: XY, dx: number, dy: number): XY => [clampX(p[0] + dx), clampY(p[1] + dy)];
/** La pilota als peus d'una jugadora (al costat, sense tapar-li el número). */
const atFeet = (p: XY, dir: 1 | -1 = 1): XY => [clampX(p[0] + 1.9 * dir), clampY(p[1] + 1.6)];

/** Índex de la jugadora d'un sistema per etiqueta (la primera que hi coincideixi). */
const idx = (spots: Spot[], ...labels: string[]) => {
  for (const l of labels) {
    const i = spots.findIndex((s) => s.label === l);
    if (i >= 0) return i;
  }
  return -1;
};
const idxAll = (spots: Spot[], ...labels: string[]) => spots.map((s, i) => (labels.includes(s.label) ? i : -1)).filter((i) => i >= 0);

// ---------------------------------------------------------------------------
// Pla de partit automàtic
// ---------------------------------------------------------------------------

export type PlanInput = {
  rival: string;
  ours: string; // el nostre sistema
  theirs: string; // el seu sistema
  ourSquad: Squad;
  theirSquad: Squad;
  press: "alta" | "mitja" | "baixa"; // com volem defensar
  build: "curta" | "mixta" | "llarga"; // com volem sortir
  side: "auto" | "esquerra" | "dreta" | "dins"; // per on volem atacar
  scout: Record<string, string>; // textos de l'informe del rival
  table?: { pos: number; pts: number; pj: number; gf: number; gc: number; form: string[] } | null;
  usTable?: { pos: number; pts: number; pj: number; gf: number; gc: number } | null;
};

const low = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const has = (s: string, ...words: string[]) => words.some((w) => new RegExp(w).test(low(s)));

/** Línies de cada equip a partir del sistema (defenses, migcampistes, davanteres). */
function lines(system: string) {
  const [d, ...rest] = system.split("-").map(Number);
  return { def: d || 4, mid: rest.slice(0, -1).reduce((a, b) => a + b, 0) || 4, att: rest[rest.length - 1] || 2 };
}

/** Llegeix l'informe i les dades i en treu el pla i les escenes animades. */
export function buildPlan(inp: PlanInput): BoardData {
  const S = inp.scout;
  const rivalPress = has(S.pressing, "alt", "agressiv", "intens", "home a home", "individual") ? "alta" : has(S.pressing, "baix", "replega", "enrere", "tanca") ? "baixa" : "mitja";
  const rivalLong = has(S.buildup, "llarg", "directe", "pilotada", "esquena", "punta");
  const rivalShort = has(S.buildup, "curt", "des de baix", "combina", "toc", "pivot", "baixa entre");
  const weakBehindFB = has(S.weaknesses, "esquena", "lateral", "carriler", "banda");
  const weakSlow = has(S.weaknesses, "lent", "velocitat", "recupera");
  const weakAir = has(S.weaknesses, "aire", "joc aeri", "pilota aturada", "corner", "centre");
  const weakPress = has(S.weaknesses, "pressio", "pressionar", "sota pressio", "perd", "errors");
  const strongAir = has(S.strengths, "aire", "joc aeri", "cap", "alcada", "abp", "corner");
  const strongCounter = has(S.strengths + " " + S.transitions, "contraatac", "rapid", "transicio", "velocitat");
  const strongLong = has(S.strengths, "llarg", "punta", "directe");
  const sideHint = has(S.weaknesses, "dreta") ? "dreta" : has(S.weaknesses, "esquerra") ? "esquerra" : null;
  // Atenció: «la seva banda dreta» és la nostra esquerra quan ataquem.
  const attackSide: "esquerra" | "dreta" | "dins" =
    inp.side !== "auto" ? inp.side : sideHint === "dreta" ? "esquerra" : sideHint === "esquerra" ? "dreta" : weakBehindFB ? "esquerra" : "dins";

  const ourL = lines(inp.ours);
  const theirL = lines(inp.theirs);
  const T = inp.table;
  const gfpm = T && T.pj ? T.gf / T.pj : null;
  const gcpm = T && T.pj ? T.gc / T.pj : null;

  // ----- Text del pla -----
  const plan: PlanSection[] = [];
  const ctx: string[] = [];
  if (T) {
    ctx.push(`${inp.rival}: ${T.pos}a amb ${T.pts} punts en ${T.pj} partits (${T.gf} gols a favor, ${T.gc} en contra).`);
    if (T.form.length) ctx.push(`Ratxa: ${T.form.join(" ")}.`);
    if (inp.usTable) ctx.push(`Nosaltres: ${inp.usTable.pos}a amb ${inp.usTable.pts} punts.`);
    if (gcpm != null && gcpm >= 2) ctx.push("Encaixa molt: partit per atacar amb gent i xutar molt.");
    else if (gcpm != null && gcpm <= 0.8) ctx.push("Encaixa poc: caldrà paciència i aprofitar les pilotes aturades.");
    if (gfpm != null && gfpm >= 2.2) ctx.push("Fa molts gols: cura especial a la defensa de transicions i a les vigilàncies.");
  }
  ctx.push(`Sistemes: nosaltres ${inp.ours} contra el seu ${inp.theirs}.`);
  plan.push({ title: "Context", lines: ctx });

  const withBall: string[] = [];
  if (inp.build === "llarga" || (inp.build === "mixta" && rivalPress === "alta")) {
    withBall.push("Sortida en llarg cap a la punta o l'esquena de les seves laterals, i guanyar les segones jugades amb les migcampistes a prop.");
  } else {
    withBall.push(`Sortida curta: la portera i les ${ourL.def >= 4 ? "centrals" : "tres centrals"} obertes; el pivot entre línies per rebre d'esquena a la pressió.`);
  }
  if (rivalPress === "alta") withBall.push("Pressionen alt: si saltem la primera línia tindrem espai a l'esquena. Pocs tocs a la nostra zona.");
  if (rivalPress === "baixa") withBall.push("Es tanquen enrere: circulació ràpida d'una banda a l'altra, centres a l'àrea i xuts de fora.");
  if (ourL.def > theirL.att) withBall.push(`Superioritat a la sortida: ${ourL.def} defenses contra ${theirL.att} davanteres seves (+${ourL.def - theirL.att}).`);
  if (ourL.mid > theirL.mid) withBall.push(`Superioritat al mig del camp (${ourL.mid} contra ${theirL.mid}): buscar la jugadora lliure entre línies.`);
  else if (ourL.mid < theirL.mid) withBall.push(`Inferioritat al mig (${ourL.mid} contra ${theirL.mid}): jugar per fora i que una davantera baixi a ajudar.`);
  withBall.push(
    attackSide === "dins"
      ? "Atacar per dins: combinacions curtes i passades entre línies cap a la punta."
      : `Atacar sobretot per la banda ${attackSide}${weakBehindFB ? ": és on tenen l'espai a l'esquena de la lateral" : ""}.`,
  );
  if (weakSlow) withBall.push("Són lentes en la recuperació: atacs ràpids i desmarcatges a l'espai.");
  plan.push({ title: "Amb pilota", lines: withBall });

  const noBall: string[] = [];
  if (inp.press === "alta") {
    noBall.push("Pressió alta: la punta orienta cap a fora, les extrems salten a la lateral i la resta tanca línies de passada.");
    if (rivalLong) noBall.push("Juguen en llarg: les centrals alerta a la pilota a l'esquena i les migcampistes a les segones jugades.");
    if (rivalShort || weakPress) noBall.push("Volen sortir curt i pateixen amb pressió: és el partit per robar a dalt.");
  } else if (inp.press === "mitja") {
    noBall.push("Bloc mig: línies juntes (uns 25-30 m), pressió quan la pilota va a banda o quan reben d'esquena.");
  } else {
    noBall.push("Bloc baix: defensar l'àrea i el carril central, sortir ràpid a la contra quan robem.");
  }
  if (strongLong) noBall.push("La seva arma és la pilota llarga a la punta: vigilància i cobertura de la segona central.");
  if (strongAir) noBall.push("Són fortes per alt: evitar faltes a prop de l'àrea i defensar bé els centres.");
  plan.push({ title: "Sense pilota", lines: noBall });

  const trans: string[] = [];
  trans.push(strongCounter ? "Transició defensiva: sempre 3 jugadores darrere la pilota (vigilàncies) i pressió immediata 5 segons." : "Transició defensiva: pressió immediata després de pèrdua, i si no es pot, replegar ràpid.");
  trans.push(weakSlow || weakBehindFB ? "Transició ofensiva: quan robem, primera passada a l'espai cap a la banda feble i arribar amb 3-4 jugadores." : "Transició ofensiva: si no hi ha espai, assegurar la pilota i reorganitzar.");
  plan.push({ title: "Transicions", lines: trans });

  const abp: string[] = [];
  if (weakAir) abp.push("Defensen malament les pilotes aturades: preparar 2 jugades de córner i una de falta lateral.");
  if (S.abp_against?.trim()) abp.push(`Com defensen (informe): ${S.abp_against.trim()}`);
  if (S.abp_for?.trim()) abp.push(`Les seves jugades: ${S.abp_for.trim()}`);
  if (strongAir) abp.push("A les seves ABP: marcatge a les rematadores fortes i una jugadora al primer pal.");
  if (!abp.length) abp.push("ABP: córners al primer pal i rebuig controlat a la frontal.");
  plan.push({ title: "Pilota aturada", lines: abp });

  const keys = (S.keys ?? "").split(/\n|·|;/).map((x) => x.trim()).filter(Boolean);
  plan.push({
    title: "Claus per a les jugadores",
    lines: keys.length
      ? keys
      : [
          inp.press === "alta" ? "Pressionar juntes i amb intensitat." : "Línies juntes i ajudes.",
          attackSide === "dins" ? "Jugar entre línies." : `Atacar per la banda ${attackSide}.`,
          "Concentració a les pilotes aturades.",
        ],
  });

  // ----- Escenes animades -----
  const U = formationOf(inp.ours);
  const R = formationOf(inp.theirs);
  const tokens = makeTokens(inp.ourSquad, inp.theirSquad);
  const theirBlock = rivalPress === "alta" ? BLOCKS.highPress : rivalPress === "baixa" ? BLOCKS.lowBlock : BLOCKS.midBlock;
  const ourBlock = inp.press === "alta" ? BLOCKS.highPress : inp.press === "baixa" ? BLOCKS.lowBlock : BLOCKS.midBlock;
  const Y = "#ffd400", W = "#ffffff", RED = "#ff3b30";
  const scenes: Scene[] = [];
  const scene = (title: string, frames: Frame[], view: Scene["view"] = "full"): Scene => ({ id: uid(), title, tokens, frames, view });

  // 1) Onze contra onze
  const f0 = framePos(U, R, BLOCKS.neutral, BLOCKS.neutral, [PW / 2, PH / 2]);
  scenes.push(scene(`Onze · ${inp.ours} contra ${inp.theirs}`, [frame(f0, `${inp.ours} contra ${inp.theirs}. ${ourL.def > theirL.att ? `Superioritat a la sortida (+${ourL.def - theirL.att}).` : ""}`)]));

  // 2) Sortida de pilota
  {
    const gk = 0;
    const cb = idx(U, "DFC");
    const piv = idx(U, "MCD", "MC");
    const fb = idx(U, attackSide === "dreta" ? "LD" : "LI", attackSide === "dreta" ? "CD" : "CI");
    const st = idx(U, "DC");
    const a = framePos(U, R, BLOCKS.buildUp, theirBlock, [6, PH / 2]);
    a.ball = atFeet(a[`u${gk}`]);
    const b = framePos(U, R, BLOCKS.buildUp, { ...theirBlock, shift: attackSide === "dreta" ? 8 : -8 }, a.ball);
    if (cb >= 0) b.ball = atFeet(b[`u${cb}`]);
    const shapesA = cb >= 0 ? [shape("pass", Y, [a[`u${gk}`], a[`u${cb}`]])] : [];
    if (piv >= 0) shapesA.push(shape("run", W, [a[`u${piv}`], near(a[`u${piv}`], -8, 0)]));
    if (piv >= 0) b[`u${piv}`] = near(a[`u${piv}`], -8, 0);
    const frames = [frame(a, rivalPress === "alta" ? "Pressionen alt: ens obrim i la pivot baixa a rebre." : "Sortida curta des de la portera.", shapesA)];
    if (inp.build === "llarga" || (inp.build === "mixta" && rivalPress === "alta")) {
      const c = { ...b };
      const target = st >= 0 ? near(b[`u${st}`], 6, 0) : [70, PH / 2] as XY;
      c.ball = atFeet(target);
      if (st >= 0) c[`u${st}`] = target;
      frames.push(frame(b, "Si ens tapen, pilota llarga a la punta.", cb >= 0 && st >= 0 ? [shape("pass", Y, [b[`u${cb}`], target])] : []));
      frames.push(frame(c, "Segona jugada: les migcampistes s'acosten a la punta.", [], 1.6));
    } else {
      const c = { ...b };
      if (piv >= 0) c.ball = atFeet(b[`u${piv}`]);
      const d = { ...c };
      if (fb >= 0) {
        d[`u${fb}`] = near(c[`u${fb}`], 18, 0);
        d.ball = atFeet(d[`u${fb}`]);
      }
      frames.push(frame(b, "La central condueix i busca la pivot entre línies.", piv >= 0 && cb >= 0 ? [shape("pass", Y, [b[`u${cb}`], b[`u${piv}`]])] : []));
      frames.push(frame(c, `La pivot gira i obre cap a la banda ${attackSide === "dins" ? "lliure" : attackSide}.`, fb >= 0 && piv >= 0 ? [shape("pass", Y, [c[`u${piv}`], d[`u${fb}`]]), shape("run", W, [c[`u${fb}`], d[`u${fb}`]])] : []));
      frames.push(frame(d, "Progressem per fora amb superioritat.", [], 1.5));
    }
    scenes.push(scene("Sortida de pilota", frames));
  }

  // 3) Sense pilota: pressió o bloc
  {
    const rcb = idx(R, "DFC");
    const rfb = idx(R, "LD", "CD");
    const st = idx(U, "DC");
    const wing = idx(U, "EI", "MI", "MC");
    const a = framePos(U, R, ourBlock, BLOCKS.buildUp, [PW - 6, PH / 2]);
    a.ball = atFeet(a.r0, -1);
    const b = framePos(U, R, { ...ourBlock, shift: -10 }, { ...BLOCKS.buildUp, shift: 6 }, a.ball);
    if (rcb >= 0) b.ball = atFeet(b[`r${rcb}`], -1);
    const c = { ...b };
    if (st >= 0 && rcb >= 0) c[`u${st}`] = near(b[`r${rcb}`], -3, 2);
    if (wing >= 0 && rfb >= 0) c[`u${wing}`] = near(b[`r${rfb}`], -3, 0);
    const shapesB: TShape[] = [];
    if (st >= 0 && rcb >= 0) shapesB.push(shape("run", RED, [b[`u${st}`], c[`u${st}`]]));
    if (wing >= 0 && rfb >= 0) shapesB.push(shape("run", RED, [b[`u${wing}`], c[`u${wing}`]]));
    const title = inp.press === "alta" ? "Pressió alta" : inp.press === "mitja" ? "Bloc mig" : "Bloc baix";
    const zoneX = inp.press === "alta" ? [PW - 30, PW - 4] : inp.press === "mitja" ? [PW / 2 - 12, PW / 2 + 14] : [18, 42];
    scenes.push(
      scene(title, [
        frame(a, inp.press === "alta" ? "Portera rival amb pilota: ens col·loquem tapant línies de passada." : "Ens col·loquem junts i compactes.", inp.press === "alta" && rcb >= 0 ? [shape("pass", Y, [a.r0, b[`r${rcb}`]])] : []),
        frame(b, "Quan la pilota va a la central, saltem!", shapesB),
        frame(c, inp.press === "alta" ? "Zona de robatori: aquí volem recuperar." : "Bascular cap a la banda de la pilota.", [shape("zone", Y, [[zoneX[0], 4], [zoneX[1], 26]])], 1.2),
      ]),
    );
  }

  // 4) Transició ofensiva
  {
    const mid = idx(U, "MC", "MCD", "MCO");
    const st = idx(U, "DC");
    const w = idx(U, attackSide === "dreta" ? "ED" : "EI", attackSide === "dreta" ? "MD" : "MI");
    const a = framePos(U, R, BLOCKS.midBlock, BLOCKS.attack, [PW / 2 - 5, PH / 2]);
    if (mid >= 0) a.ball = atFeet(a[`u${mid}`]);
    const b = framePos(U, R, { ...BLOCKS.attack, a: 26 }, { ...BLOCKS.midBlock, a: 14 }, a.ball);
    const laneY = attackSide === "dreta" ? PH - 10 : attackSide === "esquerra" ? 10 : PH / 2;
    const space: XY = [PW - 22, laneY];
    if (w >= 0) b[`u${w}`] = space;
    if (st >= 0) b[`u${st}`] = [PW - 16, PH / 2 + (attackSide === "dreta" ? -5 : 5)];
    b.ball = atFeet(space);
    const shapesA: TShape[] = [];
    if (mid >= 0) shapesA.push(shape("pass", Y, [a[`u${mid}`], space]));
    if (w >= 0) shapesA.push(shape("run", W, [a[`u${w}`], space]));
    if (st >= 0) shapesA.push(shape("run", W, [a[`u${st}`], b[`u${st}`]]));
    scenes.push(
      scene("Transició ofensiva", [
        frame(a, `Robem: primera passada a l'espai${weakBehindFB ? " a l'esquena de la lateral" : ""}.`, shapesA),
        frame(b, "Arribem amb 3-4 jugadores i finalitzem ràpid.", [shape("zone", Y, [[PW - 17, PH / 2 - 10], [PW - 1, PH / 2 + 10]])], 1.6),
      ]),
    );
  }

  // 5) Córner a favor
  {
    const pos: Record<string, XY> = {};
    const ourIdx = U.map((_, i) => i);
    const theirIdx = R.map((_, i) => i);
    const taker: XY = [PW - 0.8, 0.8];
    const attackers: XY[] = [[PW - 7, 30], [PW - 9, 36], [PW - 11, 28], [PW - 13, 40], [PW - 18, 34]];
    ourIdx.forEach((i) => (pos[`u${i}`] = i === 0 ? [8, PH / 2] : i <= 2 ? [PW / 2 - 4, 24 + i * 8] : attackers[(i - 3) % attackers.length] ?? [PW - 20, 30]));
    const lastOur = ourIdx[ourIdx.length - 1];
    pos[`u${lastOur}`] = taker;
    theirIdx.forEach((i) => (pos[`r${i}`] = i === 0 ? [PW - 2, PH / 2] : [PW - 5 - (i % 4) * 2.5, 26 + (i % 6) * 3.4]));
    pos.ball = taker;
    const b = { ...pos };
    const runner = ourIdx[3];
    b[`u${runner}`] = [PW - 6, 29];
    b.ball = [PW - 6, 29];
    const posts = idxAll(R, "DC")[0];
    scenes.push(
      scene(
        "Córner a favor",
        [
          frame(pos, weakAir ? "Defensen malament per alt: atac al primer pal." : "Córner: atac al primer pal i rebuig a la frontal.", [
            shape("pass", Y, [taker, [PW - 6, 29]]),
            shape("run", W, [pos[`u${runner}`], [PW - 6, 29]]),
          ]),
          frame(b, posts >= 0 ? "Remat i segona jugada a la frontal." : "Remat.", [shape("zone", Y, [[PW - 21, 26], [PW - 15, 42]])], 1.3),
        ],
        "half",
      ),
    );
  }

  return { scenes, plan, meta: { rival: inp.rival, ours: inp.ours, theirs: inp.theirs } };
}

/** Escena buida amb les dues onzes col·locades (per començar una pissarra lliure). */
export function blankScene(ours: Squad, theirs: Squad, oursSys: string, theirsSys: string): Scene {
  const tokens = makeTokens(ours, theirs);
  const pos = framePos(formationOf(oursSys), formationOf(theirsSys), BLOCKS.neutral, BLOCKS.neutral, [PW / 2, PH / 2]);
  return { id: uid(), title: "Escena", tokens, frames: [frame(pos, "")], view: "full" };
}

/** Squad genèric (1..11) si no tenim dorsals. */
export const numbered = (system: string): Squad => formationOf(system).map((_, i) => ({ n: String(i + 1) }));
