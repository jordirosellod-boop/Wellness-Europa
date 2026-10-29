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
const cutouts = new Map<string, Promise<string | null>>();
let avatarsCache: Promise<Map<string, string>> | null = null;
export const forgetThumbs = () => { thumbsCache = null; avatarsCache = null; cutouts.clear(); };

/** Els avatars (cap i espatlles) de tot l'equip. Si no n'hi ha cap de col·locat, la foto petita. */
export function fetchAvatars(): Promise<Map<string, string>> {
  avatarsCache ??= (async () => {
    const sb = supabase();
    const [set, unset] = await Promise.all([
      fetchAll<{ profile_id: string; avatar: string }>((f, t) =>
        sb.from("player_photos").select("profile_id, avatar").not("avatar", "is", null).order("profile_id").range(f, t)),
      fetchAll<{ profile_id: string }>((f, t) =>
        sb.from("player_photos").select("profile_id").is("avatar", null).order("profile_id").range(f, t)),
    ]);
    const m = new Map(set.map((r) => [r.profile_id, r.avatar]));
    if (unset.length) {
      const thumbs = await fetchAll<{ profile_id: string; thumb: string }>((f, t) =>
        sb.from("player_photos").select("profile_id, thumb").in("profile_id", unset.map((r) => r.profile_id)).order("profile_id").range(f, t));
      for (const r of thumbs) m.set(r.profile_id, r.thumb);
    }
    return m;
  })().catch((e) => { avatarsCache = null; throw e; });
  return avatarsCache;
}

/** La foto gran (sencera) d'una jugadora, o null si no en té. */
export function fetchCutout(profileId: string): Promise<string | null> {
  let p = cutouts.get(profileId);
  if (!p) {
    p = Promise.resolve(supabase().from("player_photos").select("cutout").eq("profile_id", profileId).maybeSingle()).then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return (data?.cutout as string | undefined) ?? null;
    });
    p.catch(() => cutouts.delete(profileId));
    cutouts.set(profileId, p);
  }
  return p;
}

/** La foto de l'avatar (si el staff no l'ha col·locada a part, la petita). */
export async function fetchAvatar(profileId: string): Promise<string | null> {
  const { data, error } = await supabase().from("player_photos").select("avatar, thumb").eq("profile_id", profileId).maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { avatar: string | null; thumb: string } | null;
  return row?.avatar ?? row?.thumb ?? null;
}

export async function savePhoto(profileId: string, cutout: string, thumb: string, avatar: string): Promise<void> {
  const { data, error } = await supabase().from("player_photos")
    .upsert({ profile_id: profileId, cutout, thumb, avatar }, { onConflict: "profile_id" }).select("profile_id").single();
  if (error || !data) throw new Error(error?.message ?? "No s'ha pogut desar la foto.");
  forgetThumbs();
}

export async function deletePhoto(profileId: string): Promise<void> {
  const { data, error } = await supabase().from("player_photos").delete().eq("profile_id", profileId).select("profile_id");
  if (error || !data?.length) throw new Error(error?.message ?? "No s'ha pogut treure la foto.");
  forgetThumbs();
}
