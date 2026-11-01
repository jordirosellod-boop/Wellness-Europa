// El temps que farà (Open-Meteo: gratuït, sense clau). Per al camp de casa o, a fora, pel poble de l'adreça.

const HOME = { lat: 41.4062, lon: 2.1626 }; // Barcelona (Nou Sardenya)

export type Forecast = { temp: number; rain: number; wind: number; code: number };

const cache = new Map<string, Promise<Forecast | null>>();

/** El poble a partir de l'adreça («…, 08338 Premià de Dalt» → «Premià de Dalt»). */
export function townOf(address: string | null | undefined): string | null {
  const m = address?.match(/\b\d{5}\s+([^,]+)$/);
  return m ? m[1].trim() : null;
}

async function coords(town: string | null): Promise<{ lat: number; lon: number }> {
  if (!town) return HOME;
  try {
    // El cercador troba millor els noms sense accents («Premia de Dalt»)
    const plain = town.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(plain)}&count=1&language=ca&countryCode=ES`);
    const j = (await r.json()) as { results?: { latitude: number; longitude: number }[] };
    const p = j.results?.[0];
    return p ? { lat: p.latitude, lon: p.longitude } : HOME;
  } catch {
    return HOME;
  }
}

/** Previsió per a un dia i una hora (només fins a 15 dies vista). */
export function forecastAt(date: string, time: string | null, town: string | null = null): Promise<Forecast | null> {
  const key = `${date}|${time}|${town}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const { lat, lon } = await coords(town);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&timezone=Europe%2FMadrid&start_date=${date}&end_date=${date}`;
      const r = await fetch(url);
      if (!r.ok) return null;
      const j = (await r.json()) as { hourly?: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[]; wind_speed_10m: number[] } };
      const h = j.hourly;
      if (!h?.time?.length) return null;
      const hour = Number((time ?? "18:00").slice(0, 2));
      const i = Math.max(0, h.time.findIndex((t) => Number(t.slice(11, 13)) === hour));
      return { temp: Math.round(h.temperature_2m[i]), rain: h.precipitation_probability[i] ?? 0, wind: Math.round(h.wind_speed_10m[i]), code: h.weather_code[i] };
    })().catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/** Icona i paraula segons el codi del temps (WMO). */
export function sky(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "Sol" };
  if (code <= 2) return { icon: "🌤️", label: "Poc ennuvolat" };
  if (code === 3) return { icon: "☁️", label: "Ennuvolat" };
  if (code <= 48) return { icon: "🌫️", label: "Boira" };
  if (code <= 57) return { icon: "🌦️", label: "Plugim" };
  if (code <= 67 || (code >= 80 && code <= 82)) return { icon: "🌧️", label: "Pluja" };
  if (code <= 77 || code === 85 || code === 86) return { icon: "🌨️", label: "Neu" };
  return { icon: "⛈️", label: "Tempesta" };
}

/** Un consell curt segons el temps. */
export function tip(f: Forecast): string | null {
  if (f.rain >= 50) return "porta impermeable";
  if (f.temp <= 8) return "abriga't bé";
  if (f.temp >= 28) return "molta aigua i crema solar";
  if (f.wind >= 30) return "farà vent";
  return null;
}
