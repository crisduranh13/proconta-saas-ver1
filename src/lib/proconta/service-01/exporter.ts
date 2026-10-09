import type { Worksheet } from "exceljs";
import type { Service01Analysis, Service01Status } from "./types";
import { SERVICE01_STATUSES } from "./types";

export interface Service01WorkbookExport {
  filename: string;
  bytes: Uint8Array;
}

const ACC = "#,##0.00;[Red]-#,##0.00;-";
const PCT = "0.0%";
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
const OK_FILL = fill("FFC6EFCE");
const BAD_FILL = fill("FFFFC7CE");
const STATUS_FILL: Record<Service01Status, string> = {
  CONCILIADO: "FFC6EFCE",
  "CONCILIADO C/OBS": "FFFFEB9C",
  PARCIAL: "FFFFD8A8",
  "SIN CFDI": "FFFFC7CE",
  "NO REQUIERE": "FFE7E6E6",
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

/** Genera el entregable del Servicio 1: Resumen, Salidas y CFDI sin pago. */
export async function exportService01Xlsx(
  analysis: Service01Analysis,
): Promise<Service01WorkbookExport> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ProConta";
  workbook.created = new Date();
  // Se crea primero para que quede como primera hoja; se llena al final porque referencia a Salidas.
  const resumen = workbook.addWorksheet("Resumen", { views: [{ showGridLines: false }] });

  // ───── Salidas ─────
  const salidas = workbook.addWorksheet("Salidas", { views: [{ state: "frozen", ySplit: 1 }] });
  const columns = [
    "Fecha oper",
    "Fecha liq",
    "Cuenta",
    "Movimiento del banco",
    "Referencia",
    "Importe",
    "Estatus",
    "CFDI",
    "RFC emisor",
    "Emisor",
    "Fecha CFDI",
    "Total CFDI",
    "Método",
    "Forma",
    "Uso",
    "Observación del contador",
    "Diferencia",
  ];
  header(salidas, 1, columns);
  widths(salidas, [11, 11, 14, 46, 54, 13, 17, 20, 15, 30, 11, 12, 8, 7, 6, 70, 12]);
  analysis.outflows.forEach((outflow, index) => {
    const row = salidas.getRow(index + 2);
    const { movement, cfdi } = outflow;
    const values: (string | number | null)[] = [
      dmy(movement.operDate),
      dmy(movement.liqDate),
      movement.account,
      movement.description.slice(0, 46),
      movement.detail.slice(0, 70),
      movement.cargo,
      outflow.status,
      cfdi?.serieFolio ?? "",
      cfdi?.rfc ?? outflow.rfcHint,
      cfdi?.emisor.slice(0, 34) ?? "",
      cfdi ? dmy(cfdi.date) : "",
      cfdi ? cfdi.total : null,
      cfdi?.metodo ?? "",
      cfdi?.forma ?? "",
      cfdi?.uso ?? "",
      outflow.note,
    ];
    values.forEach((value, column) => {
      row.getCell(column + 1).value = value;
    });
    row.getCell(17).value = {
      formula: `IF(L${index + 2}="","",F${index + 2}-L${index + 2})`,
      result: cfdi ? movement.cargo - cfdi.total : "",
    };
    row.getCell(6).numFmt = ACC;
    row.getCell(12).numFmt = ACC;
    row.getCell(17).numFmt = ACC;
    row.getCell(7).fill = fill(STATUS_FILL[outflow.status]);
    row.font = FONT;
    row.alignment = { wrapText: true, vertical: "top" };
  });
  const lastSalida = analysis.outflows.length + 1;
  const totalRow = lastSalida + 1;
  salidas.getCell(totalRow, 5).value = "TOTAL";
  salidas.getCell(totalRow, 6).value = {
    formula: `SUM(F2:F${lastSalida})`,
    result: analysis.totals.importe,
  };
  salidas.getCell(totalRow, 12).value = {
    formula: `SUM(L2:L${lastSalida})`,
    result: analysis.totals.cfdiConSalidaImporte,
  };
  for (const column of [5, 6, 12]) {
    const cell = salidas.getCell(totalRow, column);
    cell.font = BOLD;
    cell.fill = TOTAL_FILL;
    if (column > 5) cell.numFmt = ACC;
  }
  salidas.autoFilter = { from: "A1", to: `Q${lastSalida}` };

  // ───── CFDI sin pago ─────
  const unpaid = workbook.addWorksheet("CFDI sin pago", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  header(unpaid, 1, [
    "Fecha",
    "RFC emisor",
    "Emisor",
    "Serie-Folio",
    "Subtotal",
    "IVA",
    "Total",
    "Método",
    "Forma",
    "Uso",
    "Diagnóstico",
  ]);
  widths(unpaid, [11, 15, 40, 20, 13, 12, 13, 8, 7, 6, 78]);
  analysis.unpaid.forEach((entry, index) => {
    const row = unpaid.getRow(index + 2);
    const { cfdi } = entry;
    const values: (string | number)[] = [
      dmy(cfdi.date),
      cfdi.rfc,
      cfdi.emisor.slice(0, 40),
      cfdi.serieFolio,
      cfdi.subtotal,
      cfdi.iva,
      cfdi.total,
      cfdi.metodo,
      cfdi.forma,
      cfdi.uso,
      entry.diagnostico,
    ];
    values.forEach((value, column) => {
      row.getCell(column + 1).value = value;
    });
    for (const column of [5, 6, 7]) row.getCell(column).numFmt = ACC;
    row.font = FONT;
    row.alignment = { wrapText: true, vertical: "top" };
  });
  const lastUnpaid = analysis.unpaid.length + 1;
  unpaid.getCell(lastUnpaid + 1, 4).value = "TOTAL";
  unpaid.getCell(lastUnpaid + 1, 4).font = BOLD;
  unpaid.getCell(lastUnpaid + 1, 4).fill = TOTAL_FILL;
  (["E", "F", "G"] as const).forEach((letter, index) => {
    const cell = unpaid.getCell(lastUnpaid + 1, 5 + index);
    cell.value = {
      formula: `SUM(${letter}2:${letter}${lastUnpaid})`,
      result:
        index === 2
          ? analysis.totals.cfdiSinSalidaImporte
          : analysis.unpaid.reduce(
              (acc, e) => acc + (index === 0 ? e.cfdi.subtotal : e.cfdi.iva),
              0,
            ),
    };
    cell.numFmt = ACC;
    cell.font = BOLD;
    cell.fill = TOTAL_FILL;
  });

  // ───── Resumen ─────
  widths(resumen, [62, 16, 16, 14, 72]);
  const period = `${analysis.periodFrom.slice(0, 7)}`;
  resumen.getCell("A1").value =
    `CONCILIACIÓN DE SALIDAS vs CFDI RECIBIDOS · ${dmy(analysis.periodFrom)} AL ${dmy(analysis.periodTo)}`;
  resumen.getCell("A1").font = { ...FONT, bold: true, size: 13 };
  resumen.getCell("A2").value = [
    analysis.client.name,
    analysis.client.rfc,
    analysis.statements.map((s) => s.account).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
  resumen.getCell("A3").value =
    `Fuente: ${analysis.statements.map((s) => s.fileName).join(", ")} y ${analysis.cfdiFileName}. La app propone; el contador revisa y decide.`;
  resumen.getCell("A3").font = { ...FONT, size: 9, italic: true, color: { argb: "FF595959" } };

  const band = (row: number, title: string, labels: string[] = []) => {
    resumen.getCell(row, 1).value = title;
    for (let column = 1; column <= 5; column++) {
      resumen.getCell(row, column).fill = TOTAL_FILL;
      resumen.getCell(row, column).font = BOLD;
    }
    labels.forEach((label, index) => {
      resumen.getCell(row, index + 2).value = label;
      resumen.getCell(row, index + 2).alignment = { horizontal: "center" };
    });
  };

  let row = 5;
  band(row++, "1. VALIDACIÓN DEL ESTADO DE CUENTA", ["Leído", "Documento", "Diferencia"]);
  for (const statement of analysis.statements) {
    resumen.getCell(row, 1).value = `${statement.account} · ${statement.fileName}`;
    resumen.getCell(row, 1).font = BOLD;
    row++;
    for (const check of statement.checks) {
      resumen.getCell(row, 1).value = check.label;
      resumen.getCell(row, 2).value = check.read;
      resumen.getCell(row, 3).value = check.document;
      resumen.getCell(row, 3).font = { ...FONT, color: { argb: "FF0000FF" } };
      resumen.getCell(row, 4).value = {
        formula: `IF(C${row}="","",ROUND(B${row}-C${row},2))`,
        result:
          check.document === null ? "" : Math.round((check.read - check.document) * 100) / 100,
      };
      resumen.getCell(row, 5).value = {
        formula: `IF(D${row}="",${check.ok ? '"OK"' : '"REVISAR"'},IF(D${row}=0,"OK","REVISAR"))`,
        result: check.ok ? "OK" : "REVISAR",
      };
      resumen.getCell(row, 5).font = BOLD;
      resumen.getCell(row, 5).fill = check.ok ? OK_FILL : BAD_FILL;
      if (check.kind === "money") {
        for (const column of [2, 3, 4]) resumen.getCell(row, column).numFmt = ACC;
      }
      row++;
    }
  }

  row++;
  band(row++, "2. RESULTADO DE LA CONCILIACIÓN", ["Salidas", "Importe", "% del importe"]);
  const statusFirst = row;
  const totalStatusRow = statusFirst + SERVICE01_STATUSES.length;
  for (const status of SERVICE01_STATUSES) {
    resumen.getCell(row, 1).value = status;
    resumen.getCell(row, 1).fill = fill(STATUS_FILL[status]);
    resumen.getCell(row, 2).value = {
      formula: `COUNTIF(Salidas!G2:G${lastSalida},A${row})`,
      result: analysis.byStatus[status].salidas,
    };
    resumen.getCell(row, 3).value = {
      formula: `SUMIF(Salidas!G2:G${lastSalida},A${row},Salidas!F2:F${lastSalida})`,
      result: analysis.byStatus[status].importe,
    };
    resumen.getCell(row, 4).value = {
      formula: `IFERROR(C${row}/$C$${totalStatusRow},0)`,
      result: analysis.totals.importe
        ? analysis.byStatus[status].importe / analysis.totals.importe
        : 0,
    };
    resumen.getCell(row, 3).numFmt = ACC;
    resumen.getCell(row, 4).numFmt = PCT;
    row++;
  }
  resumen.getCell(row, 1).value = "TOTAL DE SALIDAS";
  resumen.getCell(row, 2).value = {
    formula: `SUM(B${statusFirst}:B${row - 1})`,
    result: analysis.totals.salidas,
  };
  resumen.getCell(row, 3).value = {
    formula: `SUM(C${statusFirst}:C${row - 1})`,
    result: analysis.totals.importe,
  };
  resumen.getCell(row, 4).value = { formula: `SUM(D${statusFirst}:D${row - 1})`, result: 1 };
  for (let column = 1; column <= 4; column++) {
    resumen.getCell(row, column).font = BOLD;
    resumen.getCell(row, column).fill = TOTAL_FILL;
  }
  resumen.getCell(row, 3).numFmt = ACC;
  resumen.getCell(row, 4).numFmt = PCT;
  row++;
  resumen.getCell(row, 1).value =
    "Control: total de la hoja de salidas contra los cargos del banco";
  resumen.getCell(row, 2).value = {
    formula: `Salidas!F${totalRow}`,
    result: analysis.totals.importe,
  };
  resumen.getCell(row, 3).value = analysis.totals.cargosBancoImporte;
  resumen.getCell(row, 4).value = { formula: `ROUND(B${row}-C${row},2)`, result: 0 };
  resumen.getCell(row, 5).value = { formula: `IF(D${row}=0,"OK","REVISAR")`, result: "OK" };
  resumen.getCell(row, 5).font = BOLD;
  resumen.getCell(row, 5).fill = OK_FILL;
  for (const column of [2, 3, 4]) resumen.getCell(row, column).numFmt = ACC;
  row++;
  resumen.getCell(row, 1).value = "% del importe que requiere CFDI y ya lo tiene identificado";
  resumen.getCell(row, 3).value = {
    formula: `IFERROR((C${statusFirst}+C${statusFirst + 1})/(C${totalStatusRow}-C${statusFirst + 4}),0)`,
    result: analysis.totals.pctRequiereYTiene,
  };
  resumen.getCell(row, 3).numFmt = PCT;
  resumen.getCell(row, 3).font = BOLD;
  resumen.getCell(row, 3).fill = KEY_FILL;
  row += 2;

  band(row++, "3. CFDI RECIBIDOS", ["Cantidad", "Importe"]);
  const cfdiRows: [string, number, number][] = [
    [
      "CFDI del mes (activos, tipo ingreso)",
      analysis.totals.cfdiActivos,
      analysis.totals.cfdiActivosImporte,
    ],
    [
      "  Con salida bancaria identificada",
      analysis.totals.cfdiConSalida,
      analysis.totals.cfdiConSalidaImporte,
    ],
    [
      "  Sin salida bancaria identificada",
      analysis.totals.cfdiSinSalida,
      analysis.totals.cfdiSinSalidaImporte,
    ],
    ["Complementos de pago (REP) recibidos", analysis.totals.rep, analysis.totals.repImporte],
    ["CFDI de egreso (notas de crédito)", analysis.totals.egreso, analysis.totals.egresoImporte],
    [
      "CFDI cancelados (no se consideran)",
      analysis.totals.cancelados,
      analysis.totals.canceladosImporte,
    ],
  ];
  for (const [label, count, importe] of cfdiRows) {
    resumen.getCell(row, 1).value = label;
    resumen.getCell(row, 2).value = count;
    resumen.getCell(row, 3).value = importe;
    resumen.getCell(row, 3).numFmt = ACC;
    row++;
  }
  if (analysis.warnings.length) {
    row++;
    band(row++, "4. AVISOS");
    for (const warning of analysis.warnings) {
      resumen.getCell(row++, 1).value = warning;
    }
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
