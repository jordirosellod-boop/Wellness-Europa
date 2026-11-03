// Petits detalls de tacte i so.

let sw: HTMLLabelElement | null = null;

/**
 * Vibració suau (com quan es mou un interruptor a l'iPhone). A l'iPhone es fa amb un interruptor amagat
 * (Safari 18 hi fa vibrar el mòbil); a Android, amb la vibració normal. S'ha de cridar en tocar alguna cosa.
 */
export function haptic() {
  try {
    if (navigator.vibrate?.(8)) return;
    if (!sw) {
      sw = document.createElement("label");
      sw.setAttribute("aria-hidden", "true");
      sw.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      sw.appendChild(input);
      document.body.appendChild(sw);
    }
    sw.click();
  } catch { /* sense vibració */ }
}

// ---------- Sons (fets al moment, sense fitxers) ----------

const SOUND_KEY = "sons";
export const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== "0"; } catch { return true; } };
export const setSoundOn = (on: boolean) => { try { localStorage.setItem(SOUND_KEY, on ? "1" : "0"); } catch { /* res */ } };

let ac: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (!soundOn()) return null;
  try {
    ac ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ac.state === "suspended") void ac.resume();
    return ac;
  } catch { return null; }
}

/** Xiulet d'àrbitre: dues notes agudes amb el trinat de la boleta. `long` per al final. */
export function whistle(long = false) {
  const a = ctx();
  if (!a) return;
  const t0 = a.currentTime, dur = long ? 1.1 : 0.55;
  const out = a.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(0.16, t0 + 0.03);
  out.gain.setValueAtTime(0.16, t0 + dur - 0.08);
  out.gain.linearRampToValueAtTime(0, t0 + dur);
  out.connect(a.destination);
  // trinat (la boleta de dins el xiulet)
  const trill = a.createOscillator(), depth = a.createGain();
  trill.frequency.value = 38; depth.gain.value = 120;
  trill.connect(depth);
  for (const f of [2950, 3320]) {
    const o = a.createOscillator();
    o.type = "sine"; o.frequency.value = f;
    depth.connect(o.frequency);
    const g = a.createGain(); g.gain.value = 0.5;
    o.connect(g).connect(out);
    o.start(t0); o.stop(t0 + dur);
  }
  trill.start(t0); trill.stop(t0 + dur);
}

/** Grada celebrant un gol: soroll filtrat que creix i s'apaga. */
export function crowd() {
  const a = ctx();
  if (!a) return;
  const t0 = a.currentTime, dur = 2.2;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / a.sampleRate * 9 * Math.PI * 2) ** 2);
  const src = a.createBufferSource(); src.buffer = buf;
  const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 0.7;
  const g = a.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.22, t0 + 0.35);
  g.gain.setValueAtTime(0.22, t0 + 1.1);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(bp).connect(g).connect(a.destination);
  src.start(t0); src.stop(t0 + dur);
}
