"use client";

import { useEffect, useState } from "react";
import { addDays, startOfWeek, weekRange } from "@/lib/dates";
import { dutyOf, fetchDuties, fetchDutyMembers, fetchDutySettings, firstNames, groupName, TASK_LABEL, type DutyGroup, type DutySettings } from "@/lib/duties";
import { fetchAll, supabase } from "@/lib/supabase";
import { todayMadrid } from "@/lib/wellness";

/** Qui porta el material i les porteries aquesta setmana (per a les jugadores i el planning). */
export function DutiesCard({ week, meId, title = "Aquesta setmana" }: { week?: string; meId?: string; title?: string }) {
  const w = week ?? startOfWeek(todayMadrid());
  const [groups, setGroups] = useState<DutyGroup[] | null>(null);
  useEffect(() => {
    fetchDuties(w).then(setGroups, () => setGroups([]));
  }, [w]);
  if (!groups) return null;
  const mat = dutyOf(groups, "material"), gk = dutyOf(groups, "porteria");
  if (!mat && !gk) return null;
  const mine = meId ? groups.find((g) => g.players.some((p) => p.id === meId)) : null;
  return (
    <section className={`card duties-card${mine?.task ? " mine" : ""}`}>
      <h2>{title}</h2>
      {mine?.task && <p className="duties-me">Et toca a tu: <b>{TASK_LABEL[mine.task]}</b> ({groupName(mine)})</p>}
      <ul className="duties-list">
        {[mat, gk].filter((g): g is DutyGroup => !!g).map((g) => (
          <li key={g.task}>
            <b>{TASK_LABEL[g.task!]}</b> <span>{groupName(g)}{g.players.length ? ` · ${firstNames(g)}` : ""}</span>
          </li>
        ))}
      </ul>
      {mine && !mine.task && <p className="muted small" style={{ margin: "6px 0 0" }}>Ets al {groupName(mine).replace(/^Grup/, "grup")}: aquesta setmana no et toca res.</p>}
    </section>
  );
}

