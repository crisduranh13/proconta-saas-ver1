import type { PdfWord } from "./pdf-text";
import type { BankCheck, BankMovement, BankStatement } from "./types";

/*
 * Lector del estado de cuenta BBVA en PDF. Las columnas se ubican con el encabezado de
 * cada página (OPER, LIQ, DESCRIPCIÓN, CARGOS, ABONOS, OPERACIÓN) porque cambian de
 * posición entre páginas. Un movimiento ocupa varios renglones: el primero trae las dos
 * fechas y el importe; los siguientes son referencia, beneficiario y CLABE.
 */

const DATE = /^\d{2}\/[A-ZÁ]{3}$/;
const AMOUNT = /^[\d,]+\.\d{2}$/;
const MONTHS: Record<string, string> = {
  ENE: "01",
  FEB: "02",
  MAR: "03",
  ABR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AGO: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DIC: "12",
};
const HEADER_WORDS = new Set([
  "OPER",
  "LIQ",
  "DESCRIPCIÓN",
  "REFERENCIA",
  "CARGOS",
  "ABONOS",
  "OPERACIÓN",
]);
const STOP_WORDS = new Set(["Total", "Cuadro", "Glosario", "Nombre"]);
const FOOTER = /BBVA MEXICO, S\.A\.|Av\. Paseo de la Reforma/;

type Column = "oper" | "liq" | "desc" | "cargo" | "abono" | "sal1" | "sal2";

interface Line {
  y: number;
  words: PdfWord[];
  text: string;
}

function toLines(words: PdfWord[]): Line[] {
  const lines: Line[] = [];
  for (const word of [...words].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((entry) => Math.abs(entry.y - word.y) <= 1.5);
    if (line) line.words.push(word);
    else lines.push({ y: word.y, words: [word], text: "" });
  }
  for (const line of lines) {
    line.words.sort((a, b) => a.x - b.x);
    line.text = line.words.map((word) => word.text).join(" ");
  }
  return lines;
}

