import ExcelJS from "exceljs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { analyzeReceivables, parseReference } from "@/lib/proconta/service-04/engine";
import { exportService04Xlsx } from "@/lib/proconta/service-04/exporter";
import type { Service04Options } from "@/lib/proconta/service-04/types";

const packageRoot = resolve(process.cwd(), "docs/SERVICE-04");
const auxPath = resolve(packageRoot, "01_entradas/AUX_1103.xlsx");
const historicalPath = resolve(packageRoot, "03_resultados_esperados/Cta_por_Cobrar_20260917.xlsx");
const hasHistorical = existsSync(auxPath) && existsSync(historicalPath);

async function load(path: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook;
}

function cellResult(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === "object" && !(value instanceof Date) && "result" in value) {
    return value.result;
  }
  return value;
}

const cents = (value: number) => Math.round(value * 100);

interface HistoricalAccount {
  total: number;
  /** Facturas del periodo del auxiliar (2026) con su saldo. */
  periodInvoices: Map<string, number>;
  /** Partidas de ejercicios anteriores y diferencias por conciliar. */
  otherCents: number;
}

/** Lee la hoja "Cuentas por cobrar" del entregable histórico del caso 4.8. */
function readHistorical(workbook: ExcelJS.Workbook, periodFrom: string) {
  const sheet = workbook.getWorksheet("Cuentas por cobrar")!;
  const accounts = new Map<string, HistoricalAccount>();
  let current: HistoricalAccount | null = null;
  let grandTotal = 0;
  for (let row = 6; row <= sheet.rowCount; row++) {
    const account = sheet.getCell(row, 1).value;
    const date = sheet.getCell(row, 3).value;
    const description = String(sheet.getCell(row, 6).value ?? "");
    const balance = Number(cellResult(sheet.getCell(row, 9).value) ?? 0);
    if (typeof account === "string" && /^\d{4}-/.test(account)) {
      current = { total: 0, periodInvoices: new Map(), otherCents: 0 };
      accounts.set(account, current);
      continue;
    }
    if (/^TOTAL CUENTAS/.test(description)) {
      grandTotal = balance;
      continue;
    }
    if (!current) continue;
    if (/^TOTAL |^Sin saldo/.test(description)) {
      current.total = balance;
      continue;
    }
    const iso = date instanceof Date ? date.toISOString().slice(0, 10) : null;
    const folio = /A\/(\d+)/.exec(description)?.[1];
    if (iso && iso >= periodFrom && folio && /^Venta/.test(description)) {
      current.periodInvoices.set(`A/${folio}`, cents(balance));
    } else if (iso || /^Diferencia/.test(description)) {
      current.otherCents += cents(balance);
    }
  }
  return { accounts, grandTotal };
}

