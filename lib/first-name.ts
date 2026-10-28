// El nom de pila (per saludar): «Laia M.» → «Laia».
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Es guarda al mòbil per saludar-la pel nom a la pantalla d'entrada la propera vegada que obri l'app. */
export function rememberSplashName(name: string) {
  try {
    localStorage.setItem("splash-name", firstName(name).slice(0, 30));
  } catch {
    /* sense emmagatzematge: l'entrada diu «Juvenil C» */
  }
}
