"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loading } from "@/components/loading";
import { Player360View } from "@/components/player-360";
import { CoachShell, Footer } from "@/components/ui";
import { loadPlayer360, type Player360 } from "@/lib/player360";
import { todayMadrid } from "@/lib/wellness";

export default function PlayerPage() {
  return (
    <>
      <CoachShell>{() => <Fitxa />}</CoachShell>
      <Footer />
    </>
  );
}

function Fitxa() {
  const today = todayMadrid();
  const [p, setP] = useState<Player360 | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) { Promise.resolve().then(() => setErr("Falta la jugadora.")); return; }
    let alive = true;
    loadPlayer360(id, today).then((x) => alive && setP(x), (e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [today]);
  return (
    <>
      <Link href="/entrenador/equip" className="btn small secondary" style={{ marginBottom: 10 }}>‹ Equip</Link>
      {err ? <p className="msg error">{err}</p> : p ? <Player360View p={p} today={today} /> : <Loading lines={6} />}
    </>
  );
}
