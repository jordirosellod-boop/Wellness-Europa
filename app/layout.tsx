import { OfflineBanner, PullToRefresh } from "@/components/app-chrome";
import { HapticTouches, UndoToast } from "@/components/feel";
import type { Metadata, Viewport } from "next";
import { Anton, Poppins } from "next/font/google";
import "./globals.css";
import { escapulada, kitFont } from "@/lib/fonts";

// Tipografia com la de ceeuropa.cat: títols estrets en majúscules i text en Poppins.
const display = Anton({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-display", display: "swap" });
const body = Poppins({ weight: ["400", "500", "600", "700"], subsets: ["latin", "latin-ext"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Juvenil C 2026/2027 · CE Europa",
  description: "Juvenil C 2026/2027 del CE Europa: wellness, RPE, calendari, multes i estadístiques",
  robots: { index: false, follow: false },
  // A l'iPhone, l'app afegida a la pantalla d'inici s'obre a pantalla completa (necessari per als avisos).
  // «black-translucent»: la zona de l'hora és transparent (la foto de l'entrada i la barra blava hi arriben; l'hora surt en blanc).
  // L'iPhone ho llegeix quan s'afegeix l'app a la pantalla d'inici.
  appleWebApp: { capable: true, title: "Juvenil C", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a2ea0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // a l'iPhone, de vora a vora: l'entrada ocupa tota la pantalla (la barra de dalt baixa el contingut, veure --top-safe)
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ca" suppressHydrationWarning className={`${escapulada.variable} ${kitFont.variable} ${display.variable} ${body.variable}`}>
      <body>
        {/* Entrada: l'escut apareix i s'esvaeix (només CSS; no bloqueja res i no surt si es demana menys moviment). */}
        <link rel="preload" as="image" href="/fons-grada.webp" type="image/webp" />
        <div className="splash" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/escut.png" alt="" width={112} height={112} />
          <b id="splash-hello" suppressHydrationWarning>Juvenil C</b>
          <span>CE Europa</span>
          {/* Dia de partit (amagat la resta de dies; ho omple el guió de sota) */}
          <div className="sp-match">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/escut.png" alt="" width={64} height={64} />
            <i>VS</i>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img id="sp-rival" alt="" width={64} height={64} suppressHydrationWarning />
          </div>
          <span className="sp-today" id="sp-today" suppressHydrationWarning>Avui partit</span>
        </div>
        {/* Si ja havia entrat abans, la saluda pel nom (es llegeix del mateix mòbil abans de pintar). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              // Si s'acaba d'actualitzar estirant cap avall, no torna a sortir l'entrada
              "try{if(sessionStorage.getItem('skip-splash')){sessionStorage.removeItem('skip-splash');document.documentElement.setAttribute('data-nosplash','')}}catch(e){}" +
              "try{var n=localStorage.getItem('splash-name'),h=document.getElementById('splash-hello');if(n&&h){var t=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',hour:'2-digit',hourCycle:'h23'}).format(new Date());h.textContent=(t>='06'&&t<'13'?'Bon dia':t>='13'&&t<'20'?'Bona tarda':'Bona nit')+', '+n+'!';h.className='named'}}catch(e){}" +
              // El dia de partit: els dos escuts i «Avui partit · hora» (guardat per l'app a SplashMatchSaver)
              "try{var m=JSON.parse(localStorage.getItem('splash-match')||'null'),d=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid'}).format(new Date());if(m&&m.d===d){var r=document.getElementById('sp-rival'),t=document.getElementById('sp-today');if(r&&typeof m.c==='string'&&m.c.indexOf('/api/fcf/crest?f=')===0)r.src=m.c;if(t)t.textContent='Avui partit'+(m.t?' · '+m.t+' h':'');document.documentElement.setAttribute('data-matchday',m.h===false?'away':'home')}}catch(e){}" +
              // A l'iPhone, la franja de l'hora pren el color de l'app (blau): mentre dura l'entrada, el de dalt de la foto
              "try{var tc=document.querySelector('meta[name=theme-color]');if(tc&&!document.documentElement.hasAttribute('data-nosplash')&&!matchMedia('(prefers-reduced-motion: reduce)').matches){var tc0=tc.getAttribute('content');tc.setAttribute('content','#5f6b89');setTimeout(function(){tc.setAttribute('content',tc0)},3200)}}catch(e){}",
          }}
        />
        {children}
        <PullToRefresh />
        <OfflineBanner />
        <HapticTouches />
        <UndoToast />
      </body>
    </html>
  );
}