describe("Servicio 4 · caso histórico 4.8 (auxiliar 1103 al 17/09/2026)", () => {
  it.skipIf(!hasHistorical)(
    "reproduce saldos, facturas abiertas y control del despacho",
    async () => {
      const analysis = analyzeReceivables(await load(auxPath));
      const historical = readHistorical(await load(historicalPath), analysis.periodFrom!);

      expect(analysis.cutoffDate).toBe("2026-09-17");
      expect(analysis.totals).toMatchObject({
        clients: 18,
        invoicesReviewed: 1608,
        payments: 438,
        creditNotes: 9,
        clientsWithBalance: 8,
        totalPending: 1008233.23,
        reconciledClients: 18,
        unreconciledClients: 0,
      });
      expect(cents(analysis.totals.totalPending)).toBe(cents(historical.grandTotal));
      expect(analysis.totals.over90Percent).toBeGreaterThan(0.3);
      expect(analysis.totals.over90Percent).toBeLessThan(0.32);

      let historicalPeriodInvoices = 0;
      for (const client of analysis.clients) {
        const expected = historical.accounts.get(client.account);
        expect(expected, client.account).toBeDefined();
        expect(client.difference, client.name).toBe(0);
        expect(cents(client.reconstructedBalance), client.name).toBe(cents(expected!.total));

        const items = analysis.openItems.filter((item) => item.account === client.account);
        const invoices = new Map(
          items
            .filter((item) => item.kind === "factura")
            .map((item) => [item.folio!, cents(item.remaining)]),
        );
        expect(invoices, `${client.name}: facturas abiertas`).toEqual(expected!.periodInvoices);
        const other = items
          .filter((item) => item.kind !== "factura")
          .reduce((sum, item) => sum + cents(item.remaining), 0);
        expect(other, `${client.name}: saldo inicial y diferencias`).toBe(expected!.otherCents);
        historicalPeriodInvoices += expected!.periodInvoices.size;
      }
      expect(analysis.totals.openInvoices).toBe(historicalPeriodInvoices);

      const bunge = analysis.openItems.filter(
        (item) => item.account === "1103-0001-0072" && item.kind === "diferencia_centavos",
      );
      expect(bunge.map((item) => item.remaining)).toEqual([0.29]);
      expect(
        analysis.payments
          .filter((payment) => payment.rule === "FIFO_PARCIAL")
          .every((p) => p.requiresReview),
      ).toBe(true);
    },
  );

  it.skipIf(!hasHistorical)("genera el Excel con todas las hojas y controles en cero", async () => {
    const analysis = analyzeReceivables(await load(auxPath));
    const output = await exportService04Xlsx(analysis);
    expect(output.filename).toBe("Cta_por_Cobrar_20260917.xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(output.bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Resumen",
      "Facturas pendientes",
      "Antigüedad",
      "Pagos por revisar",
      "Diferencias conciliación",
      "Control (interno)",
      "Aplicación de abonos",
    ]);
    // ExcelJS no conserva el resultado en caché de una fórmula cuando vale 0, así que los
    // controles se verifican con las celdas de entrada de cada fórmula.
    const control = workbook.getWorksheet("Control (interno)")!;
    const pending = workbook.getWorksheet("Facturas pendientes")!;
    const num = (row: number, column: number) =>
      Number(cellResult(control.getCell(row, column).value) ?? 0);
    // H referencia el total del cliente en "Facturas pendientes"; se lee la celda referida.
    const informe = (row: number) => {
      const formula = (control.getCell(row, 8).value as { formula?: string }).formula ?? "";
      const referenced = Number(/I(\d+)$/.exec(formula)?.[1]);
      return Number(cellResult(pending.getCell(referenced, 9).value) ?? 0);
    };
    analysis.clients.forEach((client, index) => {
      const row = 6 + index;
      expect(
        String(
          control.getCell(row, 7).value &&
            (control.getCell(row, 7).value as { formula?: string }).formula,
        ),
      ).toBe(`ROUND(C${row}+D${row}-E${row}-F${row},2)`);
      expect(
        Math.round((num(row, 3) + num(row, 4) - num(row, 5) - num(row, 6)) * 100) / 100 + 0,
        `control auxiliar ${client.name}`,
      ).toBe(0);
      expect(num(row, 6), `saldo auxiliar ${client.name}`).toBe(client.auxiliaryBalance);
      expect(informe(row), `saldo informe ${client.name}`).toBe(client.reconstructedBalance);
      expect(
        Math.round((informe(row) - num(row, 6)) * 100) / 100 + 0,
        `diferencia ${client.name}`,
      ).toBe(0);
    });
    const totalRow = [...Array(pending.rowCount).keys()]
      .map((index) => index + 1)
      .find((row) => String(pending.getCell(row, 6).value).startsWith("TOTAL CUENTAS"))!;
    expect(cellResult(pending.getCell(totalRow, 9).value)).toBe(1008233.23);
    expect(workbook.getWorksheet("Aplicación de abonos")!.rowCount).toBe(1 + 438 + 9);
  });
});

// ───────────────────────── pruebas sintéticas ─────────────────────────

