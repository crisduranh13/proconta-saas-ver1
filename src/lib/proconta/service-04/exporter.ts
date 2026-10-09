import type { Worksheet } from "exceljs";
import { BUCKET_LABELS } from "./engine";
import type { Service04Analysis, Service04Item, Service04Rule } from "./types";

export interface Service04WorkbookExport {
  filename: string;
  bytes: Uint8Array;
}

const MONEY = '"$"#,##0.00;[Red]\\-"$"#,##0.00';
const PERCENT = "0.0%";
const DATE = "dd/mm/yyyy";
const BASE_FONT = { name: "Arial", size: 10 };
const BOLD = { ...BASE_FONT, bold: true };
const TITLE = { ...BASE_FONT, bold: true, size: 12 };
const fill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
const HEADER_FILL = fill("FFD9E1F2");
const OK_FILL = fill("FFE2EFDA");
const REVIEW_FILL = fill("FFFFF2CC");
const ERROR_FILL = fill("FFF8CBAD");

export const RULE_LABELS: Record<Service04Rule, string> = {
  FOLIO_EXACTO: "1 · Folio exacto",
  FOLIO_EXACTO_PARCIAL: "1 · Folio exacto (abono parcial)",
  SALDO_INICIAL: "1 · Folio de ejercicio anterior → saldo inicial",
  RANGO: "2 · Rango completo",
  RANGO_SUBCONJUNTO: "2 · Rango (facturas que cuadran)",
  MONTO_EXACTO: "3 · Monto exacto",
  FIFO_EXACTO: "4 · FIFO exacto",
  FIFO_COMBINACION: "4 · Suma de facturas antiguas",
  FIFO_PARCIAL: "5 · FIFO parcial (revisar)",
  NC_RESIDUO: "Nota de crédito → saldo igual",
  NC_FIFO: "Nota de crédito → partida más antigua (revisar)",
};

const REFERENCE_LABELS = {
  coincide: "Coincide",
  no_corresponde: "No corresponde",
  sin_referencia: "Sin referencia",
  sin_combinacion: "Sin combinación",
} as const;

function dateValue(iso: string | null): Date | null {
  return iso ? new Date(`${iso}T00:00:00Z`) : null;
}

