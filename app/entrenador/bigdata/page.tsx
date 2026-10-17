"use client";

import { BigData } from "@/components/bigdata";
import { CoachShell, Footer, OwnerOnly } from "@/components/ui";
import { escapulada } from "@/lib/fonts";

export default function BigDataPage() {
  return (
    <>
      <CoachShell>{() => <OwnerOnly><div className={`an-font ${escapulada.variable}`}><BigData /></div></OwnerOnly>}</CoachShell>
      <Footer />
    </>
  );
}
