/** Mentre carrega: la silueta del contingut amb una brillantor suau (en lloc de «Carregant…»). */
export function Loading({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">Carregant…</span>
      <div className="sk-card">
        <i className="sk-title" />
        {Array.from({ length: lines }, (_, i) => <i key={i} className="sk-line" style={{ width: `${92 - ((i * 17) % 35)}%` }} />)}
      </div>
      <div className="sk-card short">
        <i className="sk-line" style={{ width: "70%" }} />
        <i className="sk-line" style={{ width: "45%" }} />
      </div>
    </div>
  );
}
