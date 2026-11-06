import { OfflineBanner, PullToRefresh } from "@/components/app-chrome";
import { CompactTitle, HapticTouches, SwipeNav, UndoToast } from "@/components/feel";
import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
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
          <div className="sp-crest">
            <svg className="sp-outline" viewBox="0 0 192 192" aria-hidden="true"><path pathLength={1} d="M58.5 7.5 L72.5 7.5 L73.5 8.5 L77.5 8.5 L86.5 11.5 L94.5 15.5 L99.5 19.5 L101.5 19.5 L106.5 15.5 L114.5 11.5 L124.5 8.5 L143.5 8.5 L153.5 11.5 L165.5 18.5 L173.5 26.5 L181.5 38.5 L188.5 55.5 L188.5 58.5 L190.5 63.5 L190.5 68.5 L191.5 69.5 L191.5 88.5 L190.5 89.5 L190.5 94.5 L184.5 113.5 L178.5 124.5 L172.5 132.5 L157.5 146.5 L139.5 156.5 L121.5 161.5 L106.5 162.5 L102.5 162.5 L101.5 161.5 L97.5 166.5 L88.5 174.5 L75.5 181.5 L68.5 183.5 L64.5 183.5 L63.5 184.5 L43.5 183.5 L34.5 180.5 L19.5 171.5 L13.5 165.5 L8.5 158.5 L2.5 144.5 L0.5 129.5 L1.5 128.5 L8.5 128.5 L15.5 126.5 L27.5 119.5 L37.5 108.5 L41.5 100.5 L42.5 93.5 L43.5 92.5 L43.5 79.5 L42.5 78.5 L41.5 71.5 L35.5 60.5 L25.5 50.5 L16.5 45.5 L18.5 37.5 L25.5 26.5 L33.5 18.5 L47.5 10.5 L57.5 8.5 L58.5 7.5 Z" /><path className="sp-spark" pathLength={1} d="M58.5 7.5 L72.5 7.5 L73.5 8.5 L77.5 8.5 L86.5 11.5 L94.5 15.5 L99.5 19.5 L101.5 19.5 L106.5 15.5 L114.5 11.5 L124.5 8.5 L143.5 8.5 L153.5 11.5 L165.5 18.5 L173.5 26.5 L181.5 38.5 L188.5 55.5 L188.5 58.5 L190.5 63.5 L190.5 68.5 L191.5 69.5 L191.5 88.5 L190.5 89.5 L190.5 94.5 L184.5 113.5 L178.5 124.5 L172.5 132.5 L157.5 146.5 L139.5 156.5 L121.5 161.5 L106.5 162.5 L102.5 162.5 L101.5 161.5 L97.5 166.5 L88.5 174.5 L75.5 181.5 L68.5 183.5 L64.5 183.5 L63.5 184.5 L43.5 183.5 L34.5 180.5 L19.5 171.5 L13.5 165.5 L8.5 158.5 L2.5 144.5 L0.5 129.5 L1.5 128.5 L8.5 128.5 L15.5 126.5 L27.5 119.5 L37.5 108.5 L41.5 100.5 L42.5 93.5 L43.5 92.5 L43.5 79.5 L42.5 78.5 L41.5 71.5 L35.5 60.5 L25.5 50.5 L16.5 45.5 L18.5 37.5 L25.5 26.5 L33.5 18.5 L47.5 10.5 L57.5 8.5 L58.5 7.5 Z" /></svg>
            {/* el dibuix de dins (ratlles, «CEE», pilota…): es traça en daurat com la vora i després l'escut s'omple de color */}
            <svg className="sp-lines" viewBox="0 0 192 192" aria-hidden="true">
              <path pathLength={1} style={{ "--i": 0 } as CSSProperties} d="M182.5 77.5 L182.5 85.5 L181.5 86.5 L181.5 92.5 L180.5 93.5 L179.5 100.5 L178.5 102.5 L176.5 102.5 L175.5 103.5 L162.5 104.5 L161.5 105.5 L153.5 105.5 L152.5 106.5 L141.5 106.5 L140.5 107.5 L123.5 107.5 L122.5 108.5 L75.5 108.5 L74.5 107.5 L49.5 106.5 L48.5 105.5 L50.5 102.5 L51.5 94.5 L52.5 93.5 L52.5 81.5 L74.5 82.5 L75.5 83.5 L132.5 83.5 L133.5 82.5 L148.5 82.5 L149.5 81.5 L168.5 80.5 L169.5 79.5 L175.5 79.5 L176.5 78.5 L181.5 78.5 L182.5 77.5 Z" />
              <path pathLength={1} style={{ "--i": 1 } as CSSProperties} d="M59.5 7.5 L71.5 7.5 L72.5 8.5 L80.5 9.5 L92.5 14.5 L100.5 20.5 L106.5 15.5 L120.5 9.5 L124.5 9.5 L125.5 8.5 L142.5 8.5 L143.5 9.5 L150.5 10.5 L162.5 16.5 L173.5 26.5 L179.5 35.5 L180.5 38.5 L182.5 40.5 L188.5 55.5 L189.5 63.5 L190.5 64.5 L190.5 69.5 L191.5 70.5 L191.5 86.5 L190.5 87.5 L190.5 93.5 L189.5 94.5 L189.5 98.5 L188.5 99.5 L188.5 102.5 L187.5 103.5 L186.5 108.5 L183.5 113.5 L182.5 117.5 L180.5 119.5 L175.5 128.5 L171.5 132.5 L171.5 133.5 L158.5 145.5 L149.5 151.5 L141.5 155.5 L139.5 155.5 L136.5 157.5 L134.5 157.5 L130.5 159.5 L127.5 159.5 L126.5 160.5 L106.5 162.5 L101.5 161.5 L88.5 174.5 L77.5 180.5 L75.5 180.5 L68.5 183.5 L63.5 183.5 L62.5 184.5 L49.5 184.5 L48.5 183.5 L44.5 183.5 L43.5 182.5 L40.5 182.5 L39.5 181.5 L34.5 180.5 L26.5 176.5 L18.5 170.5 L8.5 158.5 L3.5 147.5 L3.5 144.5 L1.5 139.5 L1.5 132.5 L0.5 131.5 L0.5 129.5 L15.5 126.5 L26.5 120.5 L37.5 108.5 L41.5 100.5 L42.5 94.5 L43.5 93.5 L43.5 78.5 L42.5 77.5 L42.5 74.5 L41.5 73.5 L40.5 68.5 L37.5 64.5 L36.5 61.5 L25.5 50.5 L16.5 45.5 L17.5 40.5 L25.5 26.5 L32.5 19.5 L45.5 11.5 L47.5 11.5 L54.5 8.5 L58.5 8.5 L59.5 7.5 Z" />
              <path pathLength={1} style={{ "--i": 2 } as CSSProperties} d="M45.5 111.5 L48.5 111.5 L49.5 112.5 L58.5 112.5 L59.5 113.5 L73.5 113.5 L74.5 114.5 L106.5 114.5 L106.5 122.5 L105.5 123.5 L105.5 127.5 L104.5 128.5 L103.5 135.5 L102.5 136.5 L101.5 141.5 L94.5 155.5 L85.5 165.5 L81.5 168.5 L78.5 169.5 L73.5 172.5 L71.5 172.5 L67.5 174.5 L62.5 174.5 L61.5 175.5 L50.5 175.5 L49.5 174.5 L41.5 173.5 L38.5 171.5 L36.5 171.5 L32.5 169.5 L26.5 165.5 L19.5 158.5 L15.5 152.5 L11.5 142.5 L10.5 136.5 L17.5 135.5 L29.5 129.5 L41.5 118.5 L44.5 114.5 L45.5 111.5 Z" />
              <path pathLength={1} style={{ "--i": 3 } as CSSProperties} d="M144.5 18.5 L153.5 21.5 L155.5 23.5 L158.5 24.5 L161.5 28.5 L112.5 77.5 L103.5 77.5 L86.5 77.5 L144.5 18.5 Z" />
              <path pathLength={1} style={{ "--i": 4 } as CSSProperties} d="M176.5 108.5 L174.5 113.5 L166.5 125.5 L155.5 136.5 L139.5 146.5 L137.5 146.5 L134.5 148.5 L132.5 148.5 L125.5 151.5 L121.5 151.5 L120.5 152.5 L102.5 153.5 L103.5 149.5 L106.5 144.5 L106.5 142.5 L108.5 139.5 L110.5 129.5 L111.5 128.5 L111.5 124.5 L112.5 123.5 L112.5 114.5 L152.5 112.5 L153.5 111.5 L169.5 110.5 L170.5 109.5 L175.5 109.5 L176.5 108.5 Z" />
              <path pathLength={1} style={{ "--i": 5 } as CSSProperties} d="M76.5 18.5 L82.5 19.5 L88.5 22.5 L96.5 28.5 L56.5 68.5 L51.5 73.5 L50.5 72.5 L49.5 67.5 L47.5 64.5 L47.5 62.5 L41.5 54.5 L76.5 18.5 Z" />
              <path pathLength={1} style={{ "--i": 6 } as CSSProperties} d="M54.5 119.5 L66.5 119.5 L73.5 122.5 L78.5 126.5 L83.5 134.5 L83.5 137.5 L84.5 138.5 L84.5 148.5 L83.5 149.5 L82.5 154.5 L74.5 163.5 L68.5 166.5 L66.5 166.5 L65.5 167.5 L55.5 167.5 L54.5 166.5 L49.5 165.5 L39.5 156.5 L36.5 149.5 L36.5 137.5 L39.5 130.5 L44.5 124.5 L54.5 119.5 Z" />
              <path pathLength={1} style={{ "--i": 7 } as CSSProperties} d="M177.5 51.5 L177.5 53.5 L180.5 60.5 L181.5 70.5 L182.5 71.5 L181.5 72.5 L176.5 72.5 L175.5 73.5 L169.5 73.5 L168.5 74.5 L166.5 74.5 L153.5 75.5 L177.5 51.5 Z" />
              <path pathLength={1} style={{ "--i": 8 } as CSSProperties} d="M117.5 117.5 L131.5 117.5 L132.5 118.5 L134.5 118.5 L135.5 119.5 L151.5 124.5 L153.5 132.5 L144.5 139.5 L140.5 140.5 L139.5 141.5 L137.5 141.5 L137.5 133.5 L138.5 132.5 L138.5 128.5 L134.5 125.5 L131.5 125.5 L130.5 126.5 L131.5 128.5 L129.5 129.5 L122.5 130.5 L121.5 131.5 L116.5 131.5 L116.5 118.5 L117.5 117.5 Z" />
              <path pathLength={1} style={{ "--i": 9 } as CSSProperties} d="M104.5 87.5 L122.5 87.5 L122.5 90.5 L109.5 90.5 L108.5 91.5 L108.5 93.5 L109.5 94.5 L118.5 94.5 L118.5 97.5 L117.5 96.5 L113.5 96.5 L111.5 97.5 L109.5 97.5 L108.5 98.5 L108.5 100.5 L109.5 101.5 L122.5 101.5 L122.5 104.5 L104.5 104.5 L104.5 87.5 Z" />
              <path pathLength={1} style={{ "--i": 10 } as CSSProperties} d="M58.5 123.5 L65.5 123.5 L70.5 127.5 L71.5 132.5 L72.5 133.5 L72.5 144.5 L71.5 145.5 L71.5 147.5 L63.5 143.5 L63.5 131.5 L61.5 126.5 L58.5 123.5 Z" />
              <path pathLength={1} style={{ "--i": 11 } as CSSProperties} d="M57.5 131.5 L58.5 131.5 L58.5 141.5 L51.5 144.5 L45.5 150.5 L43.5 154.5 L40.5 148.5 L40.5 145.5 L42.5 141.5 L47.5 136.5 L57.5 131.5 Z" />
              <path pathLength={1} style={{ "--i": 12 } as CSSProperties} d="M57.5 146.5 L60.5 146.5 L62.5 148.5 L71.5 152.5 L77.5 152.5 L78.5 151.5 L77.5 154.5 L73.5 158.5 L71.5 159.5 L65.5 159.5 L53.5 153.5 L51.5 150.5 L57.5 146.5 Z" />
              <path pathLength={1} style={{ "--i": 13 } as CSSProperties} d="M149.5 85.5 L149.5 88.5 L142.5 88.5 L141.5 89.5 L136.5 89.5 L135.5 90.5 L135.5 92.5 L136.5 93.5 L144.5 93.5 L146.5 92.5 L146.5 95.5 L137.5 95.5 L136.5 96.5 L136.5 99.5 L137.5 100.5 L147.5 100.5 L150.5 99.5 L150.5 102.5 L132.5 103.5 L132.5 88.5 L131.5 87.5 L134.5 87.5 L135.5 86.5 L148.5 86.5 L149.5 85.5 Z" />
              <path pathLength={1} style={{ "--i": 14 } as CSSProperties} d="M81.5 87.5 L90.5 87.5 L94.5 89.5 L94.5 92.5 L90.5 90.5 L82.5 90.5 L78.5 94.5 L78.5 97.5 L81.5 100.5 L86.5 101.5 L90.5 101.5 L93.5 99.5 L94.5 101.5 L93.5 103.5 L91.5 103.5 L90.5 104.5 L82.5 104.5 L76.5 101.5 L74.5 97.5 L74.5 93.5 L75.5 91.5 L78.5 88.5 L80.5 88.5 L81.5 87.5 Z" />
              <path pathLength={1} style={{ "--i": 15 } as CSSProperties} d="M149.5 126.5 L150.5 131.5 L145.5 135.5 L141.5 137.5 L140.5 137.5 L141.5 136.5 L141.5 128.5 L148.5 127.5 L149.5 126.5 Z" />
              <path pathLength={1} style={{ "--i": 16 } as CSSProperties} d="M76.5 130.5 L80.5 138.5 L80.5 146.5 L78.5 147.5 L76.5 147.5 L77.5 146.5 L77.5 132.5 L76.5 130.5 Z" />
              <path pathLength={1} style={{ "--i": 17 } as CSSProperties} d="M48.5 155.5 L54.5 160.5 L61.5 163.5 L64.5 163.5 L62.5 163.5 L55.5 163.5 L48.5 160.5 L47.5 159.5 L48.5 155.5 Z" />
              <path pathLength={1} style={{ "--i": 18 } as CSSProperties} d="M51.5 124.5 L53.5 124.5 L55.5 127.5 L53.5 127.5 L46.5 131.5 L42.5 134.5 L43.5 131.5 L51.5 124.5 Z" />
              <path pathLength={1} style={{ "--i": 19 } as CSSProperties} d="M119.5 121.5 L127.5 124.5 L128.5 126.5 L127.5 127.5 L125.5 127.5 L121.5 127.5 L119.5 128.5 L119.5 121.5 Z" />
            </svg>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sp-fill" src="/escut.png" alt="" width={112} height={112} />
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
              "try{var tc=document.querySelector('meta[name=theme-color]');if(tc&&!document.documentElement.hasAttribute('data-nosplash')&&!matchMedia('(prefers-reduced-motion: reduce)').matches){var tc0=tc.getAttribute('content');tc.setAttribute('content','#5f6b89');setTimeout(function(){tc.setAttribute('content',tc0)},4400)}}catch(e){}",
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
