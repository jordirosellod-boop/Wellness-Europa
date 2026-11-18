// MVP del partit: les convocades voten (un vot, no a si mateixes) des de l'hora del partit fins l'endemà a les 12 h.
// La base de dades ho controla tot (qui pot votar, quan i què es veu).

import { addDays } from "@/lib/dates";
import { madridEpoch } from "@/lib/matchday";
import { fetchConvocations, fetchRoster, type Convocation, type RosterRow } from "@/lib/convo";
import { supabase } from "@/lib/supabase";

export type MvpWinner = { convocation_id: string; match_date: string; rival: string; player_id: string };

export const mvpOpens = (c: Convocation) => madridEpoch(c.match_date, (c.kickoff ?? "00:00").slice(0, 5));
export const mvpCloses = (c: Convocation) => madridEpoch(addDays(c.match_date, 1), "12:00");
export const mvpOpen = (c: Convocation, now = Date.now()) => c.published && now >= mvpOpens(c) && now < mvpCloses(c);

/** La votació oberta on la jugadora pot votar (si n'hi ha): el partit, les companyes convocades i si ja ha votat. */
export async function fetchMyVote(meId: string, today: string): Promise<{ c: Convocation; mates: RosterRow[]; voted: boolean } | null> {
  const list = await fetchConvocations(addDays(today, -1));
  const c = list.find((x) => mvpOpen(x));
  if (!c) return null;
  const roster = await fetchRoster(c.id);
  if (!roster.some((r) => r.player_id === meId && r.called)) return null;
  const { data } = await supabase().from("mvp_votes").select("candidate_id").eq("convocation_id", c.id).eq("voter_id", meId).maybeSingle();
  return { c, mates: roster.filter((r) => r.called && !r.guest && r.player_id !== meId), voted: !!data };
}

export async function castVote(convocationId: string, candidateId: string): Promise<void> {
  const { error } = await supabase().from("mvp_votes").insert({ convocation_id: convocationId, candidate_id: candidateId }).select("convocation_id").single();
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "Ja has votat en aquest partit." : error.message);
}

export async function fetchWinners(): Promise<MvpWinner[]> {
  const { data, error } = await supabase().rpc("mvp_winners").range(0, 199);
  if (error) throw new Error(error.message);
  return (data ?? []) as MvpWinner[];
}