function amount(text: string): number {
  return Number(text.replace(/,/g, ""));
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isoDate(dmy: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

interface Summary {
  periodFrom: string | null;
  periodTo: string | null;
  rfc: string;
  holder: string;
  account: string;
  opening: number | null;
  closing: number | null;
  cargosN: number | null;
  cargosImporte: number | null;
  abonosN: number | null;
  abonosImporte: number | null;
}

function readSummary(pages: PdfWord[][]): Summary {
  const summary: Summary = {
    periodFrom: null,
    periodTo: null,
    rfc: "",
    holder: "",
    account: "",
    opening: null,
    closing: null,
    cargosN: null,
    cargosImporte: null,
    abonosN: null,
    abonosImporte: null,
  };
  const first = pages[0] ?? [];
  const lines = toLines(first);
  let clientLineY: number | null = null;
  let rfcLineY: number | null = null;
  for (const line of lines) {
    const text = line.text;
    let match = /DEL (\d{2}\/\d{2}\/\d{4}) AL (\d{2}\/\d{2}\/\d{4})/.exec(text);
    if (match) {
      summary.periodFrom = isoDate(match[1]!);
      summary.periodTo = isoDate(match[2]!);
    }
    match = /R\.F\.C\.?\s+([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/.exec(text);
    if (match && !summary.rfc) {
      summary.rfc = match[1]!;
      rfcLineY = line.y;
    }
    match = /No\. de Cuenta\s+(\d+)/.exec(text);
    if (match) summary.account = match[1]!;
    if (/No\. de Cliente/.test(text)) clientLineY = line.y;
    match = /Saldo Anterior\s+([\d,]+\.\d{2})/.exec(text);
    if (match) summary.opening = amount(match[1]!);
    match = /Saldo Final \(\+\)\s+([\d,]+\.\d{2})/.exec(text);
    if (match) summary.closing = amount(match[1]!);
    match = /Retiros \/ Cargos \(-\)\s+(\d+)\s+([\d,]+\.\d{2})/.exec(text);
    if (match) {
      summary.cargosN = Number(match[1]);
      summary.cargosImporte = amount(match[2]!);
    }
    match = /Abonos \(\+\)\s+(\d+)\s+([\d,]+\.\d{2})/.exec(text);
    if (match) {
      summary.abonosN = Number(match[1]);
      summary.abonosImporte = amount(match[2]!);
    }
  }
  if (clientLineY !== null && rfcLineY !== null) {
    const holderLine = lines.find(
      (line) =>
        line.y < clientLineY! && line.y > rfcLineY! && line.words.every((word) => word.x < 200),
    );
    summary.holder = holderLine?.text ?? "";
  }
  return summary;
}

/** Totales que el propio documento declara en su página de "Total de Movimientos". */
function readTotalsPage(pages: PdfWord[][]): Partial<Summary> {
  const result: Partial<Summary> = {};
  for (const page of pages) {
    for (const line of toLines(page)) {
      let match = /TOTAL IMPORTE CARGOS\s+([\d,]+\.\d{2})/.exec(line.text);
      if (match) result.cargosImporte = amount(match[1]!);
      match = /TOTAL MOVIMIENTOS CARGOS\s+(\d+)/.exec(line.text);
      if (match) result.cargosN = Number(match[1]);
      match = /TOTAL IMPORTE ABONOS\s+([\d,]+\.\d{2})/.exec(line.text);
      if (match) result.abonosImporte = amount(match[1]!);
      match = /TOTAL MOVIMIENTOS ABONOS\s+(\d+)/.exec(line.text);
      if (match) result.abonosN = Number(match[1]);
    }
  }
  return result;
}

function movementDate(dayMonth: string, summary: Summary): string {
  const [day, month] = dayMonth.split("/");
  const mm = MONTHS[month ?? ""] ?? "01";
  const fromYear = summary.periodFrom?.slice(0, 4);
  const toYear = summary.periodTo?.slice(0, 4);
  const fromMonth = summary.periodFrom?.slice(5, 7) ?? "01";
  let year = toYear ?? fromYear ?? String(new Date().getUTCFullYear());
  if (fromYear && toYear && fromYear !== toYear && mm >= fromMonth) year = fromYear;
  return `${year}-${mm}-${day}`;
}

export function readBbvaPdf(pages: PdfWord[][], fileName: string): BankStatement {
  const summary = readSummary(pages);
  const totalsPage = readTotalsPage(pages);
  const cargosN = summary.cargosN ?? totalsPage.cargosN ?? null;
  const cargosImporte = summary.cargosImporte ?? totalsPage.cargosImporte ?? null;
  const abonosN = summary.abonosN ?? totalsPage.abonosN ?? null;
  const abonosImporte = summary.abonosImporte ?? totalsPage.abonosImporte ?? null;
  if (!summary.periodFrom || !summary.periodTo) {
    throw new Error(
      `${fileName}: no se encontró el periodo del estado de cuenta (DEL dd/mm/aaaa AL dd/mm/aaaa). ¿Es un estado de cuenta BBVA?`,
    );
  }

  interface Draft {
    page: number;
    oper: string;
    liq: string;
    desc: string;
    cargo: number;
    abono: number;
    saldo: number;
    extra: string[];
  }
  const drafts: Draft[] = [];
  pages.forEach((words, index) => {
    const header = new Map<string, PdfWord>();
    for (const word of words) {
      if (HEADER_WORDS.has(word.text) && !header.has(word.text)) header.set(word.text, word);
    }
    const desc = header.get("DESCRIPCIÓN");
    const cargos = header.get("CARGOS");
    const liq = header.get("LIQ");
    const abonos = header.get("ABONOS");
    const oper = header.get("OPERACIÓN");
    if (!desc || !cargos || !liq || !abonos || !oper) return;
    const top = desc.y;
    const limLiq = liq.x - 4;
    const limDesc = desc.x - 4;
    const limCargo = cargos.x1 + 6;
    const limAbono = abonos.x1 + 6;
    const limOper = oper.x1 + 6;
    const column = (x: number): Column => {
      if (x < limLiq) return "oper";
      if (x < limDesc - 1) return "liq";
      if (x < limCargo - 62) return "desc";
      if (x < limCargo) return "cargo";
      if (x < limAbono) return "abono";
      if (x < limOper) return "sal1";
      return "sal2";
    };
    const stops = words
      .filter((word) => STOP_WORDS.has(word.text) && word.y < top)
      .map((word) => word.y);
    const floor = stops.length ? Math.max(...stops) + 2 : Number.NEGATIVE_INFINITY;
    const body = toLines(words.filter((word) => word.y < top - 6 && word.y > floor)).filter(
      (line) => !FOOTER.test(line.text),
    );
    let current: Draft | null = null;
    for (const line of body) {
      const segment = line.words;
      const first = segment[0];
      const second = segment[1];
      if (first && second && DATE.test(first.text) && first.x < limLiq && DATE.test(second.text)) {
        const cells: Partial<Record<Column, string[]>> = {};
        for (const word of segment) {
          (cells[column(word.x)] ??= []).push(word.text);
        }
        // El importe puede quedar pegado a la descripción si la columna está desplazada.
        const descCells = cells.desc ?? [];
        if (!cells.cargo && !cells.abono && descCells.length && AMOUNT.test(descCells.at(-1)!)) {
          cells.cargo = [descCells.pop()!];
        }
        const number = (key: Column) => {
          const value = cells[key]?.[0];
          return value && AMOUNT.test(value) ? amount(value) : 0;
        };
        const operText = cells.oper?.[0] ?? first.text;
        current = {
          page: index + 1,
          oper: operText,
          liq: cells.liq?.[0] ?? operText,
          desc: descCells.join(" "),
          cargo: number("cargo"),
          abono: number("abono"),
          saldo: number("sal1") || number("sal2"),
          extra: [],
        };
        drafts.push(current);
      } else if (current) {
        const text = line.text.trim();
        if (text) current.extra.push(text);
      }
    }
  });

  if (!drafts.length) {
    throw new Error(`${fileName}: no se encontró el detalle de movimientos en el PDF.`);
  }

  const movements: BankMovement[] = drafts.map((draft, index) => ({
    id: index,
    account: `BBVA ${summary.account || "cuenta"}`,
    page: draft.page,
    operDate: movementDate(draft.oper, summary),
    liqDate: movementDate(draft.liq, summary),
    description: draft.desc,
    detail: draft.extra.join(" "),
    cargo: draft.cargo,
    abono: draft.abono,
    saldo: draft.saldo || null,
  }));

  // Regla 1 · validar la extracción contra lo que dice el documento.
  const readCargos = movements.filter((movement) => movement.cargo > 0);
  const readAbonos = movements.filter((movement) => movement.abono > 0);
  const readCargosImporte = round2(readCargos.reduce((sum, m) => sum + m.cargo, 0));
  const readAbonosImporte = round2(readAbonos.reduce((sum, m) => sum + m.abono, 0));
  let running = summary.opening ?? 0;
  let intermediateOk = true;
  for (const movement of movements) {
    running = round2(running - movement.cargo + movement.abono);
    if (movement.saldo !== null && Math.abs(running - movement.saldo) > 0.01) {
      intermediateOk = false;
    }
  }
  const moneyOk = (read: number, document: number | null) =>
    document === null || Math.abs(read - document) <= 0.01;
  const checks: BankCheck[] = [
    {
      label: "Número de cargos (salidas)",
      read: readCargos.length,
      document: cargosN,
      ok: cargosN === null || cargosN === readCargos.length,
      kind: "count",
    },
    {
      label: "Importe total de cargos",
      read: readCargosImporte,
      document: cargosImporte,
      ok: moneyOk(readCargosImporte, cargosImporte),
      kind: "money",
    },
    {
      label: "Número de abonos",
      read: readAbonos.length,
      document: abonosN,
      ok: abonosN === null || abonosN === readAbonos.length,
      kind: "count",
    },
    {
      label: "Importe total de abonos",
      read: readAbonosImporte,
      document: abonosImporte,
      ok: moneyOk(readAbonosImporte, abonosImporte),
      kind: "money",
    },
    {
      label: "Saldo final: inicial − cargos + abonos",
      read: running,
      document: summary.closing,
      ok: moneyOk(running, summary.closing) && intermediateOk,
      kind: "money",
    },
  ];
  const failed = checks.filter((check) => !check.ok);
  if (failed.length) {
    const detail = failed
      .map(
        (check) =>
          `${check.label}: leído ${check.read}${check.document === null ? "" : `, documento ${check.document}`}`,
      )
      .join("; ");
    throw new Error(
      `${fileName}: la extracción no cuadra con el estado de cuenta (${detail}${intermediateOk ? "" : "; saldos intermedios inconsistentes"}). No se procesa.`,
    );
  }

  return {
    kind: "bbva-pdf",
    fileName,
    account: `BBVA ${summary.account || "cuenta"}`,
    holder: summary.holder,
    rfc: summary.rfc,
    periodFrom: summary.periodFrom,
    periodTo: summary.periodTo,
    openingBalance: summary.opening,
    closingBalance: summary.closing,
    movements,
    checks,
  };
}
