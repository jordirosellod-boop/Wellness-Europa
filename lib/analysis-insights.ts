// Conclusions automàtiques a partir de les marques (sense intel·ligència artificial: regles clares).

import { halfOf, type AEvent, type AMatch } from "@/lib/analysis";

export type Insight = { tone: "good" | "bad" | "info"; text: string };

const THIRD = ["terç defensiu", "terç mig", "terç ofensiu"];
const thirdOf = (x: number) => Math.min(2, Math.floor(x / 33.34));
const NEGATIVE = ["Pèrdua", "Falta", "Targeta", "Fora de joc"];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Llegeix les accions del partit i en treu les idees principals, ordenades per importància. */
export function matchInsights(m: AMatch, events: AEvent[], playerName: (id: string) => string): Insight[] {
  const list = rawInsights(m, events, playerName);
  if (m.kind !== "rival") return list;
  // Vídeo del rival: «nosaltres» és l'equip analitzat i l'altre és el seu contrari.
  const who = m.rival || "el rival";
  return list.map((i) => ({
    ...i,
    text: i.text
      .replace(/accions nostres/g, `accions de ${who}`)
      .replace(/ nostres contra /g, ` de ${who} contra `)
      .replace(/que nosaltres/g, `que ${who}`)
      .replace(/ ens supera en /g, ` supera ${who} en `)
      .replace(/la nostra porteria/g, "la seva porteria")
      .replace(/ de el contrari/g, " del contrari")
      .replace(/^./, (c) => c.toUpperCase()),
  }));
}

function rawInsights(m: AMatch, events: AEvent[], playerName: (id: string) => string): Insight[] {
  const out: Insight[] = [];
  if (events.length < 3) return [{ tone: "info", text: "Encara hi ha poques accions marcades per treure conclusions." }];
  const rival = m.kind === "rival" ? "el contrari" : m.rival || "el rival";
  const by = (team: "us" | "rival", action?: string) => events.filter((e) => e.team === team && (!action || e.action === action));
  const actions = [...new Set(events.map((e) => e.action))];

  // 1. Comparativa per acció (on som millors i on pitjors)
  const diffs = actions
    .map((a) => ({ a, us: by("us", a).length, rv: by("rival", a).length }))
    .filter((d) => d.us + d.rv >= 4 && !NEGATIVE.includes(d.a)); // fer-ne més no és «dominar»
  const best = [...diffs].sort((x, y) => y.us - y.rv - (x.us - x.rv))[0];
  const worst = [...diffs].sort((x, y) => x.us - x.rv - (y.us - y.rv))[0];
  if (best && best.us > best.rv) out.push({ tone: "good", text: `Domini en «${best.a}»: ${best.us} nostres contra ${best.rv} de ${rival}.` });
  if (worst && worst.rv > worst.us) out.push({ tone: "bad", text: `${rival} ens supera en «${worst.a}»: ${worst.rv} contra ${worst.us}.` });

  // 2. Encert de les accions amb resultat
  for (const a of actions) {
    const r = by("us", a).filter((e) => e.result);
    if (r.length >= 4) {
      const ok = r.filter((e) => e.result === "ok").length;
      const p = pct(ok, r.length);
      if (p <= 40) out.push({ tone: "bad", text: `Encert baix en «${a}»: ${ok} de ${r.length} (${p}%).` });
      else if (p >= 70) out.push({ tone: "good", text: `Bon encert en «${a}»: ${ok} de ${r.length} (${p}%).` });
    }
  }

  // 3. On es concentren les pèrdues i les recuperacions
  for (const [a, good] of [["Pèrdua", false], ["Recuperació", true]] as const) {
    const z = by("us", a).filter((e) => e.zx != null);
    if (z.length >= 4) {
      const counts = [0, 1, 2].map((k) => z.filter((e) => thirdOf(e.zx!) === k).length);
      const k = counts.indexOf(Math.max(...counts));
      out.push({
        tone: good ? (k === 2 ? "good" : "info") : k === 0 ? "bad" : "info",
        text: `${a === "Pèrdua" ? "Pèrdues" : "Recuperacions"}: ${counts[k]} de ${z.length} al ${THIRD[k]}${good && k === 2 ? " (bona pressió alta)" : !good && k === 0 ? " (perill: molt a prop de la nostra porteria)" : ""}.`,
      });
    }
  }

  // 4. Primera part vs segona
  if (m.h2_start != null) {
    const h = (team: "us" | "rival", n: 1 | 2) => events.filter((e) => e.team === team && halfOf(m, e.t) === n).length;
    const u1 = h("us", 1), u2 = h("us", 2), r1 = h("rival", 1), r2 = h("rival", 2);
    if (u1 + u2 >= 8) {
      if (u2 < u1 * 0.7) out.push({ tone: "bad", text: `Baixada a la 2a part: ${u1} accions nostres a la 1a i ${u2} a la 2a.` });
      else if (u2 > u1 * 1.3) out.push({ tone: "good", text: `Millora a la 2a part: de ${u1} a ${u2} accions nostres.` });
    }
    if (r2 > r1 * 1.4 && r1 + r2 >= 8) out.push({ tone: "bad", text: `${rival} va créixer a la 2a part (${r1} → ${r2} accions).` });
  }

  // 5. Franja de 15' on el rival va dominar
  const seg = (e: AEvent) => {
    const h = halfOf(m, e.t);
    const s = h === 2 ? e.t - Number(m.h2_start) : e.t - Number(m.h1_start);
    return (h - 1) * 3 + Math.min(2, Math.floor(Math.max(0, s) / 900));
  };
  const SEGS = ["0-15'", "15-30'", "30-45'", "45-60'", "60-75'", "75-90'"];
  let worstSeg = -1, worstDiff = 2;
  SEGS.forEach((_, i) => {
    const d = events.filter((e) => e.team === "rival" && seg(e) === i).length - events.filter((e) => e.team === "us" && seg(e) === i).length;
    if (d > worstDiff) { worstDiff = d; worstSeg = i; }
  });
  if (worstSeg >= 0) out.push({ tone: "bad", text: `El pitjor moment va ser del ${SEGS[worstSeg]}: ${rival} va fer ${worstDiff} accions més que nosaltres.` });

  // 6. Jugadores destacades
  const players = [...new Set(by("us").map((e) => e.player_id).filter(Boolean))] as string[];
  for (const a of ["Recuperació", "Xut", "Passada clau"]) {
    const top = players.map((p) => ({ p, n: by("us", a).filter((e) => e.player_id === p).length })).sort((x, y) => y.n - x.n)[0];
    if (top && top.n >= 3) out.push({ tone: "good", text: `${playerName(top.p)} lidera «${a}» amb ${top.n}.` });
  }
  const lossTop = players.map((p) => ({ p, n: by("us", "Pèrdua").filter((e) => e.player_id === p).length })).sort((x, y) => y.n - x.n)[0];
  if (lossTop && lossTop.n >= 4) out.push({ tone: "info", text: `${playerName(lossTop.p)} acumula ${lossTop.n} pèrdues (revisar-les amb ella).` });

  // 7. Eficàcia de cara a porteria
  const shots = by("us", "Xut").length, goals = by("us", "Gol").length;
  if (shots >= 3) out.push({ tone: goals / shots >= 0.2 ? "good" : "info", text: `Eficàcia: ${goals} gols en ${shots} xuts (${pct(goals, shots)}%).` });

  return out.length ? out : [{ tone: "info", text: "Partit equilibrat: no hi ha cap diferència clara a destacar." }];
}
