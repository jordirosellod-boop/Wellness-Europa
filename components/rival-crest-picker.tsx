"use client";

import { useEffect, useState } from "react";
import { crestFor, reloadCrests, useCrests } from "@/components/crest";
import { CREST_BASE, isCrestFile } from "@/lib/fcf";
import { supabase } from "@/lib/supabase";

type Saved = { id: string; fcf_file: string | null; has_image: boolean };

/** De l'enllaç d'una imatge d'escut de la FCF («https://files.fcf.cat/escudos/clubes/escudos/123.png») en treu el fitxer. */
export function crestFileFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const base = new URL(CREST_BASE);
    if (u.protocol !== "https:" || u.hostname !== base.hostname || !u.pathname.startsWith(base.pathname)) return null;
    const f = decodeURIComponent(u.pathname.slice(base.pathname.length));
    return isCrestFile(f) ? f : null;
  } catch {
    return null;
  }
}

/** Redueix la imatge a 192 px (sense perdre la transparència) i la torna com a «data:image/png». */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 192 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const url = c.toDataURL("image/png");
  if (url.length > 190_000) throw new Error("La imatge és massa gran. Prova amb una retallada només amb l'escut.");
  return url;
}

/** Staff: l'escut del rival d'un amistós. Si no surt sol, es pot enganxar l'enllaç de la FCF o pujar una imatge. */
export function RivalCrestPicker({ rival }: { rival: string }) {
  const teams = useCrests();
  const name = rival.trim();
  const src = name ? crestFor(teams, name) : null;
  const [saved, setSavedRaw] = useState<{ key: string; row: Saved | null } | null>(null);
  const key = name.toLowerCase();
  const setSaved = (row: Saved | null) => setSavedRaw({ key, row });
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // L'escut afegit a mà per a aquest nom (si n'hi ha)
  useEffect(() => {
    if (!name) return;
    let alive = true;
    const t = setTimeout(() => {
      supabase().from("team_crests").select("id, fcf_file, image").eq("name_key", name.toLowerCase()).maybeSingle()
        .then(({ data }) => alive && setSavedRaw({ key: name.toLowerCase(), row: data ? { id: data.id as string, fcf_file: data.fcf_file as string | null, has_image: !!data.image } : null }));
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [name]);
  const mine = name && saved?.key === key ? saved.row : null;

  async function save(row: { fcf_file: string | null; image: string | null }) {
    if (!name) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase().from("team_crests")
      .upsert({ name, ...row, updated_at: new Date().toISOString() }, { onConflict: "name_key" })
      .select("id, fcf_file, image").single();
    setBusy(false);
    if (error || !data) return setMsg({ ok: false, text: `No s'ha pogut desar: ${error?.message ?? "torna-ho a provar"}` });
    setSaved({ id: data.id as string, fcf_file: data.fcf_file as string | null, has_image: !!data.image });
    setOpen(false); setLink("");
    setMsg({ ok: true, text: "Desat ✓ L'escut ja surt a la convocatòria i al cartell." });
    await reloadCrests();
  }
  async function remove() {
    if (!mine) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase().from("team_crests").delete().eq("id", mine.id);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: `No s'ha pogut treure: ${error.message}` });
    setSaved(null);
    setMsg({ ok: true, text: "Escut tret." });
    await reloadCrests();
  }
  function fromLink() {
    const f = crestFileFromUrl(link);
    if (!f) return setMsg({ ok: false, text: "Aquest enllaç no és d'un escut de la FCF (ha de començar per https://files.fcf.cat/escudos/…)." });
    void save({ fcf_file: f, image: null });
  }
  async function fromFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\//.test(file.type)) return setMsg({ ok: false, text: "Tria una imatge." });
    try {
      const image = await shrink(file);
      await save({ fcf_file: null, image });
    } catch (e) {
      setBusy(false);
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  const linkFile = crestFileFromUrl(link);
  // Equips coneguts (del grup) per triar-ne un si el nom de l'amistós s'escriu diferent
  const known = teams.filter((t) => !t.id.startsWith("x-")).slice(0, 24);

  return (
    <div className="rcp">
      <div className="rcp-row">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="rcp-crest" src={src} alt="" width={44} height={44} />
        ) : (
          <span className="rcp-crest rcp-empty" aria-hidden="true">?</span>
        )}
        <span className="rcp-text">
          {!name ? "Escriu el rival i en buscarem l'escut." : src ? <><b>Escut del rival</b>{mine ? " · posat a mà" : " · trobat"}</> : <><b>Sense escut</b> · posa-l&apos;hi perquè quedi millor</>}
        </span>
        {name && (
          <button type="button" className="btn small secondary" disabled={busy} onClick={() => { setOpen((o) => !o); setMsg(null); }}>
            {open ? "Tancar" : src ? "Canviar" : "Posar escut"}
          </button>
        )}
      </div>
      {open && name && (
        <div className="rcp-panel">
          <p className="small" style={{ margin: 0 }}>
            <b>Des de la FCF:</b> a <a href="https://www.fcf.cat/ca/clubs" target="_blank" rel="noopener noreferrer">fcf.cat › Clubs</a> busca el club, mantén premut l&apos;escut i tria <b>Copia l&apos;adreça de la imatge</b>. Enganxa-la aquí:
          </p>
          <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <input type="url" inputMode="url" placeholder="https://files.fcf.cat/escudos/…" value={link} disabled={busy} onChange={(e) => setLink(e.target.value)} aria-label="Enllaç de l'escut" />
            {linkFile && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="rcp-crest" src={`/api/fcf/crest?f=${encodeURIComponent(linkFile)}`} alt="" width={40} height={40} />
            )}
            <button type="button" className="btn small" disabled={busy || !link.trim()} onClick={fromLink}>Desar</button>
          </div>
          <label className="btn small secondary rcp-upload">
            📷 O puja una imatge de l&apos;escut
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(e) => { void fromFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {known.length > 0 && (
            <>
              <p className="small muted" style={{ margin: "4px 0 0" }}>O tria&apos;l d&apos;un equip de la lliga:</p>
              <div className="rcp-known">
                {known.map((t) => {
                  const f = new URLSearchParams(t.crest.split("?")[1] ?? "").get("f");
                  return (
                    <button key={t.id} type="button" title={t.name} aria-label={t.name} disabled={busy || !f} onClick={() => f && save({ fcf_file: f, image: null })}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.crest} alt="" width={34} height={34} loading="lazy" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {mine && <button type="button" className="btn small secondary" disabled={busy} onClick={remove}>Treure l&apos;escut posat a mà</button>}
        </div>
      )}
      {msg && <p className={`msg${msg.ok ? " ok" : " error"}`} style={{ marginTop: 6 }}>{msg.text}</p>}
    </div>
  );
}
