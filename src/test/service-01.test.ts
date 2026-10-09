import ExcelJS from "exceljs";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { readBbvaPdf } from "@/lib/proconta/service-01/bbva-pdf";
import { readBbvaXlsx } from "@/lib/proconta/service-01/bbva-xlsx";
import { CATALOG_A, CATALOG_B, resolveCatalog } from "@/lib/proconta/service-01/catalogs";
import { readCfdiWorkbook } from "@/lib/proconta/service-01/cfdi-xlsx";
import { analyzeOutflows, rfcFromDescription, tokens } from "@/lib/proconta/service-01/engine";
import { exportService01Xlsx } from "@/lib/proconta/service-01/exporter";
import { hungarian } from "@/lib/proconta/service-01/hungarian";
import { extractPdfWords } from "@/lib/proconta/service-01/pdf-text";
import type { BankStatement, CfdiFile, Service01Status } from "@/lib/proconta/service-01/types";
import { SERVICE01_STATUSES } from "@/lib/proconta/service-01/types";

const packageRoot = resolve(process.cwd(), "docs/SERVICE-01");
const path = (relative: string) => resolve(packageRoot, relative);
const caseA = {
  pdf: path("01_entradas/caso_A/estado_cuenta_BBVA_sep2026.pdf"),
  cfdi: path("01_entradas/caso_A/cfdi_recibidos_DocDigitales_sep2026.xlsx"),
  golden: path("03_resultados_esperados/golden_A.json"),
  csv: path("03_resultados_esperados/golden_A_movimientos.csv"),
};
const caseB = {
  banks: [
    path("01_entradas/caso_B/movimientos_BBVA_PYME.xlsx"),
    path("01_entradas/caso_B/movimientos_BBVA_personal.xlsx"),
    path("01_entradas/caso_B/movimientos_TDC.xlsx"),
  ],
  cfdi: path("01_entradas/caso_B/cfdi_recibidos_DocDigitales_sep2026.xlsx"),
  golden: path("03_resultados_esperados/golden_B.json"),
  csv: path("03_resultados_esperados/golden_B_movimientos.csv"),
};
const priorMonthFile = resolve(
  process.cwd(),
  "docs/SERVICE-02/01_entradas/cfdi_mes_anterior_pendientes_ago2026.xlsx",
);
const hasA = Object.values(caseA).every(existsSync);
const hasB = [...caseB.banks, caseB.cfdi, caseB.golden, caseB.csv].every(existsSync);

interface Golden {
  validacion_banco?: {
    saldo_inicial: number;
    cargos_n: number;
    cargos_importe: number;
    abonos_n: number;
    abonos_importe: number;
    saldo_final: number;
    movimientos: number;
  };
  por_estatus: Record<Service01Status, { salidas: number; importe: number }>;
  total_salidas: { n: number; importe: number };
  cfdi?: {
    activos_ingreso: number;
    con_salida: number;
    sin_salida: number;
    rep: number;
    egreso: number;
    cancelados: number;
  };
  pct_importe_que_requiere_cfdi_y_lo_tiene?: number;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function workbook(file: string) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  return book;
}

async function loadCfdi(file: string): Promise<CfdiFile> {
  return readCfdiWorkbook(await workbook(file), file.split("/").at(-1)!);
}

