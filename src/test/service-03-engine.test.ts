import ExcelJS from "exceljs";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { analyzeIssuedInvoices } from "@/lib/proconta/service-03/engine";

const packageRoot = resolve(process.cwd(), "docs/SERVICE-03");

interface GoldenFixture {
  caso: string;
  entrada: string;
  salida_esperada: string;
  hoja_salida: string;
  columna_inicio_resultados: string;
  opciones: {
    cliente: string;
    tolerancia_por_dia: number;
    folios_confirmados_tasa0: string[];
    siigo_base16: number | null;
    siigo_base0: number | null;
  };
  totales: Record<string, unknown>;
  dias: Record<string, unknown>[];
  cfdi_sin_iva_activos: Record<string, unknown>[];
  cfdi_con_diferencia: Record<string, unknown>[];
  cfdi_con_ieps: Record<string, unknown>[];
  cancelados: Record<string, unknown>[];
  folios_faltantes: string[];
  cotejo_siigo?: Record<string, unknown>;
  escenarios: {
    escenario: string;
    folios_marcados_tasa0: string[];
    X_tasa0: number;
    IEPS: number;
    iva_explicado: number;
    diferencia_no_explicada: number;
    dias_REVISAR: number;
  }[];
}

function cents(value: unknown): unknown {
  if (typeof value !== "number") return value;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function selected(record: unknown, keys: readonly string[], moneyKeys: readonly string[] = []) {
  const row = record as Record<string, unknown>;
  return Object.fromEntries(
    keys.map((key) => [key, moneyKeys.includes(key) ? cents(row[key]) : row[key]]),
  );
}

function compareRecords(
  actual: object[],
  expected: Record<string, unknown>[],
  keys: readonly string[],
  moneyKeys: readonly string[] = [],
) {
  expect(actual.map((row) => selected(row, keys, moneyKeys))).toEqual(
    expected.map((row) => selected(row, keys, moneyKeys)),
  );
}

async function loadSource(relativePath: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolve(packageRoot, relativePath));
  return workbook;
}

const cases = [
  {
    name: "B",
    golden: "03_resultados_esperados/golden_B.json",
    input: "01_entradas/B_INGRESOS_2026-09_al_29.xlsx",
  },
  {
    name: "C",
    golden: "03_resultados_esperados/golden_C.json",
    input: "01_entradas/C_INGRESOS_2026-09_al_30.xlsx",
  },
] as const;

