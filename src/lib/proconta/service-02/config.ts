import { CATALOG_B } from "../service-01/catalogs";
import type { Service02Config } from "./types";

/* Configuración fiscal del Servicio 2. Lo que depende del cliente se guarda por catálogo del S1. */

export const DEFAULT_SERVICE02_CONFIG: Service02Config = {
  ownBankRfcs: ["BBA830831LJ2"],
  institutoRfcs: ["IMS421231I45", "INF7205011ZA"],
  anticipoFinal: [],
  efectivoMaximo: 2000,
  usosPersonales: ["D10"],
};

/** Ajustes por cliente, indexados por el id del catálogo del Servicio 1. */
export const SERVICE02_CONFIGS: Record<string, Partial<Service02Config>> = {
  // Vidrios y Procesos de Xalapa factura anticipos (serie ANT) y después la factura final (serie C),
  // que se netea con nota de crédito: el gasto ya se dedujo con el anticipo.
  [CATALOG_B.id]: { anticipoFinal: [{ rfc: "VPX080813QP7", serie: "C" }] },
};

export function resolveService02Config(
  catalogId: string,
  override: Partial<Service02Config> = {},
): Service02Config {
  return { ...DEFAULT_SERVICE02_CONFIG, ...(SERVICE02_CONFIGS[catalogId] ?? {}), ...override };
}
