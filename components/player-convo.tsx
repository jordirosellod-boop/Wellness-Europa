"use client";

import { useEffect, useState } from "react";
import { ConvoSheet } from "@/components/convo-sheet";
import { fetchConvocations, fetchRoster, type Convocation, type RosterRow } from "@/lib/convo";
import { addDays } from "@/lib/dates";
import { todayMadrid } from "@/lib/wellness";

/** Convocatòries publicades: la propera (o l'última) i, a sota, les anteriors. */
export function PlayerConvo({ meId }: { meId: string }) {
  const today = todayMadrid();
  const [list, setList] = useState<Convocation[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [roster, setRoster] = useState<{ id: string; rows: RosterRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConvocations(addDays(today, -60)).then(
      (l) => {
        setList(l);
        setSelected((l.find((c) => c.match_date >= today) ?? l[l.length - 1])?.id ?? null);
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [today]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    fetchRoster(selected).then(
      (rows) => alive && setRoster({ id: selected, rows }),
      (e) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, [selected]);

  const c = list?.find((x) => x.id === selected) ?? null;

  return (
    <>
      <h1>Convocatòria</h1>
      {error && <p className="msg error">{error}</p>}
      {!list && !error && <p className="muted">Carregant…</p>}
      {list?.length === 0 && <p className="card">Encara no hi ha cap convocatòria penjada.</p>}
      {list && list.length > 1 && (
        <div className="tabs convo-tabs" style={{ marginBottom: 12 }}>
          {[...list].reverse().map((x) => (
            <button key={x.id} aria-pressed={x.id === selected} onClick={() => setSelected(x.id)}>
              {x.match_date.slice(8, 10)}/{x.match_date.slice(5, 7)} · {x.rival}
            </button>
          ))}
        </div>
      )}
      {c && roster?.id === c.id && <ConvoSheet c={c} roster={roster.rows} meId={meId} />}
      {c && roster?.id !== c.id && !error && <p className="muted">Carregant…</p>}
    </>
  );
}

/** Per a l'Inici: la propera convocatòria publicada i si hi ets. */
export async function nextConvoFor(meId: string, today: string): Promise<{ c: Convocation; called: boolean } | null> {
  const list = await fetchConvocations(today);
  const c = list[0];
  if (!c) return null;
  const rows = await fetchRoster(c.id);
  return { c, called: !!rows.find((r) => r.player_id === meId)?.called };
}
