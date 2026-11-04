"use client";

import Link from "next/link";
import { PlayerPlanning } from "@/components/weekly-view";
import { CoachShell, Footer } from "@/components/ui";

/** El planning penjat, tal com el veuen les jugadores (per a tot el staff). */
export default function StaffPlanningView() {
  return (
    <>
      <CoachShell>{(me) => (
        <>
          <PlayerPlanning meId={me.id} staff />
          <Link href="/entrenador/planning" className="btn secondary block" style={{ marginTop: 12 }}>✏️ Editar el planning</Link>
        </>
      )}</CoachShell>
      <Footer />
    </>
  );
}
