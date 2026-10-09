import type {
  BankMovement,
  BankStatement,
  CfdiFile,
  CfdiRecord,
  RepRecord,
  Service01Analysis,
  Service01Catalog,
} from "../service-01/types";

export type DepositClass = "INGRESO" | "INGRESO SIN CFDI" | "NO ES INGRESO";
export const DEPOSIT_CLASSES: DepositClass[] = ["INGRESO", "INGRESO SIN CFDI", "NO ES INGRESO"];

export type IssuedStatus = "COBRADO" | "COBRADO VÍA REP" | "PENDIENTE DE COBRO";

export type DeductionStatus =
  "DEDUCIBLE" | "NO DEDUCIBLE" | "NO APLICA" | "OTRO PERIODO" | "PENDIENTE";
export const DEDUCTION_STATUSES: DeductionStatus[] = [
  "DEDUCIBLE",
  "NO DEDUCIBLE",
  "NO APLICA",
  "OTRO PERIODO",
  "PENDIENTE",
];

export interface Service02Config {
  /** RFC del banco de las cuentas revisadas: su CFDI de comisiones fechado al inicio del mes es del mes anterior. */
  ownBankRfcs: string[];
  /** Institutos cuyas cuotas se deducen con el CFDI que emiten al pagar (IMSS, INFONAVIT). */
  institutoRfcs: string[];
  /** Series de factura final de anticipo por proveedor: el gasto ya se dedujo con el CFDI del anticipo. */
  anticipoFinal: { rfc: string; serie: string }[];
  /** Tope de pagos en efectivo deducibles (art. 27 fr. III LISR). */
  efectivoMaximo: number;
  /** Uso de CFDI que corresponde a deducción personal (colegiaturas). */
  usosPersonales: string[];
}

export interface Service02Deposit {
  movement: BankMovement;
  classification: DepositClass;
  /** CFDI emitido o REP emitido con el que se identificó el cobro. */
  reference: string;
  base: number;
  iva: number;
  note: string;
}

export interface Service02Issued {
  key: string;
  cfdi: CfdiRecord | null;
  rep: RepRecord | null;
  receptorRfc: string;
  receptor: string;
  date: string;
  metodo: string;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  status: IssuedStatus;
  cobrado: number;
  note: string;
}

export interface Service02Received {
  key: string;
  cfdi: CfdiRecord | null;
  rep: RepRecord | null;
  date: string;
  tipo: string;
  rfc: string;
  emisor: string;
  serieFolio: string;
  metodo: string;
  forma: string;
  uso: string;
  subtotal: number;
  iva: number;
  total: number;
  status: DeductionStatus;
  note: string;
  prior: boolean;
}

export interface Service02Inputs {
  statements: BankStatement[];
  recibidos: CfdiFile;
  emitidos: CfdiFile;
  previousMonth?: CfdiFile | null;
}

export interface Service02Options {
  catalog?: Service01Catalog;
  config?: Partial<Service02Config>;
}

export interface IsrResult {
  base: number;
  limiteInferior: number;
  limiteSuperior: number;
  cuotaFija: number;
  pctExcedente: number;
  isr: number;
}

export interface Service02Analysis {
  client: { name: string; rfc: string };
  periodFrom: string;
  periodTo: string;
  config: Service02Config;
  outflows: Service01Analysis;
  deposits: Service02Deposit[];
  issued: Service02Issued[];
  received: Service02Received[];
  byDeposit: Record<DepositClass, { depositos: number; importe: number }>;
  byIssued: Record<IssuedStatus, number>;
  byDeduction: Record<DeductionStatus, { cfdi: number; subtotal: number; iva: number }>;
  ingresos: {
    depositos: number;
    importe: number;
    cobradoConIva: number;
    baseSinIva: number;
    ivaTrasladado: number;
  };
  iva: { trasladado: number; acreditable: number; aPagar: number };
  isr: IsrResult & { ingresos: number; deducciones: number };
  warnings: string[];
  outputFilename: string;
}
