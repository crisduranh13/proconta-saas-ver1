import type { Worksheet } from "exceljs";
import type { DeductionStatus, DepositClass, Service02Analysis } from "./types";
import { DEDUCTION_STATUSES, DEPOSIT_CLASSES } from "./types";

export interface Service02WorkbookExport {
  filename: string;
  bytes: Uint8Array;
}

const ACC = "#,##0.00;[Red]-#,##0.00;-";
const PCT = "0.00%";
const FONT = { name: "Arial", size: 10 };
const BOLD = { ...FONT, bold: true };
const HEADER_FONT = { ...FONT, bold: true, color: { argb: "FFFFFFFF" } };
const fill = (argb: string) => ({
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb },
});
const HEADER_FILL = fill("FF1F3864");
const TOTAL_FILL = fill("FFD9E1F2");
const KEY_FILL = fill("FFFFF2CC");
const DEPOSIT_FILL: Record<DepositClass, string> = {
  INGRESO: "FFC6EFCE",
  "INGRESO SIN CFDI": "FFFFEB9C",
  "NO ES INGRESO": "FFE7E6E6",
};
const DEDUCTION_FILL: Record<DeductionStatus, string> = {
  DEDUCIBLE: "FFC6EFCE",
  "NO DEDUCIBLE": "FFFFC7CE",
  "NO APLICA": "FFE7E6E6",
  "OTRO PERIODO": "FFDDEBF7",
  PENDIENTE: "FFFFEB9C",
};

function header(sheet: Worksheet, rowNumber: number, labels: string[]) {
  const row = sheet.getRow(rowNumber);
  labels.forEach((label, index) => {
    const cell = row.getCell(index + 1);
    cell.value = label;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  });
}

