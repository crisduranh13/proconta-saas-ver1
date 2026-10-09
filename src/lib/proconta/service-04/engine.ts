import type { CellValue, Workbook, Worksheet } from "exceljs";
import type {
  Service04AgingBucket,
  Service04Analysis,
  Service04Anomaly,
  Service04BucketKey,
  Service04Client,
  Service04HeaderColumns,
  Service04HeaderKey,
  Service04Item,
  Service04ItemKind,
  Service04Options,
  Service04Payment,
  Service04ReferenceStatus,
  Service04Rule,
} from "./types";

/*
 * Servicio 4 · Cuentas por cobrar.
 * Reconstruye las partidas abiertas del auxiliar de clientes (cuenta 1103) aplicando cada abono
 * con la prioridad documentada en el caso 4.8: folio exacto, rango con sus extremos, monto
 * exacto, FIFO exacto o suma de facturas antiguas y, como último recurso, FIFO parcial marcado.
 * Todo se calcula en centavos enteros para que el control contra el auxiliar cuadre al centavo.
 */

const DAY_MS = 86_400_000;
const OVERDUE_WITHOUT_PAYMENT_DAYS = 60;
const OLD_INVOICE_DAYS = 90;
const MAX_RANGE_WIDTH = 2000;

export const BUCKET_LABELS: Record<Service04BucketKey, string> = {
  vigente: "Vigente",
  d1_30: "1–30 días",
  d31_60: "31–60 días",
  d61_90: "61–90 días",
  d90_mas: "Más de 90 días",
  otros: "Diferencias y saldos a favor",
};
const BUCKET_ORDER: Service04BucketKey[] = [
  "vigente",
  "d1_30",
  "d31_60",
  "d61_90",
  "d90_mas",
  "otros",
];

type Plain = string | number | boolean | Date | null;

interface WorkItem {
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
  remaining: number;
  payments: { paymentId: number; rowNumber: number; date: string; amount: number }[];
  sourceFolio?: string | null;
}

interface WorkPayment {
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
  singles: number[];
  ranges: [number, number][];
  rule: Service04Rule;
  referenceStatus: Service04ReferenceStatus;
  allocations: { itemId: number; folio: string | null; amount: number }[];
  unapplied: number;
  requiresReview: boolean;
  notes: string[];
}

interface WorkClient {
  account: string;
  name: string;
  headerRow: number;
  opening: number;
  debitSum: number;
  creditSum: number;
  creditNotesSum: number;
  lastBalanceCell: number | null;
  totalsRow: { row: number; debit: number | null; credit: number | null } | null;
  invoicesReviewed: number;
  zeroInvoices: { row: number; folio: string | null }[];
  items: WorkItem[];
  payments: WorkPayment[];
  creditNotes: WorkPayment[];
  anomalies: Service04Anomaly[];
}

// ───────────────────────── lectura de celdas ─────────────────────────

function plain(value: CellValue | undefined): Plain {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return plain(value.result as CellValue);
    if ("text" in value) return String(value.text);
    return null;
  }
  return value;
}

function text(value: Plain): string {
  if (value === null) return "";
  if (value instanceof Date) return isoFromDate(value) ?? "";
  return String(value).trim();
}

