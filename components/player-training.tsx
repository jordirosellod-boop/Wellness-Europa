"use client";

import { useEffect, useRef, useState } from "react";
import { PlanSheet } from "@/components/plan-sheet";
import { addDays, fmtShort } from "@/lib/dates";
import { deliverPdf, planPdf } from "@/lib/plan-pdf";
import { fetchPublished, fetchPublishedList, snapshotRoster, type PublishedData, type PublishedRow } from "@/lib/published-training";
import { safeName } from "@/lib/share-file";
import { todayMadrid } from "@/lib/wellness";
import { Loading } from "@/components/loading";

/** El full es dibuixa a mida A4 i es redueix fins a l'amplada de la pantalla. */
function FitSheet({ data }: { data: PublishedData }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    const sheet = el?.querySelector<HTMLElement>(".plan-sheet");
    if (!el || !sheet) return;
    const fit = () => {
      const k = Math.min(1, el.clientWidth / sheet.offsetWidth);
      sheet.style.transform = `scale(${k})`;
      el.style.height = `${sheet.offsetHeight * k}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [data]);
  return (
    <div className="ps-viewer" ref={box}>
      <PlanSheet plan={data.plan} roster={snapshotRoster(data)} onScreen />
    </div>
  );
}

/** Pantalla de la jugadora: els entrenos que el cos tècnic ha penjat (el d'avui primer). */
export function PlayerTraining() {
  const today = todayMadrid();
  const [list, setList] = useState<PublishedRow[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [data, setData] = useState<PublishedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<File | null>(null);

  useEffect(() => {
    fetchPublishedList(addDays(today, -30)).then(
      (l) => {
        setList(l);
        const pick = l.find((x) => x.plan_date === today) ?? l.find((x) => x.plan_date < today) ?? l[l.length - 1];
        setSel(pick?.plan_id ?? null);
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [today]);
  useEffect(() => {
    if (!sel) return;
    let off = false;
    fetchPublished(sel).then(
      (d) => !off && setData(d),
      (e) => !off && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      off = true;
    };
  }, [sel]);

  async function makePdf() {
    const el = document.querySelector<HTMLElement>(".ps-viewer .plan-sheet");
    if (!el || !data) return;
    setBusy(true);
    try {
      const file = await planPdf(el, `${safeName(`Entreno ${data.plan.plan_date}`)}.pdf`);
      if (navigator.canShare?.({ files: [file] })) setPdf(file);
      else await deliverPdf(file);
    } catch (e) {
      setError(`No s'ha pogut fer el PDF: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  const current = list?.find((x) => x.plan_id === sel);
  return (
    <>
      <h1>Entreno</h1>
      {error && <p className="msg error">{error}</p>}
      {!list && !error && <Loading />}
      {list?.length === 0 && <p className="card">Encara no hi ha cap entreno penjat.</p>}
      {list && list.length > 1 && (
        <div className="tabs convo-tabs" style={{ marginBottom: 10 }}>
          {list.map((x) => (
            <button key={x.plan_id} aria-pressed={x.plan_id === sel} onClick={() => { setData(null); setSel(x.plan_id); }}>
              {x.plan_date === today ? "Avui" : fmtShort(x.plan_date)}
            </button>
          ))}
        </div>
      )}
      {current && !data && !error && <p className="muted">Carregant l&apos;entreno…</p>}
      {data && (
        <>
          <FitSheet data={data} />
          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            <button type="button" className="btn small secondary" disabled={busy} onClick={makePdf}>{busy ? "Fent el PDF…" : "📄 Veure en PDF (per fer zoom)"}</button>
            {pdf && <button type="button" className="btn small" onClick={() => deliverPdf(pdf).then(() => setPdf(null))}>📤 Obrir el PDF</button>}
          </div>
        </>
      )}
    </>
  );
}
