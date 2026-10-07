"use client";

import { useEffect, useState } from "react";
import { CoachShell, Footer } from "@/components/ui";
import { acwrBand, fmtRatio, MIN_DAYS } from "@/lib/acwr";
import { loadTeamAcwr, type PlayerLoad } from "@/lib/acwr-data";
import { fetchAll, supabase } from "@/lib/supabase";
import { fmtDate, friendlyError, todayMadrid, type Profile } from "@/lib/wellness";

export default function LoadPage() {
  return (
    <>
      <CoachShell>{() => <TeamLoad />}</CoachShell>
      <Footer />
    </>
  );
}

type Row = { player: Profile; load: PlayerLoad };

async function fetchTeamLoad(asOf: string): Promise<Row[]> {
  const sb = supabase();
  const players = await fetchAll<Profile>((f, t) =>
    sb.from("profiles").select("id, role, display_name, created_at").eq("role", "player").order("display_name").order("id").range(f, t),
  );
  const loads = await loadTeamAcwr(asOf, players);
  return players.map((p) => ({ player: p, load: loads.get(p.id)! }));
}

/** Ordre: primer les de més risc; les que no tenen prou dades, al final. */
function sortKey(r: Row): number {
  const res = r.load.result;
  if (!res || res.acwr == null || res.days < MIN_DAYS) return -1;
  return Math.abs(res.acwr - 1.05);
}

function TeamLoad() {
  const today = todayMadrid();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTeamLoad(today).then(setRows, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [today]);

  const sorted = rows ? [...rows].sort((a, b) => sortKey(b) - sortKey(a)) : null;

  return (
    <>
      <h1>Càrrega (ACWR)</h1>
      <p className="muted" style={{ marginTop: -6 }}>{fmtDate(today)} · només el staff veu aquesta pantalla</p>
      {error && <p className="msg error">{friendlyError(error)}</p>}
      {!sorted && !error && <p className="muted">Calculant…</p>}
      {sorted?.length === 0 && <p className="muted">Encara no hi ha jugadores.</p>}
      {sorted?.map(({ player, load }) => <LoadCard key={player.id} name={player.display_name} load={load} />)}

      <section className="card small">
        <h2>Com es llegeix</h2>
        <p style={{ marginTop: 0 }}>
          <b>ACWR</b> = càrrega aguda ÷ càrrega crònica, amb mitjanes exponencials (EWMA) de 7 i 28 dies. La càrrega de cada sessió és
          RPE × minuts.
        </p>
        <p>
          <span className="chip band-moderat">Baixa</span> menys de 0,8 · <span className="chip band-bo">Òptima</span> 0,8 – 1,3 ·{" "}
          <span className="chip band-alerta">Alerta</span> 1,3 – 1,5 · <span className="chip band-baix">Risc</span> més d&apos;1,5
        </p>
        <p>
          Amb EWMA el valor <b>puja els dies d&apos;entrenament i baixa els de descans</b>, encara que la setmana sigui normal. Compara&apos;l
          sempre el mateix dia de la setmana (per exemple, el dia del primer entrenament).
        </p>
        <p style={{ marginBottom: 0 }}>
          Calen uns {MIN_DAYS} dies de dades perquè sigui fiable. Els RPE que falten compten com a càrrega 0, i per tant fan baixar
          l&apos;ACWR: per això s&apos;indiquen.
        </p>
      </section>
    </>
  );
}

function LoadCard({ name, load }: { name: string; load: PlayerLoad }) {
  const r = load.result;
  const enough = r != null && r.acwr != null && r.days >= MIN_DAYS;
  const band = enough ? acwrBand(r.acwr!) : null;
  return (
    <div className={`player${band && (band.label === "Risc" || band.label === "Alerta") ? " has-alert" : ""}`}>
      <div className="row between">
        <b>{name}</b>
        {enough ? (
          <span className={`chip ${band!.cls}`}>ACWR {fmtRatio(r.acwr!)} · {band!.label}</span>
        ) : (
          <span className="chip pendent">{r ? `Falten ${MIN_DAYS - r.days} dies de dades` : "Sense dades"}</span>
        )}
      </div>
      {r && (
        <div className="line muted">
          Aguda {Math.round(r.acute)} · Crònica {Math.round(r.chronic)} UA/dia · Últims 7 dies: {Math.round(r.week)} UA
          {!enough && r.acwr != null && ` · ACWR provisional ${fmtRatio(r.acwr)}`}
        </div>
      )}
      {load.missing > 0 && (
        <div className="line" style={{ color: "var(--taronja)" }}>
          ⚠ {load.missing} {load.missing === 1 ? "sessió" : "sessions"} sense RPE als últims 28 dies
        </div>
      )}
    </div>
  );
}
