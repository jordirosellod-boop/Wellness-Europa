"use client";

import { FcfStats } from "@/components/fcf-stats";
import { CoachShell, Footer } from "@/components/ui";

export default function StatsPage() {
  return (
    <>
      <CoachShell>{() => <FcfStats mode="coach" />}</CoachShell>
      <Footer />
    </>
  );
}
