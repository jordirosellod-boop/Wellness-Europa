"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/wellness";
import { Loading } from "@/components/loading";
import { outcome, recentResult } from "@/lib/matchday";
import { todayMadrid } from "@/lib/wellness";

/** Si ahir o avui hem guanyat (es mira un cop per sessió): l'escut porta una estrelleta daurada. */
function useVictory(): boolean {
  const [win, setWin] = useState(false);
  useEffect(() => {
    let alive = true;
    const today = todayMadrid();
    try {
      const c = JSON.parse(sessionStorage.getItem("victoria") ?? "null") as { day: string; win: boolean } | null;
      if (c?.day === today) { Promise.resolve().then(() => alive && setWin(c.win)); return () => { alive = false; }; }
    } catch { /* res */ }
    // Sense sessió (pantalla d'entrada) no es mira res: ja es mirarà quan s'hagi entrat
    supabase().auth.getSession().then(({ data }) => (data.session ? recentResult(today, 1) : Promise.reject())).then((r) => {
      const w = !!r && outcome(r) === "G";
      try { sessionStorage.setItem("victoria", JSON.stringify({ day: today, win: w })); } catch { /* res */ }
      if (alive) setWin(w);
    }, () => {});
    return () => { alive = false; };
  }, []);
  return win;
}

export function Brand() {
  const win = useVictory();
  return (
    <span className={`brand${win ? " won" : ""}`} title={win ? "Hem guanyat! 💙" : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-logo" src="/escut.png" alt="Escut del CE Europa" width={40} height={40} />
      {win && <span className="brand-star" aria-label="Victòria: +3 punts">+3</span>}
      <span>Juvenil C 2026/2027</span>
    </span>
  );
}

/** Carrega el perfil de qui ha iniciat sessió. Si es demana un rol i no el té, el torna a l'inici. */
export function useMe(required?: Profile["role"]) {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase().auth.getSession();
        const uid = data.session?.user.id;
        let profile: Profile | null = null;
        if (uid) {
          const { data: p, error: e } = await supabase()
            .from("profiles")
            .select("id, role, display_name")
            .eq("id", uid)
            .maybeSingle();
          if (e) throw e;
          profile = p as Profile | null;
        }
        if (!alive) return;
        if (required && profile?.role !== required) {
          router.replace("/");
          return;
        }
        setMe(profile);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [required, router]);

  return { me, error };
}

export function CoachShell({ children }: { children: (me: Profile) => ReactNode }) {
  const { me, error } = useMe("coach");
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    await supabase().auth.signOut();
    router.replace("/");
  }

  return (
    <>
      <header className="topbar">
        <Link href="/entrenador" style={{ textDecoration: "none" }}>
          <Brand />
        </Link>
        {/* Tornar a tocar la pestanya on ja ets: puja suaument a dalt de tot */}
        <nav className="nav" onClick={(e) => {
          const a = (e.target as HTMLElement).closest("a");
          if (!a || new URL(a.href).pathname !== window.location.pathname) return;
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        }}>
          <Link
            href="/entrenador"
            className={path === "/entrenador" || path.startsWith("/entrenador/sessio") || path.startsWith("/entrenador/programacio") ? "active" : ""}
          >
            Calendari
          </Link>
          <Link href="/entrenador/convocatoria" className={path === "/entrenador/convocatoria" ? "active" : ""}>
            Convo
          </Link>
          <Link href="/entrenador/assistencia" className={path === "/entrenador/assistencia" ? "active" : ""}>
            Llista
          </Link>
          <Link href="/entrenador/carrega" className={path === "/entrenador/carrega" ? "active" : ""}>
            Càrrega
          </Link>
          <Link href="/entrenador/estadistiques" className={path === "/entrenador/estadistiques" ? "active" : ""}>
            Stats
          </Link>
          <Link href="/entrenador/multes" className={path === "/entrenador/multes" ? "active" : ""}>
            Multes
          </Link>
          <Link href="/entrenador/equip" className={path === "/entrenador/equip" ? "active" : ""}>
            Equip
          </Link>
        </nav>
      </header>
      <main>
        {error ? <p className="msg error">{error}</p> : me ? children(me) : <Loading />}
        {me && (
          <div className="center" style={{ marginTop: 28 }}>
            <button className="btn small secondary" onClick={logout}>Tancar sessió</button>
          </div>
        )}
      </main>
    </>
  );
}

export function Scale({
  value,
  onChange,
  min,
  max,
  low,
  high,
  label,
  disabled,
  tone,
}: {
  value: number | null;
  onChange: (v: number) => void;
  min: number;
  max: number;
  low: string;
  high: string;
  label: string;
  disabled?: boolean;
  /** Color de cada número: "up" = com més alt, millor (verd); "down" = com més alt, més dur (vermell). */
  tone?: "up" | "down";
}) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const hue = (n: number) => {
    const t = (n - min) / (max - min);
    return Math.round((tone === "down" ? 1 - t : t) * 125);
  };
  return (
    <div>
      <div className={`scale${min === 0 ? " rpe" : ""}${tone ? " toned" : ""}`} role="group" aria-label={label}>
        {nums.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${label}: ${n}`}
            disabled={disabled}
            style={tone ? ({ "--h": hue(n) } as CSSProperties) : undefined}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="scale-ends">
        <span>
          {min} = {low}
        </span>
        <span>
          {max} = {high}
        </span>
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      CE Europa · <Link href="/privacitat">Privacitat</Link>
    </footer>
  );
}

/** És el responsable de l'app? (l'únic que veu l'Anàlisi i les Plantilles). null = encara no se sap. */
export function useIsOwner(): boolean | null {
  const [owner, setOwner] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    supabase()
      .rpc("is_owner")
      .then(({ data, error }) => alive && setOwner(!error && data === true));
    return () => {
      alive = false;
    };
  }, []);
  return owner;
}

/** Mostra el contingut només al responsable; a la resta, un avís. */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const owner = useIsOwner();
  if (owner === null) return <Loading />;
  if (!owner) return <p className="card">Aquesta secció és privada de l&apos;entrenador responsable.</p>;
  return <>{children}</>;
}