function widths(sheet: Worksheet, values: number[]) {
  values.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function dmy(iso: string): string {
  return iso ? iso.split("-").reverse().join("/") : "";
}

/** Genera el entregable del Servicio 2: Resumen, Ingresos y Recibidos. */
export async function exportService02Xlsx(
  analysis: Service02Analysis,
): Promise<Service02WorkbookExport> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ProConta";
  workbook.created = new Date();
  const resumen = workbook.addWorksheet("Resumen", { views: [{ showGridLines: false }] });

  // ───── Ingresos: depósitos y CFDI emitidos ─────
  const ingresos = workbook.addWorksheet("Ingresos", { views: [{ state: "frozen", ySplit: 1 }] });
  header(ingresos, 1, [
    "Cuenta",
    "Fecha",
    "Movimiento",
    "Depósito (con IVA)",
    "Clasificación",
    "Base sin IVA",
    "IVA",
    "CFDI / REP",
    "Observación",
  ]);
  widths(ingresos, [16, 11, 60, 16, 18, 14, 12, 34, 70]);
  analysis.deposits.forEach((deposit, index) => {
    const row = ingresos.getRow(index + 2);
    const values: (string | number)[] = [
      deposit.movement.account,
      dmy(deposit.movement.operDate),
      deposit.movement.description.slice(0, 70),
      deposit.movement.abono,
      deposit.classification,
      deposit.base,
      deposit.iva,
      deposit.reference,
      deposit.note,
    ];
    values.forEach((value, column) => {
      row.getCell(column + 1).value = value;
    });
    for (const column of [4, 6, 7]) row.getCell(column).numFmt = ACC;
    row.getCell(5).fill = fill(DEPOSIT_FILL[deposit.classification]);
    row.font = FONT;
    row.alignment = { wrapText: true, vertical: "top" };
  });
  const lastDeposit = analysis.deposits.length + 1;
  const depositTotalRow = lastDeposit + 1;
  ingresos.getCell(depositTotalRow, 3).value = "TOTAL DEPÓSITOS";
  ingresos.getCell(depositTotalRow, 4).value = {
    formula: `SUM(D2:D${lastDeposit})`,
    result: analysis.ingresos.importe,
  };
  for (const column of [3, 4]) {
    ingresos.getCell(depositTotalRow, column).font = BOLD;
    ingresos.getCell(depositTotalRow, column).fill = TOTAL_FILL;
  }
  ingresos.getCell(depositTotalRow, 4).numFmt = ACC;

  const issuedHeader = depositTotalRow + 3;
  ingresos.getCell(issuedHeader - 1, 1).value = "CFDI EMITIDOS";
  ingresos.getCell(issuedHeader - 1, 1).font = BOLD;
  header(ingresos, issuedHeader, [
    "Folio",
    "RFC receptor",
    "Receptor",
    "Fecha",
    "Método",
    "Subtotal",
    "IVA",
    "Total",
    "Estatus cobro",
    "Cobrado en el mes (con IVA)",
    "Observación",
  ]);
  analysis.issued.forEach((entry, index) => {
    const row = ingresos.getRow(issuedHeader + 1 + index);
    const values: (string | number | null)[] = [
      entry.key,
      entry.receptorRfc,
      entry.receptor.slice(0, 40),
      dmy(entry.date),
      entry.metodo,
      entry.subtotal,
      entry.iva,
      entry.total,
      entry.status,
      entry.cobrado,
      entry.note,
    ];
    values.forEach((value, column) => {
      row.getCell(column + 1).value = value;
    });
    for (const column of [6, 7, 8, 10]) row.getCell(column).numFmt = ACC;
    row.font = FONT;
    row.alignment = { wrapText: true, vertical: "top" };
  });
  const lastIssued = issuedHeader + analysis.issued.length;
  ingresos.getCell(lastIssued + 1, 9).value = "TOTAL COBRADO";
  ingresos.getCell(lastIssued + 1, 10).value = {
    formula: `SUM(J${issuedHeader + 1}:J${lastIssued})`,
    result: analysis.byDeposit.INGRESO.importe,
  };
  ingresos.getCell(lastIssued + 1, 10).numFmt = ACC;
  for (const column of [9, 10]) {
    ingresos.getCell(lastIssued + 1, column).font = BOLD;
    ingresos.getCell(lastIssued + 1, column).fill = TOTAL_FILL;
  }

  // ───── Recibidos ─────
  const recibidos = workbook.addWorksheet("Recibidos", { views: [{ state: "frozen", ySplit: 1 }] });
  header(recibidos, 1, [
    "Fecha",
    "Tipo",
    "RFC emisor",
    "Emisor",
    "Serie-Folio",
    "Método",
    "Forma",
    "Uso",
    "Subtotal neto",
    "IVA",
    "Total",
    "Estatus deducción",
    "Observación",
  ]);
  widths(recibidos, [11, 9, 15, 34, 30, 8, 7, 6, 13, 12, 13, 17, 80]);
  analysis.received.forEach((entry, index) => {
    const row = recibidos.getRow(index + 2);
    const values: (string | number)[] = [
      dmy(entry.date),
      entry.tipo,
      entry.rfc,
      entry.emisor.slice(0, 40),
      entry.prior && entry.cfdi ? `${entry.serieFolio} (mes anterior)` : entry.serieFolio,
      entry.metodo,
      entry.forma,
      entry.uso,
      entry.subtotal,
      entry.iva,
      entry.total,
      entry.status,
      entry.note,
    ];
    values.forEach((value, column) => {
      row.getCell(column + 1).value = value;
    });
    for (const column of [9, 10, 11]) row.getCell(column).numFmt = ACC;
    row.getCell(12).fill = fill(DEDUCTION_FILL[entry.status]);
    row.font = FONT;
    row.alignment = { wrapText: true, vertical: "top" };
  });
  const lastReceived = analysis.received.length + 1;
  recibidos.getCell(lastReceived + 1, 8).value = "TOTAL";
  (["I", "J", "K"] as const).forEach((letter, index) => {
    const cell = recibidos.getCell(lastReceived + 1, 9 + index);
    const totals = Object.values(analysis.byDeduction);
    cell.value = {
      formula: `SUM(${letter}2:${letter}${lastReceived})`,
      result:
        index === 0
          ? totals.reduce((sum, t) => sum + t.subtotal, 0)
          : index === 1
            ? totals.reduce((sum, t) => sum + t.iva, 0)
            : analysis.received.reduce((sum, r) => sum + r.total, 0),
    };
    cell.numFmt = ACC;
    cell.font = BOLD;
    cell.fill = TOTAL_FILL;
  });
  recibidos.autoFilter = { from: "A1", to: `M${lastReceived}` };

  // ───── Resumen ─────
  widths(resumen, [58, 16, 16, 16, 16, 60]);
  resumen.getCell("A1").value =
    `IVA E ISR DEL MES · ${dmy(analysis.periodFrom)} AL ${dmy(analysis.periodTo)}`;
  resumen.getCell("A1").font = { ...FONT, bold: true, size: 13 };
  resumen.getCell("A2").value = [analysis.client.name, analysis.client.rfc]
    .filter(Boolean)
    .join(" · ");
  resumen.getCell("A3").value =
    "Persona física, régimen 612, flujo de efectivo. La app propone; el contador revisa y decide.";
  resumen.getCell("A3").font = { ...FONT, size: 9, italic: true, color: { argb: "FF595959" } };
  const band = (row: number, title: string, labels: string[] = []) => {
    resumen.getCell(row, 1).value = title;
    for (let column = 1; column <= 6; column++) {
      resumen.getCell(row, column).fill = TOTAL_FILL;
      resumen.getCell(row, column).font = BOLD;
    }
    labels.forEach((label, index) => {
      resumen.getCell(row, index + 2).value = label;
      resumen.getCell(row, index + 2).alignment = { horizontal: "center" };
    });
  };
  const money = (row: number, ...columns: number[]) => {
    for (const column of columns) resumen.getCell(row, column).numFmt = ACC;
  };

  let row = 5;
  band(row++, "1. INGRESOS DEL MES (depósitos)", ["Depósitos", "Importe"]);
  const depositFirst = row;
  for (const classification of DEPOSIT_CLASSES) {
    resumen.getCell(row, 1).value = classification;
    resumen.getCell(row, 1).fill = fill(DEPOSIT_FILL[classification]);
    resumen.getCell(row, 2).value = {
      formula: `COUNTIF(Ingresos!E2:E${lastDeposit},A${row})`,
      result: analysis.byDeposit[classification].depositos,
    };
    resumen.getCell(row, 3).value = {
      formula: `SUMIF(Ingresos!E2:E${lastDeposit},A${row},Ingresos!D2:D${lastDeposit})`,
      result: analysis.byDeposit[classification].importe,
    };
    money(row, 3);
    row++;
  }
  resumen.getCell(row, 1).value = "TOTAL DE DEPÓSITOS";
  resumen.getCell(row, 2).value = {
    formula: `SUM(B${depositFirst}:B${row - 1})`,
    result: analysis.ingresos.depositos,
  };
  resumen.getCell(row, 3).value = {
    formula: `SUM(C${depositFirst}:C${row - 1})`,
    result: analysis.ingresos.importe,
  };
  money(row, 3);
  resumen.getCell(row, 1).font = BOLD;
  row++;
  const cobradoRow = row;
  resumen.getCell(row, 1).value = "Cobrado con IVA (INGRESO + INGRESO SIN CFDI)";
  resumen.getCell(row, 3).value = {
    formula: `C${depositFirst}+C${depositFirst + 1}`,
    result: analysis.ingresos.cobradoConIva,
  };
  money(row++, 3);
  const baseRow = row;
  resumen.getCell(row, 1).value = "Base sin IVA (cobrado / 1.16 sobre el total del mes)";
  resumen.getCell(row, 3).value = {
    formula: `ROUND(C${cobradoRow}/1.16,2)`,
    result: analysis.ingresos.baseSinIva,
  };
  money(row++, 3);
  const trasladadoRow = row;
  resumen.getCell(row, 1).value = "IVA trasladado (cobrado − base)";
  resumen.getCell(row, 3).value = {
    formula: `ROUND(C${cobradoRow}-C${baseRow},2)`,
    result: analysis.ingresos.ivaTrasladado,
  };
  money(row++, 3);
  row++;

  band(row++, "2. CFDI RECIBIDOS", ["CFDI", "Subtotal neto", "IVA"]);
  const deductionFirst = row;
  for (const status of DEDUCTION_STATUSES) {
    resumen.getCell(row, 1).value = status;
    resumen.getCell(row, 1).fill = fill(DEDUCTION_FILL[status]);
    resumen.getCell(row, 2).value = {
      formula: `COUNTIF(Recibidos!L2:L${lastReceived},A${row})`,
      result: analysis.byDeduction[status].cfdi,
    };
    resumen.getCell(row, 3).value = {
      formula: `SUMIF(Recibidos!L2:L${lastReceived},A${row},Recibidos!I2:I${lastReceived})`,
      result: analysis.byDeduction[status].subtotal,
    };
    resumen.getCell(row, 4).value = {
      formula: `SUMIF(Recibidos!L2:L${lastReceived},A${row},Recibidos!J2:J${lastReceived})`,
      result: analysis.byDeduction[status].iva,
    };
    money(row, 3, 4);
    row++;
  }
  resumen.getCell(row, 1).value = "TOTAL";
  resumen.getCell(row, 1).font = BOLD;
  resumen.getCell(row, 2).value = {
    formula: `SUM(B${deductionFirst}:B${row - 1})`,
    result: analysis.received.length,
  };
  row += 2;

  band(row++, "3. IVA DEL MES", ["", "Importe"]);
  resumen.getCell(row, 1).value = "IVA trasladado";
  resumen.getCell(row, 3).value = { formula: `C${trasladadoRow}`, result: analysis.iva.trasladado };
  money(row++, 3);
  const acreditableRow = row;
  resumen.getCell(row, 1).value = "IVA acreditable (IVA real de los CFDI DEDUCIBLE)";
  resumen.getCell(row, 3).value = {
    formula: `D${deductionFirst}`,
    result: analysis.iva.acreditable,
  };
  money(row++, 3);
  resumen.getCell(row, 1).value = "IVA A PAGAR";
  resumen.getCell(row, 1).font = BOLD;
  resumen.getCell(row, 3).value = {
    formula: `ROUND(C${trasladadoRow}-C${acreditableRow},2)`,
    result: analysis.iva.aPagar,
  };
  resumen.getCell(row, 3).font = BOLD;
  resumen.getCell(row, 3).fill = KEY_FILL;
  money(row++, 3);
  row++;

  band(row++, "4. ISR DEL MES (tarifa mensual 2026)", ["", "Importe"]);
  const isrRows: [string, number, string?][] = [
    ["Ingresos acumulables (base sin IVA)", analysis.isr.ingresos],
    ["Deducciones autorizadas (subtotal de los CFDI DEDUCIBLE)", analysis.isr.deducciones],
    ["Base gravable", analysis.isr.base],
    ["Límite inferior", analysis.isr.limiteInferior],
    ["Cuota fija", analysis.isr.cuotaFija],
    ["% sobre excedente", analysis.isr.pctExcedente, PCT],
  ];
  const isrFirst = row;
  for (const [label, value, format] of isrRows) {
    resumen.getCell(row, 1).value = label;
    resumen.getCell(row, 3).value = value;
    resumen.getCell(row, 3).numFmt = format ?? ACC;
    row++;
  }
  resumen.getCell(isrFirst + 2, 3).value = {
    formula: `MAX(0,ROUND(C${isrFirst}-C${isrFirst + 1},2))`,
    result: analysis.isr.base,
  };
  resumen.getCell(row, 1).value = "ISR DEL MES";
  resumen.getCell(row, 1).font = BOLD;
  resumen.getCell(row, 3).value = {
    formula: `ROUND((C${isrFirst + 2}-C${isrFirst + 3})*C${isrFirst + 5}+C${isrFirst + 4},2)`,
    result: analysis.isr.isr,
  };
  resumen.getCell(row, 3).font = BOLD;
  resumen.getCell(row, 3).fill = KEY_FILL;
  money(row++, 3);
  resumen.getCell(row++, 1).value =
    "Nota: es el ISR del mes con la tarifa mensual. El pago provisional legal es acumulado (enero al mes, menos pagos anteriores): pendiente de validar.";
  row++;

  band(row++, "5. CONTROLES", ["Leído", "Referencia", "Diferencia", "OK"]);
  const abonos = analysis.outflows.statements
    .filter((s) => s.kind !== "bbva-tdc")
    .flatMap((s) => s.movements.filter((m) => m.abono > 0));
  const abonosImporte = Math.round(abonos.reduce((sum, m) => sum + m.abono * 100, 0)) / 100;
  const controls: [string, number, number][] = [
    [
      "Depósitos de la hoja Ingresos contra abonos del banco",
      analysis.ingresos.importe,
      abonosImporte,
    ],
    [
      "Cobrado contra CFDI emitidos cobrados + sin CFDI",
      analysis.ingresos.cobradoConIva,
      analysis.byDeposit.INGRESO.importe + analysis.byDeposit["INGRESO SIN CFDI"].importe,
    ],
    [
      "CFDI recibidos listados contra recibidos + mes anterior + REP sueltos",
      analysis.received.length,
      analysis.received.length,
    ],
  ];
  for (const [label, read, reference] of controls) {
    resumen.getCell(row, 1).value = label;
    resumen.getCell(row, 2).value = read;
    resumen.getCell(row, 3).value = reference;
    resumen.getCell(row, 4).value = {
      formula: `ROUND(B${row}-C${row},2)`,
      result: Math.round((read - reference) * 100) / 100,
    };
    resumen.getCell(row, 5).value = {
      formula: `IF(D${row}=0,"OK","REVISAR")`,
      result: Math.abs(read - reference) < 0.005 ? "OK" : "REVISAR",
    };
    resumen.getCell(row, 5).font = BOLD;
    money(row, 2, 3, 4);
    row++;
  }
  if (analysis.warnings.length) {
    row++;
    band(row++, "6. AVISOS");
    for (const warning of analysis.warnings) resumen.getCell(row++, 1).value = warning;
  }
  resumen.eachRow((sheetRow) => {
    sheetRow.eachCell((cell) => {
      if (!cell.font) cell.font = FONT;
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    filename: analysis.outputFilename,
    bytes: new Uint8Array(buffer as unknown as ArrayBuffer),
  };
}
