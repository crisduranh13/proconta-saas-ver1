import type { Service03Analysis } from "./types";

export interface Service03WorkbookExport {
  filename: string;
  bytes: Uint8Array;
}

const MONEY_FORMAT = '"$"#,##0.00;[Red]\\-"$"#,##0.00';
const NUMBER_FORMAT = "#,##0.00";
const HEADER_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFD9E1F2" },
};
const BASE_FONT = { name: "Arial", size: 10 };
const BOLD_FONT = { ...BASE_FONT, bold: true };

function columnLetter(index: number): string {
  let value = index;
  let label = "";
  while (value > 0) {
    const digit = (value - 1) % 26;
    label = String.fromCharCode(65 + digit) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function activeIncomeSumFormula(
  valueRange: string,
  statusRange: string,
  typeRange?: string,
): string {
  if (!typeRange) return `SUMIFS(${valueRange},${statusRange},"Activo")`;
  return ["INGRESO", "I", ""]
    .map((type) => `SUMIFS(${valueRange},${statusRange},"Activo",${typeRange},"${type}")`)
    .join("+");
}

/**
 * Creates the accountant's review workbook from a validated Service 3 analysis.
 * The analysis owns the loaded source workbook, so call this once per analysis.
 * The original source columns retain their values; only review columns and a
 * Resumen worksheet are added.
 */
export async function exportService03Xlsx(
  analysis: Service03Analysis,
): Promise<Service03WorkbookExport> {
  const { workbook, worksheet, headerColumns: headers } = analysis;
  const lastRow = analysis.rows.at(-1)?.rowNumber;
  if (!lastRow) throw new Error("No hay CFDI para exportar.");
  if (workbook.getWorksheet("Resumen")) {
    throw new Error(
      "Este análisis ya se exportó. Vuelve a analizar el archivo para generar otra copia.",
    );
  }

  worksheet.name = analysis.sheetName;
  const firstResultColumn = analysis.columna_resultados_inicia;
  const [
    subtotalColumn,
    totalColumn,
    ivaColumn,
    discountColumn,
    differenceColumn,
    zeroRateColumn,
    iepsColumn,
    reviewColumn,
  ] = Array.from({ length: 8 }, (_, index) => firstResultColumn + index);
  if (
    subtotalColumn === undefined ||
    totalColumn === undefined ||
    ivaColumn === undefined ||
    discountColumn === undefined ||
    differenceColumn === undefined ||
    zeroRateColumn === undefined ||
    iepsColumn === undefined ||
    reviewColumn === undefined
  ) {
    throw new Error("No se pudieron crear las columnas de revisión.");
  }

  const originalSubtotal = columnLetter(headers.subtotal);
  const originalTotal = columnLetter(headers.total);
  const originalIva = columnLetter(headers.iva);
  const originalStatus = columnLetter(headers.estatus);
  const originalType = headers.tipo ? columnLetter(headers.tipo) : null;
  const originalDiscount = headers.descuento ? columnLetter(headers.descuento) : null;
  const resultSubtotal = columnLetter(subtotalColumn);
  const resultTotal = columnLetter(totalColumn);
  const resultIva = columnLetter(ivaColumn);
  const resultDiscount = columnLetter(discountColumn);
  const resultDifference = columnLetter(differenceColumn);
  const resultZeroRate = columnLetter(zeroRateColumn);
  const resultIeps = columnLetter(iepsColumn);
  const resultReview = columnLetter(reviewColumn);
  const confirmedRows = new Set(
    analysis.candidatos_sin_iva
      .filter((candidate) => candidate.confirmed)
      .map((candidate) => candidate.fila),
  );

  ["SUBTOTAL", "TOTAL", "IVA", "DESCUENTO", "DIFERENCIA", "TASA 0%", "IEPS", "REVISIÓN"].forEach(
    (label, index) => {
      const cell = worksheet.getCell(1, firstResultColumn + index);
      cell.value = label;
      cell.font = BOLD_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: "center" };
      worksheet.getColumn(firstResultColumn + index).width = index === 7 ? 12 : 15;
    },
  );

  const iepsFormula = (row: number): string => {
    if (headers.ieps) return `ROUND(${columnLetter(headers.ieps)}${row},2)`;
    return `ROUND(${originalTotal}${row}-${originalSubtotal}${row}${originalDiscount ? `+${originalDiscount}${row}` : ""}-${originalIva}${row}${headers.ivaret ? `+${columnLetter(headers.ivaret)}${row}` : ""}${headers.isrret ? `+${columnLetter(headers.isrret)}${row}` : ""},2)`;
  };

  for (const day of analysis.dias) {
    const end = day.fila_fin;
    const range = (column: string): string => `${column}${day.fila_ini}:${column}${end}`;
    const dailySum = (column: string, result: number) => ({
      formula: activeIncomeSumFormula(
        range(column),
        range(originalStatus),
        originalType ? range(originalType) : undefined,
      ),
      result,
    });
    worksheet.getCell(end, subtotalColumn).value = dailySum(originalSubtotal, day.S);
    worksheet.getCell(end, totalColumn).value = dailySum(originalTotal, day.T);
    worksheet.getCell(end, ivaColumn).value = dailySum(originalIva, day.U);
    worksheet.getCell(end, discountColumn).value = originalDiscount
      ? dailySum(originalDiscount, day.V)
      : 0;
    worksheet.getCell(end, differenceColumn).value = {
      formula: `+(${resultSubtotal}${end}-${resultDiscount}${end})*0.16-${resultIva}${end}`,
      result: day.WExact,
    };
    worksheet.getCell(end, reviewColumn).value = {
      formula: `IF(ABS(${resultDifference}${end}-(SUM(${resultZeroRate}${day.fila_ini}:${resultZeroRate}${end})-SUM(${resultIeps}${day.fila_ini}:${resultIeps}${end}))*0.16)<=Resumen!$B$4,"OK","REVISAR")`,
      result: day.revision,
    };
    for (const column of [
      subtotalColumn,
      totalColumn,
      ivaColumn,
      discountColumn,
      differenceColumn,
    ]) {
      worksheet.getCell(end, column).numFmt = MONEY_FORMAT;
    }
  }

  for (const invoice of analysis.rows) {
    if (!invoice.active || invoice.ieps <= 0) continue;
    const cell = worksheet.getCell(invoice.rowNumber, iepsColumn);
    cell.value = { formula: iepsFormula(invoice.rowNumber), result: invoice.ieps };
    cell.numFmt = MONEY_FORMAT;
  }

  for (const candidate of analysis.candidatos_sin_iva) {
    if (!candidate.confirmed) continue;
    const row = candidate.fila;
    const cell = worksheet.getCell(row, zeroRateColumn);
    cell.value = {
      formula: `ROUND(${originalSubtotal}${row}${originalDiscount ? `-${originalDiscount}${row}` : ""}+${resultIeps}${row}-${originalIva}${row}/0.16,2)`,
      result: candidate.base0,
    };
    cell.numFmt = MONEY_FORMAT;
  }

  const totalsRow = lastRow + 2;
  const totalLabel = worksheet.getCell(totalsRow, firstResultColumn - 1);
  totalLabel.value = "TOTAL";
  totalLabel.font = BOLD_FONT;
  const totals = [
    analysis.totales.S,
    analysis.totales.T,
    analysis.totales.U,
    analysis.totales.V,
    analysis.totales.W,
    analysis.resumen.X,
    analysis.totales.IEPS,
  ];
  for (let index = 0; index < totals.length; index++) {
    const column = firstResultColumn + index;
    const result = totals[index];
    if (result === undefined) continue;
    const letter = columnLetter(column);
    const cell = worksheet.getCell(totalsRow, column);
    cell.value = { formula: `SUM(${letter}2:${letter}${lastRow})`, result };
    cell.numFmt = MONEY_FORMAT;
    cell.font = BOLD_FONT;
    cell.fill = HEADER_FILL;
  }
  const reviewTotal = worksheet.getCell(totalsRow, reviewColumn);
  reviewTotal.value = {
    formula: `COUNTIF(${resultReview}2:${resultReview}${lastRow},"REVISAR")`,
    result: analysis.resumen.revisar,
  };
  reviewTotal.font = BOLD_FONT;
  reviewTotal.fill = HEADER_FILL;
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  const lastOriginal = columnLetter(analysis.ultima_columna_original);
  worksheet.addConditionalFormatting({
    ref: `A2:${lastOriginal}${lastRow}`,
    rules: [
      {
        type: "expression",
        priority: 1,
        formulae: [`$${originalStatus}2="Cancelado"`],
        style: {
          font: { strike: true, color: { argb: "FF808080" } },
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD9D9D9" } },
        },
      },
      {
        type: "expression",
        priority: 2,
        formulae: [
          `AND($${originalStatus}2="Activo",OR(ISNUMBER($${resultZeroRate}2),ISNUMBER($${resultIeps}2)))`,
        ],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFDDEBF7" } },
        },
      },
      {
        type: "expression",
        priority: 3,
        formulae: [
          `AND($${originalStatus}2="Activo",($${originalSubtotal}2${originalDiscount ? `-$${originalDiscount}2` : ""})*0.16-$${originalIva}2>Resumen!$B$4)`,
        ],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } },
        },
      },
    ],
  });
  worksheet.addConditionalFormatting({
    ref: `${resultReview}2:${resultReview}${lastRow}`,
    rules: [
      {
        type: "cellIs",
        operator: "equal",
        priority: 4,
        formulae: ['"REVISAR"'],
        style: {
          font: { bold: true, color: { argb: "FF9C0006" } },
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } },
        },
      },
      {
        type: "cellIs",
        operator: "equal",
        priority: 5,
        formulae: ['"OK"'],
        style: {
          font: { color: { argb: "FF006100" } },
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFC6EFCE" } },
        },
      },
    ],
  });

  addSummaryWorksheet(analysis, totalsRow, {
    originalStatus,
    originalType,
    originalSubtotal,
    resultSubtotal,
    resultTotal,
    resultIva,
    resultDiscount,
    resultDifference,
    resultZeroRate,
    resultIeps,
    resultReview,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return { filename: analysis.outputFilename, bytes: new Uint8Array(buffer) };
}

interface SummaryColumns {
  originalStatus: string;
  originalType: string | null;
  originalSubtotal: string;
  resultSubtotal: string;
  resultTotal: string;
  resultIva: string;
  resultDiscount: string;
  resultDifference: string;
  resultZeroRate: string;
  resultIeps: string;
  resultReview: string;
}

function addSummaryWorksheet(
  analysis: Service03Analysis,
  totalsRow: number,
  columns: SummaryColumns,
): void {
  const { workbook, rows, totales, resumen, options } = analysis;
  const confirmedRows = new Set(
    analysis.candidatos_sin_iva
      .filter((candidate) => candidate.confirmed)
      .map((candidate) => candidate.fila),
  );
  const summary = workbook.addWorksheet("Resumen");
  const sourceSheet = `'${analysis.sheetName}'`;
  const lastRow = rows.at(-1)?.rowNumber ?? 1;
  const month = analysis.period.month;
  const year = analysis.period.year;
  const day = analysis.period.to.slice(8, 10);
  const fullRange = (column: string): string => `${sourceSheet}!${column}2:${column}${lastRow}`;
  const activeCountFormula = columns.originalType
    ? ["INGRESO", "I", ""]
        .map(
          (type) =>
            `COUNTIFS(${fullRange(columns.originalStatus)},"Activo",${fullRange(columns.originalType ?? "")},"${type}")`,
        )
        .join("+")
    : `COUNTIF(${fullRange(columns.originalStatus)},"Activo")`;

  const section = (row: number, title: string): void => {
    const cell = summary.getCell(row, 1);
    cell.value = title;
    cell.font = BOLD_FONT;
    for (let column = 1; column <= 9; column++) {
      summary.getCell(row, column).fill = HEADER_FILL;
    }
  };
  summary.getCell("A1").value =
    `REVISIÓN DE CFDI EMITIDOS${options.clientLabel ? ` · ${options.clientLabel.toUpperCase()}` : ""} · ${month}/${year} (al ${day}/${month}/${year})`;
  summary.getCell("A1").font = { name: "Arial", bold: true, size: 13 };
  summary.getCell("A2").value =
    "Fuente: reporte INGRESOS de Doc Digitales sin modificar. Por día, al último CFDI: DIFERENCIA = (SUBTOTAL − DESCUENTO) × 16% − IVA. Solo CFDI activos. IEPS = Total − (Subtotal − Descuento) − IVA + retenciones.";
  summary.getCell("A2").font = { name: "Arial", size: 9, italic: true };
  summary.getCell("A4").value = "Tolerancia por redondeo ($)";
  summary.getCell("B4").value = options.tolerance;
  summary.getCell("B4").font = { ...BASE_FONT, color: { argb: "FF0000FF" } };
  summary.getCell("B4").numFmt = NUMBER_FORMAT;

  section(6, "RESULTADO DEL MES");
  const resultRows: Record<string, number> = {};
  let current = 7;
  const put = (
    key: string,
    label: string,
    value: number | string | { formula: string; result: number | string },
    format = NUMBER_FORMAT,
    bold = false,
  ): void => {
    resultRows[key] = current;
    const labelCell = summary.getCell(current, 1);
    const valueCell = summary.getCell(current, 2);
    labelCell.value = label;
    valueCell.value = value;
    labelCell.font = BASE_FONT;
    valueCell.font = bold ? BOLD_FONT : BASE_FONT;
    valueCell.numFmt = format;
    current++;
  };

  put("n", "CFDI en el archivo", totales.cfdi, "0");
  put(
    "act",
    "  Activos",
    {
      formula: activeCountFormula,
      result: totales.activos,
    },
    "0",
  );
  put(
    "can",
    "  Cancelados (no se suman)",
    {
      formula: `COUNTIF(${fullRange(columns.originalStatus)},"Cancelado")`,
      result: totales.cancelados,
    },
    "0",
  );
  put(
    "S",
    "SUBTOTAL",
    { formula: `${sourceSheet}!${columns.resultSubtotal}${totalsRow}`, result: totales.S },
    NUMBER_FORMAT,
    true,
  );
  put(
    "T",
    "TOTAL",
    { formula: `${sourceSheet}!${columns.resultTotal}${totalsRow}`, result: totales.T },
    NUMBER_FORMAT,
    true,
  );
  put("U", "IVA trasladado", {
    formula: `${sourceSheet}!${columns.resultIva}${totalsRow}`,
    result: totales.U,
  });
  put("V", "DESCUENTO", {
    formula: `${sourceSheet}!${columns.resultDiscount}${totalsRow}`,
    result: totales.V,
  });
  put(
    "W",
    "DIFERENCIA (suma de la columna DIFERENCIA)",
    { formula: `${sourceSheet}!${columns.resultDifference}${totalsRow}`, result: totales.W },
    NUMBER_FORMAT,
    true,
  );
  put("X", "Ventas a TASA 0% confirmadas", {
    formula: `${sourceSheet}!${columns.resultZeroRate}${totalsRow}`,
    result: resumen.X,
  });
  put("I", "IEPS incluido en la base del IVA", {
    formula: `${sourceSheet}!${columns.resultIeps}${totalsRow}`,
    result: totales.IEPS,
  });
  put("E", "  IVA que explican la tasa 0% y el IEPS", {
    formula: `ROUND((B${resultRows["X"]}-B${resultRows["I"]})*0.16,2)`,
    result: totales.iva_explicado,
  });
  put(
    "NE",
    "DIFERENCIA NO EXPLICADA",
    {
      formula: `ROUND(B${resultRows["W"]}-B${resultRows["E"]},2)`,
      result: resumen.noExplicada,
    },
    NUMBER_FORMAT,
    true,
  );
  put(
    "dr",
    "Días a revisar",
    {
      formula: `${sourceSheet}!${columns.resultReview}${totalsRow}`,
      result: resumen.revisar,
    },
    "0",
    true,
  );

  const unexplainedRow = resultRows["NE"];
  if (unexplainedRow !== undefined) {
    for (const column of [1, 2]) {
      summary.getCell(unexplainedRow, column).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF2CC" },
      };
    }
    summary.getCell(unexplainedRow, 3).value = {
      formula: `IF(ABS(B${unexplainedRow})<=B4,"OK: todo explicado","REVISAR")`,
      result: Math.abs(resumen.noExplicada) <= options.tolerance ? "OK: todo explicado" : "REVISAR",
    };
    summary.getCell(unexplainedRow, 3).font = BOLD_FONT;
  }

  current++;
  const controlRow = current;
  summary.getCell(controlRow, 1).value =
    "Control: subtotal directo de activos − suma de los días (debe dar 0)";
  summary.getCell(controlRow, 2).value = {
    formula: `ROUND(${activeIncomeSumFormula(
      fullRange(columns.originalSubtotal),
      fullRange(columns.originalStatus),
      columns.originalType ? fullRange(columns.originalType) : undefined,
    )}-B${resultRows["S"]},2)`,
    result: analysis.controlSubtotal,
  };
  summary.getCell(controlRow, 3).value = {
    formula: `IF(B${controlRow}=0,"OK","REVISAR")`,
    result: "OK",
  };
  summary.getCell(controlRow, 1).font = BASE_FONT;
  summary.getCell(controlRow, 3).font = BOLD_FONT;

  let row = controlRow + 2;
  if (options.siigoBase16 !== null || options.siigoBase0 !== null) {
    section(row++, "COTEJO vs SIIGO");
    ["Concepto", "SIIGO", "CFDI", "Diferencia"].forEach((label, index) => {
      const cell = summary.getCell(row, index + 1);
      cell.value = label;
      cell.font = BOLD_FONT;
    });
    row++;
    const siigoRows: [string, number, string, number][] = [
      [
        "Base al 16%",
        options.siigoBase16 ?? 0,
        `B${resultRows["S"]}-B${resultRows["V"]}-B${resultRows["X"]}`,
        totales.base16,
      ],
      ["Base al 0%", options.siigoBase0 ?? 0, `B${resultRows["X"]}`, resumen.X],
    ];
    for (const [label, siigo, formula, cfdi] of siigoRows) {
      summary.getCell(row, 1).value = label;
      summary.getCell(row, 2).value = siigo;
      summary.getCell(row, 2).font = { ...BASE_FONT, color: { argb: "FF0000FF" } };
      summary.getCell(row, 3).value = { formula, result: cfdi };
      summary.getCell(row, 4).value = {
        formula: `ROUND(C${row}-B${row},2)`,
        result: roundMoney(cfdi - siigo),
      };
      for (const column of [2, 3, 4]) summary.getCell(row, column).numFmt = NUMBER_FORMAT;
      row++;
    }
    summary.getCell(row, 1).value =
      "Una diferencia en la base al 0% suele ser un CFDI de tasa 0% que no se registró en SIIGO, o uno sin IVA que no es bomba.";
    summary.getCell(row, 1).font = { name: "Arial", size: 9, italic: true };
    row += 2;
  }

  section(row++, "CFDI CON DIFERENCIA EN EL IVA (revisión por comprobante)");
  [
    "Folio",
    "Fecha",
    "Receptor",
    "Subtotal",
    "IVA",
    "Diferencia",
    "IEPS",
    "Base 0%",
    "Explicación",
  ].forEach((label, index) => {
    const cell = summary.getCell(row, index + 1);
    cell.value = label;
    cell.font = BOLD_FONT;
  });
  row++;
  if (analysis.cfdi_con_diferencia.length === 0) {
    summary.getCell(row++, 1).value = "Ninguno: todos los CFDI activos traen IVA exacto al 16%.";
  }
  for (const invoice of analysis.cfdi_con_diferencia) {
    const base0 = invoice.base0 * 0.16 > 0.05 ? invoice.base0 : 0;
    const confirmed = base0 > 0 && confirmedRows.has(invoice.fila);
    const explanation = invoice.explicacion || "Diferencia de redondeo";
    [
      invoice.folio,
      invoice.dia,
      invoice.receptor,
      invoice.subtotal,
      invoice.iva,
      invoice.dif,
      invoice.ieps || null,
      base0 || null,
      explanation,
    ].forEach((value, index) => {
      const cell = summary.getCell(row, index + 1);
      cell.value = value;
      cell.font = BASE_FONT;
      if (index >= 3 && index <= 7) cell.numFmt = NUMBER_FORMAT;
    });
    summary.getCell(row, 9).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: base0 > 0 && !confirmed ? "FFFFC7CE" : "FFDDEBF7" },
    };
    row++;
  }

  row++;
  section(row++, "CANCELADOS (no se suman)");
  ["Folio", "Fecha", "Receptor", "Subtotal", "IVA", "Total", "Posible sustituto"].forEach(
    (label, index) => {
      const cell = summary.getCell(row, index + 1);
      cell.value = label;
      cell.font = BOLD_FONT;
    },
  );
  row++;
  if (analysis.cancelados.length === 0) summary.getCell(row++, 1).value = "Ninguno.";
  for (const invoice of analysis.cancelados) {
    const substitute = invoice.sustituto
      ? `${invoice.sustituto}${invoice.sustituto_dia ? ` (${invoice.sustituto_dia.slice(8, 10)}/${invoice.sustituto_dia.slice(5, 7)})` : ""}`
      : "No se encontró uno con el mismo total y receptor";
    [
      invoice.folio,
      invoice.dia,
      invoice.receptor,
      invoice.subtotal,
      invoice.iva,
      invoice.total,
      substitute,
    ].forEach((value, index) => {
      const cell = summary.getCell(row, index + 1);
      cell.value = value;
      cell.font = BASE_FONT;
      if (index >= 3 && index <= 5) cell.numFmt = NUMBER_FORMAT;
    });
    row++;
  }

  row++;
  section(row++, "FOLIOS QUE NO VIENEN EN EL ARCHIVO");
  if (analysis.folios_faltantes.length === 0) {
    summary.getCell(row++, 1).value = "Ninguno: la secuencia está completa.";
  }
  for (const folio of analysis.folios_faltantes) {
    summary.getCell(row, 1).value = folio;
    summary.getCell(row, 2).value =
      "Confirmar si es un CFDI que no bajó el sistema o un folio no timbrado.";
    row++;
  }

  const nonIncome = analysis.rows.filter(
    (invoice) => invoice.estatus.toLowerCase() === "activo" && !invoice.active,
  );
  if (nonIncome.length) {
    row++;
    section(row++, "CFDI ACTIVOS QUE NO SON DE INGRESO (no se suman)");
    for (const invoice of nonIncome) {
      summary.getCell(row, 1).value = invoice.folio;
      summary.getCell(row, 2).value = invoice.tipo;
      summary.getCell(row, 4).value = invoice.total;
      row++;
    }
  }

  row++;
  section(row++, "CRITERIO FISCAL");
  summary.getCell(row, 1).value =
    "IEPS: cuando un producto causa IEPS, el IVA se calcula sobre el precio más el IEPS (art. 18 LIVA); por eso esos CFDI traen un IVA mayor al 16% del subtotal.";
  summary.getCell(row++, 1).font = { name: "Arial", size: 9 };
  summary.getCell(row, 1).value =
    "Tasa 0% en bombas: aplica a equipo para riego agrícola (art. 2-A, fr. I, inciso e, LIVA). Una bomba de uso doméstico va al 16%. El contador confirma.";
  summary.getCell(row, 1).font = { name: "Arial", size: 9 };

  summary.getColumn(1).width = 46;
  summary.getColumn(2).width = 16;
  summary.getColumn(3).width = 28;
  for (const column of [4, 5, 6, 7, 8]) summary.getColumn(column).width = 12;
  summary.getColumn(9).width = 70;
}
