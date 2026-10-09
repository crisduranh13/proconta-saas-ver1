import type { CellValue, Workbook, Worksheet } from "exceljs";
import type { BankCheck, BankMovement, BankStatement } from "./types";

/*
 * Lector de los reportes de movimientos de BBVA en XLSX (banca en línea): cuentas de
 * cheques (FECHA, DESCRIPCIÓN, ABONO, CARGO, SALDO) y tarjeta de crédito (FECHA,
 * DESCRIPCIÓN, MONTO). No traen totales del documento; se valida el saldo corrido.
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
  return String(value)
    .replace(/_x0000_/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value: Plain): string {
  return text(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

function parseDate(value: Plain): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    if (value < 20_000 || value > 80_000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }
  const raw = text(value);
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return null;
}

function money(value: Plain): number {
  if (value === null || value === "") return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return 0;
  const number = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

interface Layout {
  headerRow: number;
  date: number;
  description: number;
  abono: number | null;
  cargo: number | null;
  monto: number | null;
  saldo: number | null;
}

function findLayout(sheet: Worksheet): Layout | null {
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 30); rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const columns: Partial<
      Record<"date" | "description" | "abono" | "cargo" | "monto" | "saldo", number>
    > = {};
    for (let column = 1; column <= Math.max(row.cellCount, 1); column++) {
      const header = normalizeHeader(plain(row.getCell(column).value));
      if (header === "FECHA") columns.date ??= column;
      else if (header === "DESCRIPCION") columns.description ??= column;
      else if (header === "ABONO" || header === "ABONOS") columns.abono ??= column;
      else if (header === "CARGO" || header === "CARGOS") columns.cargo ??= column;
      else if (header === "MONTO" || header === "IMPORTE") columns.monto ??= column;
      else if (header === "SALDO") columns.saldo ??= column;
    }
    if (columns.date && columns.description && (columns.cargo || columns.monto)) {
      return {
        headerRow: rowNumber,
        date: columns.date,
        description: columns.description,
        abono: columns.abono ?? null,
        cargo: columns.cargo ?? null,
        monto: columns.monto ?? null,
        saldo: columns.saldo ?? null,
      };
    }
  }
  return null;
}

function accountLabel(
  sheet: Worksheet,
  fileName: string,
  isCard: boolean,
): {
  account: string;
  holder: string;
} {
  let digits = "";
  let holder = "";
  for (let rowNumber = 1; rowNumber <= 3; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    for (let column = 1; column <= Math.max(row.cellCount, 1); column++) {
      const value = text(plain(row.getCell(column).value));
      if (!value) continue;
      const match = /(?:Cuenta|Tarjeta)[^0-9]*(\d{4,})/i.exec(value);
      if (match && !digits) digits = match[1]!;
      else if (!/cuenta|tarjeta|detalle|saldo|mes actual/i.test(value) && !holder) holder = value;
    }
  }
  const name = fileName.toLowerCase();
  const kind = isCard
    ? "TDC"
    : /pyme/.test(name)
      ? "PYME"
      : /personal/.test(name)
        ? "PERSONAL"
        : "CUENTA";
  return { account: `${kind} ${digits}`.trim(), holder };
}

export function readBbvaXlsx(workbook: Workbook, fileName: string): BankStatement {
  const found = workbook.worksheets
    .map((sheet) => ({ sheet, layout: findLayout(sheet) }))
    .find((entry) => entry.layout !== null);
  if (!found?.layout) {
    throw new Error(
      `${fileName}: no se encontraron las columnas FECHA, DESCRIPCIÓN y CARGO/MONTO del reporte BBVA.`,
    );
  }
  const { sheet, layout } = found;
  const isCard = layout.monto !== null && layout.cargo === null;
  const { account, holder } = accountLabel(sheet, fileName, isCard);
  const movements: BankMovement[] = [];
  const saldos: (number | null)[] = [];
  for (let rowNumber = layout.headerRow + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const date = parseDate(plain(row.getCell(layout.date).value));
    const description = text(plain(row.getCell(layout.description).value));
    if (!date || !description) continue;
    let cargo = 0;
    let abono = 0;
    if (isCard) {
      const monto = money(plain(row.getCell(layout.monto!).value));
      if (monto > 0) cargo = monto;
      else abono = -monto;
    } else {
      cargo = Math.abs(money(plain(row.getCell(layout.cargo!).value)));
      abono = layout.abono ? Math.abs(money(plain(row.getCell(layout.abono).value))) : 0;
    }
    const saldoValue = layout.saldo ? plain(row.getCell(layout.saldo).value) : null;
    const saldo = saldoValue === null || saldoValue === "" ? null : money(saldoValue);
    saldos.push(saldo);
    movements.push({
      id: movements.length,
      account,
      page: null,
      operDate: date,
      liqDate: date,
      description,
      detail: "",
      cargo: round2(cargo),
      abono: round2(abono),
      saldo,
    });
  }
  if (!movements.length) throw new Error(`${fileName}: el reporte no trae movimientos.`);

  // Validación: el saldo corrido debe ser consistente renglón a renglón (el reporte viene
  // del más reciente al más antiguo o al revés; se aceptan ambos órdenes).
  let chainOk = true;
  let chainChecked = 0;
  if (!isCard && layout.saldo) {
    const descending = descendingOrder(movements);
    for (let index = 0; index + 1 < movements.length; index++) {
      const current = movements[index]!;
      const next = movements[index + 1]!;
      if (current.saldo === null || next.saldo === null) continue;
      chainChecked++;
      const expected = descending
        ? round2(next.saldo + current.abono - current.cargo)
        : round2(current.saldo + next.abono - next.cargo);
      const actual = descending ? current.saldo : next.saldo;
      if (Math.abs(expected - actual) > 0.01) chainOk = false;
    }
  }
  const cargos = movements.filter((m) => m.cargo > 0);
  const abonos = movements.filter((m) => m.abono > 0);
  const checks: BankCheck[] = [
    {
      label: "Número de cargos (salidas)",
      read: cargos.length,
      document: null,
      ok: true,
      kind: "count",
    },
    {
      label: "Importe total de cargos",
      read: round2(cargos.reduce((sum, m) => sum + m.cargo, 0)),
      document: null,
      ok: true,
      kind: "money",
    },
    { label: "Número de abonos", read: abonos.length, document: null, ok: true, kind: "count" },
    {
      label: "Importe total de abonos",
      read: round2(abonos.reduce((sum, m) => sum + m.abono, 0)),
      document: null,
      ok: true,
      kind: "money",
    },
    {
      label: isCard ? "Saldo corrido (la TDC no lo trae)" : "Saldo corrido consistente",
      read: chainChecked,
      document: chainChecked,
      ok: chainOk,
      kind: "count",
    },
  ];
  if (!chainOk) {
    throw new Error(
      `${fileName}: el saldo corrido del reporte no es consistente entre renglones. Revisa que el archivo esté completo. No se procesa.`,
    );
  }
  const dates = movements.map((m) => m.operDate).sort();
  const last = dates.at(-1)!;
  const sorted = descendingOrder(movements) ? [...movements].reverse() : movements;
  sorted.forEach((movement, index) => {
    movement.id = index;
  });
  return {
    kind: isCard ? "bbva-tdc" : "bbva-xlsx",
    fileName,
    account,
    holder,
    rfc: "",
    periodFrom: `${last.slice(0, 7)}-01`,
    periodTo: last,
    openingBalance: null,
    closingBalance: null,
    movements: sorted,
    checks,
  };
}

/** El reporte viene del más reciente al más antiguo (puede traer un renglón fuera de orden por fecha de aplicación). */
function descendingOrder(movements: BankMovement[]): boolean {
  const first = movements[0]?.operDate ?? "";
  const last = movements.at(-1)?.operDate ?? "";
  return first >= last;
}
