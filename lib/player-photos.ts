// Fotos de les jugadores (retallades). Només les veu l'equip; només el staff les puja.

import { fetchAll, supabase } from "@/lib/supabase";

/** Fotos petites (del cap a la cintura) de totes les jugadores que en tenen. */
let thumbsCache: Promise<Map<string, string>> | null = null;
export function fetchThumbs(): Promise<Map<string, string>> {
  thumbsCache ??= fetchAll<{ profile_id: string; thumb: string }>((f, t) =>
    supabase().from("player_photos").select("profile_id, thumb").order("profile_id").range(f, t))
    .then((rows) => new Map(rows.map((r) => [r.profile_id, r.thumb])))
    .catch((e) => { thumbsCache = null; throw e; });
  return thumbsCache;
}
export const forgetThumbs = () => { thumbsCache = null; };

/** La foto gran (sencera) d'una jugadora, o null si no en té. */
export async function fetchCutout(profileId: string): Promise<string | null> {
  const { data, error } = await supabase().from("player_photos").select("cutout").eq("profile_id", profileId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.cutout as string | undefined) ?? null;
}

export async function savePhoto(profileId: string, cutout: string, thumb: string): Promise<void> {
  const { data, error } = await supabase().from("player_photos")
    .upsert({ profile_id: profileId, cutout, thumb }, { onConflict: "profile_id" }).select("profile_id").single();
  if (error || !data) throw new Error(error?.message ?? "No s'ha pogut desar la foto.");
  forgetThumbs();
}

export async function deletePhoto(profileId: string): Promise<void> {
  const { data, error } = await supabase().from("player_photos").delete().eq("profile_id", profileId).select("profile_id");
  if (error || !data?.length) throw new Error(error?.message ?? "No s'ha pogut treure la foto.");
  forgetThumbs();
}
