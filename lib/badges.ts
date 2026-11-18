// Insígnies de la jugadora: es calculen amb les dades que ja hi ha (res de nou a la base de dades).

export type Badge = { id: string; icon: string; name: string; how: string; got: boolean };

export type BadgeInput = {
  streak: number;          // wellness seguits ara
  bestMonthAtt: boolean;   // algun mes sencer amb el 100% d'entrenos
  goals: number;           // gols a les actes de la FCF
  hatTrick: boolean;       // 3 gols o més en un partit
  starts: number;          // partits de titular
  fullMatch: boolean;      // un partit de 80 minuts o més
  mvps: number;            // vegades MVP
  rivals: number;          // escuts diferents a l'àlbum
};

export function computeBadges(i: BadgeInput): Badge[] {
  return [
    { id: "ratxa10", icon: "🔥", name: "Ratxa 10", how: "10 wellness seguits", got: i.streak >= 10 },
    { id: "ratxa25", icon: "☄️", name: "Ratxa 25", how: "25 wellness seguits", got: i.streak >= 25 },
    { id: "mes100", icon: "📅", name: "Mes perfecte", how: "Un mes sencer sense faltar a cap entreno", got: i.bestMonthAtt },
    { id: "gol1", icon: "⚽", name: "Primer gol", how: "Marcar un gol en un partit de lliga", got: i.goals >= 1 },
    { id: "hattrick", icon: "🎩", name: "Hat-trick", how: "3 gols en un mateix partit", got: i.hatTrick },
    { id: "tit5", icon: "🧱", name: "Fixa", how: "5 partits de titular", got: i.starts >= 5 },
    { id: "full", icon: "⏱️", name: "Partit sencer", how: "Jugar 80 minuts en un partit", got: i.fullMatch },
    { id: "mvp", icon: "⭐", name: "MVP", how: "Ser l'MVP d'un partit (votat per l'equip)", got: i.mvps >= 1 },
    { id: "album", icon: "🛡️", name: "Col·leccionista", how: "Jugar contra 8 equips diferents", got: i.rivals >= 8 },
  ];
}
