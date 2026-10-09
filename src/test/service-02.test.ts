import ExcelJS from "exceljs";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { readBbvaXlsx } from "@/lib/proconta/service-01/bbva-xlsx";
import { readCfdiWorkbook } from "@/lib/proconta/service-01/cfdi-xlsx";
import type { BankStatement, CfdiFile } from "@/lib/proconta/service-01/types";
import { analyzeMonthTaxes } from "@/lib/proconta/service-02/engine";
import { exportService02Xlsx } from "@/lib/proconta/service-02/exporter";
import { TARIFA_ISR_2026_MENSUAL, computeIsr } from "@/lib/proconta/service-02/isr";
import type {
  DeductionStatus,
  DepositClass,
  IssuedStatus,
  Service02Analysis,
} from "@/lib/proconta/service-02/types";
import { DEDUCTION_STATUSES, DEPOSIT_CLASSES } from "@/lib/proconta/service-02/types";

const packageRoot = resolve(process.cwd(), "docs/SERVICE-02");
const path = (relative: string) => resolve(packageRoot, relative);
const inputs = {
  banks: [
    path("01_entradas/movimientos_BBVA_PYME.xlsx"),
    path("01_entradas/movimientos_BBVA_personal.xlsx"),
    path("01_entradas/movimientos_TDC.xlsx"),
  ],
  recibidos: path("01_entradas/cfdi_recibidos_DocDigitales_sep2026.xlsx"),
  emitidos: path("01_entradas/cfdi_emitidos_DocDigitales_sep2026.xlsx"),
  prior: path("01_entradas/cfdi_mes_anterior_pendientes_ago2026.xlsx"),
};
const expected = {
  golden: path("03_resultados_esperados/golden_S2.json"),
  recibidos: path("03_resultados_esperados/golden_recibidos.csv"),
  ingresos: path("03_resultados_esperados/golden_ingresos.csv"),
  emitidos: path("03_resultados_esperados/golden_emitidos.csv"),
  tarifa: path("03_resultados_esperados/tarifa_isr_2026_mensual.csv"),
};
const hasCase = [
  ...inputs.banks,
  ...Object.values(expected),
  inputs.recibidos,
  inputs.emitidos,
  inputs.prior,
].every(existsSync);

