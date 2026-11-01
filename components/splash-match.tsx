"use client";

import { useEffect } from "react";
import { crestFor, useCrests } from "@/components/crest";
import { prettyTeam } from "@/lib/analysis";
import { fetchConvocations, hhmm } from "@/lib/convo";

/**
 * Guarda al mòbil el proper partit perquè, el dia del partit, la pantalla d'entrada surti amb els dos escuts
 * i «Avui partit · hora» (l'entrada es pinta abans que l'app carregui, per això es llegeix del mateix mòbil).
 */
export function SplashMatchSaver({ today }: { today: string }) {
  const teams = useCrests();
  useEffect(() => {
    let alive = true;
    fetchConvocations(today).then((list) => {
      if (!alive) return;
      const c = list[0];
      try {
        if (!c) return localStorage.removeItem("splash-match");
        const rival = prettyTeam(c.rival);
        localStorage.setItem("splash-match", JSON.stringify({
          d: c.match_date, t: c.kickoff ? hhmm(c.kickoff) : "", h: c.is_home, c: crestFor(teams, rival) ?? "",
        }));
      } catch { /* sense emmagatzematge: l'entrada surt com sempre */ }
    }, () => {});
    return () => { alive = false; };
  }, [today, teams]);
  return null;
}
