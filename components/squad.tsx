"use client";

import { useEffect, useState } from "react";
import { Loading } from "@/components/loading";
import { PlayerGrid, type GridRow } from "@/components/player-grid";
import { kitFont } from "@/lib/fonts";
import { supabase } from "@/lib/supabase";

type SquadRow = { player_id: string; display_name: string; dorsal: number | null; goalkeeper: boolean };

/** La plantilla: totes les companyes amb foto i dorsal (només nom i dorsal, res més). */
export function Squad({ meId }: { meId: string }) {
  const [rows, setRows] = useState<SquadRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase().rpc("team_roster").range(0, 199).then(({ data, error }) => {
      if (!alive) return;
      if (error) setErr(error.message);
      else setRows((data ?? []) as SquadRow[]);
    });
    return () => { alive = false; };
  }, []);

  if (err) return <p className="msg error">No s&apos;ha pogut carregar la plantilla: {err}</p>;
  if (!rows) return <Loading />;
  const row = (r: SquadRow): GridRow => ({ player_id: r.player_id, display_name: r.display_name, dorsal: r.dorsal });
  const gks = rows.filter((r) => r.goalkeeper).map(row);
  const field = rows.filter((r) => !r.goalkeeper).map(row);
  return (
    <section className={`squad ${kitFont.variable}`}>
      <header className="squad-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/escut.png" alt="" width={48} height={48} />
        <div>
          <span className="convo-kicker">CE Europa · Juvenil C</span>
          <h1 className="convo-title">La plantilla</h1>
        </div>
      </header>
      {gks.length > 0 && (<><h2 className="convo-sub">Porteres <span>{gks.length}</span></h2><PlayerGrid rows={gks} meId={meId} /></>)}
      <h2 className="convo-sub">Jugadores <span>{field.length}</span></h2>
      <PlayerGrid rows={field} meId={meId} />
      <p className="squad-note">Toca una companya per veure-la en gran.</p>
    </section>
  );
}