function round(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function itemStatus(item: Service04Item): string {
  if (item.kind === "saldo_inicial") return "Saldo inicial sin detalle · revisar";
  if (item.kind === "diferencia_centavos") return "Diferencia por conciliar · revisar";
  if (item.kind === "saldo_a_favor") return "Saldo a favor · revisar";
  if (item.kind === "cargo_sin_folio") return "Cargo sin folio · revisar";
  return item.applied > 0 ? "Saldo parcial" : "Pendiente";
}

function itemDescription(item: Service04Item): string {
  if (item.kind === "diferencia_centavos") {
    return `Diferencia por conciliar${item.sourceFolio ? ` (residuo de ${item.sourceFolio})` : ""}`;
  }
  return item.description;
}

function header(sheet: Worksheet, rowNumber: number, labels: string[]) {
  const row = sheet.getRow(rowNumber);
  labels.forEach((label, index) => {
    const cell = row.getCell(index + 1);
    cell.value = label;
    cell.font = BOLD;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

function widths(sheet: Worksheet, values: number[]) {
  values.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function money(sheet: Worksheet, columns: number[]) {
  for (const column of columns) sheet.getColumn(column).numFmt = MONEY;
}

/** Genera el entregable del Servicio 4. Las fórmulas guardan su resultado para lectores sin recálculo. */
export async function exportService04Xlsx(analysis: Service04Analysis): Promise<Service04WorkbookExport> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ProConta";
  workbook.created = new Date();
  const cutoff = dateValue(analysis.cutoffDate)!;
  const cutoffLabel = analysis.cutoffDate.split("-").reverse().join("/");
  const reviewCount = analysis.anomalies.filter((anomaly) => anomaly.requiresReview).length;

  // ───── Resumen ─────
  const summary = workbook.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  widths(summary, [34, 18, 18, 14, 16, 18, 22]);
  summary.getCell("A1").value = analysis.company || "Cuentas por cobrar";
  summary.getCell("A1").font = TITLE;
  summary.getCell("A2").value = analysis.rfc;
  summary.getCell("A3").value = `CUENTAS POR COBRAR · RESUMEN AL ${cutoffLabel}`;
  summary.getCell("A3").font = BOLD;
  summary.getCell("A4").value =
    `Fuente: auxiliar de clientes (hoja ${analysis.sheetName}${analysis.periodFrom ? `, ${analysis.periodFrom} al ${analysis.periodTo}` : ""}). Antigüedad ${analysis.creditDays ? `con ${analysis.creditDays} días de crédito` : "por fecha de factura"}.`;
  const allReconciled = analysis.totals.unreconciledClients === 0;
  summary.getCell("A5").value = allReconciled
    ? `CONCILIADO: los ${analysis.totals.clients} clientes cuadran al centavo con el auxiliar.`
    : `NO CONCILIADO: ${analysis.totals.unreconciledClients} cliente(s) con diferencia contra el auxiliar. Ver hoja "Diferencias conciliación".`;
  summary.getCell("A5").font = BOLD;
  summary.getCell("A5").fill = allReconciled ? OK_FILL : ERROR_FILL;
  summary.getCell("A6").value = reviewCount
    ? `${reviewCount} partida(s) pendientes de revisión del contador (en amarillo). Las asignaciones marcadas no están confirmadas.`
    : "Sin partidas pendientes de revisión.";
  summary.getCell("A6").fill = reviewCount ? REVIEW_FILL : OK_FILL;

  const kpis: [string, number | string, string?][] = [
    ["Saldo total pendiente", analysis.totals.totalPending, MONEY],
    ["Clientes con adeudo", analysis.totals.clientsWithBalance],
    ["Facturas pendientes", analysis.totals.openInvoices],
    ["Saldos iniciales sin detalle", analysis.totals.openingWithoutDetail],
    ["Diferencias por conciliar", analysis.totals.centDifferences],
    ["Porcentaje vencido", analysis.totals.overduePercent, PERCENT],
    ["Saldo con más de 90 días", analysis.totals.over90, MONEY],
    ["Clientes en el auxiliar", analysis.totals.clients],
    ["Facturas revisadas", analysis.totals.invoicesReviewed],
    ["Abonos", analysis.totals.payments],
    ["Notas de crédito", analysis.totals.creditNotes],
  ];
  let row = 8;
  header(summary, row++, ["Concepto", "Resultado"]);
  for (const [label, value, format] of kpis) {
    summary.getCell(row, 1).value = label;
    summary.getCell(row, 2).value = value;
    if (format) summary.getCell(row, 2).numFmt = format;
    row++;
  }

  row += 1;
  summary.getCell(row++, 1).value = "ANTIGÜEDAD DE SALDOS";
  summary.getCell(row - 1, 1).font = BOLD;
  header(summary, row++, ["Antigüedad", "Importe", "% del total", "Partidas"]);
  const agingStart = row;
  for (const bucket of analysis.aging) {
    summary.getCell(row, 1).value = bucket.label;
    summary.getCell(row, 2).value = bucket.amount;
    summary.getCell(row, 2).numFmt = MONEY;
    summary.getCell(row, 4).value = bucket.items;
    row++;
  }
  const agingEnd = row - 1;
  summary.getCell(row, 1).value = "TOTAL";
  summary.getCell(row, 1).font = BOLD;
  summary.getCell(row, 2).value = { formula: `SUM(B${agingStart}:B${agingEnd})`, result: analysis.totals.totalPending };
  summary.getCell(row, 2).numFmt = MONEY;
  summary.getCell(row, 2).font = BOLD;
  for (let current = agingStart; current <= agingEnd; current++) {
    const bucket = analysis.aging[current - agingStart]!;
    summary.getCell(current, 3).value = { formula: `IFERROR(B${current}/$B$${row},0)`, result: bucket.percent };
    summary.getCell(current, 3).numFmt = PERCENT;
  }
  row += 2;

  summary.getCell(row++, 1).value = "CLIENTES";
  summary.getCell(row - 1, 1).font = BOLD;
  header(summary, row++, ["Cliente", "Cuenta", "Saldo", "Facturas pendientes", "Antigüedad", "Último cobro", "Conciliación"]);
  for (const client of analysis.clients) {
    summary.getCell(row, 1).value = client.name;
    summary.getCell(row, 2).value = client.account;
    summary.getCell(row, 3).value = client.reconstructedBalance;
    summary.getCell(row, 3).numFmt = MONEY;
    summary.getCell(row, 4).value = client.openInvoices;
    summary.getCell(row, 5).value = client.agingLabel;
    summary.getCell(row, 6).value = dateValue(client.lastPaymentDate);
    summary.getCell(row, 6).numFmt = DATE;
    const status = summary.getCell(row, 7);
    status.value = client.status === "Conciliado" ? (client.reviewCount ? "Conciliado · con revisión" : "Conciliado") : "CON DIFERENCIA";
    status.fill = client.status !== "Conciliado" ? ERROR_FILL : client.reviewCount ? REVIEW_FILL : OK_FILL;
    row++;
  }

  // ───── Facturas pendientes por cliente ─────
  const pending = workbook.addWorksheet("Facturas pendientes", { views: [{ state: "frozen", ySplit: 5 }] });
  widths(pending, [16, 30, 12, 7, 9, 52, 15, 15, 15, 8, 16, 30]);
  pending.getCell("A1").value = analysis.company;
  pending.getCell("A1").font = TITLE;
  pending.getCell("A2").value = analysis.rfc;
  pending.getCell("A3").value = `CUENTAS POR COBRAR · FACTURAS PENDIENTES DE COBRO AL ${cutoffLabel}`;
  pending.getCell("A3").font = BOLD;
  header(pending, 5, [
    "CUENTA",
    "Nombre",
    "Fecha",
    "Tipo",
    "Póliza",
    "Descripción del movimiento",
    "Fact $",
    "Abonos aplicados",
    "SALDO",
    "Días",
    "Antigüedad",
    "Estado",
  ]);
  money(pending, [7, 8, 9]);
  pending.getColumn(3).numFmt = DATE;
  row = 6;
  const clientTotalRows = new Map<string, number>();
  for (const client of analysis.clients) {
    pending.getCell(row, 1).value = client.account;
    pending.getCell(row, 2).value = client.name;
    pending.getRow(row).font = BOLD;
    row++;
    const items = analysis.openItems.filter((item) => item.account === client.account);
    const first = row;
    for (const item of items) {
      pending.getCell(row, 3).value = dateValue(item.date);
      pending.getCell(row, 4).value = item.tipo;
      pending.getCell(row, 5).value = item.poliza;
      pending.getCell(row, 6).value = itemDescription(item);
      pending.getCell(row, 7).value = item.original;
      pending.getCell(row, 8).value = item.applied;
      pending.getCell(row, 9).value = { formula: `ROUND(G${row}-H${row},2)`, result: item.remaining };
      pending.getCell(row, 10).value = item.days;
      pending.getCell(row, 11).value = BUCKET_LABELS[item.bucket];
      const status = itemStatus(item);
      pending.getCell(row, 12).value = status;
      if (status.includes("revisar")) pending.getRow(row).fill = REVIEW_FILL;
      row++;
    }
    pending.getCell(row, 6).value = items.length ? `TOTAL ${client.name.toUpperCase()}` : "Sin saldo pendiente";
    pending.getCell(row, 9).value = items.length
      ? { formula: `SUM(I${first}:I${row - 1})`, result: client.reconstructedBalance }
      : 0;
    pending.getCell(row, 6).font = BOLD;
    pending.getCell(row, 9).font = BOLD;
    clientTotalRows.set(client.account, row);
    row += 2;
  }
  pending.getCell(row, 6).value = `TOTAL CUENTAS POR COBRAR AL ${cutoffLabel}`;
  pending.getCell(row, 9).value = {
    formula: [...clientTotalRows.values()].map((total) => `I${total}`).join("+"),
    result: analysis.totals.totalPending,
  };
  pending.getRow(row).font = BOLD;

  // ───── Antigüedad por cliente ─────
  const aging = workbook.addWorksheet("Antigüedad", { views: [{ state: "frozen", ySplit: 3 }] });
  widths(aging, [32, 16, 16, 16, 16, 16, 18, 16, 16]);
  aging.getCell("A1").value = `ANTIGÜEDAD DE SALDOS AL ${cutoffLabel} · ${analysis.creditDays ? `${analysis.creditDays} días de crédito` : "por fecha de factura"}`;
  aging.getCell("A1").font = BOLD;
  header(aging, 3, ["Cliente", ...analysis.aging.map((bucket) => bucket.label), "Total", "Vencido %"]);
  money(aging, [2, 3, 4, 5, 6, 7, 8]);
  row = 4;
  const agingFirst = row;
  for (const client of analysis.clients.filter((entry) => entry.reconstructedBalance !== 0)) {
    aging.getCell(row, 1).value = client.name;
    analysis.aging.forEach((bucket, index) => {
      aging.getCell(row, index + 2).value = client.aging[bucket.key];
    });
    aging.getCell(row, 8).value = { formula: `SUM(B${row}:G${row})`, result: client.reconstructedBalance };
    const overdue = client.aging.d1_30 + client.aging.d31_60 + client.aging.d61_90 + client.aging.d90_mas;
    aging.getCell(row, 9).value = {
      formula: `IFERROR(SUM(C${row}:F${row})/H${row},0)`,
      result: client.reconstructedBalance ? overdue / client.reconstructedBalance : 0,
    };
    aging.getCell(row, 9).numFmt = PERCENT;
    row++;
  }
  aging.getCell(row, 1).value = "TOTAL";
  for (let column = 2; column <= 8; column++) {
    const letter = String.fromCharCode(64 + column);
    const result =
      column === 8 ? analysis.totals.totalPending : (analysis.aging[column - 2]?.amount ?? 0);
    aging.getCell(row, column).value = { formula: `SUM(${letter}${agingFirst}:${letter}${row - 1})`, result };
  }
  aging.getCell(row, 9).value = { formula: `IFERROR(SUM(C${row}:F${row})/H${row},0)`, result: analysis.totals.overduePercent };
  aging.getCell(row, 9).numFmt = PERCENT;
  aging.getRow(row).font = BOLD;

  // ───── Pagos por revisar ─────
  const review = workbook.addWorksheet("Pagos por revisar", { views: [{ state: "frozen", ySplit: 3 }] });
  widths(review, [30, 9, 12, 38, 15, 34, 16, 50, 14, 11, 60]);
  review.getCell("A1").value =
    "Abonos y notas de crédito cuya referencia no coincide o cuya asignación requiere criterio. La referencia del abono es una pista, no la verdad.";
  review.getCell("A1").font = BOLD;
  header(review, 3, [
    "Cliente",
    "Renglón",
    "Fecha",
    "Descripción",
    "Importe",
    "Regla aplicada",
    "Referencia",
    "Aplicado a",
    "Sin aplicar",
    "Requiere criterio",
    "Decisión del motor",
  ]);
  money(review, [5, 9]);
  review.getColumn(3).numFmt = DATE;
  row = 4;
  for (const payment of analysis.payments.filter(
    (entry) => entry.requiresReview || (entry.kind === "abono" && entry.referenceStatus !== "coincide"),
  )) {
    writePayment(review, row, payment);
    if (payment.requiresReview) review.getRow(row).fill = REVIEW_FILL;
    row++;
  }
  if (row === 4) review.getCell(row, 1).value = "Sin pagos por revisar.";

  // ───── Diferencias de conciliación ─────
  const differences = workbook.addWorksheet("Diferencias conciliación");
  widths(differences, [32, 16, 18, 18, 16, 18, 80]);
  differences.getCell("A1").value = "CONTROL: Saldo auxiliar − Saldo reconstruido = Diferencia (debe ser 0)";
  differences.getCell("A1").font = BOLD;
  header(differences, 3, ["Cliente", "Cuenta", "Saldo auxiliar", "Saldo reconstruido", "Diferencia", "Estado", "Posibles causas"]);
  money(differences, [3, 4, 5]);
  row = 4;
  for (const client of analysis.clients) {
    differences.getCell(row, 1).value = client.name;
    differences.getCell(row, 2).value = client.account;
    differences.getCell(row, 3).value = client.auxiliaryBalance;
    differences.getCell(row, 4).value = client.reconstructedBalance;
    differences.getCell(row, 5).value = { formula: `ROUND(C${row}-D${row},2)`, result: client.difference };
    differences.getCell(row, 6).value = client.status;
    differences.getCell(row, 6).fill = client.status === "Conciliado" ? OK_FILL : ERROR_FILL;
    differences.getCell(row, 7).value = client.possibleCauses.join(" ");
    row++;
  }
  row += 1;
  differences.getCell(row++, 1).value = "DIFERENCIAS DE CENTAVOS (partidas visibles, no se suman a otra factura)";
  differences.getCell(row - 1, 1).font = BOLD;
  header(differences, row++, ["Cliente", "Cuenta", "Importe", "Factura de origen", "", "", "Explicación"]);
  const cents = analysis.anomalies.filter((anomaly) => anomaly.code === "DIFERENCIA_CENTAVOS");
  for (const anomaly of cents) {
    differences.getCell(row, 1).value = anomaly.client;
    differences.getCell(row, 2).value = anomaly.account;
    differences.getCell(row, 3).value = anomaly.amount ?? 0;
    differences.getCell(row, 4).value = anomaly.folio ?? "";
    differences.getCell(row, 7).value = anomaly.message;
    differences.getRow(row).fill = REVIEW_FILL;
    row++;
  }
  if (!cents.length) differences.getCell(row, 1).value = "Sin diferencias de centavos.";

  // ───── Control (interno) ─────
  const control = workbook.addWorksheet("Control (interno)");
  widths(control, [16, 30, 15, 16, 16, 16, 14, 16, 14, 10, 12, 10, 14]);
  control.getCell("A1").value = "CONTROL INTERNO · no se envía al cliente";
  control.getCell("A1").font = BOLD;
  control.getCell("A2").value = "Fecha de corte";
  control.getCell("B2").value = cutoff;
  control.getCell("B2").numFmt = DATE;
  control.getCell("A3").value =
    `Fuente: ${analysis.sheetName}. Saldo final del auxiliar tomado del propio archivo; la columna G debe ser 0 y la columna I debe ser 0.`;
  header(control, 5, [
    "Cuenta",
    "Nombre",
    "Saldo inicial",
    "Cargos",
    "Abonos",
    "Saldo final auxiliar",
    "Control auxiliar (debe ser 0)",
    "Saldo en el informe",
    "Diferencia (debe ser 0)",
    "Facturas abiertas",
    "Partida más antigua",
    "Días al corte",
    "Estado",
  ]);
  money(control, [3, 4, 5, 6, 7, 8, 9]);
  control.getColumn(11).numFmt = DATE;
  row = 6;
  const controlFirst = row;
  for (const client of analysis.clients) {
    const totalRow = clientTotalRows.get(client.account)!;
    control.getCell(row, 1).value = client.account;
    control.getCell(row, 2).value = client.name;
    control.getCell(row, 3).value = client.opening;
    control.getCell(row, 4).value = client.debits;
    control.getCell(row, 5).value = client.credits;
    control.getCell(row, 6).value = client.auxiliaryBalance;
    control.getCell(row, 7).value = {
      formula: `ROUND(C${row}+D${row}-E${row}-F${row},2)`,
      result: round(client.opening + client.debits - client.credits - client.auxiliaryBalance),
    };
    control.getCell(row, 8).value = { formula: `'Facturas pendientes'!I${totalRow}`, result: client.reconstructedBalance };
    control.getCell(row, 9).value = { formula: `ROUND(H${row}-F${row},2)`, result: round(-client.difference) };
    control.getCell(row, 10).value = client.openInvoices;
    control.getCell(row, 11).value = dateValue(client.oldestDate);
    control.getCell(row, 12).value = client.oldestDate
      ? { formula: `$B$2-K${row}`, result: client.maxDays ?? 0 }
      : null;
    control.getCell(row, 13).value = client.status;
    control.getCell(row, 13).fill = client.status === "Conciliado" ? OK_FILL : ERROR_FILL;
    row++;
  }
  control.getCell(row, 2).value = "TOTAL";
  for (const column of [3, 4, 5, 6, 7, 8, 9, 10]) {
    const letter = String.fromCharCode(64 + column);
    control.getCell(row, column).value = { formula: `SUM(${letter}${controlFirst}:${letter}${row - 1})` };
  }
  control.getRow(row).font = BOLD;
  row += 2;
  control.getCell(row++, 1).value = "PARTIDAS A REVISAR Y HALLAZGOS";
  control.getCell(row - 1, 1).font = BOLD;
  header(control, row++, ["Severidad", "Cliente", "Hallazgo", "Renglón", "Folio", "Importe", "Revisión", "Detalle"]);
  const order = { alta: 0, media: 1, baja: 2 } as const;
  for (const anomaly of [...analysis.anomalies].sort(
    (a, b) => order[a.severity] - order[b.severity] || Number(b.requiresReview) - Number(a.requiresReview),
  )) {
    control.getCell(row, 1).value = anomaly.severity.toUpperCase();
    control.getCell(row, 2).value = anomaly.client;
    control.getCell(row, 3).value = anomaly.code.replace(/_/g, " ").toLowerCase();
    control.getCell(row, 4).value = anomaly.rowNumber ?? null;
    control.getCell(row, 5).value = anomaly.folio ?? null;
    control.getCell(row, 6).value = anomaly.amount ?? null;
    control.getCell(row, 7).value = anomaly.requiresReview ? "Requiere criterio" : "Informativo";
    control.getCell(row, 8).value = anomaly.message;
    if (anomaly.requiresReview) control.getRow(row).fill = REVIEW_FILL;
    row++;
  }

  // ───── Aplicación de abonos (bitácora completa) ─────
  const log = workbook.addWorksheet("Aplicación de abonos", { views: [{ state: "frozen", ySplit: 1 }] });
  widths(log, [30, 9, 12, 38, 15, 34, 16, 50, 14, 11, 60]);
  header(log, 1, [
    "Cliente",
    "Renglón",
    "Fecha",
    "Descripción",
    "Importe",
    "Regla aplicada",
    "Referencia",
    "Aplicado a",
    "Sin aplicar",
    "Requiere criterio",
    "Decisión del motor",
  ]);
  money(log, [5, 9]);
  log.getColumn(3).numFmt = DATE;
  analysis.payments.forEach((payment, index) => writePayment(log, index + 2, payment));

  for (const sheet of workbook.worksheets) {
    sheet.eachRow((sheetRow) => {
      sheetRow.eachCell((cell) => {
        if (!cell.font?.bold) cell.font = { ...BASE_FONT, ...(cell.font ?? {}) };
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    filename: analysis.outputFilename,
    bytes: new Uint8Array(buffer as unknown as ArrayBuffer),
  };
}

function writePayment(sheet: Worksheet, row: number, payment: Service04Analysis["payments"][number]) {
  sheet.getCell(row, 1).value = payment.client;
  sheet.getCell(row, 2).value = payment.rowNumber;
  sheet.getCell(row, 3).value = dateValue(payment.date);
  sheet.getCell(row, 4).value = payment.kind === "nota_credito" ? `NC · ${payment.description}` : payment.description;
  sheet.getCell(row, 5).value = payment.amount;
  sheet.getCell(row, 6).value = RULE_LABELS[payment.rule];
  sheet.getCell(row, 7).value = payment.kind === "nota_credito" ? "Nota de crédito" : REFERENCE_LABELS[payment.referenceStatus];
  sheet.getCell(row, 8).value = payment.allocations
    .map((allocation) => `${allocation.folio} (${allocation.amount.toFixed(2)})`)
    .join(", ");
  sheet.getCell(row, 9).value = payment.unapplied || null;
  sheet.getCell(row, 10).value = payment.requiresReview ? "Sí" : "No";
  sheet.getCell(row, 11).value = payment.note;
}
