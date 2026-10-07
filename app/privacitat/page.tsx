import Link from "next/link";
import { Brand } from "@/components/ui";

export const metadata = { title: "Privacitat · Juvenil C 2026/2027" };

export default function PrivacyPage() {
  return (
    <>
      <header className="topbar">
        <Link href="/" style={{ textDecoration: "none" }}>
          <Brand />
        </Link>
      </header>
      <main>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Política de privacitat</h1>
          <p className="muted small">Versió breu. El club és el responsable del tractament.</p>

          <h2>Qui tracta les dades</h2>
          <p>El CE Europa (cos tècnic de l&apos;equip). Per a qualsevol dubte o petició, adreça&apos;t a l&apos;entrenador o al club.</p>

          <h2>Quines dades</h2>
          <ul>
            <li>Nom de la jugadora (nom i inicial del cognom).</li>
            <li>Respostes de benestar (son, fatiga, estat d&apos;ànim), molèsties o dolor si n&apos;hi ha, l&apos;esforç percebut (RPE) i notes opcionals.</li>
            <li>Data i hora d&apos;enviament.</li>
          </ul>
          <p>No es recull correu, telèfon, adreça ni cap altra dada.</p>

          <h2>Per a què</h2>
          <p>Només per adaptar la càrrega dels entrenaments i prevenir lesions. No es fan servir per a res més.</p>

          <h2>Base legal</h2>
          <p>Consentiment dels pares, mares o tutors legals (i de la jugadora). Es pot retirar en qualsevol moment.</p>

          <h2>Qui hi té accés</h2>
          <p>
            Cada jugadora només veu les seves dades. El cos tècnic de l&apos;equip veu les de totes. No es cedeixen a tercers.
            Les dades s&apos;allotgen en servidors a la Unió Europea (Supabase).
          </p>

          <h2>Quant de temps</h2>
          <p>Durant la temporada en curs. En acabar, s&apos;esborren o s&apos;anonimitzen.</p>

          <h2>Drets</h2>
          <p>
            Podeu demanar veure, corregir o esborrar les dades, o retirar el consentiment, adreçant-vos al club. També podeu
            reclamar a l&apos;Autoritat Catalana de Protecció de Dades (apdcat.gencat.cat).
          </p>
        </div>
      </main>
    </>
  );
}