type Movement = [date: string, description: string, debit: number, credit: number];
interface SyntheticAccount {
  account: string;
  name: string;
  opening?: number;
  movements: Movement[];
  /** Sobrescribe el saldo final de la columna Saldo para simular un auxiliar alterado. */
  finalBalance?: number;
}

function makeAux(accounts: SyntheticAccount[], options: { shuffleColumns?: boolean } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Datos");
  const headers = options.shuffleColumns
    ? [
        "Descripción del movimiento",
        "Cuenta",
        "Abonos",
        "Fecha",
        "Cargos",
        "Nombre de la cuenta",
        "Saldo",
        "Póliza",
      ]
    : [
        "Cuenta",
        "Nombre de la cuenta",
        "Fecha",
        "Tipo",
        "Póliza",
        "Descripción del movimiento",
        "Referencia",
        "Cargos",
        "Abonos",
        "Saldo",
      ];
  sheet.addRow(["SEPTIEMBRE EJERCICIO: 2026"]);
  sheet.addRow(["EMPRESA SINTÉTICA SA DE CV"]);
  sheet.addRow(["XAXX010101000"]);
  sheet.addRow(["Auxiliar de cuentas"]);
  sheet.addRow([" del 01/01/2026 al 30/09/2026"]);
  sheet.addRow(headers);
  const put = (values: Record<string, unknown>) =>
    sheet.addRow(headers.map((header) => values[header] ?? null));
  for (const account of accounts) {
    let balance = account.opening ?? 0;
    put({ Cuenta: account.account, "Nombre de la cuenta": account.name, Saldo: balance });
    let debits = 0;
    let credits = 0;
    account.movements.forEach(([date, description, debit, credit], index) => {
      balance = Math.round((balance + debit - credit) * 100) / 100;
      debits += debit;
      credits += credit;
      const last = index === account.movements.length - 1;
      put({
        Fecha: new Date(`${date}T00:00:00Z`),
        Tipo: credit ? "002" : "001",
        Póliza: String(index + 1).padStart(6, "0"),
        "Descripción del movimiento": description,
        Cargos: debit,
        Abonos: credit,
        Saldo: last && account.finalBalance !== undefined ? account.finalBalance : balance,
      });
    });
    put({ "Descripción del movimiento": "TOTALES CUENTA: ", Cargos: debits, Abonos: credits });
  }
  return workbook;
}

const venta = (folio: number) => `Venta-Docto.: A/${folio} - CLIENTE SINTETICO`;
const analyze = (accounts: SyntheticAccount[], options: Service04Options = {}) =>
  analyzeReceivables(makeAux(accounts), { cutoffDate: "2026-09-30", ...options });

