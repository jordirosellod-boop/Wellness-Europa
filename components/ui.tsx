"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/wellness";

export function Brand() {
  return (
    <span className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-logo" src="/escut.png" alt="Escut del CE Europa" width={40} height={40} />
      <span>Wellness</span>
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
        <nav className="nav">
          <Link
            href="/entrenador"
            className={path === "/entrenador" || path.startsWith("/entrenador/sessio") || path.startsWith("/entrenador/programacio") ? "active" : ""}
          >
            Calendari
          </Link>
          <Link href="/entrenador/carrega" className={path === "/entrenador/carrega" ? "active" : ""}>
            Càrrega
          </Link>
          <Link href="/entrenador/multes" className={path === "/entrenador/multes" ? "active" : ""}>
            Multes
          </Link>
          <Link href="/entrenador/equip" className={path === "/entrenador/equip" ? "active" : ""}>
            Equip
          </Link>
          <button onClick={logout}>Sortir</button>
        </nav>
      </header>
      <main>
        {error ? <p className="msg error">{error}</p> : me ? children(me) : <p className="muted">Carregant…</p>}
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
}: {
  value: number | null;
  onChange: (v: number) => void;
  min: number;
  max: number;
  low: string;
  high: string;
  label: string;
  disabled?: boolean;
}) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div className={`scale${min === 0 ? " rpe" : ""}`} role="group" aria-label={label}>
        {nums.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${label}: ${n}`}
            disabled={disabled}
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