export function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[:.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isoFromDate(date: Date): string | null {
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function validIso(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1) return null;
  if (date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function parseDate(value: Plain): string | null {
  if (value === null || value === "") return null;
  if (value instanceof Date) return isoFromDate(value);
  if (typeof value === "number") {
    if (value < 20_000 || value > 80_000) return null;
    return isoFromDate(new Date(Date.UTC(1899, 11, 30) + Math.round(value) * DAY_MS));
  }
  const raw = String(value).trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (match) return validIso(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (match) return validIso(Number(match[3]), Number(match[2]), Number(match[1]));
  return null;
}

/** Pesos → centavos enteros. Devuelve null si la celda está vacía. */
function parseCents(value: Plain, rowNumber: number, label: string): number | null {
  if (value === null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Renglón ${rowNumber}: ${label} no es un importe válido.`);
    return toCents(value);
  }
  if (value instanceof Date || typeof value === "boolean") {
    throw new Error(`Renglón ${rowNumber}: ${label} no es un importe válido.`);
  }
  let raw = value.replace(/[$\s]/g, "").replace(/,/g, "");
  if (raw === "" || raw === "-") return null;
  let sign = 1;
  if (/^\(.*\)$/.test(raw)) {
    sign = -1;
    raw = raw.slice(1, -1);
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount)) {
    throw new Error(`Renglón ${rowNumber}: ${label} "${value}" no es un importe numérico.`);
  }
  return sign * toCents(amount);
}

function toCents(pesos: number): number {
  return Math.round(pesos * 100 + Math.sign(pesos) * 1e-6);
}

function pesos(cents: number): number {
  const value = cents / 100;
  return value === 0 ? 0 : value;
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

function money(cents: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
}

// ───────────────────────── encabezados ─────────────────────────

const HEADER_MATCHERS: [Service04HeaderKey, (value: string) => boolean][] = [
  ["account", (v) => ["cuenta", "no cuenta", "numero de cuenta", "cuenta contable"].includes(v)],
  ["name", (v) => v.startsWith("nombre")],
  ["date", (v) => v === "fecha"],
  ["type", (v) => v === "tipo" || v === "tipo de poliza"],
  ["poliza", (v) => v === "poliza" || v === "no poliza" || v === "numero de poliza"],
  ["description", (v) => v.startsWith("descripcion") || v === "concepto"],
  ["reference", (v) => v.startsWith("referencia")],
  ["debit", (v) => ["cargos", "cargo", "debe"].includes(v)],
  ["credit", (v) => ["abonos", "abono", "haber"].includes(v)],
  ["balance", (v) => v === "saldo" || v === "saldo final"],
];
const REQUIRED_HEADERS: [Service04HeaderKey, string][] = [
  ["account", "Cuenta"],
  ["date", "Fecha"],
  ["description", "Descripción"],
  ["debit", "Cargos"],
  ["credit", "Abonos"],
];

function findHeader(worksheet: Worksheet): { row: number; columns: Service04HeaderColumns } | null {
  const limit = Math.min(worksheet.rowCount, 60);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const columns: Service04HeaderColumns = {};
    const cellCount = Math.max(row.cellCount, worksheet.columnCount);
    for (let column = 1; column <= cellCount; column++) {
      const value = normalize(text(plain(row.getCell(column).value)));
      if (!value) continue;
      for (const [key, matches] of HEADER_MATCHERS) {
        if (columns[key] === undefined && matches(value)) {
          columns[key] = column;
          break;
        }
      }
    }
    if (columns.date && columns.description && columns.debit && columns.credit) {
      return { row: rowNumber, columns };
    }
  }
  return null;
}

// ───────────────────────── referencias y folios ─────────────────────────

function invoiceFolio(description: string): { folio: string; number: number } | null {
  const docto = /Docto\.?\s*:?\s*([A-Za-z0-9]*)\s*\/\s*(\d+)/i.exec(description);
  if (docto) {
    const serie = docto[1] ?? "";
    return { folio: `${serie}/${docto[2]}`, number: Number(docto[2]) };
  }
  const loose = /(?:factura|fact|folio)\D{0,5}(\d{3,7})/i.exec(description);
  return loose ? { folio: loose[1]!, number: Number(loose[1]) } : null;
}

export function parseReference(raw: string): { singles: number[]; ranges: [number, number][] } {
  const ranges: [number, number][] = [];
  const singles: number[] = [];
  let rest = raw.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, " ");
  rest = rest.replace(/(\d{3,7})\s*-\s*(\d{3,7})/g, (whole, a: string, b: string) => {
    const from = Number(a);
    const to = Number(b);
    if (to > from && to - from <= MAX_RANGE_WIDTH) {
      ranges.push([from, to]);
      return " ";
    }
    return whole;
  });
  for (const match of rest.matchAll(/(?<![\d.])(\d{3,7})(?![\d.])/g)) {
    const value = Number(match[1]);
    if (!singles.includes(value)) singles.push(value);
  }
  return { singles, ranges };
}

const CREDIT_NOTE = /dev\.?\s*desc|devoluci|bonificaci|nota de credito|^nc\b|descuento/;

// ───────────────────────── búsqueda de combinaciones ─────────────────────────

/**
 * Combinaciones exactas (en centavos) del pool, en orden de antigüedad. La búsqueda tiene un
 * presupuesto fijo: si se agota, se reporta lo encontrado y el abono cae a la siguiente regla.
 */
function findSubsets(
  pool: WorkItem[],
  target: number,
  maxSize: number,
  limit: number,
  budget = 600_000,
): WorkItem[][] {
  const results: WorkItem[][] = [];
  if (target <= 0) return results;
  const suffix: number[] = new Array<number>(pool.length + 1).fill(0);
  for (let index = pool.length - 1; index >= 0; index--) {
    suffix[index] = suffix[index + 1]! + pool[index]!.remaining;
  }
  let nodes = 0;
  const chosen: WorkItem[] = [];
  const visit = (start: number, sum: number) => {
    if (results.length >= limit || nodes++ > budget) return;
    if (sum === target && chosen.length) {
      results.push([...chosen]);
      return;
    }
    if (chosen.length === maxSize || sum + suffix[start]! < target) return;
    for (let index = start; index < pool.length; index++) {
      const item = pool[index]!;
      if (sum + suffix[index]! < target) return;
      if (sum + item.remaining > target) continue;
      chosen.push(item);
      visit(index + 1, sum + item.remaining);
      chosen.pop();
      if (results.length >= limit) return;
    }
  };
  visit(0, 0);
  return results;
}

function fifoKey(item: WorkItem): [string, number, number] {
  return [item.date ?? "0000-00-00", item.folioNumber ?? Number.MAX_SAFE_INTEGER, item.rowNumber ?? 0];
}

function byFifo(a: WorkItem, b: WorkItem): number {
  const [da, fa, ra] = fifoKey(a);
  const [db, fb, rb] = fifoKey(b);
  return da < db ? -1 : da > db ? 1 : fa - fb || ra - rb;
}

// ───────────────────────── motor ─────────────────────────

export function analyzeReceivables(
  workbook: Workbook,
  options: Service04Options = {},
): Service04Analysis {
  const worksheetWithHeader = workbook.worksheets
    .map((worksheet) => ({ worksheet, header: findHeader(worksheet) }))
    .find((entry) => entry.header !== null);
  if (!worksheetWithHeader?.header) {
    throw new Error(
      "No se encontró el encabezado del auxiliar. Se esperan las columnas Cuenta, Fecha, Descripción, Cargos y Abonos.",
    );
  }
  const { worksheet, header } = worksheetWithHeader;
  const columns = header.columns;
  const missing = REQUIRED_HEADERS.filter(([key]) => columns[key] === undefined).map(([, l]) => l);
  if (missing.length) {
    throw new Error(`El auxiliar no trae las columnas obligatorias: ${missing.join(", ")}.`);
  }

  // Metadatos de la cabecera del reporte (empresa, RFC y periodo).
  let company = "";
  let rfc = "";
  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  const preamble: string[] = [];
  for (let rowNumber = 1; rowNumber < header.row; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    let first = "";
    for (let column = 1; column <= Math.max(row.cellCount, 1) && !first; column++) {
      first = text(plain(row.getCell(column).value));
    }
    if (!first) continue;
    preamble.push(first);
    const period = /del\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+al\s+(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(first);
    if (period) {
      periodFrom = parseDate(period[1]!);
      periodTo = parseDate(period[2]!);
    }
    const rfcMatch = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/.exec(first);
    if (rfcMatch && !rfc) {
      rfc = rfcMatch[1]!;
      company = preamble.at(-2) ?? "";
    }
  }

  const warnings: string[] = [];
  if (columns.balance === undefined) {
    warnings.push(
      "El auxiliar no trae columna Saldo: el saldo inicial se toma como cero y el saldo del auxiliar se calcula con cargos menos abonos.",
    );
  }

  const cell = (rowNumber: number, key: Service04HeaderKey): Plain => {
    const column = columns[key];
    return column === undefined ? null : plain(worksheet.getRow(rowNumber).getCell(column).value);
  };

  const clients: WorkClient[] = [];
  let current: WorkClient | null = null;
  let nextId = 1;
  let lastMovementDate: string | null = null;

  for (let rowNumber = header.row + 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const accountText = text(cell(rowNumber, "account"));
    const descriptionRaw = text(cell(rowNumber, "description"));
    const description = normalize(descriptionRaw);
    const dateValue = cell(rowNumber, "date");
    const date = parseDate(dateValue);

    if (!date && accountText && /^\d{2,}([-.]\d+)+$|^\d{4,}$/.test(accountText)) {
      const opening = parseCents(cell(rowNumber, "balance"), rowNumber, "el saldo inicial") ?? 0;
      current = {
        account: accountText,
        name: text(cell(rowNumber, "name")) || descriptionRaw || accountText,
        headerRow: rowNumber,
        opening,
        debitSum: 0,
        creditSum: 0,
        creditNotesSum: 0,
        lastBalanceCell: columns.balance === undefined ? null : opening,
        totalsRow: null,
        invoicesReviewed: 0,
        zeroInvoices: [],
        items: [],
        payments: [],
        creditNotes: [],
        anomalies: [],
      };
      clients.push(current);
      continue;
    }

    const looksLikeTotal = !date && (/^total/.test(description) || /^total/.test(normalize(accountText)));
    if (looksLikeTotal) {
      // "TOTALES CUENTA" cierra la cuenta. Otros totales (generales) se ignoran.
      if (current && /cuenta/.test(description + normalize(accountText)) && !current.totalsRow) {
        current.totalsRow = {
          row: rowNumber,
          debit: parseCents(cell(rowNumber, "debit"), rowNumber, "el total de cargos"),
          credit: parseCents(cell(rowNumber, "credit"), rowNumber, "el total de abonos"),
        };
        current = null;
      }
      continue;
    }

    if (!date) {
      if (dateValue !== null && text(dateValue) !== "") {
        throw new Error(`Renglón ${rowNumber}: la fecha "${text(dateValue)}" no es válida.`);
      }
      continue;
    }

    const debit = parseCents(cell(rowNumber, "debit"), rowNumber, "el cargo") ?? 0;
    const credit = parseCents(cell(rowNumber, "credit"), rowNumber, "el abono") ?? 0;
    if (!current) {
      throw new Error(
        `Renglón ${rowNumber}: hay un movimiento fuera de una cuenta de cliente. Revisa que el archivo sea el auxiliar completo.`,
      );
    }
    if (!lastMovementDate || date > lastMovementDate) lastMovementDate = date;
    current.debitSum += debit;
    current.creditSum += credit;
    const balance = parseCents(cell(rowNumber, "balance"), rowNumber, "el saldo");
    if (balance !== null) current.lastBalanceCell = balance;

    const base = {
      account: current.account,
      date,
      rowNumber,
      tipo: text(cell(rowNumber, "type")),
      poliza: text(cell(rowNumber, "poliza")),
      description: descriptionRaw,
    };
    const reference = `${text(cell(rowNumber, "reference"))} ${descriptionRaw}`;
    const isCreditNote = CREDIT_NOTE.test(description);
    const isInvoiceText = /venta|docto|factura/.test(description) && !isCreditNote;

    if (debit === 0 && credit === 0) {
      if (isInvoiceText) {
        current.invoicesReviewed++;
        current.zeroInvoices.push({ row: rowNumber, folio: invoiceFolio(descriptionRaw)?.folio ?? null });
      }
      continue;
    }

    if (debit > 0) {
      const folio = invoiceFolio(descriptionRaw);
      current.invoicesReviewed++;
      current.items.push({
        ...base,
        id: nextId++,
        kind: folio ? "factura" : "cargo_sin_folio",
        folio: folio?.folio ?? null,
        folioNumber: folio?.number ?? null,
        original: debit,
        remaining: debit,
        payments: [],
      });
    } else if (debit < 0) {
      current.creditNotesSum += -debit;
      current.creditNotes.push(newPayment(nextId++, current, "nota_credito", base, -debit, reference));
    }

    if (credit > 0) {
      if (isCreditNote) {
        current.creditNotesSum += credit;
        current.creditNotes.push(newPayment(nextId++, current, "nota_credito", base, credit, reference));
      } else {
        current.payments.push(newPayment(nextId++, current, "abono", base, credit, reference));
      }
    } else if (credit < 0) {
      // Un abono negativo revierte un cobro: vuelve a ser saldo por cobrar.
      current.items.push({
        ...base,
        id: nextId++,
        kind: "cargo_sin_folio",
        folio: null,
        folioNumber: null,
        original: -credit,
        remaining: -credit,
        payments: [],
      });
      current.anomalies.push({
        code: "ASIGNACION_AMBIGUA",
        severity: "media",
        account: current.account,
        client: current.name,
        rowNumber,
        date,
        amount: pesos(-credit),
        message: `Abono negativo (reversa de cobro) por ${money(-credit)}; se tomó como saldo por cobrar sin factura.`,
        requiresReview: true,
      });
    }
  }

  if (!clients.length) {
    throw new Error(
      "No se encontraron cuentas de cliente en el auxiliar. Verifica que sea el auxiliar de la cuenta de clientes (1103).",
    );
  }

  const cutoffDate = options.cutoffDate || periodTo || lastMovementDate;
  if (!cutoffDate || !parseDate(cutoffDate)) {
    throw new Error("No se pudo determinar la fecha de corte. Indícala manualmente.");
  }
  if (lastMovementDate && cutoffDate < lastMovementDate) {
    throw new Error(
      `La fecha de corte (${cutoffDate}) es anterior al último movimiento del auxiliar (${lastMovementDate}). Usa un auxiliar cortado a esa fecha.`,
    );
  }
  const creditDays = Math.max(0, Math.floor(options.creditDays ?? 0));
  const tolerance = toCents(options.centsTolerance ?? 1);
  const openingDate = periodFrom ? addDays(periodFrom, -1) : null;

  for (const client of clients) {
    if (client.opening !== 0) {
      client.items.unshift({
        id: nextId++,
        account: client.account,
        kind: client.opening > 0 ? "saldo_inicial" : "saldo_a_favor",
        folio: null,
        folioNumber: null,
        date: openingDate,
        rowNumber: client.headerRow,
        tipo: "",
        poliza: "",
        description:
          client.opening > 0
            ? `Saldo inicial${periodFrom ? ` al ${periodFrom}` : ""} sin detalle de facturas`
            : `Saldo inicial a favor del cliente${periodFrom ? ` al ${periodFrom}` : ""}`,
        original: client.opening,
        remaining: client.opening,
        payments: [],
      });
    }
    const payments = [...client.payments].sort(
      (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.rowNumber - b.rowNumber),
    );
    for (const payment of payments) allocatePayment(client, payment, () => nextId++);
    const notes = [...client.creditNotes].sort(
      (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.rowNumber - b.rowNumber),
    );
    for (const note of notes) allocateCreditNote(client, note, () => nextId++);

    for (const item of client.items) {
      const small = item.remaining !== 0 && Math.abs(item.remaining) <= tolerance;
      if (!small) continue;
      if (item.kind === "saldo_a_favor" || item.payments.length > 0) {
        item.sourceFolio = item.folio;
        item.kind = "diferencia_centavos";
      }
    }
  }

  // ─── resultados por cliente ───
  const allItems: Service04Item[] = [];
  const allPayments: Service04Payment[] = [];
  const anomalies: Service04Anomaly[] = [];
  const clientResults: Service04Client[] = [];

  for (const client of clients) {
    const items = client.items.map((item) => toItem(item, cutoffDate, creditDays));
    const open = items.filter((item) => item.remaining !== 0);
    const reconstructed = client.items.reduce((sum, item) => sum + item.remaining, 0);
    const computedAux = client.opening + client.debitSum - client.creditSum;
    const auxiliary = client.lastBalanceCell ?? computedAux;
    const difference = auxiliary - reconstructed;
    const causes: string[] = [];
    if (client.lastBalanceCell !== null && client.lastBalanceCell !== computedAux) {
      causes.push(
        `El saldo final del auxiliar (${money(client.lastBalanceCell)}) no es igual a saldo inicial + cargos − abonos (${money(computedAux)}): puede faltar un renglón o haber un saldo alterado.`,
      );
      client.anomalies.push({
        code: "SALDO_AUXILIAR_NO_CUADRA",
        severity: "alta",
        account: client.account,
        client: client.name,
        amount: pesos(client.lastBalanceCell - computedAux),
        message: causes.at(-1)!,
        requiresReview: true,
      });
    }
    if (client.totalsRow) {
      const { debit, credit, row } = client.totalsRow;
      if ((debit !== null && debit !== client.debitSum) || (credit !== null && credit !== client.creditSum)) {
        const message = `Los TOTALES CUENTA del renglón ${row} (cargos ${money(debit ?? 0)}, abonos ${money(credit ?? 0)}) no coinciden con los movimientos leídos (cargos ${money(client.debitSum)}, abonos ${money(client.creditSum)}).`;
        causes.push(message);
        client.anomalies.push({
          code: "TOTALES_NO_CUADRAN",
          severity: "alta",
          account: client.account,
          client: client.name,
          rowNumber: row,
          message,
          requiresReview: true,
        });
      }
    }
    if (difference !== 0) {
      if (!causes.length) causes.push("Diferencia no explicada por los controles del auxiliar.");
      client.anomalies.push({
        code: "DIFERENCIA_CONCILIACION",
        severity: "alta",
        account: client.account,
        client: client.name,
        amount: pesos(difference),
        message: `Saldo auxiliar ${money(auxiliary)} − saldo reconstruido ${money(reconstructed)} = ${money(difference)}. El cliente no está conciliado.`,
        requiresReview: true,
      });
    }

    addClientFindings(client, items, cutoffDate, tolerance);

    const pendingItems = open.filter((item) => item.remaining > 0 && item.kind !== "diferencia_centavos");
    const openInvoices = pendingItems.filter((item) => item.kind === "factura" || item.kind === "cargo_sin_folio");
    const dated = pendingItems.filter((item) => item.date);
    const oldest = dated.reduce<Service04Item | null>(
      (best, item) => (!best || (item.date ?? "") < (best.date ?? "") ? item : best),
      null,
    );
    const aging = Object.fromEntries(BUCKET_ORDER.map((key) => [key, 0])) as Record<Service04BucketKey, number>;
    for (const item of open) aging[item.bucket] = (aging[item.bucket] ?? 0) + item.remaining;
    for (const key of BUCKET_ORDER) aging[key] = round2(aging[key]);
    const paymentDates = client.payments.map((payment) => payment.date).sort();
    const clientPayments = [...client.payments, ...client.creditNotes].map(toPayment);

    clientResults.push({
      account: client.account,
      name: client.name,
      headerRow: client.headerRow,
      opening: pesos(client.opening),
      debits: pesos(client.debitSum),
      credits: pesos(client.creditSum),
      creditNotes: pesos(client.creditNotesSum),
      invoicesReviewed: client.invoicesReviewed,
      zeroInvoices: client.zeroInvoices.length,
      paymentsCount: client.payments.length,
      creditNotesCount: client.creditNotes.length,
      auxiliaryBalance: pesos(auxiliary),
      reconstructedBalance: pesos(reconstructed),
      difference: pesos(difference),
      status: difference === 0 ? "Conciliado" : "Con diferencia",
      possibleCauses: difference === 0 ? [] : causes,
      openInvoices: openInvoices.length,
      openItems: open.length,
      oldestDate: oldest?.date ?? null,
      maxDays: oldest?.days ?? null,
      agingLabel: oldest ? BUCKET_LABELS[oldest.bucket] : reconstructed === 0 ? "Sin saldo" : BUCKET_LABELS.otros,
      lastPaymentDate: paymentDates.at(-1) ?? null,
      reviewCount: client.anomalies.filter((anomaly) => anomaly.requiresReview).length,
      aging,
    });
    allItems.push(...open);
    allPayments.push(...clientPayments);
    anomalies.push(...client.anomalies);
  }

  const totalPendingCents = allItems.reduce((sum, item) => sum + toCents(item.remaining), 0);
  const bucketCents = Object.fromEntries(BUCKET_ORDER.map((key) => [key, 0])) as Record<Service04BucketKey, number>;
  const bucketCounts = { ...bucketCents };
  for (const item of allItems) {
    bucketCents[item.bucket] += toCents(item.remaining);
    if (item.remaining > 0 && item.kind !== "diferencia_centavos") bucketCounts[item.bucket]++;
  }
  const aging: Service04AgingBucket[] = BUCKET_ORDER.map((key) => ({
    key,
    label: BUCKET_LABELS[key],
    amount: pesos(bucketCents[key]),
    items: bucketCounts[key],
    percent: totalPendingCents ? bucketCents[key] / totalPendingCents : 0,
  }));
  const overdueCents = bucketCents.d1_30 + bucketCents.d31_60 + bucketCents.d61_90 + bucketCents.d90_mas;
  const abonos = allPayments.filter((payment) => payment.kind === "abono");

  const totals = {
    clients: clientResults.length,
    invoicesReviewed: clientResults.reduce((sum, client) => sum + client.invoicesReviewed, 0),
    zeroInvoices: clientResults.reduce((sum, client) => sum + client.zeroInvoices, 0),
    payments: abonos.length,
    creditNotes: allPayments.length - abonos.length,
    clientsWithBalance: clientResults.filter((client) => client.reconstructedBalance > 0).length,
    openInvoices: clientResults.reduce((sum, client) => sum + client.openInvoices, 0),
    openingWithoutDetail: allItems.filter((item) => item.kind === "saldo_inicial").length,
    centDifferences: allItems.filter((item) => item.kind === "diferencia_centavos").length,
    totalPending: pesos(totalPendingCents),
    overdue: pesos(overdueCents),
    overduePercent: totalPendingCents ? overdueCents / totalPendingCents : 0,
    over90: pesos(bucketCents.d90_mas),
    over90Percent: totalPendingCents ? bucketCents.d90_mas / totalPendingCents : 0,
    reconciledClients: clientResults.filter((client) => client.status === "Conciliado").length,
    unreconciledClients: clientResults.filter((client) => client.status !== "Conciliado").length,
    referenceMatched: abonos.filter((payment) => payment.referenceStatus === "coincide").length,
    referenceMismatch: abonos.filter((payment) => payment.referenceStatus === "no_corresponde").length,
    withoutReference: abonos.filter((payment) => payment.referenceStatus === "sin_referencia").length,
    withoutCombination: abonos.filter((payment) => payment.referenceStatus === "sin_combinacion").length,
    paymentsToReview: allPayments.filter((payment) => payment.requiresReview).length,
    auxiliaryBalance: pesos(clientResults.reduce((sum, client) => sum + toCents(client.auxiliaryBalance), 0)),
    reconstructedBalance: pesos(
      clientResults.reduce((sum, client) => sum + toCents(client.reconstructedBalance), 0),
    ),
  };

  return {
    company,
    rfc,
    sheetName: worksheet.name,
    periodFrom,
    periodTo,
    cutoffDate,
    creditDays,
    centsTolerance: pesos(tolerance),
    headerRow: header.row,
    headerColumns: columns,
    clients: clientResults,
    openItems: allItems,
    payments: allPayments,
    anomalies,
    aging,
    totals,
    warnings,
    outputFilename: `Cta_por_Cobrar_${cutoffDate.replace(/-/g, "")}.xlsx`,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function newPayment(
  id: number,
  client: WorkClient,
  kind: "abono" | "nota_credito",
  base: { date: string; rowNumber: number; tipo: string; poliza: string; description: string },
  amount: number,
  reference: string,
): WorkPayment {
  const refs = kind === "abono" ? parseReference(reference) : { singles: [], ranges: [] };
  return {
    id,
    account: client.account,
    client: client.name,
    kind,
    rowNumber: base.rowNumber,
    date: base.date,
    tipo: base.tipo,
    poliza: base.poliza,
    description: base.description,
    amount,
    singles: refs.singles,
    ranges: refs.ranges,
    rule: "FIFO_PARCIAL",
    referenceStatus: refs.singles.length || refs.ranges.length ? "coincide" : "sin_referencia",
    allocations: [],
    unapplied: 0,
    requiresReview: false,
    notes: [],
  };
}

function openItems(client: WorkClient): WorkItem[] {
  return client.items
    .filter((item) => item.remaining > 0 && item.kind !== "saldo_a_favor")
    .sort(byFifo);
}

function apply(item: WorkItem, payment: WorkPayment, amount: number) {
  if (amount <= 0) return;
  item.remaining -= amount;
  item.payments.push({ paymentId: payment.id, rowNumber: payment.rowNumber, date: payment.date, amount });
  const existing = payment.allocations.find((allocation) => allocation.itemId === item.id);
  if (existing) existing.amount += amount;
  else payment.allocations.push({ itemId: item.id, folio: item.folio ?? labelFor(item), amount });
}

function labelFor(item: WorkItem): string {
  return item.kind === "saldo_inicial" ? "Saldo inicial" : item.description.slice(0, 40);
}

function applyAll(items: WorkItem[], payment: WorkPayment) {
  for (const item of items) apply(item, payment, item.remaining);
}

function folioLabel(items: WorkItem[]): string {
  return items.map((item) => item.folio ?? labelFor(item)).join(", ");
}

function chooseSolution(solutions: WorkItem[][], extremes: Set<number>): WorkItem[] {
  const score = (solution: WorkItem[]) =>
    solution.filter((item) => item.folioNumber !== null && extremes.has(item.folioNumber)).length;
  return [...solutions].sort((a, b) => score(b) - score(a))[0]!;
}

function dedupe(solutions: WorkItem[][]): WorkItem[][] {
  const seen = new Set<string>();
  return solutions.filter((solution) => {
    const key = solution
      .map((item) => item.id)
      .sort((a, b) => a - b)
      .join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function allocatePayment(client: WorkClient, payment: WorkPayment, newId: () => number) {
  const amount = payment.amount;
  const open = openItems(client);
  const hasReference = payment.singles.length > 0 || payment.ranges.length > 0;
  const referenced = (folio: number) =>
    payment.singles.includes(folio) || payment.ranges.some(([from, to]) => folio >= from && folio <= to);

  if (hasReference) {
    const candidates = open.filter((item) => item.folioNumber !== null && referenced(item.folioNumber));
    if (candidates.length) {
      const sum = candidates.reduce((total, item) => total + item.remaining, 0);
      const usesRange = payment.ranges.length > 0;
      // 1 y 2 · la referencia explica el abono completo.
      if (sum === amount) {
        applyAll(candidates, payment);
        payment.rule = usesRange ? "RANGO" : "FOLIO_EXACTO";
        payment.notes.push(`Referencia aplicada a ${folioLabel(candidates)}.`);
        return;
      }
      // 1 · abono parcial a un solo folio referido.
      if (!usesRange && candidates.length === 1 && amount < sum) {
        apply(candidates[0]!, payment, amount);
        payment.rule = "FOLIO_EXACTO_PARCIAL";
        payment.notes.push(`Abono parcial a ${folioLabel(candidates)}.`);
        return;
      }
      // 2 · un rango no significa todas sus facturas: buscar el subconjunto exacto.
      if (amount < sum) {
        const excluded = findSubsets(candidates, sum - amount, 3, 3).map((out) =>
          candidates.filter((item) => !out.includes(item)),
        );
        const included = findSubsets(candidates, amount, Number.POSITIVE_INFINITY, 2);
        const solutions = dedupe([...excluded, ...included]);
        if (solutions.length) {
          const numbers = candidates.map((item) => item.folioNumber!);
          const extremes = new Set(
            usesRange
              ? payment.ranges.flat()
              : [Math.min(...numbers), Math.max(...numbers)],
          );
          const chosen = chooseSolution(solutions, extremes);
          applyAll(chosen, payment);
          payment.rule = usesRange ? "RANGO_SUBCONJUNTO" : "FOLIO_EXACTO";
          payment.notes.push(`Referencia aplicada a ${folioLabel(chosen)} (no a todas las facturas referidas).`);
          if (solutions.length > 1) markAmbiguous(client, payment, solutions.length);
          return;
        }
      }
    }
    // Folio de un ejercicio anterior: se aplica al saldo inicial sin detalle.
    const opening = open.find((item) => item.kind === "saldo_inicial");
    const known = client.items.filter((item) => item.folioNumber !== null).map((item) => item.folioNumber!);
    const minimum = known.length ? Math.min(...known) : Number.POSITIVE_INFINITY;
    const referencedNumbers = [...payment.singles, ...payment.ranges.flat()];
    const allPrior = referencedNumbers.every((folio) => folio < minimum && !known.includes(folio));
    if (opening && allPrior && amount <= opening.remaining) {
      apply(opening, payment, amount);
      payment.rule = "SALDO_INICIAL";
      payment.notes.push(
        "La referencia es de un folio anterior al periodo del auxiliar; se aplicó al saldo inicial sin detalle.",
      );
      return;
    }
    payment.referenceStatus = "no_corresponde";
  }

  const pool = open.filter((item) => !item.date || item.date <= payment.date);

  // 3 · monto exacto contra una factura.
  for (const scope of [pool, open]) {
    const exact = scope.filter((item) => item.remaining === amount);
    if (!exact.length) continue;
    apply(exact[0]!, payment, amount);
    payment.rule = "MONTO_EXACTO";
    payment.notes.push(`Aplicado por monto exacto a ${folioLabel([exact[0]!])}.`);
    if (exact.length > 1) markAmbiguous(client, payment, exact.length);
    if (scope === open && exact[0]!.date && exact[0]!.date > payment.date) {
      payment.requiresReview = true;
      client.anomalies.push({
        code: "ABONO_ANTES_DE_FACTURA",
        severity: "media",
        account: client.account,
        client: client.name,
        rowNumber: payment.rowNumber,
        folio: exact[0]!.folio,
        date: payment.date,
        amount: pesos(amount),
        message: `El abono del ${payment.date} se aplicó a ${folioLabel([exact[0]!])}, fechada el ${exact[0]!.date}.`,
        requiresReview: true,
      });
    }
    return;
  }

  // 4 · FIFO exacto o suma de facturas antiguas.
  let accumulated = 0;
  for (let index = 0; index < pool.length; index++) {
    accumulated += pool[index]!.remaining;
    if (accumulated === amount) {
      const chosen = pool.slice(0, index + 1);
      applyAll(chosen, payment);
      payment.rule = "FIFO_EXACTO";
      payment.notes.push(`Aplicado a las facturas más antiguas: ${folioLabel(chosen)}.`);
      return;
    }
    if (accumulated > amount) {
      const prefix = pool.slice(0, index + 1);
      const solutions = dedupe(
        findSubsets(prefix, accumulated - amount, 2, 3).map((out) =>
          prefix.filter((item) => !out.includes(item)),
        ),
      );
      if (solutions.length) {
        applyAll(solutions[0]!, payment);
        payment.rule = "FIFO_COMBINACION";
        payment.notes.push(`Aplicado a una combinación de facturas antiguas: ${folioLabel(solutions[0]!)}.`);
        if (solutions.length > 1) markAmbiguous(client, payment, solutions.length);
        return;
      }
      break;
    }
  }
  const combos = dedupe(findSubsets(pool.slice(0, 40), amount, Number.POSITIVE_INFINITY, 2));
  if (combos.length) {
    applyAll(combos[0]!, payment);
    payment.rule = "FIFO_COMBINACION";
    payment.notes.push(`Aplicado a una combinación de facturas antiguas: ${folioLabel(combos[0]!)}.`);
    if (combos.length > 1) markAmbiguous(client, payment, combos.length);
    return;
  }

  // 5 · FIFO parcial, marcado para revisión.
  payment.rule = "FIFO_PARCIAL";
  payment.referenceStatus = "sin_combinacion";
  payment.requiresReview = true;
  let left = amount;
  const ordered = [...pool, ...open.filter((item) => !pool.includes(item))];
  for (const item of ordered) {
    if (left <= 0) break;
    const take = Math.min(left, item.remaining);
    apply(item, payment, take);
    left -= take;
  }
  if (left > 0) addCredit(client, payment, left, newId);
  payment.notes.push(
    `Ninguna factura ni combinación coincide con el importe; se aplicó en orden de antigüedad${left > 0 ? ` y sobran ${money(left)}` : ""}.`,
  );
  client.anomalies.push({
    code: "ABONO_SIN_COMBINACION",
    severity: "alta",
    account: client.account,
    client: client.name,
    rowNumber: payment.rowNumber,
    date: payment.date,
    amount: pesos(amount),
    message: `Abono "${payment.description}" por ${money(amount)} sin factura ni combinación exacta; aplicado por FIFO parcial a ${folioLabel(
      client.items.filter((item) => payment.allocations.some((allocation) => allocation.itemId === item.id)),
    )}.`,
    requiresReview: true,
  });
}

function markAmbiguous(client: WorkClient, payment: WorkPayment, options: number) {
  payment.requiresReview = true;
  payment.notes.push(`Hay ${options > 2 ? "varias" : "dos"} asignaciones posibles; se eligió la más antigua.`);
  client.anomalies.push({
    code: "ASIGNACION_AMBIGUA",
    severity: "media",
    account: client.account,
    client: client.name,
    rowNumber: payment.rowNumber,
    date: payment.date,
    amount: pesos(payment.amount),
    message: `Abono "${payment.description}" por ${money(payment.amount)}: más de una combinación de facturas cuadra con el importe. Se aplicó a ${payment.allocations
      .map((allocation) => allocation.folio)
      .join(", ")}; confirma la asignación.`,
    requiresReview: true,
  });
}

function addCredit(client: WorkClient, payment: WorkPayment, amount: number, newId: () => number) {
  payment.unapplied += amount;
  client.items.push({
    id: newId(),
    account: client.account,
    kind: "saldo_a_favor",
    folio: null,
    folioNumber: null,
    date: payment.date,
    rowNumber: payment.rowNumber,
    tipo: payment.tipo,
    poliza: payment.poliza,
    description: `Excedente sin aplicar de "${payment.description}"`,
    original: -amount,
    remaining: -amount,
    payments: [],
  });
}

function allocateCreditNote(client: WorkClient, note: WorkPayment, newId: () => number) {
  const open = openItems(client);
  const exact = open
    .filter((item) => item.remaining === note.amount)
    .sort((a, b) => Number(b.payments.length > 0) - Number(a.payments.length > 0) || byFifo(a, b));
  if (exact.length) {
    apply(exact[0]!, note, note.amount);
    note.rule = "NC_RESIDUO";
    note.notes.push(
      `El auxiliar no relaciona la nota con una factura; se aplicó a ${folioLabel([exact[0]!])}, cuyo saldo es igual a la nota.`,
    );
    if (exact.length > 1) markAmbiguous(client, note, exact.length);
    return;
  }
  let left = note.amount;
  for (const item of open) {
    if (left <= 0) break;
    const take = Math.min(left, item.remaining);
    apply(item, note, take);
    left -= take;
  }
  if (left > 0) addCredit(client, note, left, newId);
  note.rule = "NC_FIFO";
  note.requiresReview = true;
  note.notes.push("Nota de crédito sin factura relacionada; se aplicó a la partida más antigua.");
  client.anomalies.push({
    code: "NOTA_CREDITO_SIN_RELACION",
    severity: "media",
    account: client.account,
    client: client.name,
    rowNumber: note.rowNumber,
    date: note.date,
    amount: pesos(note.amount),
    message: `Nota de crédito "${note.description}" por ${money(note.amount)} sin factura relacionada; aplicada a ${note.allocations
      .map((allocation) => allocation.folio)
      .join(", ")}.`,
    requiresReview: true,
  });
}

function bucketFor(kind: Service04ItemKind, remaining: number, days: number | null, creditDays: number): Service04BucketKey {
  if (kind === "diferencia_centavos" || remaining < 0 || days === null) return "otros";
  const overdue = days - creditDays;
  if (overdue <= 0) return "vigente";
  if (overdue <= 30) return "d1_30";
  if (overdue <= 60) return "d31_60";
  if (overdue <= 90) return "d61_90";
  return "d90_mas";
}

function toItem(item: WorkItem, cutoffDate: string, creditDays: number): Service04Item {
  const days = item.kind === "diferencia_centavos" || !item.date ? null : daysBetween(item.date, cutoffDate);
  return {
    id: item.id,
    account: item.account,
    kind: item.kind,
    folio: item.folio,
    folioNumber: item.folioNumber,
    date: item.date,
    rowNumber: item.rowNumber,
    tipo: item.tipo,
    poliza: item.poliza,
    description: item.description,
    original: pesos(item.original),
    applied: pesos(item.original - item.remaining),
    remaining: pesos(item.remaining),
    days,
    bucket: bucketFor(item.kind, item.remaining, days, creditDays),
    payments: item.payments.map((payment) => ({ ...payment, amount: pesos(payment.amount) })),
    ...(item.sourceFolio !== undefined ? { sourceFolio: item.sourceFolio } : {}),
  };
}

function toPayment(payment: WorkPayment): Service04Payment {
  return {
    id: payment.id,
    account: payment.account,
    client: payment.client,
    kind: payment.kind,
    rowNumber: payment.rowNumber,
    date: payment.date,
    tipo: payment.tipo,
    poliza: payment.poliza,
    description: payment.description,
    amount: pesos(payment.amount),
    referencedFolios: [
      ...payment.singles,
      ...payment.ranges.flatMap(([from, to]) => [from, to]),
    ],
    rule: payment.rule,
    referenceStatus: payment.kind === "nota_credito" ? "sin_referencia" : payment.referenceStatus,
    allocations: payment.allocations.map((allocation) => ({ ...allocation, amount: pesos(allocation.amount) })),
    unapplied: pesos(payment.unapplied),
    requiresReview: payment.requiresReview,
    note: payment.notes.join(" "),
  };
}

function addClientFindings(
  client: WorkClient,
  items: Service04Item[],
  cutoffDate: string,
  tolerance: number,
) {
  const base = { account: client.account, client: client.name };
  for (const payment of client.payments) {
    if (payment.referenceStatus === "no_corresponde") {
      client.anomalies.push({
        ...base,
        code: "REFERENCIA_NO_CORRESPONDE",
        severity: "baja",
        rowNumber: payment.rowNumber,
        date: payment.date,
        amount: pesos(payment.amount),
        message: `La referencia "${payment.description}" no corresponde a facturas abiertas del cliente por ese importe. ${payment.notes.join(" ")}`,
        requiresReview: payment.requiresReview,
      });
    } else if (payment.referenceStatus === "sin_referencia") {
      client.anomalies.push({
        ...base,
        code: "ABONO_SIN_REFERENCIA",
        severity: "baja",
        rowNumber: payment.rowNumber,
        date: payment.date,
        amount: pesos(payment.amount),
        message: `Abono "${payment.description}" sin folio identificable. ${payment.notes.join(" ")}`,
        requiresReview: payment.requiresReview,
      });
    }
  }
  for (const item of items) {
    if (item.kind === "diferencia_centavos") {
      client.anomalies.push({
        ...base,
        code: "DIFERENCIA_CENTAVOS",
        severity: "media",
        rowNumber: item.rowNumber ?? undefined,
        folio: item.sourceFolio ?? null,
        date: item.date,
        amount: item.remaining,
        message: `Diferencia de ${money(toCents(item.remaining))} ${item.sourceFolio ? `en ${item.sourceFolio}` : ""} después de aplicar los abonos (${item.payments
          .map((payment) => `renglón ${payment.rowNumber}`)
          .join(", ")}). Se presenta como partida por conciliar, no como saldo de factura.`,
        requiresReview: true,
      });
    } else if (item.kind === "factura" && item.payments.length && item.remaining > 0) {
      client.anomalies.push({
        ...base,
        code: "FACTURA_SALDO_PARCIAL",
        severity: "media",
        rowNumber: item.rowNumber ?? undefined,
        folio: item.folio,
        date: item.date,
        amount: item.remaining,
        message: `${item.folio} tiene abonos por ${money(toCents(item.applied))} y conserva saldo de ${money(toCents(item.remaining))}.`,
        requiresReview: false,
      });
    } else if (item.kind === "saldo_a_favor" && item.remaining < 0) {
      client.anomalies.push({
        ...base,
        code: "SALDO_A_FAVOR",
        severity: "media",
        rowNumber: item.rowNumber ?? undefined,
        date: item.date,
        amount: item.remaining,
        message: `${item.description}: saldo a favor del cliente por ${money(-toCents(item.remaining))} sin factura a la cual aplicarlo.`,
        requiresReview: true,
      });
    }
  }
  if (client.opening !== 0) {
    const opening = items.find((item) => item.kind === "saldo_inicial");
    const residual = opening?.remaining ?? 0;
    client.anomalies.push({
      ...base,
      code: "SALDO_INICIAL_SIN_DETALLE",
      severity: residual > 0 ? "media" : "baja",
      rowNumber: client.headerRow,
      amount: pesos(client.opening),
      message:
        residual > 0
          ? `Saldo inicial de ${money(client.opening)} sin detalle de facturas en el auxiliar; quedan ${money(toCents(residual))} pendientes. Se necesita el reporte anterior para identificar los folios.`
          : `Saldo inicial de ${money(client.opening)} sin detalle; quedó cubierto por los abonos del periodo.`,
      requiresReview: residual > 0,
    });
  }
  const old = items.filter(
    (item) => item.remaining > 0 && item.kind !== "diferencia_centavos" && (item.days ?? 0) > OLD_INVOICE_DAYS,
  );
  if (old.length) {
    const total = old.reduce((sum, item) => sum + toCents(item.remaining), 0);
    client.anomalies.push({
      ...base,
      code: "FACTURA_ANTIGUA",
      severity: "media",
      amount: pesos(total),
      message: `${old.length} partida(s) con más de ${OLD_INVOICE_DAYS} días por ${money(total)}; la más antigua del ${old
        .map((item) => item.date ?? "")
        .sort()[0]}.`,
      requiresReview: false,
    });
  }
  const balance = items.reduce((sum, item) => sum + toCents(item.remaining), 0);
  const lastPayment = client.payments.map((payment) => payment.date).sort().at(-1) ?? null;
  const daysWithout = lastPayment ? daysBetween(lastPayment, cutoffDate) : null;
  if (balance > tolerance && (daysWithout === null || daysWithout > OVERDUE_WITHOUT_PAYMENT_DAYS)) {
    client.anomalies.push({
      ...base,
      code: "CLIENTE_SIN_COBROS",
      severity: "alta",
      amount: pesos(balance),
      date: lastPayment,
      message: lastPayment
        ? `Debe ${money(balance)} y su último cobro fue el ${lastPayment} (${daysWithout} días sin cobros al corte).`
        : `Debe ${money(balance)} y no tiene ningún cobro en el periodo del auxiliar.`,
      requiresReview: false,
    });
  }
  if (client.zeroInvoices.length) {
    client.anomalies.push({
      ...base,
      code: "FACTURA_EN_CERO",
      severity: "baja",
      message: `${client.zeroInvoices.length} factura(s) en $0.00 (canceladas o sin importe) que no afectan el saldo: ${client.zeroInvoices
        .map((invoice) => invoice.folio ?? `renglón ${invoice.row}`)
        .join(", ")}.`,
      requiresReview: false,
    });
  }
}