describe("Servicio 4 · reglas del motor con datos sintéticos", () => {
  it("lee referencias con folios, rangos y listas", () => {
    expect(parseReference("6093- 6099")).toEqual({ singles: [], ranges: [[6093, 6099]] });
    expect(parseReference("5654- 5692, 5612- 5651")).toEqual({
      singles: [],
      ranges: [
        [5654, 5692],
        [5612, 5651],
      ],
    });
    expect(parseReference("DEP FACT 6918 SOL EN NUTR")).toEqual({ singles: [6918], ranges: [] });
    expect(parseReference("DEP FACT VARIAS YARA")).toEqual({ singles: [], ranges: [] });
    expect(parseReference("6501, 6503 y 6505").singles).toEqual([6501, 6503, 6505]);
  });

  it("ubica encabezados en cualquier columna y excluye los renglones de totales", () => {
    const workbook = makeAux(
      [
        {
          account: "1103-0001-0001",
          name: "Cliente uno",
          movements: [
            ["2026-09-01", venta(100), 1000, 0],
            ["2026-09-02", venta(101), 500, 0],
          ],
        },
      ],
      { shuffleColumns: true },
    );
    const result = analyzeReceivables(workbook);
    expect(result.headerColumns).toMatchObject({ description: 1, account: 2, credit: 3, date: 4 });
    expect(result.totals).toMatchObject({
      clients: 1,
      invoicesReviewed: 2,
      totalPending: 1500,
      openInvoices: 2,
    });
    expect(result.company).toBe("EMPRESA SINTÉTICA SA DE CV");
    expect(result.rfc).toBe("XAXX010101000");
    expect(result.cutoffDate).toBe("2026-09-30");
  });

  it("aplica folio exacto, rango completo y rango con sólo parte de sus facturas", () => {
    const result = analyze([
      {
        account: "1103-0001-0002",
        name: "Cliente dos",
        movements: [
          ["2026-01-02", venta(200), 100, 0],
          ["2026-01-02", venta(201), 200, 0],
          ["2026-01-02", venta(202), 300, 0],
          ["2026-01-03", venta(203), 400, 0],
          ["2026-01-04", venta(204), 500, 0],
          ["2026-01-10", "200", 0, 100],
          ["2026-01-11", "201-202", 0, 500],
          // El rango 203-204 no significa "todas": paga sólo la 204 y la 203 recibe un abono parcial.
          ["2026-01-12", "203- 204", 0, 500],
          ["2026-01-12", "ABONO 203", 0, 350],
        ],
      },
    ]);
    const rules = result.payments.map((payment) => payment.rule);
    expect(rules).toEqual(["FOLIO_EXACTO", "RANGO", "RANGO_SUBCONJUNTO", "FOLIO_EXACTO_PARCIAL"]);
    expect(result.openItems).toMatchObject([
      { folio: "A/203", original: 400, applied: 350, remaining: 50 },
    ]);
    expect(result.anomalies.map((anomaly) => anomaly.code)).toContain("FACTURA_SALDO_PARCIAL");
    expect(result.clients[0]).toMatchObject({ difference: 0, status: "Conciliado" });
  });

  it("usa la referencia como pista: si no corresponde, aplica por monto exacto y lo registra", () => {
    const result = analyze([
      {
        account: "1103-0001-0003",
        name: "Cliente tres",
        movements: [
          ["2026-02-01", venta(300), 1000, 0],
          ["2026-02-01", venta(301), 2500, 0],
          ["2026-02-10", "5932-5941", 0, 2500],
        ],
      },
    ]);
    expect(result.payments[0]).toMatchObject({
      rule: "MONTO_EXACTO",
      referenceStatus: "no_corresponde",
    });
    expect(result.payments[0]!.allocations).toEqual([
      { itemId: expect.any(Number), folio: "A/301", amount: 2500 },
    ]);
    expect(result.anomalies.map((anomaly) => anomaly.code)).toContain("REFERENCIA_NO_CORRESPONDE");
    expect(result.totals.referenceMismatch).toBe(1);
  });

  it("aplica FIFO exacto o suma de facturas antiguas cuando no hay referencia", () => {
    const result = analyze([
      {
        account: "1103-0001-0004",
        name: "Cliente cuatro",
        movements: [
          ["2026-03-01", venta(400), 100, 0],
          ["2026-03-02", venta(401), 250, 0],
          ["2026-03-03", venta(402), 175, 0],
          ["2026-03-04", venta(403), 80, 0],
          ["2026-03-05", venta(404), 90, 0],
          ["2026-03-20", "DEP FACT VARIAS", 0, 350],
          ["2026-03-21", "DEP FACT VARIAS", 0, 265],
        ],
      },
    ]);
    expect(result.payments.map((payment) => payment.rule)).toEqual([
      "FIFO_EXACTO",
      "FIFO_COMBINACION",
    ]);
    expect(result.openItems).toMatchObject([{ folio: "A/403", remaining: 80 }]);
    expect(result.totals.withoutReference).toBe(2);
  });

  it("marca para revisión las asignaciones ambiguas y el FIFO parcial", () => {
    const result = analyze([
      {
        account: "1103-0001-0005",
        name: "Cliente cinco",
        movements: [
          ["2026-04-01", venta(500), 900, 0],
          ["2026-04-02", venta(501), 900, 0],
          ["2026-04-03", venta(502), 333.33, 0],
          ["2026-04-10", "DEP", 0, 900],
          ["2026-04-11", "DEP", 0, 1000],
        ],
      },
    ]);
    const [exact, partial] = result.payments;
    expect(exact).toMatchObject({ rule: "MONTO_EXACTO", requiresReview: true });
    expect(exact!.allocations[0]!.folio).toBe("A/500");
    expect(partial).toMatchObject({
      rule: "FIFO_PARCIAL",
      referenceStatus: "sin_combinacion",
      requiresReview: true,
    });
    const codes = result.anomalies.map((anomaly) => anomaly.code);
    expect(codes).toContain("ASIGNACION_AMBIGUA");
    expect(codes).toContain("ABONO_SIN_COMBINACION");
    expect(result.clients[0]!.difference).toBe(0);
  });

  it("presenta los centavos sobrantes como diferencia visible, no como factura pendiente", () => {
    const result = analyze([
      {
        account: "1103-0001-0006",
        name: "Cliente seis",
        movements: [
          ["2026-03-01", venta(600), 1000.1, 0],
          ["2026-03-01", venta(601), 2000, 0],
          ["2026-03-15", "600-601", 0, 2999.81],
        ],
      },
    ]);
    expect(result.totals).toMatchObject({
      openInvoices: 0,
      centDifferences: 1,
      totalPending: 0.29,
    });
    expect(result.openItems).toMatchObject([
      { kind: "diferencia_centavos", remaining: 0.29, bucket: "otros" },
    ]);
    expect(
      result.anomalies.find((anomaly) => anomaly.code === "DIFERENCIA_CENTAVOS"),
    ).toMatchObject({
      requiresReview: true,
      amount: 0.29,
    });
  });

  it("considera el saldo inicial sin detalle y aplica folios de ejercicios anteriores", () => {
    const result = analyze([
      {
        account: "1103-0001-0007",
        name: "Cliente siete",
        opening: 5000,
        movements: [
          ["2026-01-05", venta(5400), 1200, 0],
          ["2026-01-06", "5297", 0, 3000],
          ["2026-01-07", "Dev.Desc.Reb/Venta-Docto.: /150 - CLIENTE", -200, 0],
        ],
      },
    ]);
    expect(result.payments.map((payment) => payment.rule)).toEqual(["SALDO_INICIAL", "NC_FIFO"]);
    expect(result.openItems).toMatchObject([
      { kind: "saldo_inicial", date: "2025-12-31", remaining: 1800, bucket: "d90_mas" },
      { folio: "A/5400", remaining: 1200 },
    ]);
    const codes = result.anomalies.map((anomaly) => anomaly.code);
    expect(codes).toContain("SALDO_INICIAL_SIN_DETALLE");
    expect(codes).toContain("NOTA_CREDITO_SIN_RELACION");
    expect(result.totals.creditNotes).toBe(1);
    expect(result.clients[0]!.reconstructedBalance).toBe(3000);
  });

  it("aplica una nota de crédito al saldo que coincide exactamente", () => {
    const result = analyze([
      {
        account: "1103-0001-0008",
        name: "Cliente ocho",
        movements: [
          ["2026-05-01", venta(800), 1000, 0],
          ["2026-05-02", "Dev.Desc.Reb/Venta-Docto.: /160 - CLIENTE", -100, 0],
          ["2026-05-10", "800", 0, 900],
        ],
      },
    ]);
    expect(result.payments.map((payment) => payment.rule)).toEqual([
      "FOLIO_EXACTO_PARCIAL",
      "NC_RESIDUO",
    ]);
    expect(result.totals.totalPending).toBe(0);
  });

  it("no declara conciliado un cliente cuyo auxiliar no cuadra", () => {
    const result = analyze([
      {
        account: "1103-0001-0009",
        name: "Cliente nueve",
        movements: [["2026-06-01", venta(900), 1000, 0]],
        finalBalance: 1000.5,
      },
    ]);
    expect(result.clients[0]).toMatchObject({
      status: "Con diferencia",
      auxiliaryBalance: 1000.5,
      reconstructedBalance: 1000,
      difference: 0.5,
    });
    expect(result.clients[0]!.possibleCauses.length).toBeGreaterThan(0);
    expect(result.totals.unreconciledClients).toBe(1);
    expect(result.anomalies.map((anomaly) => anomaly.code)).toContain("DIFERENCIA_CONCILIACION");
  });

  it("calcula la antigüedad con días de crédito y detecta clientes sin cobros", () => {
    const accounts: SyntheticAccount[] = [
      {
        account: "1103-0001-0010",
        name: "Cliente diez",
        movements: [
          ["2026-09-30", venta(1000), 100, 0],
          ["2026-09-10", venta(1001), 200, 0],
          ["2026-08-15", venta(1002), 300, 0],
          ["2026-07-20", venta(1003), 400, 0],
          ["2026-05-01", venta(1004), 500, 0],
        ],
      },
    ];
    const byDate = analyze(accounts);
    expect(byDate.aging.map((bucket) => [bucket.key, bucket.amount])).toEqual([
      ["vigente", 100],
      ["d1_30", 200],
      ["d31_60", 300],
      ["d61_90", 400],
      ["d90_mas", 500],
      ["otros", 0],
    ]);
    expect(byDate.totals.overduePercent).toBeCloseTo(1400 / 1500);
    expect(byDate.anomalies.map((anomaly) => anomaly.code)).toEqual(
      expect.arrayContaining(["CLIENTE_SIN_COBROS", "FACTURA_ANTIGUA"]),
    );
    const withCredit = analyze(accounts, { creditDays: 30 });
    expect(withCredit.aging.find((bucket) => bucket.key === "vigente")!.amount).toBe(300);
  });

  it("rechaza archivos sin información suficiente con mensajes comprensibles", () => {
    const empty = new ExcelJS.Workbook();
    empty.addWorksheet("Hoja1").addRow(["Folio", "Total"]);
    expect(() => analyzeReceivables(empty)).toThrow(/encabezado del auxiliar/i);

    const orphan = new ExcelJS.Workbook();
    const sheet = orphan.addWorksheet("Datos");
    sheet.addRow(["Cuenta", "Fecha", "Descripción", "Cargos", "Abonos"]);
    sheet.addRow([null, new Date("2026-01-01T00:00:00Z"), venta(1), 100, 0]);
    expect(() => analyzeReceivables(orphan)).toThrow(/fuera de una cuenta/i);

    const badAmount = makeAux([
      { account: "1103-0001-0011", name: "Cliente", movements: [["2026-01-01", venta(1), 100, 0]] },
    ]);
    badAmount.worksheets[0]!.getCell("H8").value = "cien pesos";
    expect(() => analyzeReceivables(badAmount)).toThrow(/renglón 8/i);

    expect(() =>
      analyze(
        [
          {
            account: "1103-0001-0012",
            name: "Cliente",
            movements: [["2026-09-20", venta(1), 1, 0]],
          },
        ],
        {
          cutoffDate: "2026-09-01",
        },
      ),
    ).toThrow(/fecha de corte/i);
  });

  it("exporta un Excel que distingue lo conciliado de lo pendiente", async () => {
    const result = analyze([
      {
        account: "1103-0001-0013",
        name: "Cliente trece",
        movements: [
          ["2026-04-01", venta(1300), 900, 0],
          ["2026-04-02", venta(1301), 900, 0],
          ["2026-04-10", "DEP", 0, 900],
        ],
      },
    ]);
    const output = await exportService04Xlsx(result);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(output.bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const summary = workbook.getWorksheet("Resumen")!;
    expect(String(summary.getCell("A5").value)).toMatch(/^CONCILIADO/);
    expect(String(summary.getCell("A6").value)).toMatch(/pendientes de revisión/);
    const review = workbook.getWorksheet("Pagos por revisar")!;
    expect(review.getCell(4, 10).value).toBe("Sí");
  });
});
