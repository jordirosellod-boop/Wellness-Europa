"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CoachShell, Footer } from "@/components/ui";
import { adminAction, fetchAll, supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/wellness";

export default function TeamPage() {
  return (
    <>
      <CoachShell>{(me) => <Team me={me} />}</CoachShell>
      <Footer />
    </>
  );
}

function linkFor(key: string) {
  return `${window.location.origin}/j#${key}`;
}

async function fetchTeam() {
  const sb = supabase();
  const [p, l] = await Promise.all([
    fetchAll<Profile>((f, t) => sb.from("profiles").select("id, role, display_name").order("display_name").order("id").range(f, t)),
    fetchAll<{ player_id: string; link_key: string }>((f, t) =>
      sb.from("player_links").select("player_id, link_key").order("player_id").range(f, t),
    ),
  ]);
  return { p, l };
}

function Team({ me }: { me: Profile }) {
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [links, setLinks] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetchTeam().then(
        ({ p, l }) => {
          setPeople(p);
          setLinks(new Map(l.map((x) => [x.player_id, x.link_key])));
        },
        (e) => setError(e instanceof Error ? e.message : String(e)),
      ),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="msg error">{error}</p>;
  if (!people) return <p className="muted">Carregant…</p>;

  const players = people.filter((p) => p.role === "player");
  const staff = people.filter((p) => p.role === "coach");

  return (
    <>
      <h1>Equip</h1>
      <AddPlayer onDone={load} />
      <section className="card">
        <h2>Jugadores ({players.length})</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Envia cada enllaç <b>per missatge privat</b> a la jugadora, mai al grup. Qui tingui l&apos;enllaç pot entrar com ella.
        </p>
        {players.length === 0 && <p className="muted">Encara no n&apos;hi ha cap.</p>}
        <ul className="list">
          {players.map((p) => (
            <PlayerRow key={p.id} player={p} linkKey={links.get(p.id)} onChange={load} />
          ))}
        </ul>
      </section>
      <StaffSection me={me} staff={staff} onChange={load} />
    </>
  );
}

function AddPlayer({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await adminAction({ action: "createPlayer", name: name.trim() });
      setMsg({ ok: true, text: `${name.trim()} afegida. Ara copia o envia-li el seu enllaç (a la llista).` });
      setName("");
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={add}>
      <h2>Afegir jugadora</h2>
      <div>
        <label className="field" htmlFor="pname">Nom (p. ex. &quot;Laia M.&quot;)</label>
        <input id="pname" type="text" maxLength={60} required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <button className="btn block" disabled={busy}>{busy ? "Afegint…" : "Afegir"}</button>
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
    </form>
  );
}

function PlayerRow({ player, linkKey, onChange }: { player: Profile; linkKey?: string; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function copy() {
    if (!linkKey) return;
    try {
      await navigator.clipboard.writeText(linkFor(linkKey));
      setMsg({ ok: true, text: "Enllaç copiat. Enganxa'l en un missatge privat." });
    } catch {
      setMsg({ ok: false, text: "No s'ha pogut copiar. Fes servir «Enviar»." });
    }
  }

  async function share() {
    if (!linkKey) return;
    const text = `Hola ${player.display_name}! Aquest és el teu enllaç personal per omplir el wellness i l'RPE. No el comparteixis amb ningú:\n${linkFor(linkKey)}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        /* cancel·lat */
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    }
  }

  async function run(action: "regenerateLink" | "deletePlayer", question: string, done: string) {
    if (!confirm(question)) return;
    setBusy(true);
    setMsg(null);
    try {
      await adminAction({ action, playerId: player.id });
      setMsg({ ok: true, text: done });
      onChange();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <b>{player.display_name}</b>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn small" onClick={share} disabled={!linkKey || busy}>Enviar enllaç</button>
        <button className="btn small secondary" onClick={copy} disabled={!linkKey || busy}>Copiar</button>
        <button
          className="btn small secondary"
          disabled={busy}
          onClick={() =>
            run(
              "regenerateLink",
              `Crear un enllaç nou per a ${player.display_name}? L'antic deixarà de funcionar a l'instant i hauràs d'enviar-li el nou.`,
              "Enllaç nou creat. Envia-li'l.",
            )
          }
        >
          Nou enllaç
        </button>
        <button
          className="btn small danger"
          disabled={busy}
          onClick={() =>
            run(
              "deletePlayer",
              `Esborrar ${player.display_name} i TOTS els seus registres (wellness i RPE)? No es pot desfer.`,
              "Jugadora esborrada.",
            )
          }
        >
          Esborrar
        </button>
      </div>
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
    </li>
  );
}

function StaffSection({ me, staff, onChange }: { me: Profile; staff: Profile[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await adminAction({ action: "createStaff", name: name.trim(), email: email.trim(), password });
      setMsg({ ok: true, text: `${name.trim()} afegit/da. Passa-li el correu i la contrasenya en privat.` });
      setName("");
      setEmail("");
      setPassword("");
      onChange();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Profile) {
    if (!confirm(`Treure l'accés de ${p.display_name}?`)) return;
    try {
      await adminAction({ action: "deleteStaff", staffId: p.id });
      onChange();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <section className="card">
      <h2>Staff ({staff.length})</h2>
      <ul className="list">
        {staff.map((p) => (
          <li key={p.id} className="row between">
            <span>
              {p.display_name} {p.id === me.id && <span className="muted small">(tu)</span>}
            </span>
            {p.id !== me.id && (
              <button className="btn small danger" onClick={() => remove(p)}>Treure</button>
            )}
          </li>
        ))}
      </ul>
      <form className="stack" style={{ marginTop: 16 }} onSubmit={add}>
        <h3>Afegir algú del staff</h3>
        <div>
          <label className="field" htmlFor="stn">Nom</label>
          <input id="stn" type="text" maxLength={60} required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="field" htmlFor="ste">Correu</label>
          <input id="ste" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="field" htmlFor="stp">Contrasenya inicial (mínim 8)</label>
          <input id="stp" type="text" minLength={8} required autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn secondary block" disabled={busy}>{busy ? "Afegint…" : "Afegir al staff"}</button>
        {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
      </form>
    </section>
  );
}