interface GoldenS2 {
  ingresos: {
    por_clasificacion: Record<DepositClass, { depositos: number; importe: number }>;
    total_depositos: { n: number; importe: number };
    cobrado_con_iva: number;
    base_sin_iva: number;
    iva_trasladado: number;
  };
  emitidos: { estatus: Record<IssuedStatus, number> };
  recibidos: {
    por_estatus: Record<DeductionStatus, { cfdi: number; subtotal: number; iva: number }>;
    total_cfdi: number;
  };
  iva: { trasladado: number; acreditable: number; a_pagar: number };
  isr: {
    ingresos: number;
    deducciones: number;
    base_gravable: number;
    limite_inferior: number;
    cuota_fija: number;
    pct_excedente: number;
    isr_del_mes: number;
  };
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

async function cfdi(file: string): Promise<CfdiFile> {
  return readCfdiWorkbook(await workbook(file), file.split("/").at(-1)!);
}

let cached: Service02Analysis | null = null;
async function analysis(): Promise<Service02Analysis> {
  if (cached) return cached;
  const statements: BankStatement[] = [];
  for (const file of inputs.banks) {
    statements.push(readBbvaXlsx(await workbook(file), file.split("/").at(-1)!));
  }
  cached = analyzeMonthTaxes({
    statements,
    recibidos: await cfdi(inputs.recibidos),
    emitidos: await cfdi(inputs.emitidos),
    previousMonth: await cfdi(inputs.prior),
  });
  return cached;
}

describe("Servicio 2 · IVA e ISR de septiembre 2026 (caso B)", () => {
  it.skipIf(!hasCase)("calcula IVA a pagar 26,549.53 e ISR 43,426.43", async () => {
    const golden = JSON.parse(readFileSync(expected.golden, "utf8")) as GoldenS2;
    const result = await analysis();
    expect(result.ingresos.depositos).toBe(golden.ingresos.total_depositos.n);
    expect(result.ingresos.importe).toBe(golden.ingresos.total_depositos.importe);
    for (const c of DEPOSIT_CLASSES) {
      expect(result.byDeposit[c], c).toEqual(golden.ingresos.por_clasificacion[c]);
    }
    expect(result.ingresos.cobradoConIva).toBe(golden.ingresos.cobrado_con_iva);
    expect(result.ingresos.baseSinIva).toBe(golden.ingresos.base_sin_iva);
    expect(result.ingresos.ivaTrasladado).toBe(golden.ingresos.iva_trasladado);
    expect(result.byIssued).toEqual(golden.emitidos.estatus);
    expect(result.received).toHaveLength(golden.recibidos.total_cfdi);
    for (const status of DEDUCTION_STATUSES) {
      expect(result.byDeduction[status], status).toEqual(golden.recibidos.por_estatus[status]);
    }
    expect(result.iva).toEqual({
      trasladado: golden.iva.trasladado,
      acreditable: golden.iva.acreditable,
      aPagar: golden.iva.a_pagar,
    });
    expect(result.iva.aPagar).toBe(26549.53);
    expect(result.isr.isr).toBe(43426.43);
    expect(result.isr).toMatchObject({
      ingresos: golden.isr.ingresos,
      deducciones: golden.isr.deducciones,
      base: golden.isr.base_gravable,
      limiteInferior: golden.isr.limite_inferior,
      cuotaFija: golden.isr.cuota_fija,
      pctExcedente: golden.isr.pct_excedente,
    });
  });

  it.skipIf(!hasCase)("reproduce el estatus de cada uno de los 88 CFDI recibidos", async () => {
    const result = await analysis();
    const rows = parseCsv(readFileSync(expected.recibidos, "utf8"))
      .slice(1)
      .filter((r) => r.length >= 12);
    expect(rows).toHaveLength(88);
    const pending = [...result.received];
    const differences = rows.flatMap((row) => {
      const serieFolio = row[4]!.replace(/\s*\(ago\)\s*$/, "");
      let index = pending.findIndex((entry) => entry.cfdi && entry.serieFolio === serieFolio);
      if (index < 0) {
        index = pending.findIndex(
          (entry) =>
            entry.rfc === row[2] &&
            entry.date === row[0] &&
            Math.abs(entry.total - Number(row[10])) < 0.005,
        );
      }
      if (index < 0) return [`${row[0]} ${row[4]}: no se encontró el CFDI`];
      const [entry] = pending.splice(index, 1);
      const same =
        entry!.status === row[11] &&
        Math.abs(entry!.subtotal - Number(row[8])) < 0.005 &&
        Math.abs(entry!.iva - Number(row[9])) < 0.005;
      return same
        ? []
        : [
            `${row[0]} ${row[4]} $${row[10]}: esperado ${row[11]} (${row[8]}/${row[9]}) / obtenido ${entry!.status} (${entry!.subtotal}/${entry!.iva}) ${entry!.note}`,
          ];
    });
    expect(differences, differences.join("\n")).toEqual([]);
    expect(pending).toEqual([]);
  });

  it.skipIf(!hasCase)("reproduce la clasificación de cada uno de los 44 depósitos", async () => {
    const result = await analysis();
    const rows = parseCsv(readFileSync(expected.ingresos, "utf8"))
      .slice(1)
      .filter((r) => r.length >= 7 && r[0]);
    expect(rows).toHaveLength(44);
    const pending = [...result.deposits];
    const differences = rows.flatMap((row) => {
      const index = pending.findIndex(
        (deposit) =>
          deposit.movement.account === row[0] &&
          deposit.movement.operDate === row[1] &&
          Math.abs(deposit.movement.abono - Number(row[3])) < 0.005,
      );
      if (index < 0) return [`${row[0]} ${row[1]} $${row[3]}: no se encontró el depósito`];
      const [deposit] = pending.splice(index, 1);
      const same =
        deposit!.classification === row[4] &&
        Math.abs(deposit!.base - Number(row[5])) < 0.005 &&
        Math.abs(deposit!.iva - Number(row[6])) < 0.005;
      return same
        ? []
        : [
            `${row[0]} ${row[1]} ${row[2]!.slice(0, 30)} $${row[3]}: esperado ${row[4]} / obtenido ${deposit!.classification} (${deposit!.note})`,
          ];
    });
    expect(differences, differences.join("\n")).toEqual([]);
    expect(pending).toEqual([]);
  });

  it.skipIf(!hasCase)("reproduce el cobro de cada CFDI emitido", async () => {
    const result = await analysis();
    const rows = parseCsv(readFileSync(expected.emitidos, "utf8"))
      .slice(1)
      .filter((r) => r[0]);
    expect(rows).toHaveLength(9);
    const byKey = new Map(result.issued.map((entry) => [entry.key, entry]));
    const differences = rows.flatMap((row) => {
      const key = row[0]!.startsWith("REP ")
        ? [...byKey.keys()].find((k) => k.startsWith("REP ") && k.includes(row[0]!.slice(4, 12)))
        : row[0];
      const entry = key ? byKey.get(key) : undefined;
      if (!entry) return [`${row[0]}: no se encontró`];
      const same = entry.status === row[8] && Math.abs(entry.cobrado - Number(row[9])) < 0.005;
      return same
        ? []
        : [`${row[0]}: esperado ${row[8]} $${row[9]} / obtenido ${entry.status} $${entry.cobrado}`];
    });
    expect(differences, differences.join("\n")).toEqual([]);
  });

  it.skipIf(!hasCase)("usa la tarifa mensual 2026 del paquete", () => {
    const rows = parseCsv(readFileSync(expected.tarifa, "utf8"))
      .slice(1)
      .filter((r) => r.length === 4)
      .map((r) => r.map(Number));
    expect(TARIFA_ISR_2026_MENSUAL).toEqual(rows);
    expect(computeIsr(160753.44)).toMatchObject({
      limiteInferior: 141880.67,
      cuotaFija: 37009.69,
      isr: 43426.43,
    });
    expect(computeIsr(0).isr).toBe(0);
    expect(computeIsr(-500).isr).toBe(0);
    expect(computeIsr(1000)).toMatchObject({ limiteInferior: 844.6, isr: 26.17 });
  });

  it.skipIf(!hasCase)("genera el Excel con Resumen, Ingresos y Recibidos", async () => {
    const result = await analysis();
    const output = await exportService02Xlsx(result);
    expect(output.filename).toBe("IVA_ISR_202609.xlsx");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(output.bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
      "Resumen",
      "Ingresos",
      "Recibidos",
    ]);
    expect(book.getWorksheet("Recibidos")!.rowCount).toBe(1 + 88 + 1);
    const resumen = book.getWorksheet("Resumen")!;
    const values: unknown[] = [];
    resumen.eachRow((row) =>
      row.eachCell((cell) =>
        values.push((cell.value as { result?: unknown })?.result ?? cell.value),
      ),
    );
    expect(values).toContain(26549.53);
    expect(values).toContain(43426.43);
    expect(values.filter((v) => v === "REVISAR")).toEqual([]);
  });
});
