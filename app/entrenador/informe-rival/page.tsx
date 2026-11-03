"use client";

import { RivalReportView } from "@/components/rival-report";
import { CoachShell, Footer } from "@/components/ui";

export default function RivalReportPage() {
  return (
    <>
      <CoachShell>{() => (<><h1>Informe del rival</h1><RivalReportView /></>)}</CoachShell>
      <Footer />
    </>
  );
}
