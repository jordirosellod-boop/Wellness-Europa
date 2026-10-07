"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Brand, Footer, useMe } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const { me } = useMe();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me?.role === "coach") router.replace("/entrenador");
    if (me?.role === "player") router.replace("/j");
  }, [me, router]);

  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.user) {
        setError("Correu o contrasenya incorrectes.");
        return;
      }
      const { data: p } = await supabase().from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      if (p?.role !== "coach") {
        await supabase().auth.signOut();
        setError("Aquest compte no té accés de staff.");
        return;
      }
      router.replace("/entrenador");
    } catch {
      setError("Sense connexió. Torna-ho a provar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <Brand />
      </header>
      <main>
        {me === undefined ? (
          <p className="muted">Carregant…</p>
        ) : (
          <>
            <div className="card">
              <h1 style={{ marginTop: 0 }}>Ets jugadora?</h1>
              <p style={{ marginBottom: 0 }}>
                Obre l&apos;<b>enllaç personal</b> que t&apos;ha enviat el teu entrenador. No cal cap contrasenya.
              </p>
            </div>
            <form className="card stack" onSubmit={login}>
              <h2>Accés staff</h2>
              <div>
                <label className="field" htmlFor="email">Correu</label>
                <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="field" htmlFor="pw">Contrasenya</label>
                <input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button className="btn block" disabled={busy}>{busy ? "Entrant…" : "Entrar"}</button>
              {error && <p className="msg error" role="alert">{error}</p>}
            </form>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