describe("Servicio 1 · caso A (BBVA PDF, prueba exacta)", () => {
  it.skipIf(!hasA)(
    "valida el banco, reproduce los totales y el estatus de las 252 salidas",
    async () => {
      const golden = JSON.parse(readFileSync(caseA.golden, "utf8")) as Golden;
      const pages = await extractPdfWords(new Uint8Array(readFileSync(caseA.pdf)));
      expect(pages).toHaveLength(22);
      const statement = readBbvaPdf(pages, "estado_cuenta_BBVA_sep2026.pdf");
      const bank = golden.validacion_banco!;
      expect(statement.rfc).toBe("BECC840424JS4");
      expect(statement.periodFrom).toBe("2026-09-01");
      expect(statement.periodTo).toBe("2026-09-30");
      expect(statement.openingBalance).toBe(bank.saldo_inicial);
      expect(statement.closingBalance).toBe(bank.saldo_final);
      expect(statement.movements).toHaveLength(bank.movimientos);
      expect(statement.checks.every((check) => check.ok)).toBe(true);
      expect(statement.checks.map((check) => check.read)).toEqual([
        bank.cargos_n,
        bank.cargos_importe,
        bank.abonos_n,
        bank.abonos_importe,
        bank.saldo_final,
      ]);
      expect(resolveCatalog([statement]).id).toBe(CATALOG_A.id);

      const cfdi = await loadCfdi(caseA.cfdi);
      const analysis = analyzeOutflows([statement], cfdi, { catalog: CATALOG_A });
      expect(analysis.totals.salidas).toBe(golden.total_salidas.n);
      expect(analysis.totals.importe).toBe(golden.total_salidas.importe);

      // Estatus de cada salida, en el mismo orden del golden (fecha de operación, orden del banco).
      const rows = parseCsv(readFileSync(caseA.csv, "utf8"))
        .slice(1)
        .filter((row) => row.length >= 15);
      expect(rows).toHaveLength(252);
      const differences = rows.flatMap((row, index) => {
        const actual = analysis.outflows[index]!;
        const sameAmount = Math.abs(Number(row[4]) - actual.movement.cargo) < 0.005;
        const sameStatus = row[5] === actual.status;
        return sameAmount && sameStatus
          ? []
          : [
              `#${index + 1} ${row[0]} ${row[2]} $${row[4]} CFDI ${row[6]}: esperado ${row[5]} / obtenido ${actual.status} (${actual.movement.description} $${actual.movement.cargo}) ${actual.note}`,
            ];
      });
      expect(differences, differences.join("\n")).toEqual([]);

      for (const status of SERVICE01_STATUSES) {
        expect(analysis.byStatus[status], status).toEqual(golden.por_estatus[status]);
      }
      const expectedCfdi = golden.cfdi!;
      expect({
        activos_ingreso: analysis.totals.cfdiActivos,
        con_salida: analysis.totals.cfdiConSalida,
        sin_salida: analysis.totals.cfdiSinSalida,
        rep: analysis.totals.rep,
        egreso: analysis.totals.egreso,
        cancelados: analysis.totals.cancelados,
      }).toEqual(expectedCfdi);
      expect(Math.round(analysis.totals.pctRequiereYTiene * 1000) / 1000).toBe(
        golden.pct_importe_que_requiere_cfdi_y_lo_tiene,
      );
    },
  );

  it.skipIf(!hasA)("genera el Excel de 3 hojas con el control en cero", async () => {
    const pages = await extractPdfWords(new Uint8Array(readFileSync(caseA.pdf)));
    const statement = readBbvaPdf(pages, "estado_cuenta_BBVA_sep2026.pdf");
    const analysis = analyzeOutflows([statement], await loadCfdi(caseA.cfdi));
    const output = await exportService01Xlsx(analysis);
    expect(output.filename).toBe("Conciliacion_Salidas_vs_CFDI_202609_BECC840424JS4.xlsx");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(output.bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
    expect(book.worksheets.map((sheet) => sheet.name).sort()).toEqual([
      "CFDI sin pago",
      "Resumen",
      "Salidas",
    ]);
    const salidas = book.getWorksheet("Salidas")!;
    expect(salidas.rowCount).toBe(1 + 252 + 1);
    const total = salidas.getCell(254, 6).value as { result?: number };
    expect(total.result).toBe(1938713.49);
    expect(book.getWorksheet("CFDI sin pago")!.rowCount).toBe(1 + 87 + 1);
    const resumen = book.getWorksheet("Resumen")!;
    let okCells = 0;
    resumen.eachRow((row) => {
      row.eachCell((cell) => {
        const value = cell.value as { result?: unknown } | string;
        if ((typeof value === "object" && value?.result === "OK") || value === "OK") okCells++;
      });
    });
    expect(okCells).toBe(6);
  });
});

describe("Servicio 1 · caso B (BBVA XLSX, por totales ±2)", () => {
  it.skipIf(!hasB)(
    "clasifica las 140 salidas de tres cuentas dentro de la tolerancia",
    async () => {
      const golden = JSON.parse(readFileSync(caseB.golden, "utf8")) as Golden;
      const statements: BankStatement[] = [];
      for (const file of caseB.banks) {
        statements.push(readBbvaXlsx(await workbook(file), file.split("/").at(-1)!));
      }
      expect(statements.map((s) => s.kind)).toEqual(["bbva-xlsx", "bbva-xlsx", "bbva-tdc"]);
      expect(statements.every((s) => s.checks.every((check) => check.ok))).toBe(true);
      expect(resolveCatalog(statements).id).toBe(CATALOG_B.id);
      const cfdi = await loadCfdi(caseB.cfdi);
      // Los 3 CFDI de agosto pagados en septiembre entran como "CFDI del mes anterior".
      const previousMonth = existsSync(priorMonthFile) ? await loadCfdi(priorMonthFile) : null;
      const analysis = analyzeOutflows(statements, cfdi, { previousMonth });
      expect(analysis.catalog.id).toBe(CATALOG_B.id);
      expect(analysis.totals.salidas).toBe(golden.total_salidas.n);
      expect(analysis.totals.importe).toBe(golden.total_salidas.importe);
      expect(analysis.totals.cfdiMesAnterior).toBe(previousMonth ? 3 : 0);
      for (const status of SERVICE01_STATUSES) {
        const actual = analysis.byStatus[status].salidas;
        expect(
          Math.abs(actual - golden.por_estatus[status].salidas),
          `${status}: golden ${golden.por_estatus[status].salidas}, obtenido ${actual}`,
        ).toBeLessThanOrEqual(2);
      }
      expect(Math.round(analysis.totals.pctRequiereYTiene * 1000) / 1000).toBe(
        golden.pct_importe_que_requiere_cfdi_y_lo_tiene,
      );
      expect(
        analysis.outflows.filter((o) => o.status === "PARCIAL").map((o) => o.cfdi?.serieFolio),
      ).toEqual(expect.arrayContaining(["TF-1502976"]));

      // Comparación salida por salida contra golden_B_movimientos.csv. Las dos diferencias
      // conocidas son de regla, no de lectura: un traspaso entre cuentas propias que el golden
      // concilia con un CFDI de $250 (aquí NO REQUIERE) y un CFDI emitido 7 días después del
      // cargo (aquí CONCILIADO C/OBS por la regla de 3 días).
      const rows = parseCsv(readFileSync(caseB.csv, "utf8"))
        .slice(1)
        .filter((row) => row.length >= 13 && row[4] && row[0]);
      expect(rows).toHaveLength(140);
      const pending = [...analysis.outflows];
      const differences = rows.flatMap((row) => {
        const index = pending.findIndex(
          (outflow) =>
            outflow.movement.account === row[0] &&
            outflow.movement.operDate === row[1] &&
            Math.abs(outflow.movement.cargo - Number(row[3])) < 0.005,
        );
        if (index < 0) return [`${row[0]} ${row[1]} $${row[3]}: no se encontró la salida`];
        const [actual] = pending.splice(index, 1);
        return actual!.status === row[4]
          ? []
          : [
              `${row[0]} ${row[1]} ${row[2]!.slice(0, 30)} $${row[3]}: esperado ${row[4]} / obtenido ${actual!.status} (${actual!.note})`,
            ];
      });
      expect(differences.length, differences.join("\n")).toBeLessThanOrEqual(2);
    },
  );
});

describe("Servicio 1 · piezas del motor", () => {
  it("resuelve la asignación óptima aunque la matriz sea rectangular", () => {
    expect(
      hungarian([
        [4, 1, 3],
        [2, 0, 5],
      ]),
    ).toEqual([1, 0]);
    expect(
      hungarian([
        [1, 2],
        [2, 1],
        [3, 3],
      ]),
    ).toEqual([0, 1, -1]);
    expect(hungarian([])).toEqual([]);
  });

  it("lee el RFC de la descripción con o sin espacio y tokeniza sin palabras vacías", () => {
    expect(rfcFromDescription("FERCHEGAS CERRO GORDO ******5534 RFC: GFE 9707075U3 11:25")).toBe(
      "GFE9707075U3",
    );
    expect(rfcFromDescription("FERRE HERCON / ******0064 RFC: MOMM700405FJ5 10:37")).toBe(
      "MOMM700405FJ5",
    );
    expect(rfcFromDescription("SPEI ENVIADO STP 0057563928")).toBe("");
    expect([...tokens("SPEI ENVIADO BAJIO tractoaccesorios costa sur SA DE CV")]).toEqual([
      "BAJIO",
      "TRACTOACCESORIOS",
      "COSTA",
    ]);
  });

  it("rechaza un PDF que no cuadra con sus totales", async () => {
    const header = (y: number) =>
      [
        ["OPER", 21.6],
        ["LIQ", 61.3],
        ["DESCRIPCIÓN", 85.5],
        ["REFERENCIA", 219],
        ["CARGOS", 372.6],
        ["ABONOS", 429.5],
        ["OPERACIÓN", 477.8],
      ].map(([text, x]) => ({ text: String(text), x: Number(x), x1: Number(x) + 40, y }));
    const page = [
      { text: "Periodo", x: 310, x1: 340, y: 734 },
      { text: "DEL", x: 480, x1: 495, y: 734 },
      { text: "01/09/2026", x: 500, x1: 540, y: 734 },
      { text: "AL", x: 545, x1: 555, y: 734 },
      { text: "30/09/2026", x: 560, x1: 600, y: 734 },
      { text: "Saldo", x: 311, x1: 330, y: 535 },
      { text: "Anterior", x: 335, x1: 360, y: 535 },
      { text: "100.00", x: 558, x1: 590, y: 535 },
      { text: "Retiros", x: 311, x1: 330, y: 509 },
      { text: "/", x: 332, x1: 334, y: 509 },
      { text: "Cargos", x: 336, x1: 360, y: 509 },
      { text: "(-)", x: 362, x1: 370, y: 509 },
      { text: "2", x: 439, x1: 445, y: 509 },
      { text: "60.00", x: 546, x1: 590, y: 509 },
      ...header(249),
      { text: "01/SEP", x: 20, x1: 46, y: 238 },
      { text: "01/SEP", x: 54.7, x1: 80, y: 238 },
      { text: "PAGO", x: 86, x1: 110, y: 238 },
      { text: "50.00", x: 392, x1: 410, y: 238 },
    ];
    expect(() => readBbvaPdf([page], "prueba.pdf")).toThrow(/no cuadra/);
  });
});
