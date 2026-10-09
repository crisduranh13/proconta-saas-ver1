import type { IsrResult } from "./types";

/** Tarifa mensual del ISR 2026 (art. 96 LISR): límite inferior, límite superior, cuota fija, % sobre excedente. */
export const TARIFA_ISR_2026_MENSUAL: [number, number, number, number][] = [
  [0.01, 844.59, 0, 0.0192],
  [844.6, 7168.51, 16.22, 0.064],
  [7168.52, 12598.02, 420.95, 0.1088],
  [12598.03, 14644.64, 1011.68, 0.16],
  [14644.65, 17533.64, 1339.14, 0.1792],
  [17533.65, 35362.83, 1856.84, 0.2136],
  [35362.84, 55736.68, 5665.16, 0.2352],
  [55736.69, 106410.5, 10457.09, 0.3],
  [106410.51, 141880.66, 25659.23, 0.32],
  [141880.67, 425641.99, 37009.69, 0.34],
  [425642.0, 9990000000000.0, 133488.54, 0.35],
];

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** ISR del mes sobre la base gravable con la tarifa mensual. Base ≤ 0 → ISR 0. */
export function computeIsr(base: number, tarifa = TARIFA_ISR_2026_MENSUAL): IsrResult {
  const gravable = round2(Math.max(0, base));
  const row = tarifa.find(([lower, upper]) => gravable >= lower && gravable <= upper) ?? tarifa[0]!;
  const [limiteInferior, limiteSuperior, cuotaFija, pctExcedente] = row;
  const isr = gravable > 0 ? round2((gravable - limiteInferior) * pctExcedente + cuotaFija) : 0;
  return { base: gravable, limiteInferior, limiteSuperior, cuotaFija, pctExcedente, isr };
}