/** Staff: a quin grup és cada jugadora i on comença la rotació. */
export function DutiesAdmin({ week }: { week: string }) {
  const [cfg, setCfg] = useState<DutySettings | null>(null);
  const [members, setMembers] = useState<Map<string, number>>(new Map());
  const [players, setPlayers] = useState<{ id: string; display_name: string }[]>([]);
  const [preview, setPreview] = useState<{ week: string; groups: DutyGroup[] }[]>([]);
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchDutySettings().then(setCfg, (e) => setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }));
    fetchDutyMembers().then(setMembers, () => {});
    fetchAll<{ id: string; display_name: string }>((f, t) => supabase().from("profiles").select("id, display_name").eq("role", "player").order("display_name").order("id").range(f, t)).then(setPlayers, () => {});
    Promise.all([0, 1, 2, 3].map((i) => fetchDuties(addDays(week, i * 7)).then((groups) => ({ week: addDays(week, i * 7), groups })))).then(setPreview, () => {});
  }, [week, version]);

  async function setGroup(pid: string, grp: number) {
    setBusy(true);
    const sb = supabase();
    const { error } = grp
      ? await sb.from("duty_groups").upsert({ player_id: pid, grp, updated_at: new Date().toISOString() }).select("player_id").single()
      : await sb.from("duty_groups").delete().eq("player_id", pid);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: `No s'ha pogut desar: ${error.message}` });
    setMsg({ ok: true, text: "Desat ✓" });
    setVersion((v) => v + 1);
  }
  /** «Aquesta setmana (la que es mira) material el grup X i porteria el Y»: d'aquí en endavant roten. */
  async function setThisWeek(patch: Partial<DutySettings>) {
    if (!cfg) return;
    const next = { ...cfg, ...patch };
    if (next.anchor_material === next.anchor_goal) return setMsg({ ok: false, text: "Material i porteria han de ser grups diferents." });
    setBusy(true);
    const { data, error } = await supabase().from("duty_settings")
      .update({ groups: next.groups, anchor_week: week, anchor_material: next.anchor_material, anchor_goal: next.anchor_goal, labels: next.labels ?? {}, updated_at: new Date().toISOString() })
      .eq("id", true).select("groups").maybeSingle();
    setBusy(false);
    if (error || !data) return setMsg({ ok: false, text: `No s'ha pogut desar: ${error?.message ?? "torna-ho a provar"}` });
    setMsg({ ok: true, text: "Desat ✓ La rotació continua a partir d'aquesta setmana." });
    setVersion((v) => v + 1);
  }

  const cur = preview[0]?.groups ?? [];
  const n = cfg?.groups ?? 4;
  const opts = Array.from({ length: n }, (_, i) => i + 1);
  return (
    <section className="card duties-admin">
      <h2 style={{ marginTop: 0 }}>🧺 Material i 🥅 porteria</h2>
      <p className="muted small" style={{ marginTop: -4 }}>Cada setmana roten: el grup de material passa al següent, i el de porteria també.</p>
      {msg && <p className={`msg${msg.ok ? "" : " error"}`}>{msg.text}</p>}
      {cfg && (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <span>{weekRange(week)}:</span>
          <label>Material <select value={dutyOf(cur, "material")?.grp ?? cfg.anchor_material} disabled={busy} onChange={(e) => setThisWeek({ anchor_material: Number(e.target.value), anchor_goal: dutyOf(cur, "porteria")?.grp ?? cfg.anchor_goal })} style={{ width: "auto" }}>
            {opts.map((g) => <option key={g} value={g}>Grup {g}</option>)}
          </select></label>
          <label>Porteria <select value={dutyOf(cur, "porteria")?.grp ?? cfg.anchor_goal} disabled={busy} onChange={(e) => setThisWeek({ anchor_goal: Number(e.target.value), anchor_material: dutyOf(cur, "material")?.grp ?? cfg.anchor_material })} style={{ width: "auto" }}>
            {opts.map((g) => <option key={g} value={g}>Grup {g}</option>)}
          </select></label>
        </div>
      )}
      {preview.length > 0 && (
        <table className="duties-rot">
          <thead><tr><th>Setmana</th><th>{TASK_LABEL.material}</th><th>{TASK_LABEL.porteria}</th></tr></thead>
          <tbody>
            {preview.map((p) => (
              <tr key={p.week}><td>{weekRange(p.week)}</td>{(["material", "porteria"] as const).map((t) => { const g = dutyOf(p.groups, t); return <td key={t}>{g ? groupName(g) : "–"}</td>; })}</tr>
            ))}
          </tbody>
        </table>
      )}
      {cfg && (
        <div className="duties-labels">
          <span className="muted small">Responsable de cada grup:</span>
          {opts.map((g) => (
            <label key={g}>Grup {g}
              <input type="text" maxLength={30} defaultValue={cfg.labels?.[String(g)] ?? ""} disabled={busy} aria-label={`Responsable del grup ${g}`}
                onBlur={(e) => {
                  const v = e.target.value.replace(/[<>]/g, "").trim().slice(0, 30);
                  if (v === (cfg.labels?.[String(g)] ?? "")) return;
                  const labels = { ...(cfg.labels ?? {}), [String(g)]: v };
                  if (!v) delete labels[String(g)];
                  setThisWeek({ labels, anchor_material: dutyOf(cur, "material")?.grp ?? cfg.anchor_material, anchor_goal: dutyOf(cur, "porteria")?.grp ?? cfg.anchor_goal });
                }} />
            </label>
          ))}
        </div>
      )}
      <details className="duties-members" open={members.size === 0}>
        <summary>Qui hi ha a cada grup</summary>
        <ul>
          {players.map((p) => (
            <li key={p.id}>
              <span>{p.display_name}</span>
              <select value={members.get(p.id) ?? 0} disabled={busy} onChange={(e) => setGroup(p.id, Number(e.target.value))} aria-label={`Grup de ${p.display_name}`}>
                <option value={0}>—</option>
                {opts.map((g) => <option key={g} value={g}>Grup {g}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