describe.each(cases)("Servicio 3, caso real anonimizado $name", ({ golden, input }) => {
  const hasGolden = existsSync(resolve(packageRoot, golden));
  const hasInput = existsSync(resolve(packageRoot, input));

  // Both ignored fixtures are absent in a clean clone. A partial package is a failure.
  it.skipIf(!hasGolden && !hasInput)(
    "reproduce el golden completo por día y por CFDI",
    async () => {
      const expected = JSON.parse(
        readFileSync(resolve(packageRoot, golden), "utf8"),
      ) as GoldenFixture;
      const workbook = await loadSource(input);
      const actual = analyzeIssuedInvoices(workbook, {
        clientLabel: expected.opciones.cliente,
        tolerance: expected.opciones.tolerancia_por_dia,
        confirmedZeroRateFolios: expected.opciones.folios_confirmados_tasa0,
        siigoBase16: expected.opciones.siigo_base16,
        siigoBase0: expected.opciones.siigo_base0,
      });

      expect(actual.outputFilename).toBe(expected.salida_esperada.split("/").at(-1));
      expect(actual.sheetName).toBe(expected.hoja_salida);
      expect(actual.columna_resultados_inicia).toBe(19);
      expect(expected.columna_inicio_resultados).toBe("S");
      expect(actual.totales).toEqual(expected.totales);

      const dayKeys = [
        "dia",
        "fila_ini",
        "fila_fin",
        "n",
        "cancelados",
        "S",
        "T",
        "U",
        "V",
        "IEPS",
        "W",
        "X",
        "revision",
      ];
      compareRecords(actual.dias, expected.dias, dayKeys, ["S", "T", "U", "V", "IEPS", "W", "X"]);

      compareRecords(
        actual.cfdi_sin_iva_activos,
        expected.cfdi_sin_iva_activos,
        ["fila", "folio", "dia", "subtotal", "iva", "ieps", "base0", "mixto"],
        ["subtotal", "iva", "ieps", "base0"],
      );
      compareRecords(
        actual.cfdi_con_diferencia,
        expected.cfdi_con_diferencia,
        ["folio", "dia", "dif", "ieps", "base0"],
        ["dif", "ieps", "base0"],
      );
      compareRecords(
        actual.cfdi_con_ieps,
        expected.cfdi_con_ieps,
        ["fila", "folio", "dia", "ieps"],
        ["ieps"],
      );
      compareRecords(
        actual.cancelados,
        expected.cancelados,
        ["folio", "dia", "subtotal", "iva", "total", "sustituto", "sustituto_dia"],
        ["subtotal", "iva", "total"],
      );
      expect(actual.folios_faltantes).toEqual(expected.folios_faltantes);

      if (expected.cotejo_siigo) {
        expect(actual.cotejo_siigo).not.toBeNull();
        expect(
          selected(actual.cotejo_siigo, [
            "base16_siigo",
            "base16_cfdi_motor",
            "diferencia_base16",
            "base0_siigo",
            "base0_cfdi_motor",
            "diferencia_base0",
          ]),
        ).toEqual(
          selected(expected.cotejo_siigo, [
            "base16_siigo",
            "base16_cfdi_motor",
            "diferencia_base16",
            "base0_siigo",
            "base0_cfdi_motor",
            "diferencia_base0",
          ]),
        );
      }
    },
  );

  it.skipIf(!hasGolden && !hasInput)("reproduce cada escenario de decisiones humanas", async () => {
    const expected = JSON.parse(
      readFileSync(resolve(packageRoot, golden), "utf8"),
    ) as GoldenFixture;
    const workbook = await loadSource(input);

    for (const scenario of expected.escenarios) {
      const actual = analyzeIssuedInvoices(workbook, {
        clientLabel: expected.opciones.cliente,
        tolerance: expected.opciones.tolerancia_por_dia,
        confirmedZeroRateFolios: scenario.folios_marcados_tasa0,
      });
      expect(
        {
          X_tasa0: actual.totales.X,
          IEPS: actual.totales.IEPS,
          iva_explicado: actual.totales.iva_explicado,
          diferencia_no_explicada: actual.totales.no_explicada,
          dias_REVISAR: actual.totales.dias_revisar,
        },
        scenario.escenario,
      ).toEqual({
        X_tasa0: scenario.X_tasa0,
        IEPS: scenario.IEPS,
        iva_explicado: scenario.iva_explicado,
        diferencia_no_explicada: scenario.diferencia_no_explicada,
        dias_REVISAR: scenario.dias_REVISAR,
      });
    }
  });
});

type SourceCell = string | number | null;
type SourceRecord = Record<string, SourceCell>;

