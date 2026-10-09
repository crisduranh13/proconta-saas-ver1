import type { CellValue, Workbook, Worksheet } from "exceljs";
import type {
  ResolvedService03Options,
  Service03Analysis,
  Service03Candidate,
  Service03Canceled,
  Service03Day,
  Service03Finding,
  Service03HeaderColumns,
  Service03HeaderKey,
  Service03InvoiceDifference,
  Service03Options,
  Service03Row,
  Service03Totals,
} from "./types";

const REQUIRED_HEADERS = {
  subtotal: "Sub Total",
  total: "Total",
  iva: "Total IVA Tras.",
  estatus: "Estatus",
  fecha: "Fecha",
  folio: "Folio",
} as const;

const HEADER_ALIASES: Record<Service03HeaderKey, string[]> = {
  subtotal: ["sub total", "subtotal"],
  total: ["total"],
  iva: ["total iva tras.", "total iva tras", "iva trasladado", "total iva trasladado"],
  estatus: ["estatus", "status"],
  fecha: ["fecha", "fecha emision", "fecha de emision"],
  folio: ["folio"],
  descuento: ["descuento"],
  serie: ["serie"],
  uuid: ["uuid", "folio fiscal"],
  rfc: ["r.f.c. receptor", "rfc receptor"],
  receptor: ["razon social receptor", "nombre receptor"],
  tipo: ["tipo de comprobante", "tipo"],
  ivaret: ["total iva ret.", "total iva ret", "iva retenido"],
  isrret: ["total isr ret.", "total isr ret", "isr retenido"],
  ieps: ["total ieps tras.", "total ieps", "ieps trasladado", "ieps"],
};

/** Rounds a rational number to the nearest integer, away from zero at a tie. */
function roundRatio(numerator: number, denominator: number): number {
  const sign = numerator < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(numerator) / denominator + 0.5);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function unboxCell(value: CellValue): unknown {
  if (value === null || value === undefined || typeof value !== "object" || value instanceof Date) {
    return value;
  }
  if ("result" in value) return value.result;
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("text" in value) return value.text;
  return value;
}

function cellText(value: CellValue): string {
  const raw = unboxCell(value);
  if (raw === null || raw === undefined) return "";
  return String(raw).trim();
}

/** Monetary source values are normalized to integer cents before any arithmetic. */
function cellCents(value: CellValue, rowNumber: number, label: string, required = false): number {
  const raw = unboxCell(value);
  if (raw === null || raw === undefined || raw === "") {
    if (required) throw new Error(`Renglón ${rowNumber}: falta ${label}.`);
    return 0;
  }
  let numeric: number;
  if (typeof raw === "number") numeric = raw;
  else if (typeof raw === "string") {
    const text = raw.trim().replace(/^\$/, "").replace(/,/g, "").replace(/\s+/g, "");
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
      throw new Error(`Renglón ${rowNumber}: ${label} no es un importe numérico.`);
    }
    numeric = Number(text);
  } else {
    throw new Error(`Renglón ${rowNumber}: ${label} no es un importe numérico.`);
  }
  if (!Number.isFinite(numeric) || !Number.isSafeInteger(Math.round(numeric * 100))) {
    throw new Error(`Renglón ${rowNumber}: ${label} está fuera del rango numérico admitido.`);
  }
  return Math.round((numeric + Math.sign(numeric) * Number.EPSILON) * 100);
}

function validIsoDay(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
  );
}

