export interface Service04Options {
  /** ISO date (YYYY-MM-DD). Defaults to the auxiliary's end date. */
  cutoffDate?: string | null;
  /** Credit days granted to customers. 0 ages by invoice date. */
  creditDays?: number;
  /** Largest residual, in pesos, reported as a cent difference instead of an open invoice. */
  centsTolerance?: number;
}

export type Service04HeaderKey =
  | "account"
  | "name"
  | "date"
  | "type"
  | "poliza"
  | "description"
  | "reference"
  | "debit"
  | "credit"
  | "balance";

export type Service04HeaderColumns = Partial<Record<Service04HeaderKey, number>>;

export type Service04ItemKind =
  | "factura"
  | "cargo_sin_folio"
  | "saldo_inicial"
  | "saldo_a_favor"
  | "diferencia_centavos";

export type Service04Rule =
  | "FOLIO_EXACTO"
  | "FOLIO_EXACTO_PARCIAL"
  | "SALDO_INICIAL"
  | "RANGO"
  | "RANGO_SUBCONJUNTO"
  | "MONTO_EXACTO"
  | "FIFO_EXACTO"
  | "FIFO_COMBINACION"
  | "FIFO_PARCIAL"
  | "NC_RESIDUO"
  | "NC_FIFO";

export type Service04ReferenceStatus =
  | "coincide"
  | "no_corresponde"
  | "sin_referencia"
  | "sin_combinacion";

export interface Service04Allocation {
  itemId: number;
  folio: string | null;
  amount: number;
}

export interface Service04Item {
  id: number;
  account: string;
  kind: Service04ItemKind;
  folio: string | null;
  folioNumber: number | null;
  date: string | null;
  rowNumber: number | null;
  tipo: string;
  poliza: string;
  description: string;
  original: number;
  applied: number;
  remaining: number;
  /** Days between the item date and the cutoff date. */
  days: number | null;
  bucket: Service04BucketKey;
  payments: { paymentId: number; rowNumber: number; date: string; amount: number }[];
  /** For cent differences: the invoice whose residual became the difference. */
  sourceFolio?: string | null;
}

export interface Service04Payment {
  id: number;
  account: string;
  client: string;
  kind: "abono" | "nota_credito";
  rowNumber: number;
  date: string;
  tipo: string;
  poliza: string;
  description: string;
  amount: number;
  referencedFolios: number[];
  rule: Service04Rule;
  referenceStatus: Service04ReferenceStatus;
  allocations: Service04Allocation[];
  unapplied: number;
  requiresReview: boolean;
  note: string;
}

export type Service04BucketKey = "vigente" | "d1_30" | "d31_60" | "d61_90" | "d90_mas" | "otros";

export interface Service04AgingBucket {
  key: Service04BucketKey;
  label: string;
  amount: number;
  items: number;
  percent: number;
}

export interface Service04Client {
  account: string;
  name: string;
  headerRow: number;
  opening: number;
  debits: number;
  credits: number;
  creditNotes: number;
  invoicesReviewed: number;
  zeroInvoices: number;
  paymentsCount: number;
  creditNotesCount: number;
  auxiliaryBalance: number;
  reconstructedBalance: number;
  difference: number;
  status: "Conciliado" | "Con diferencia";
  possibleCauses: string[];
  openInvoices: number;
  openItems: number;
  oldestDate: string | null;
  maxDays: number | null;
  agingLabel: string;
  lastPaymentDate: string | null;
  reviewCount: number;
  aging: Record<Service04BucketKey, number>;
}

export type Service04AnomalyCode =
  | "REFERENCIA_NO_CORRESPONDE"
  | "ABONO_SIN_REFERENCIA"
  | "ABONO_SIN_COMBINACION"
  | "ASIGNACION_AMBIGUA"
  | "ABONO_ANTES_DE_FACTURA"
  | "FACTURA_SALDO_PARCIAL"
  | "DIFERENCIA_CENTAVOS"
  | "SALDO_INICIAL_SIN_DETALLE"
  | "FACTURA_ANTIGUA"
  | "CLIENTE_SIN_COBROS"
  | "NOTA_CREDITO_SIN_RELACION"
  | "SALDO_A_FAVOR"
  | "FACTURA_EN_CERO"
  | "TOTALES_NO_CUADRAN"
  | "SALDO_AUXILIAR_NO_CUADRA"
  | "DIFERENCIA_CONCILIACION";

export interface Service04Anomaly {
  code: Service04AnomalyCode;
  severity: "alta" | "media" | "baja";
  account: string;
  client: string;
  rowNumber?: number | undefined;
  folio?: string | null;
  date?: string | null;
  amount?: number;
  message: string;
  requiresReview: boolean;
}

export interface Service04Totals {
  clients: number;
  invoicesReviewed: number;
  zeroInvoices: number;
  payments: number;
  creditNotes: number;
  clientsWithBalance: number;
  openInvoices: number;
  openingWithoutDetail: number;
  centDifferences: number;
  totalPending: number;
  overdue: number;
  overduePercent: number;
  over90: number;
  over90Percent: number;
  reconciledClients: number;
  unreconciledClients: number;
  referenceMatched: number;
  referenceMismatch: number;
  withoutReference: number;
  withoutCombination: number;
  paymentsToReview: number;
  auxiliaryBalance: number;
  reconstructedBalance: number;
}

export interface Service04Analysis {
  company: string;
  rfc: string;
  sheetName: string;
  periodFrom: string | null;
  periodTo: string | null;
  cutoffDate: string;
  creditDays: number;
  centsTolerance: number;
  headerRow: number;
  headerColumns: Service04HeaderColumns;
  clients: Service04Client[];
  /** Every item with a non-zero residual: open invoices, opening balances, credits and cent differences. */
  openItems: Service04Item[];
  payments: Service04Payment[];
  anomalies: Service04Anomaly[];
  aging: Service04AgingBucket[];
  totals: Service04Totals;
  warnings: string[];
  outputFilename: string;
}
