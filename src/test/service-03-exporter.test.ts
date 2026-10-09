import ExcelJS from "exceljs";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { analyzeIssuedInvoices } from "@/lib/proconta/service-03/engine";
import { exportService03Xlsx } from "@/lib/proconta/service-03/exporter";

const packageRoot = resolve(process.cwd(), "docs/SERVICE-03");

interface GoldenFixture {
  entrada: string;
  salida_esperada: string;
  hoja_salida: string;
  opciones: {
    cliente: string;
    tolerancia_por_dia: number;
    folios_confirmados_tasa0: string[];
    siigo_base16: number | null;
    siigo_base0: number | null;
  };
}

const cases = [
  {
    name: "B",
    golden: "03_resultados_esperados/golden_B.json",
    input: "01_entradas/B_INGRESOS_2026-09_al_29.xlsx",
    output: "03_resultados_esperados/CLIENTE_B_INGRESOS_09_29.xlsx",
  },
  {
    name: "C",
    golden: "03_resultados_esperados/golden_C.json",
    input: "01_entradas/C_INGRESOS_2026-09_al_30.xlsx",
    output: "03_resultados_esperados/INGRESOS_09_30.xlsx",
  },
] as const;

async function readWorkbook(path: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolve(packageRoot, path));
  return workbook;
}

function visibleValue(value: ExcelJS.CellValue): unknown {
  const displayed =
    value && typeof value === "object" && "formula" in value
      ? "result" in value
        ? value.result
        : null
      : value;
  if (typeof displayed === "number") {
    const cents = Math.round((displayed + Number.EPSILON) * 100) / 100;
    return cents === 0 ? 0 : cents;
  }
  return displayed;
}

function compareCellValues(
  actual: ExcelJS.Worksheet,
  expected: ExcelJS.Worksheet,
  firstColumn: number,
  lastColumn: number,
  lastRow: number,
): Array<{ cell: string; actual: unknown; expected: unknown }> {
  const differences: Array<{ cell: string; actual: unknown; expected: unknown }> = [];
  for (let row = 1; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const actualCell = actual.getCell(row, column);
      const expectedCell = expected.getCell(row, column);
      const actualValue = visibleValue(actualCell.value);
      const expectedValue = visibleValue(expectedCell.value);
      if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
        differences.push({
          cell: actualCell.address,
          actual: actualValue,
          expected: expectedValue,
        });
      }
    }
  }
  return differences;
}

describe.each(cases)(
  "Servicio 3, Excel validado del cliente $name",
  ({ golden, input, output }) => {
    const goldenPath = resolve(packageRoot, golden);
    const hasFixture =
      existsSync(goldenPath) ||
      existsSync(resolve(packageRoot, input)) ||
      existsSync(resolve(packageRoot, output));

    // The accounting fixtures are ignored by Git. A clean clone skips the case;
    // a partial package fails when the files are read below.
    it.skipIf(!hasFixture)("preserva el original y reproduce el resultado esperado", async () => {
      const fixture = JSON.parse(readFileSync(goldenPath, "utf8")) as GoldenFixture;
      const source = await readWorkbook(fixture.entrada);
      const goldenWorkbook = await readWorkbook(fixture.salida_esperada);
      const analysis = analyzeIssuedInvoices(source, {
        clientLabel: fixture.opciones.cliente,
        tolerance: fixture.opciones.tolerancia_por_dia,
        confirmedZeroRateFolios: fixture.opciones.folios_confirmados_tasa0,
        siigoBase16: fixture.opciones.siigo_base16,
        siigoBase0: fixture.opciones.siigo_base0,
      });

      const output = await exportService03Xlsx(analysis);
      const result = new ExcelJS.Workbook();
      await result.xlsx.load(output.bytes as unknown as Parameters<typeof result.xlsx.load>[0]);
      const original = await readWorkbook(fixture.entrada);
      const originalSheet = original.worksheets[0];
      const resultSheet = result.worksheets[0];
      const goldenSheet = goldenWorkbook.worksheets[0];
      const resultSummary = result.getWorksheet("Resumen");
      const goldenSummary = goldenWorkbook.getWorksheet("Resumen");
      if (!originalSheet || !resultSheet || !goldenSheet || !resultSummary || !goldenSummary) {
        throw new Error("Falta una hoja necesaria para cotejar el Excel.");
      }

      expect(output.filename).toBe(fixture.salida_esperada.split("/").at(-1));
      expect(result.worksheets.map((sheet) => sheet.name)).toEqual([
        fixture.hoja_salida,
        "Resumen",
      ]);
      expect(resultSheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });

      const originalDifferences = compareCellValues(
        resultSheet,
        originalSheet,
        1,
        analysis.ultima_columna_original,
        analysis.rows.at(-1)?.rowNumber ?? 1,
      );
      expect(
        originalDifferences.slice(0, 20),
        `${originalDifferences.length} cambios en columnas originales`,
      ).toEqual([]);

      const totalRow = (analysis.rows.at(-1)?.rowNumber ?? 1) + 2;
      const reviewDifferences = compareCellValues(
        resultSheet,
        goldenSheet,
        analysis.columna_resultados_inicia,
        analysis.columna_resultados_inicia + 7,
        totalRow,
      );
      expect(
        reviewDifferences.slice(0, 20),
        `${reviewDifferences.length} diferencias en columnas S:Z`,
      ).toEqual([]);

      const summaryDifferences = compareCellValues(
        resultSummary,
        goldenSummary,
        1,
        9,
        Math.max(resultSummary.rowCount, goldenSummary.rowCount),
      );
      expect(
        summaryDifferences.slice(0, 20),
        `${summaryDifferences.length} diferencias en Resumen`,
      ).toEqual([]);
    });
  },
);

it("las fórmulas del Excel excluyen comprobantes activos que no son de ingreso", async () => {
  const source = new ExcelJS.Workbook();
  const sheet = source.addWorksheet("Hoja1");
  sheet.addRow([
    "Fecha",
    "Folio",
    "Sub Total",
    "Total",
    "Total IVA Tras.",
    "Estatus",
    "Tipo de Comprobante",
  ]);
  sheet.addRow(["2026-09-01", "100", 100, 116, 16, "Activo", "INGRESO"]);
  sheet.addRow(["2026-09-01", "101", 200, 232, 32, "Activo", "EGRESO"]);

  const analysis = analyzeIssuedInvoices(source);
  const exported = await exportService03Xlsx(analysis);
  const result = new ExcelJS.Workbook();
  await result.xlsx.load(exported.bytes as unknown as Parameters<typeof result.xlsx.load>[0]);
  const resultSheet = result.worksheets[0];
  const summary = result.getWorksheet("Resumen");
  if (!resultSheet || !summary) throw new Error("Faltan las hojas del resultado.");

  expect(visibleValue(resultSheet.getCell("S3").value)).toBe(100);
  expect(resultSheet.getCell("S3").formula).toContain('G2:G3,"INGRESO"');
  expect(visibleValue(summary.getCell("B8").value)).toBe(1);
  expect(summary.getCell("B8").formula).toContain("COUNTIFS");
  expect(analysis.controlSubtotal).toBe(0);
  expect(summary.getCell("B21").formula).toContain("SUMIFS");
  expect(visibleValue(summary.getCell("C21").value)).toBe("OK");
  expect(visibleValue(resultSheet.getCell("C3").value)).toBe(200);
});
