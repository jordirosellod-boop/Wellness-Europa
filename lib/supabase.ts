import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Client del navegador. Només fa servir la clau pública: la seguretat
// la garanteix la base de dades (Row Level Security), no aquest codi.
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Falta configurar Supabase (variables d'entorn).");
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "wellness-europa",
      },
    });
  }
  return client;
}

// Supabase retorna com a màxim 1.000 files per consulta sense avisar.
// Aquesta funció demana les dades per pàgines fins que no n'hi ha més.
// La consulta que se li passa HA de tenir un .order() determinista (acabat en id).
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  size = 500,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

// Crida a les accions d'administració (crear jugadores, staff...), que
// s'executen al servidor amb la clau secreta després de comprovar que qui
// les demana és staff.
export async function adminAction<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("La sessió ha caducat. Torna a entrar.");
  let res: Response;
  try {
    res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Sense connexió. Torna-ho a provar.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Error del servidor (${res.status}).`);
  return json as T;
}
