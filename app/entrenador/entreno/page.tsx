"use client";

import { PlayerTraining } from "@/components/player-training";
import { CoachShell, Footer } from "@/components/ui";

/** Staff: els entrenos penjats, tal com els veuen les jugadores (el mateix full del PDF). */
export default function StaffTrainingPage() {
  return (
    <>
      <CoachShell>{() => <PlayerTraining staff />}</CoachShell>
      <Footer />
    </>
  );
}