function parsedDate(value: CellValue, rowNumber: number): { day: string; timestamp: number } {
  const raw = unboxCell(value);
  let year: number;
  let month: number;
  let day: number;
  let hour = 0;
  let minute = 0;
  let second = 0;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    year = raw.getUTCFullYear();
    month = raw.getUTCMonth() + 1;
    day = raw.getUTCDate();
    hour = raw.getUTCHours();
    minute = raw.getUTCMinutes();
    second = raw.getUTCSeconds();
  } else if (typeof raw === "number" && Number.isFinite(raw)) {
    const date = new Date(Math.round((raw - 25569) * 86_400_000));
    year = date.getUTCFullYear();
    month = date.getUTCMonth() + 1;
    day = date.getUTCDate();
    hour = date.getUTCHours();
    minute = date.getUTCMinutes();
    second = date.getUTCSeconds();
  } else {
    const text = String(raw ?? "").trim();
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    const local = text.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (!iso && !local) throw new Error(`Renglón ${rowNumber}: Fecha no válida.`);
    year = Number(iso ? iso[1] : local?.[3]);
    month = Number(iso ? iso[2] : local?.[2]);
    day = Number(iso ? iso[3] : local?.[1]);
    hour = Number(iso ? (iso[4] ?? 0) : (local?.[4] ?? 0));
    minute = Number(iso ? (iso[5] ?? 0) : (local?.[5] ?? 0));
    second = Number(iso ? (iso[6] ?? 0) : (local?.[6] ?? 0));
  }
  if (!validIsoDay(year, month, day) || hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Renglón ${rowNumber}: Fecha no válida.`);
  }
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return {
    day: `${yyyy}-${mm}-${dd}`,
    timestamp: Date.UTC(year, month - 1, day, hour, minute, second),
  };
}

function getHeaderColumns(worksheet: Worksheet): {
  columns: Service03HeaderColumns;
  lastColumn: number;
} {
  const found: Partial<Record<Service03HeaderKey, number>> = {};
  let lastColumn = 0;
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, index) => {
    const text = cellText(cell.value);
    if (!text) return;
    lastColumn = Math.max(lastColumn, index);
    const key = normalize(text);
    for (const [semantic, aliases] of Object.entries(HEADER_ALIASES) as [
      Service03HeaderKey,
      string[],
    ][]) {
      if (!aliases.includes(key)) continue;
      if (found[semantic]) {
        throw new Error(`El encabezado ${text} está duplicado en la hoja.`);
      }
      found[semantic] = index;
    }
  });
  const missing = (Object.keys(REQUIRED_HEADERS) as (keyof typeof REQUIRED_HEADERS)[]).filter(
    (key) => found[key] === undefined,
  );
  if (missing.length) {
    throw new Error(
      `No encuentro estas columnas en el archivo: ${missing.map((key) => REQUIRED_HEADERS[key]).join(", ")}. ¿Es el reporte INGRESOS de Doc Digitales?`,
    );
  }
  return { columns: found as Service03HeaderColumns, lastColumn };
}

function amount(cents: number): number {
  return cents / 100;
}

function rowAt(worksheet: Worksheet, rowNumber: number, column: number | undefined): CellValue {
  return column === undefined ? null : worksheet.getCell(rowNumber, column).value;
}

function invoiceActive(row: Service03Row): boolean {
  return row.active;
}

function getRows(worksheet: Worksheet, columns: Service03HeaderColumns): Service03Row[] {
  const rows: Service03Row[] = [];
  const seenUuid = new Set<string>();
  let previousTimestamp = -Infinity;
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const folio = cellText(rowAt(worksheet, rowNumber, columns.folio));
    const rawDate = rowAt(worksheet, rowNumber, columns.fecha);
    const dateText = cellText(rawDate);
    if (!folio && !dateText) continue;
    if (!folio) throw new Error(`Renglón ${rowNumber}: falta Folio.`);
    const { day, timestamp } = parsedDate(rawDate, rowNumber);
    if (timestamp < previousTimestamp) {
      throw new Error(
        `Renglón ${rowNumber}: el archivo no está ordenado por Fecha; ordénalo y vuelve a subirlo.`,
      );
    }
    previousTimestamp = timestamp;
    const uuid = cellText(rowAt(worksheet, rowNumber, columns.uuid)).toUpperCase();
    if (uuid) {
      if (seenUuid.has(uuid)) {
        throw new Error(
          `UUID repetido en renglón ${rowNumber}: este parece un reporte por concepto.`,
        );
      }
      seenUuid.add(uuid);
    }
    const estatus = cellText(rowAt(worksheet, rowNumber, columns.estatus));
    const normalizedStatus = normalize(estatus);
    if (normalizedStatus !== "activo" && normalizedStatus !== "cancelado") {
      throw new Error(`Renglón ${rowNumber}: Estatus debe ser Activo o Cancelado.`);
    }
    const tipo = cellText(rowAt(worksheet, rowNumber, columns.tipo)).toUpperCase() || "INGRESO";
    const subtotalCents = cellCents(
      rowAt(worksheet, rowNumber, columns.subtotal),
      rowNumber,
      "Sub Total",
      true,
    );
    const totalCents = cellCents(
      rowAt(worksheet, rowNumber, columns.total),
      rowNumber,
      "Total",
      true,
    );
    const ivaCents = cellCents(
      rowAt(worksheet, rowNumber, columns.iva),
      rowNumber,
      "Total IVA Tras.",
      true,
    );
    const descuentoCents = cellCents(
      rowAt(worksheet, rowNumber, columns.descuento),
      rowNumber,
      "Descuento",
    );
    const ivaRetenidoCents = cellCents(
      rowAt(worksheet, rowNumber, columns.ivaret),
      rowNumber,
      "Total IVA Ret.",
    );
    const isrRetenidoCents = cellCents(
      rowAt(worksheet, rowNumber, columns.isrret),
      rowNumber,
      "Total ISR Ret.",
    );
    const rawIepsCents =
      columns.ieps === undefined
        ? totalCents -
          (subtotalCents - descuentoCents) -
          ivaCents +
          ivaRetenidoCents +
          isrRetenidoCents
        : cellCents(rowAt(worksheet, rowNumber, columns.ieps), rowNumber, "IEPS");
    const iepsCents = rawIepsCents > 2 ? rawIepsCents : 0;
    const baseCents = subtotalCents - descuentoCents + iepsCents;
    const base0Cents = roundRatio(baseCents * 16 - ivaCents * 100, 16);
    const ivaDifferenceCents = roundRatio(
      (subtotalCents - descuentoCents) * 16 - ivaCents * 100,
      100,
    );
    rows.push({
      rowNumber,
      folio,
      serie: cellText(rowAt(worksheet, rowNumber, columns.serie)),
      uuid,
      day,
      timestamp,
      subtotal: amount(subtotalCents),
      total: amount(totalCents),
      iva: amount(ivaCents),
      descuento: amount(descuentoCents),
      estatus,
      tipo,
      rfc: cellText(rowAt(worksheet, rowNumber, columns.rfc)),
      receptor: cellText(rowAt(worksheet, rowNumber, columns.receptor)),
      ivaRetenido: amount(ivaRetenidoCents),
      isrRetenido: amount(isrRetenidoCents),
      ieps: amount(iepsCents),
      base0: amount(base0Cents),
      ivaDifference: amount(ivaDifferenceCents),
      active: normalizedStatus === "activo" && (tipo === "INGRESO" || tipo === "I"),
    });
  }
  if (!rows.length) throw new Error("El archivo no trae CFDI.");
  return rows;
}

function sumCents(
  rows: Service03Row[],
  field: "subtotal" | "total" | "iva" | "descuento" | "ieps",
): number {
  return rows.reduce((sum, row) => sum + Math.round(row[field] * 100), 0);
}

function buildDays(
  rows: Service03Row[],
  candidates: Service03Candidate[],
  toleranceCents: number,
): { days: Service03Day[]; exactWNumbers: number[] } {
  const days: Service03Day[] = [];
  const exactWNumbers: number[] = [];
  const seenDays = new Set<string>();
  for (let start = 0; start < rows.length;) {
    const first = rows[start];
    if (!first) break;
    let end = start;
    while (end + 1 < rows.length && rows[end + 1]?.day === first.day) end += 1;
    if (seenDays.has(first.day)) {
      throw new Error(`El día ${first.day} aparece en dos partes del archivo. Ordénalo por Fecha.`);
    }
    seenDays.add(first.day);
    const block = rows.slice(start, end + 1);
    const active = block.filter(invoiceActive);
    const s = sumCents(active, "subtotal");
    const t = sumCents(active, "total");
    const u = sumCents(active, "iva");
    const v = sumCents(active, "descuento");
    const ieps = sumCents(active, "ieps");
    const exactW = (s - v) * 16 - u * 100; // 1/100 of a cent
    exactWNumbers.push(exactW);
    const x = candidates
      .filter(
        (candidate) =>
          candidate.confirmed &&
          candidate.fila >= first.rowNumber &&
          candidate.fila <= (rows[end]?.rowNumber ?? 0),
      )
      .reduce((sum, candidate) => sum + Math.round(candidate.base0 * 100), 0);
    const reviewDifference = exactW - (x - ieps) * 16;
    days.push({
      dia: first.day,
      fila_ini: first.rowNumber,
      fila_fin: rows[end]?.rowNumber ?? first.rowNumber,
      n: block.length,
      cancelados: block.filter((row) => normalize(row.estatus) === "cancelado").length,
      S: amount(s),
      T: amount(t),
      U: amount(u),
      V: amount(v),
      IEPS: amount(ieps),
      W: amount(roundRatio(exactW, 100)),
      WExact: exactW / 10_000,
      X: amount(x),
      revision: Math.abs(reviewDifference) <= toleranceCents * 100 ? "OK" : "REVISAR",
    });
    start = end + 1;
  }
  return { days, exactWNumbers };
}

function missingFolios(rows: Service03Row[]): string[] {
  const bySeries = new Map<string, Set<number>>();
  for (const row of rows) {
    if (!/^\d+$/.test(row.folio)) continue;
    const number = Number(row.folio);
    if (!Number.isSafeInteger(number)) continue;
    const set = bySeries.get(row.serie) ?? new Set<number>();
    set.add(number);
    bySeries.set(row.serie, set);
  }
  const missing: string[] = [];
  for (const [series, numbers] of bySeries) {
    if (!numbers.size) continue;
    const ordered = [...numbers].sort((a, b) => a - b);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (first === undefined || last === undefined || last - first >= 5000) continue;
    for (let folio = first; folio <= last; folio += 1) {
      if (!numbers.has(folio)) missing.push(`${series ? `${series}-` : ""}${folio}`);
    }
  }
  return missing;
}

function buildFindings(
  candidates: Service03Candidate[],
  ieps: Service03Analysis["ieps"],
  canceled: Service03Canceled[],
  missing: string[],
  days: Service03Day[],
  warnings: string[],
  siigo: Service03Analysis["cotejo_siigo"],
): Service03Finding[] {
  const findings: Service03Finding[] = [];
  for (const candidate of candidates) {
    findings.push({
      code: candidate.confirmed ? "CONFIRMED_ZERO_RATE" : "UNCONFIRMED_ZERO_RATE",
      message: candidate.confirmed
        ? `Folio ${candidate.folio}: base sin IVA confirmada por el contador.`
        : `Folio ${candidate.folio}: parte sin IVA por confirmar con el contador.`,
      day: candidate.dia,
      rowNumber: candidate.fila,
      folio: candidate.folio,
      amount: candidate.base0,
      requiresHumanReview: !candidate.confirmed,
    });
  }
  for (const invoice of ieps) {
    findings.push({
      code: "IEPS_PRESENT",
      message: `Folio ${invoice.folio}: IEPS detectado en la base del IVA.`,
      day: invoice.dia,
      rowNumber: invoice.fila,
      folio: invoice.folio,
      amount: invoice.ieps,
      requiresHumanReview: true,
    });
  }
  for (const invoice of canceled) {
    findings.push({
      code: "CANCELED_INVOICE",
      message: `Folio ${invoice.folio}: CFDI cancelado${invoice.sustituto ? `; posible sustituto ${invoice.sustituto}` : ""}.`,
      day: invoice.dia,
      rowNumber: invoice.fila,
      folio: invoice.folio,
      requiresHumanReview: !invoice.sustituto,
    });
  }
  for (const folio of missing) {
    findings.push({
      code: "MISSING_FOLIO",
      message: `Folio ${folio} no aparece en el archivo; confirmar la causa.`,
      folio,
      requiresHumanReview: true,
    });
  }
  for (const day of days.filter((item) => item.revision === "REVISAR")) {
    findings.push({
      code: "DAY_REVIEW",
      message: `Día ${day.dia}: diferencia de IVA no explicada con la tolerancia indicada.`,
      day: day.dia,
      rowNumber: day.fila_fin,
      amount: day.W,
      requiresHumanReview: true,
    });
  }
  for (const warning of warnings) {
    findings.push({ code: "MULTIPLE_MONTHS", message: warning, requiresHumanReview: true });
  }
  if (
    siigo &&
    ((siigo.diferencia_base16 !== null && siigo.diferencia_base16 !== 0) ||
      (siigo.diferencia_base0 !== null && siigo.diferencia_base0 !== 0))
  ) {
    findings.push({
      code: "SIIGO_DIFFERENCE",
      message: "Las bases de CFDI difieren de las capturadas para SIIGO.",
      requiresHumanReview: true,
    });
  }
  return findings;
}

/**
 * Analyzes one Doc Digitales INGRESOS workbook without changing any source cell.
 * Financial values are first represented in integer cents. Daily W is retained
 * at 1/100 cent precision until the monthly sum has been calculated (R17).
 */
export function analyzeIssuedInvoices(
  workbook: Workbook,
  options: Service03Options = {},
): Service03Analysis {
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("El archivo no contiene hojas de cálculo.");
  const tolerance = options.tolerance ?? 1;
  if (
    !Number.isFinite(tolerance) ||
    tolerance < 0 ||
    Math.round(tolerance * 100) / 100 !== tolerance
  ) {
    throw new Error("La tolerancia debe ser un importe no negativo con hasta dos decimales.");
  }
  const resolved: ResolvedService03Options = {
    clientLabel: options.clientLabel?.trim() ?? "",
    tolerance,
    confirmedZeroRateFolios: [...new Set(options.confirmedZeroRateFolios ?? [])].map(String),
    confirmedZeroRateRows: [...new Set(options.confirmedZeroRateRows ?? [])],
    siigoBase16: options.siigoBase16 ?? null,
    siigoBase0: options.siigoBase0 ?? null,
  };
  if (resolved.confirmedZeroRateRows.some((row) => !Number.isSafeInteger(row) || row < 2)) {
    throw new Error("Los renglones confirmados deben ser números enteros válidos del archivo.");
  }
  for (const [label, value] of [
    ["SIIGO al 16%", resolved.siigoBase16],
    ["SIIGO al 0%", resolved.siigoBase0],
  ] as const) {
    if (value !== null && (!Number.isFinite(value) || Math.round(value * 100) / 100 !== value)) {
      throw new Error(`${label} debe ser un importe con hasta dos decimales.`);
    }
  }
  const { columns: headerColumns, lastColumn } = getHeaderColumns(worksheet);
  const rows = getRows(worksheet, headerColumns);
  const toleranceCents = Math.round(tolerance * 100);
  const confirmedFolios = new Set(resolved.confirmedZeroRateFolios);
  const confirmedRows = new Set(resolved.confirmedZeroRateRows);
  const candidates: Service03Candidate[] = rows
    .filter((row) => {
      if (!row.active) return false;
      const baseCents =
        Math.round(row.subtotal * 100) -
        Math.round(row.descuento * 100) +
        Math.round(row.ieps * 100);
      const ivaCents = Math.round(row.iva * 100);
      return baseCents * 16 - ivaCents * 100 > toleranceCents * 100;
    })
    .map((row) => ({
      fila: row.rowNumber,
      folio: row.folio,
      dia: row.day,
      subtotal: row.subtotal,
      iva: row.iva,
      ieps: row.ieps,
      base0: row.base0,
      mixto: row.iva > 0,
      confirmed: confirmedFolios.has(row.folio) || confirmedRows.has(row.rowNumber),
    }));
  const candidateCounts = new Map<string, number>();
  for (const candidate of candidates) {
    candidateCounts.set(candidate.folio, (candidateCounts.get(candidate.folio) ?? 0) + 1);
  }
  const unknownFolios = [...confirmedFolios].filter((folio) => !candidateCounts.has(folio));
  if (unknownFolios.length) {
    throw new Error(
      `Estos folios confirmados no son candidatos a tasa 0%: ${unknownFolios.join(", ")}.`,
    );
  }
  const ambiguousFolios = [...confirmedFolios].filter(
    (folio) => (candidateCounts.get(folio) ?? 0) > 1,
  );
  if (ambiguousFolios.length) {
    throw new Error(
      `Estos folios aparecen en más de un renglón candidato: ${ambiguousFolios.join(", ")}. Confirma por renglón.`,
    );
  }
  const candidateRows = new Set(candidates.map((candidate) => candidate.fila));
  const unknownRows = [...confirmedRows].filter((row) => !candidateRows.has(row));
  if (unknownRows.length) {
    throw new Error(
      `Estos renglones confirmados no son candidatos a tasa 0%: ${unknownRows.join(", ")}.`,
    );
  }
  const { days, exactWNumbers } = buildDays(rows, candidates, toleranceCents);
  const ieps = rows
    .filter((row) => row.active && row.ieps > 0)
    .map((row) => ({ fila: row.rowNumber, folio: row.folio, dia: row.day, ieps: row.ieps }));
  const differenceInvoices: Service03InvoiceDifference[] = rows
    .filter((row) => {
      if (!row.active) return false;
      const subCents = Math.round(row.subtotal * 100);
      const discountCents = Math.round(row.descuento * 100);
      const ivaCents = Math.round(row.iva * 100);
      const diffScaled = (subCents - discountCents) * 16 - ivaCents * 100;
      return Math.abs(diffScaled) > 500 || row.ieps > 0;
    })
    .map((row) => {
      const zeroRateRelevant = row.base0 * 0.16 > 0.05;
      const confirmedCandidate = candidates.some(
        (candidate) => candidate.fila === row.rowNumber && candidate.confirmed,
      );
      const explanations: string[] = [];
      if (row.ieps > 0) {
        explanations.push(
          "Contiene IEPS en la base del IVA: el IVA se calculó sobre subtotal + IEPS",
        );
      }
      if (zeroRateRelevant) {
        explanations.push(
          confirmedCandidate
            ? "Parte a tasa 0% confirmada"
            : "Parte sin IVA: confirmar si es bomba (tasa 0%)",
        );
      }
      if (!explanations.length) explanations.push("Diferencia de redondeo");
      return {
        fila: row.rowNumber,
        folio: row.folio,
        dia: row.day,
        receptor: row.receptor,
        subtotal: row.subtotal,
        iva: row.iva,
        dif: row.ivaDifference,
        ieps: row.ieps,
        base0: Math.max(0, row.base0),
        explicacion: explanations.join(". "),
      };
    });
  const canceled: Service03Canceled[] = rows
    .filter((row) => normalize(row.estatus) === "cancelado")
    .map((row) => {
      const substitute = rows.find(
        (candidate) =>
          candidate.active &&
          candidate.timestamp >= row.timestamp &&
          candidate.rfc === row.rfc &&
          Math.abs(Math.round(candidate.total * 100) - Math.round(row.total * 100)) <= 1,
      );
      return {
        fila: row.rowNumber,
        folio: row.folio,
        dia: row.day,
        receptor: row.receptor,
        subtotal: row.subtotal,
        iva: row.iva,
        total: row.total,
        sustituto: substitute?.folio ?? null,
        sustituto_dia: substitute?.day ?? null,
      };
    });
  const folios_faltantes = missingFolios(rows);
  const monthKeys = [...new Set(days.map((day) => day.dia.slice(0, 7)))];
  const warnings =
    monthKeys.length > 1 ? [`El archivo trae más de un mes: ${monthKeys.join(", ")}.`] : [];
  const firstDay = days[0]?.dia;
  const lastDay = days[days.length - 1]?.dia;
  if (!firstDay || !lastDay) throw new Error("El archivo no trae días con CFDI.");
  const sCents = days.reduce((sum, day) => sum + Math.round(day.S * 100), 0);
  const tCents = days.reduce((sum, day) => sum + Math.round(day.T * 100), 0);
  const uCents = days.reduce((sum, day) => sum + Math.round(day.U * 100), 0);
  const vCents = days.reduce((sum, day) => sum + Math.round(day.V * 100), 0);
  const iepsCents = days.reduce((sum, day) => sum + Math.round(day.IEPS * 100), 0);
  const xCents = days.reduce((sum, day) => sum + Math.round(day.X * 100), 0);
  const wCents = roundRatio(
    exactWNumbers.reduce((sum, day) => sum + day, 0),
    100,
  );
  const explainedCents = roundRatio((xCents - iepsCents) * 16, 100);
  const unexplainedCents = roundRatio(wCents * 100 - (xCents - iepsCents) * 16, 100);
  const totals: Service03Totals = {
    cfdi: rows.length,
    activos: rows.filter(invoiceActive).length,
    cancelados: canceled.length,
    dias: days.length,
    S: amount(sCents),
    T: amount(tCents),
    U: amount(uCents),
    V: amount(vCents),
    W: amount(wCents),
    X: amount(xCents),
    IEPS: amount(iepsCents),
    iva_explicado: amount(explainedCents),
    no_explicada: amount(unexplainedCents),
    dias_revisar: days.filter((day) => day.revision === "REVISAR").length,
    dias_con_W_mayor_tol: days
      .filter((_, index) => Math.abs(exactWNumbers[index] ?? 0) > toleranceCents * 100)
      .map((day) => day.dia),
    base16: amount(sCents - vCents - xCents),
  };
  const controlSubtotal = amount(sumCents(rows.filter(invoiceActive), "subtotal") - sCents);
  const siigo =
    resolved.siigoBase16 !== null || resolved.siigoBase0 !== null
      ? {
          base16_siigo: resolved.siigoBase16,
          base16_cfdi_motor: totals.base16,
          diferencia_base16:
            resolved.siigoBase16 === null
              ? null
              : amount(Math.round((totals.base16 - resolved.siigoBase16) * 100)),
          base0_siigo: resolved.siigoBase0,
          base0_cfdi_motor: totals.X,
          diferencia_base0:
            resolved.siigoBase0 === null
              ? null
              : amount(Math.round((totals.X - resolved.siigoBase0) * 100)),
        }
      : null;
  const outputMonth = lastDay.slice(5, 7);
  const outputDay = lastDay.slice(8, 10);
  const prefix = resolved.clientLabel
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ]+/g, "_")
    .replace(/^_|_$/g, "");
  return {
    workbook,
    worksheet,
    headerColumns,
    rows,
    dias: days,
    candidatos_sin_iva: candidates,
    cfdi_sin_iva_activos: candidates,
    cfdi_con_diferencia: differenceInvoices,
    ieps,
    cfdi_con_ieps: ieps,
    cancelados: canceled,
    folios_faltantes,
    marcados_tasa0: candidates
      .filter((candidate) => candidate.confirmed)
      .map((candidate) => candidate.folio)
      .sort(),
    totales: totals,
    controlSubtotal,
    resumen: { X: totals.X, noExplicada: totals.no_explicada, revisar: totals.dias_revisar },
    cotejo_siigo: siigo,
    columna_resultados_inicia: Math.max(lastColumn + 1, 19),
    ultima_columna_original: lastColumn,
    findings: buildFindings(candidates, ieps, canceled, folios_faltantes, days, warnings, siigo),
    warnings,
    options: resolved,
    outputFilename: `${prefix ? `${prefix}_` : ""}INGRESOS_${outputMonth}_${outputDay}.xlsx`,
    sheetName: `INGR_${outputMonth}`,
    period: { from: firstDay, to: lastDay, month: outputMonth, year: lastDay.slice(0, 4) },
  };
}
