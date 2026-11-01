// Número a la icona de l'app a la pantalla d'inici (iPhone i Android, amb l'app instal·lada i els avisos activats).

type BadgeNav = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

export function setAppBadge(n: number) {
  const nav = navigator as BadgeNav;
  try {
    if (n > 0) nav.setAppBadge?.(n).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  } catch {
    /* el navegador no ho permet: no passa res */
  }
}
