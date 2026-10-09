export type Service01Status =
  "CONCILIADO" | "CONCILIADO C/OBS" | "PARCIAL" | "SIN CFDI" | "NO REQUIERE";

export const SERVICE01_STATUSES: Service01Status[] = [
  "CONCILIADO",
  "CONCILIADO C/OBS",
  "PARCIAL",
  "SIN CFDI",
  "NO REQUIERE",
];

export interface BankMovement {
  id: number;
  /** Etiqueta de la cuenta, p. ej. "BBVA 0175219310" o "PYME 46335". */
  account: string;
  page: number | null;
  /** Fecha de operación (ISO). */
  operDate: string;
  /** Fecha de liquidación (ISO). */
  liqDate: string;
  /** Primera línea del movimiento. */
  description: string;
  /** Renglones adicionales (referencia, beneficiario, CLABE). */
  detail: string;
  cargo: number;
  abono: number;
  saldo: number | null;
}

export interface BankCheck {
  label: string;
  read: number;
  document: number | null;
  ok: boolean;
  kind: "count" | "money";
}

export interface BankStatement {
  kind: "bbva-pdf" | "bbva-xlsx" | "bbva-tdc";
  fileName: string;
  account: string;
  holder: string;
  rfc: string;
  periodFrom: string;
  periodTo: string;
  openingBalance: number | null;
  closingBalance: number | null;
  movements: BankMovement[];
  checks: BankCheck[];
}

export interface CfdiRecord {
  id: number;
  serie: string;
  folio: string;
  serieFolio: string;
  tipo: string;
  rfc: string;
  emisor: string;
  /** Fecha de emisión (ISO, sin hora). */
  date: string;
  uuid: string;
  subtotal: number;
  descuento: number;
  total: number;
  iva: number;
  metodo: string;
  /** Forma de pago a dos dígitos ("03", "28", "99"). */
  forma: string;
  estatus: string;
  uso: string;
  /** CFDI del mes anterior pendiente de pago (entrada opcional). */
  prior?: boolean;
}

export interface RepRecord {
  folio: string;
  rfc: string;
  emisor: string;
  date: string;
  uuid: string;
  monto: number;
  estatus: string;
}

export interface CfdiFile {
  fileName: string;
  cfdi: CfdiRecord[];
  rep: RepRecord[];
}

/** Catálogo por cliente. Es un dato editable, no una regla fija del motor. */
export interface Service01Catalog {
  id: string;
  label: string;
  /** RFC del cliente o fragmentos del nombre del titular que activan este catálogo. */
  matchRfc: string[];
  matchName: string[];
  /** CLABE o número de cuenta destino (tal como aparece en el movimiento) → RFC del proveedor. */
  clabeToRfc: Record<string, string>;
  /** Palabra clave del movimiento → RFC (uno o varios proveedores que comparten la pista). Se evalúan en orden. */
  keywordToRfc: [string, string | string[]][];
  /** Movimientos que no requieren CFDI: palabra clave → explicación. */
  noRequiere: [string, string][];
  /** Créditos y arrendamientos cuyo CFDI sólo ampara intereses y comisiones. */
  parcialCredito: [string, string][];
  /** Pagos SIPARE u otros pagos a institutos cuyo CFDI lo emite el instituto. */
  parcialInstituto: [string, string][];
  /** RFC de monederos de combustible o peaje → etiqueta. El CFDI se emite al consumir. */
  monederoRfc: Record<string, string>;
  /** Consumos personales: palabra clave → observación. */
  personal: [string, string][];
  /** Aseguradoras (PPD con REP). */
  seguros: string[];
  /** Diagnóstico de CFDI sin pago por RFC del emisor. */
  unpaidDiagnostics: Record<string, string>;
}

export interface Service01Outflow {
  movement: BankMovement;
  status: Service01Status;
  cfdi: CfdiRecord | null;
  rfcHint: string;
  providerByRfc: boolean;
  gapDays: number | null;
  note: string;
}

export interface Service01Unpaid {
  cfdi: CfdiRecord;
  diagnostico: string;
}

export interface Service01StatusTotals {
  salidas: number;
  importe: number;
}

export interface Service01Totals {
  salidas: number;
  importe: number;
  cargosBanco: number;
  cargosBancoImporte: number;
  abonosBanco: number;
  abonosBancoImporte: number;
  cfdiActivos: number;
  cfdiActivosImporte: number;
  cfdiMesAnterior: number;
  cfdiConSalida: number;
  cfdiConSalidaImporte: number;
  cfdiSinSalida: number;
  cfdiSinSalidaImporte: number;
  rep: number;
  repImporte: number;
  egreso: number;
  egresoImporte: number;
  cancelados: number;
  canceladosImporte: number;
  /** Importe que requiere CFDI y ya lo tiene: (CONCILIADO + C/OBS) / (total − NO REQUIERE). */
  pctRequiereYTiene: number;
}

export interface Service01Options {
  catalog?: Service01Catalog;
  /** CFDI del mes anterior que se pagaron este mes (mismo formato Doc Digitales). */
  previousMonth?: CfdiFile | null;
}

export interface Service01Analysis {
  client: { name: string; rfc: string };
  periodFrom: string;
  periodTo: string;
  catalog: Service01Catalog;
  statements: BankStatement[];
  cfdiFileName: string;
  outflows: Service01Outflow[];
  unpaid: Service01Unpaid[];
  byStatus: Record<Service01Status, Service01StatusTotals>;
  totals: Service01Totals;
  warnings: string[];
  outputFilename: string;
}
