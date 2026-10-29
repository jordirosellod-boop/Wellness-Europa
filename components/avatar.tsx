"use client";

import { useEffect, useState } from "react";
import { Shirt } from "@/components/shirt";
import { fetchAvatars } from "@/lib/player-photos";

/** Els avatars de l'equip (es carreguen un sol cop). */
export function useAvatars(): Map<string, string> {
  const [m, setM] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    fetchAvatars().then((x) => alive && setM(x), () => {});
    return () => { alive = false; };
  }, []);
  return m;
}

/** La cara de la jugadora en rodó; si no té foto, la samarreta amb el dorsal. */
export function Avatar({ src, n, gk = false, size = 28 }: { src: string | undefined; n: number | null | undefined; gk?: boolean; size?: number }) {
  if (!src) return <Shirt n={n} gk={gk} size={size} />;
  return (
    <span className={`av${gk ? " gk" : ""}`} style={{ width: size, height: size }} aria-label={n == null ? undefined : `Dorsal ${n}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" decoding="async" />
    </span>
  );
}
