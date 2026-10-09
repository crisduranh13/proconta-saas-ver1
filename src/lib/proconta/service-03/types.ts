import type { Workbook, Worksheet } from "exceljs";

/** Inputs that require an accountant's decision remain explicit. */
export interface Service03Options {
  clientLabel?: string;
  tolerance?: number;
  confirmedZeroRateFolios?: string[];
  /** Preferred when folios can repeat across series. One-based Excel row numbers. */
  confirmedZeroRateRows?: number[];
  siigoBase16?: number | null;
  siigoBase0?: number | null;
}

export interface ResolvedService03Options {
  clientLabel: string;
  tolerance: number;
  confirmedZeroRateFolios: string[];
  confirmedZeroRateRows: number[];
  siigoBase16: number | null;
  siigoBase0: number | null;
}

export type Service03HeaderKey =
  | "subtotal"
  | "total"
  | "iva"
  | "estatus"
  | "fecha"
  | "folio"
  | "descuento"
  | "serie"
  | "uuid"
  | "rfc"
  | "receptor"
  | "tipo"
  | "ivaret"
  | "isrret"
  | "ieps";

export type Service03HeaderColumns = Record<
  "subtotal" | "total" | "iva" | "estatus" | "fecha" | "folio",
  number
> &
  Partial<
    Record<
      Exclude<Service03HeaderKey, "subtotal" | "total" | "iva" | "estatus" | "fecha" | "folio">,
      number
    >
  >;

export interface Service03Row {
  rowNumber: number;
  folio: string;
  serie: string;
  uuid: string;
  day: string;
  timestamp: number;
  subtotal: number;
  total: number;
  iva: number;
  descuento: number;
  estatus: string;
  tipo: string;
  rfc: string;
  receptor: string;
  ivaRetenido: number;
  isrRetenido: number;
  ieps: number;
  base0: number;
  ivaDifference: number;
  active: boolean;
}

export interface Service03Day {
  dia: string;
  fila_ini: number;
  fila_fin: number;
  n: number;
  cancelados: number;
  S: number;
  T: number;
  U: number;
  V: number;
  IEPS: number;
  /** Display value; never use this rounded value for the monthly sum. */
  W: number;
  /** Exact daily difference in pesos from integer-cent input totals. */
  WExact: number;
  X: number;
  revision: "OK" | "REVISAR";
}

export interface Service03Candidate {
  fila: number;
  folio: string;
  dia: string;
  subtotal: number;
  iva: number;
  ieps: number;
  base0: number;
  mixto: boolean;
  confirmed: boolean;
}

export interface Service03InvoiceDifference {
  fila: number;
  folio: string;
  dia: string;
  receptor: string;
  subtotal: number;
  iva: number;
  dif: number;
  ieps: number;
  base0: number;
  explicacion: string;
}

export interface Service03Ieps {
  fila: number;
  folio: string;
  dia: string;
  ieps: number;
}

export interface Service03Canceled {
  fila: number;
  folio: string;
  dia: string;
  receptor: string;
  subtotal: number;
  iva: number;
  total: number;
  sustituto: string | null;
  sustituto_dia: string | null;
}

export interface Service03Totals {
  cfdi: number;
  activos: number;
  cancelados: number;
  dias: number;
  S: number;
  T: number;
  U: number;
  V: number;
  W: number;
  X: number;
  IEPS: number;
  iva_explicado: number;
  no_explicada: number;
  dias_revisar: number;
  dias_con_W_mayor_tol: string[];
  base16: number;
}

export interface Service03Finding {
  code:
    | "UNCONFIRMED_ZERO_RATE"
    | "CONFIRMED_ZERO_RATE"
    | "IEPS_PRESENT"
    | "CANCELED_INVOICE"
    | "MISSING_FOLIO"
    | "DAY_REVIEW"
    | "MULTIPLE_MONTHS"
    | "SIIGO_DIFFERENCE";
  message: string;
  day?: string;
  rowNumber?: number;
  folio?: string;
  amount?: number;
  requiresHumanReview: boolean;
}

export interface Service03SiigoComparison {
  base16_siigo: number | null;
  base16_cfdi_motor: number;
  diferencia_base16: number | null;
  base0_siigo: number | null;
  base0_cfdi_motor: number;
  diferencia_base0: number | null;
}

export interface Service03Analysis {
  /** The source workbook is retained for writing an output copy. The analyzer never mutates it. */
  workbook: Workbook;
  worksheet: Worksheet;
  headerColumns: Service03HeaderColumns;
  rows: Service03Row[];
  dias: Service03Day[];
  candidatos_sin_iva: Service03Candidate[];
  /** Alias used by the independent golden fixtures. */
  cfdi_sin_iva_activos: Service03Candidate[];
  cfdi_con_diferencia: Service03InvoiceDifference[];
  ieps: Service03Ieps[];
  /** Alias used by the independent golden fixtures. */
  cfdi_con_ieps: Service03Ieps[];
  cancelados: Service03Canceled[];
  folios_faltantes: string[];
  marcados_tasa0: string[];
  totales: Service03Totals;
  /** Direct subtotal of active invoices minus the sum of daily S; must equal zero. */
  controlSubtotal: number;
  resumen: { X: number; noExplicada: number; revisar: number };
  cotejo_siigo: Service03SiigoComparison | null;
  columna_resultados_inicia: number;
  ultima_columna_original: number;
  findings: Service03Finding[];
  warnings: string[];
  options: ResolvedService03Options;
  outputFilename: string;
  sheetName: string;
  period: { from: string; to: string; month: string; year: string };
}
