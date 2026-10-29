// Pissarres de partida: dibuixos base per no començar de zero (després es mou el que calgui).

import { uid, type Diagram, type El, type Team } from "@/lib/plan";

const P = (x: number, y: number, team: Team, r?: number, label?: string): El => ({ id: uid(), t: "player", x, y, team, ...(r != null ? { r } : {}), ...(label ? { label } : {}) });
const C = (x: number, y: number): El => ({ id: uid(), t: "cone", x, y });
const B = (x: number, y: number): El => ({ id: uid(), t: "ball", x, y });
const G = (x: number, y: number, r = 0): El => ({ id: uid(), t: "goal", x, y, ...(r ? { r } : {}) });
const MG = (x: number, y: number, r = 0): El => ({ id: uid(), t: "minigoal", x, y, ...(r ? { r } : {}) });

export const DRILL_TEMPLATES: { key: string; label: string; make: () => Diagram }[] = [
  {
    key: "rondo42", label: "Rondo 4×2",
    make: () => ({ field: "blank", els: [
      C(36, 18), C(64, 18), C(36, 46), C(64, 46),
      P(50, 16, "blue", 180), P(50, 48, "blue", 0), P(34, 32, "blue", 90), P(66, 32, "blue", 270),
      P(46, 30, "red"), P(54, 34, "red"), B(51, 18.6),
    ] }),
  },
  {
    key: "poss552", label: "Possessió 5×5 + 2 comodins",
    make: () => ({ field: "blank", els: [
      C(22, 8), C(78, 8), C(22, 56), C(78, 56),
      P(32, 18, "blue"), P(50, 14, "blue"), P(68, 20, "blue"), P(40, 40, "blue"), P(62, 44, "blue"),
      P(42, 24, "red", 270), P(58, 26, "red", 270), P(34, 32, "red", 270), P(54, 38, "red", 270), P(70, 34, "red", 270),
      P(20, 32, "yellow"), P(80, 32, "yellow", 270), B(33, 21),
    ] }),
  },
  {
    key: "mig", label: "Mig camp amb porteria",
    make: () => ({ field: "half", els: [
      G(50, 2), P(50, 6, "gk", 180),
      P(30, 30, "blue"), P(50, 34, "blue"), P(70, 30, "blue"), P(50, 46, "blue"),
      P(38, 22, "red", 180), P(62, 22, "red", 180), P(50, 26, "red", 180), B(50, 37),
    ] }),
  },
  {
    key: "final", label: "Finalització",
    make: () => ({ field: "half", els: [
      G(50, 2), P(50, 6, "gk", 180),
      C(30, 34), C(70, 34), C(50, 40),
      P(30, 40, "blue"), P(70, 40, "blue"), P(50, 46, "blue"), B(50, 43),
      { id: uid(), t: "arrow", x: 50, y: 44, x2: 34, y2: 30, kind: "pass" },
      { id: uid(), t: "arrow", x: 34, y: 30, x2: 46, y2: 6, kind: "shot" },
    ] }),
  },
  {
    key: "reduit", label: "Partit reduït amb miniporteries",
    make: () => ({ field: "blank", els: [
      MG(10, 32, 90), MG(90, 32, 90),
      P(22, 20, "blue"), P(22, 44, "blue"), P(34, 32, "blue"), P(44, 18, "blue"),
      P(78, 20, "red", 270), P(78, 44, "red", 270), P(66, 32, "red", 270), P(56, 46, "red", 270), B(50, 32),
    ] }),
  },
  {
    key: "onze", label: "Camp sencer 11×11",
    make: () => ({ field: "full", els: [
      G(2, 32, 90), G(98, 32, 90),
      P(6, 32, "gk"), P(18, 12, "blue"), P(16, 26, "blue"), P(16, 38, "blue"), P(18, 52, "blue"),
      P(30, 22, "blue"), P(28, 32, "blue"), P(30, 42, "blue"), P(42, 14, "blue"), P(44, 32, "blue"), P(42, 50, "blue"),
      P(94, 32, "gk", 270), P(82, 12, "red", 270), P(84, 26, "red", 270), P(84, 38, "red", 270), P(82, 52, "red", 270),
      P(70, 22, "red", 270), P(72, 32, "red", 270), P(70, 42, "red", 270), P(58, 14, "red", 270), P(56, 32, "red", 270), P(58, 50, "red", 270),
      B(50, 32),
    ] }),
  },
];
