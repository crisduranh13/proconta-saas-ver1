import type { CellValue, Workbook } from "exceljs";
import type { CfdiFile, CfdiRecord, RepRecord } from "./types";

/*
 * Lector del reporte de CFDI recibidos de Doc Digitales: una hoja con dos tablas.
 * Primero los CFDI (encabezado "Serie, Folio, Tipo de Comprobante, …"); después, desde el
 * renglón cuya columna A dice "Folio", los complementos de pago (REP) con sus propios encabezados.
 */

type Plain = string | number | Date | null;

function plain(value: CellValue | undefined): Plain {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return plain(value.result as CellValue);
    if ("text" in value) return String(value.text);
    return null;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function text(value: Plain): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function normalize(value: Plain): string {
  return text(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function number(value: Plain): number {
  if (value === null || value === "") return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return 0;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(value: Plain): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }
  const raw = text(value);
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return "";
}

/** Forma de pago SAT a dos dígitos: 3 → "03", "28" → "28", "" → "". */
export function formaPago(value: Plain): string {
  const raw = text(value);
  if (!raw) return "";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? String(Math.trunc(parsed)).padStart(2, "0") : raw;
}

type Columns = Map<string, number>;

function headerColumns(values: Plain[]): Columns {
  const columns: Columns = new Map();
  values.forEach((value, index) => {
    const key = normalize(value);
    if (key && !columns.has(key)) columns.set(key, index + 1);
  });
  return columns;
}

function pick(columns: Columns, ...names: string[]): number | undefined {
  for (const name of names) {
    const column = columns.get(name);
    if (column) return column;
  }
  for (const name of names) {
    for (const [key, column] of columns) if (key.startsWith(name)) return column;
  }
  return undefined;
}

export function readCfdiWorkbook(workbook: Workbook, fileName: string): CfdiFile {
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`${fileName}: el archivo no tiene hojas.`);
  const rowValues = (rowNumber: number): Plain[] => {
    const row = sheet.getRow(rowNumber);
    const values: Plain[] = [];
    for (let column = 1; column <= Math.max(row.cellCount, 1); column++) {
      values.push(plain(row.getCell(column).value));
    }
    return values;
  };

  let headerRow = 0;
  let columns: Columns = new Map();
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 10); rowNumber++) {
    const candidate = headerColumns(rowValues(rowNumber));
    if (candidate.has("tipo de comprobante") && candidate.has("total")) {
      headerRow = rowNumber;
      columns = candidate;
      break;
    }
  }
  if (!headerRow) {
    throw new Error(
      `${fileName}: no se encontró el encabezado de CFDI (Serie, Folio, Tipo de Comprobante, Total…). ¿Es el reporte de Doc Digitales?`,
    );
  }
  const col = {
    serie: pick(columns, "serie"),
    folio: pick(columns, "folio"),
    tipo: pick(columns, "tipo de comprobante"),
    // En el reporte de emitidos la contraparte es el receptor.
    rfc: pick(columns, "r.f.c. emisor", "rfc emisor", "r.f.c. receptor", "rfc receptor"),
    emisor: pick(columns, "razon social emisor", "razon social receptor"),
    fecha: pick(columns, "fecha"),
    uuid: pick(columns, "uuid"),
    subtotal: pick(columns, "sub total", "subtotal"),
    descuento: pick(columns, "descuento"),
    total: pick(columns, "total"),
    iva: pick(columns, "total iva tras."),
    metodo: pick(columns, "metodo de pago"),
    forma: pick(columns, "forma de pago"),
    estatus: pick(columns, "estatus"),
    uso: pick(columns, "uso cfdi receptor", "uso cfdi"),
  };
  const required: [keyof typeof col, string][] = [
    ["rfc", "R.F.C. Emisor (o Receptor)"],
    ["fecha", "Fecha"],
    ["total", "Total"],
    ["estatus", "Estatus"],
    ["metodo", "Método de Pago"],
    ["forma", "Forma de Pago"],
  ];
  const missing = required.filter(([key]) => !col[key]).map(([, label]) => label);
  if (missing.length) {
    throw new Error(`${fileName}: faltan columnas en el reporte de CFDI: ${missing.join(", ")}.`);
  }

  const cfdi: CfdiRecord[] = [];
  const rep: RepRecord[] = [];
  let repColumns: Columns | null = null;
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const values = rowValues(rowNumber);
    const at = (column: number | undefined) => (column ? (values[column - 1] ?? null) : null);
    if (!repColumns) {
      if (text(values[0] ?? null) === "Folio") {
        repColumns = headerColumns(values);
        continue;
      }
      const tipo = text(at(col.tipo)).toUpperCase();
      if (!tipo || !["INGRESO", "EGRESO"].includes(tipo)) continue;
      const serie = text(at(col.serie));
      const folio = text(at(col.folio));
      cfdi.push({
        id: cfdi.length,
        serie,
        folio,
        serieFolio: `${serie}-${folio}`.replace(/^-|-$/g, ""),
        tipo,
        rfc: text(at(col.rfc)).toUpperCase(),
        emisor: text(at(col.emisor)),
        date: isoDate(at(col.fecha)),
        uuid: text(at(col.uuid)),
        subtotal: number(at(col.subtotal)),
        descuento: number(at(col.descuento)),
        total: number(at(col.total)),
        iva: number(at(col.iva)),
        metodo: text(at(col.metodo)).toUpperCase(),
        forma: formaPago(at(col.forma)),
        estatus: text(at(col.estatus)),
        uso: text(at(col.uso)),
      });
    } else {
      const uuidColumn = pick(repColumns, "uuid");
      const uuid = text(at(uuidColumn));
      if (!uuid) continue;
      rep.push({
        folio: text(at(pick(repColumns, "folio"))),
        rfc: text(
          at(pick(repColumns, "r.f.c. emisor", "rfc emisor", "r.f.c. receptor", "rfc receptor")),
        ).toUpperCase(),
        emisor: text(at(pick(repColumns, "razon social emisor", "razon social receptor"))),
        date: isoDate(at(pick(repColumns, "fecha"))),
        uuid,
        monto: number(at(pick(repColumns, "pago monto", "monto"))),
        estatus: text(at(pick(repColumns, "estatus"))),
      });
    }
  }
  if (!cfdi.length) throw new Error(`${fileName}: el reporte no trae CFDI de ingreso o egreso.`);
  return { fileName, cfdi, rep };
}
