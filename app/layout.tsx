import { OfflineBanner, PullToRefresh } from "@/components/app-chrome";
import { CompactTitle, HapticTouches, SwipeNav, UndoToast } from "@/components/feel";
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
  // Targeta quan s'envia l'enllaç (WhatsApp…): escut, nom i la foto de la grada (app/opengraph-image.jpg)
  metadataBase: new URL("https://wellness-europa.vercel.app"),
  openGraph: {
    title: "Juvenil C · CE Europa",
    description: "L'app de l'equip: wellness, entrenaments, convocatòries i partits.",
    siteName: "Juvenil C · CE Europa",
    locale: "ca_ES",
    type: "website",
  },
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
          {/* L'escut es dibuixa: el contorn daurat es traça, s'omple de baix a dalt i hi passa un reflex de llum */}
          <div className="sp-crest" data-fill="diag">
            <svg className="sp-outline" viewBox="0 0 192 192" aria-hidden="true"><path pathLength={1} d="M58.5 7.5 L72.5 7.5 L73.5 8.5 L77.5 8.5 L86.5 11.5 L94.5 15.5 L99.5 19.5 L101.5 19.5 L106.5 15.5 L114.5 11.5 L124.5 8.5 L143.5 8.5 L153.5 11.5 L165.5 18.5 L173.5 26.5 L181.5 38.5 L188.5 55.5 L188.5 58.5 L190.5 63.5 L190.5 68.5 L191.5 69.5 L191.5 88.5 L190.5 89.5 L190.5 94.5 L184.5 113.5 L178.5 124.5 L172.5 132.5 L157.5 146.5 L139.5 156.5 L121.5 161.5 L106.5 162.5 L102.5 162.5 L101.5 161.5 L97.5 166.5 L88.5 174.5 L75.5 181.5 L68.5 183.5 L64.5 183.5 L63.5 184.5 L43.5 183.5 L34.5 180.5 L19.5 171.5 L13.5 165.5 L8.5 158.5 L2.5 144.5 L0.5 129.5 L1.5 128.5 L8.5 128.5 L15.5 126.5 L27.5 119.5 L37.5 108.5 L41.5 100.5 L42.5 93.5 L43.5 92.5 L43.5 79.5 L42.5 78.5 L41.5 71.5 L35.5 60.5 L25.5 50.5 L16.5 45.5 L18.5 37.5 L25.5 26.5 L33.5 18.5 L47.5 10.5 L57.5 8.5 L58.5 7.5 Z" /></svg>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/escut.png" alt="" width={112} height={112} />
            <i className="sp-shine" />
          </div>
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
        <SwipeNav />
        <CompactTitle />
        <UndoToast />
      </body>
    </html>
  );
}