function makeWorkbook(headers: string[], records: SourceRecord[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Hoja1");
  sheet.addRow(headers);
  for (const record of records) sheet.addRow(headers.map((header) => record[header] ?? null));
  return workbook;
}

const standardHeaders = [
  "Folio",
  "Fecha",
  "Estatus",
  "Sub Total",
  "Total",
  "Total IVA Tras.",
  "Tipo de Comprobante",
  "UUID",
  "R.F.C. Receptor",
];

function invoice(
  folio: number,
  date: string,
  subtotal: number,
  iva: number,
  extra: SourceRecord = {},
): SourceRecord {
  return {
    Folio: folio,
    Fecha: date,
    Estatus: "Activo",
    "Sub Total": subtotal,
    Total: subtotal + iva,
    "Total IVA Tras.": iva,
    "Tipo de Comprobante": "INGRESO",
    UUID: `SYNTHETIC-${folio}`,
    "R.F.C. Receptor": "XAXX010101000",
    ...extra,
  };
}

describe("Servicio 3, pruebas sintéticas sin archivos privados", () => {
  it("ubica encabezados cambiados y normalizados sin depender de la letra", () => {
    const headers = [
      "TOTAL IVA TRAS.",
      "Fólio",
      "R.F.C. Receptor",
      "Sub Total",
      "ESTATUS",
      "Tótal",
      "Fécha",
      "Tipo de Comprobante",
      "Descuento",
      "UUID",
    ];
    const workbook = makeWorkbook(headers, [
      {
        "TOTAL IVA TRAS.": 16,
        Fólio: 10,
        "R.F.C. Receptor": "XAXX010101000",
        "Sub Total": 110,
        ESTATUS: "Activo",
        Tótal: 116,
        Fécha: "2026-09-01 12:00:00",
        "Tipo de Comprobante": "INGRESO",
        Descuento: 10,
        UUID: "SYNTHETIC-10",
      },
    ]);

    const result = analyzeIssuedInvoices(workbook);
    expect(result.headerColumns.iva).toBe(1);
    expect(result.headerColumns.folio).toBe(2);
    expect(result.dias).toMatchObject([{ S: 110, T: 116, U: 16, V: 10, W: 0, revision: "OK" }]);
    expect(result.columna_resultados_inicia).toBe(19);
  });

  it("suma W sin redondear por día antes del total mensual", () => {
    const workbook = makeWorkbook(standardHeaders, [
      invoice(1, "2026-09-01 08:00:00", 0.03, 0),
      invoice(2, "2026-09-02 08:00:00", 0.03, 0),
    ]);
    const result = analyzeIssuedInvoices(workbook);

    expect(result.dias.map((day) => day.W)).toEqual([0, 0]);
    expect(result.dias.map((day) => day.WExact)).toEqual([0.0048, 0.0048]);
    expect(result.totales.W).toBe(0.01);
  });

  it("excluye cancelados de las sumas y detecta un posible sustituto", () => {
    const workbook = makeWorkbook(standardHeaders, [
      invoice(20, "2026-09-01 08:00:00", 100, 16, { Estatus: "Cancelado" }),
      invoice(21, "2026-09-02 08:00:00", 100, 16),
    ]);
    const result = analyzeIssuedInvoices(workbook);

    expect(result.totales).toMatchObject({
      cfdi: 2,
      activos: 1,
      cancelados: 1,
      S: 100,
      T: 116,
      U: 16,
    });
    expect(result.cancelados).toMatchObject([
      { folio: "20", sustituto: "21", sustituto_dia: "2026-09-02" },
    ]);
  });

  it("reporta folios faltantes sin concluir por qué faltan", () => {
    const workbook = makeWorkbook(standardHeaders, [
      invoice(10, "2026-09-01 08:00:00", 100, 16),
      invoice(12, "2026-09-01 09:00:00", 100, 16),
    ]);
    const result = analyzeIssuedInvoices(workbook);

    expect(result.folios_faltantes).toEqual(["11"]);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "MISSING_FOLIO",
        folio: "11",
        requiresHumanReview: true,
      }),
    );
  });

  it("rechaza columnas obligatorias ausentes, UUID duplicado y días desordenados", () => {
    const missingColumn = makeWorkbook(
      standardHeaders.filter((header) => header !== "Total IVA Tras."),
      [invoice(1, "2026-09-01", 100, 16)],
    );
    expect(() => analyzeIssuedInvoices(missingColumn)).toThrow(/iva/i);

    const duplicateUuid = makeWorkbook(standardHeaders, [
      invoice(1, "2026-09-01", 100, 16, { UUID: "SAME-UUID" }),
      invoice(2, "2026-09-01", 100, 16, { UUID: "SAME-UUID" }),
    ]);
    expect(() => analyzeIssuedInvoices(duplicateUuid)).toThrow(/uuid/i);

    const splitDay = makeWorkbook(standardHeaders, [
      invoice(1, "2026-09-01", 100, 16),
      invoice(2, "2026-09-02", 100, 16),
      invoice(3, "2026-09-01", 100, 16),
    ]);
    expect(() => analyzeIssuedInvoices(splitDay)).toThrow(/fecha|día|orden/i);
  });

  it("rechaza fechas e importes no válidos en vez de convertirlos silenciosamente a cero", () => {
    const invalidDate = makeWorkbook(standardHeaders, [invoice(1, "sin fecha", 100, 16)]);
    expect(() => analyzeIssuedInvoices(invalidDate)).toThrow(/fecha/i);

    const invalidAmount = makeWorkbook(standardHeaders, [
      invoice(1, "2026-09-01", 100, 16, { "Sub Total": "no es un número" }),
    ]);
    expect(() => analyzeIssuedInvoices(invalidAmount)).toThrow(/sub.?total|importe|número/i);
  });

  it("rechaza un IVA obligatorio vacío sin confundirlo con el valor numérico cero", () => {
    const blankIva = makeWorkbook(standardHeaders, [
      invoice(1, "2026-09-01", 100, 0, { "Total IVA Tras.": null }),
    ]);
    expect(() => analyzeIssuedInvoices(blankIva)).toThrow(/renglón 2: falta Total IVA Tras\./i);

    const zeroIva = makeWorkbook(standardHeaders, [invoice(1, "2026-09-01", 100, 0)]);
    expect(analyzeIssuedInvoices(zeroIva).cfdi_sin_iva_activos).toMatchObject([
      { folio: "1", iva: 0, base0: 100 },
    ]);
  });

  it("repetir el análisis entrega el mismo resultado sin modificar la hoja original", () => {
    const workbook = makeWorkbook(standardHeaders, [
      invoice(10, "2026-09-01", 100, 16),
      invoice(11, "2026-09-01", 50, 0),
    ]);
    const originalColumnCount = workbook.worksheets[0]?.getRow(1).cellCount;
    const first = analyzeIssuedInvoices(workbook);
    const second = analyzeIssuedInvoices(workbook);

    expect(second.totales).toEqual(first.totales);
    expect(second.dias).toEqual(first.dias);
    expect(second.cfdi_sin_iva_activos).toEqual(first.cfdi_sin_iva_activos);
    expect(workbook.worksheets[0]?.getRow(1).cellCount).toBe(originalColumnCount);
    expect(workbook.worksheets).toHaveLength(1);
  });

  it("deja un CFDI sin IVA pendiente hasta que el contador lo confirma", () => {
    const workbook = makeWorkbook(standardHeaders, [invoice(10, "2026-09-01", 100, 0)]);
    const pending = analyzeIssuedInvoices(workbook);

    expect(pending.totales).toMatchObject({ X: 0, dias_revisar: 1, no_explicada: 16 });
    expect(pending.cfdi_sin_iva_activos).toMatchObject([
      { folio: "10", base0: 100, confirmed: false },
    ]);
    expect(pending.findings).toContainEqual(
      expect.objectContaining({
        code: "UNCONFIRMED_ZERO_RATE",
        folio: "10",
        requiresHumanReview: true,
      }),
    );

    const confirmed = analyzeIssuedInvoices(workbook, { confirmedZeroRateFolios: ["10"] });
    expect(confirmed.totales).toMatchObject({ X: 100, dias_revisar: 0, no_explicada: 0 });
    expect(confirmed.cfdi_sin_iva_activos).toMatchObject([{ folio: "10", confirmed: true }]);
  });

  it("confirma un renglón preciso cuando el mismo folio aparece en dos series", () => {
    const workbook = makeWorkbook(
      [...standardHeaders, "Serie"],
      [
        invoice(10, "2026-09-01 08:00:00", 100, 0, { Serie: "A" }),
        invoice(10, "2026-09-02 08:00:00", 50, 0, {
          Serie: "B",
          UUID: "SYNTHETIC-SECOND-SERIES",
        }),
      ],
    );

    const result = analyzeIssuedInvoices(workbook, { confirmedZeroRateRows: [2] });
    expect(result.cfdi_sin_iva_activos).toMatchObject([
      { fila: 2, folio: "10", confirmed: true },
      { fila: 3, folio: "10", confirmed: false },
    ]);
    expect(result.totales).toMatchObject({ X: 100, dias_revisar: 1 });
    expect(result.dias.map((day) => day.revision)).toEqual(["OK", "REVISAR"]);
    expect(() => analyzeIssuedInvoices(workbook, { confirmedZeroRateRows: [4] })).toThrow(
      /renglones confirmados/i,
    );
    expect(() => analyzeIssuedInvoices(workbook, { confirmedZeroRateFolios: ["10"] })).toThrow(
      /más de un renglón candidato/i,
    );
  });
});
