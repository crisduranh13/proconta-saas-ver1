import { DEFAULT_CATALOG, resolveCatalog } from "./catalogs";
import { hungarian } from "./hungarian";
import type {
  BankMovement,
  BankStatement,
  CfdiFile,
  CfdiRecord,
  Service01Analysis,
  Service01Catalog,
  Service01Options,
  Service01Outflow,
  Service01Status,
  Service01StatusTotals,
  Service01Unpaid,
} from "./types";
import { SERVICE01_STATUSES } from "./types";

/*
 * Servicio 1 · Conciliación de salidas bancarias contra CFDI recibidos.
 * Reglas del handoff, en orden: (1) el banco ya viene validado por el lector; (2) se
 * cruzan los cargos contra los CFDI de ingreso activos; (3) el proveedor se identifica
 * por RFC en la descripción, por CLABE o por palabra clave del catálogo del cliente;
 * (4) cruce 1 a 1 por asignación óptima (húngaro) con importe ±0.05 y fecha ±20 días;
 * (5) estatus por salida; (6) diagnóstico de los CFDI sin pago.
 */

const AMOUNT_TOLERANCE_CENTS = 5;
const MAX_GAP_DAYS = 20;
const CONCILIADO_MAX_GAP = 3;
const FORBIDDEN = 1e6;
const UNASSIGNED = 1e5;
const RFC_IN_DESCRIPTION = /RFC:\s*([A-ZÑ&]{3,4})\s?(\d{6}[A-Z0-9]{3})/;
const STOP = new Set(
  "SPEI ENVIADO PAGO CUENTA TERCERO TRANSFERENCIA PROPIAS TRASPASO RETIRO TARJETA COBRO AUTOMATICO RECIBO PREST BNET MBAN BMOV GASTOS GASTO SA CV DE LA DEL RL SAPI SERVICIOS COMPANIA SEGUROS GRUPO BANCO INSTITUCION BANCA MULTIPLE FINANCIERO MEXICO".split(
    " ",
  ),
);
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

interface Outflow {
  movement: BankMovement;
  statement: BankStatement;
  full: string;
  amountCents: number;
  rfc: string;
  rfcHint: string;
  hints: string[];
  tokens: Set<string>;
}

export function tokens(value: string): Set<string> {
  const clean = value
    .toUpperCase()
    .replace(/Ñ/g, "N")
    .replace(/[^A-Z ]/g, " ");
  return new Set(clean.split(/\s+/).filter((token) => token.length >= 4 && !STOP.has(token)));
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / Math.min(a.size, b.size);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(
    Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000),
  );
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function monthLabel(iso: string): string {
  const month = Number(iso.slice(5, 7));
  return MONTHS[month - 1] ?? iso.slice(0, 7);
}

export function rfcFromDescription(full: string): string {
  const match = RFC_IN_DESCRIPTION.exec(full);
  return match ? `${match[1]}${match[2]}` : "";
}

/** Regla 3 · proveedor de la salida: RFC en la descripción, CLABE del catálogo, palabra clave. */
function providerHints(full: string, rfc: string, catalog: Service01Catalog): string[] {
  if (rfc) return [rfc];
  for (const [clabe, provider] of Object.entries(catalog.clabeToRfc)) {
    if (full.includes(clabe.toUpperCase())) return [provider.toUpperCase()];
  }
  for (const [keyword, provider] of catalog.keywordToRfc) {
    if (full.includes(keyword.toUpperCase())) {
      return (Array.isArray(provider) ? provider : [provider]).map((value) => value.toUpperCase());
    }
  }
  return [];
}

function firstMatch(full: string, entries: [string, string][]): string | null {
  for (const [keyword, note] of entries) if (full.includes(keyword.toUpperCase())) return note;
  return null;
}

/** Pagos devueltos: un abono posterior por el mismo importe cuya descripción dice DEVOLUCIÓN. */
function returnedPayment(outflow: Outflow): BankMovement | null {
  for (const movement of outflow.statement.movements) {
    if (movement.abono <= 0 || movement.operDate < outflow.movement.operDate) continue;
    if (Math.round(movement.abono * 100) !== outflow.amountCents) continue;
    if (daysBetween(movement.operDate, outflow.movement.operDate) > 15) continue;
    if (/DEVOL|DEVUELT/.test(`${movement.description} ${movement.detail}`.toUpperCase())) {
      return movement;
    }
  }
  return null;
}

export function analyzeOutflows(
  statements: BankStatement[],
  cfdiFile: CfdiFile,
  options: Service01Options = {},
): Service01Analysis {
  if (!statements.length) throw new Error("Carga al menos un estado de cuenta.");
  const catalog = options.catalog ?? resolveCatalog(statements) ?? DEFAULT_CATALOG;
  const warnings: string[] = [];
  const periodFrom = statements.map((s) => s.periodFrom).sort()[0]!;
  const periodTo = statements
    .map((s) => s.periodTo)
    .sort()
    .at(-1)!;
  const withRfc = statements.find((s) => s.rfc);
  const client = {
    name: statements.find((s) => s.holder)?.holder ?? "",
    rfc: withRfc?.rfc ?? "",
  };

  // Regla 2 · las salidas son los cargos; los candidatos, los CFDI de ingreso activos.
  const outflows: Outflow[] = [];
  for (const statement of statements) {
    for (const movement of statement.movements) {
      if (movement.cargo <= 0) continue;
      const full = `${movement.description} ${movement.detail}`.toUpperCase();
      const rfc = rfcFromDescription(full);
      const hints = providerHints(full, rfc, catalog);
      outflows.push({
        movement,
        statement,
        full,
        amountCents: Math.round(movement.cargo * 100),
        rfc,
        rfcHint: hints[0] ?? "",
        hints,
        tokens: tokens(full),
      });
    }
  }
  outflows.sort(
    (a, b) =>
      a.movement.operDate.localeCompare(b.movement.operDate) ||
      a.statement.fileName.localeCompare(b.statement.fileName) ||
      a.movement.id - b.movement.id,
  );
  // Los CFDI del mes anterior (opcional) también son candidatos; se marcan para distinguirlos.
  const prior = (options.previousMonth?.cfdi ?? []).map((cfdi, index) => ({
    ...cfdi,
    id: cfdiFile.cfdi.length + index,
    prior: true,
  }));
  const candidates = [...cfdiFile.cfdi, ...prior].filter(
    (cfdi) => cfdi.tipo === "INGRESO" && cfdi.estatus.toLowerCase() === "activo",
  );
  const cfdiTokens = new Map(candidates.map((cfdi) => [cfdi.id, tokens(cfdi.emisor)]));

  // Lo que no requiere CFDI no entra al cruce (traspasos propios, retiros, pago de TDC, SAT, devueltos).
  const preclassified = new Map<Outflow, { status: Service01Status; note: string }>();
  for (const outflow of outflows) {
    const noRequiere = firstMatch(outflow.full, catalog.noRequiere);
    if (noRequiere) {
      preclassified.set(outflow, { status: "NO REQUIERE", note: noRequiere });
      continue;
    }
    if (outflow.full.split(/\s+/).includes("SAT")) {
      preclassified.set(outflow, {
        status: "NO REQUIERE",
        note: "Pago de impuestos (línea de captura)",
      });
    }
  }

  // Regla 4 · cruce 1 a 1 con asignación óptima.
  const matchable = outflows.filter((outflow) => !preclassified.has(outflow));
  const cost = matchable.map((outflow) =>
    candidates.map((cfdi) => {
      const difference = Math.abs(outflow.amountCents - Math.round(cfdi.total * 100));
      if (difference > AMOUNT_TOLERANCE_CENTS || !cfdi.date) return FORBIDDEN;
      const gap = Math.min(
        daysBetween(outflow.movement.operDate, cfdi.date),
        daysBetween(outflow.movement.liqDate, cfdi.date),
      );
      if (gap > MAX_GAP_DAYS) return FORBIDDEN;
      // Una compra con tarjeta trae el RFC del comercio: no puede ampararla un CFDI de otro emisor.
      if (outflow.rfc && outflow.rfc !== cfdi.rfc) return FORBIDDEN;
      const byRfc = outflow.hints.includes(cfdi.rfc);
      const sim = similarity(outflow.tokens, cfdiTokens.get(cfdi.id) ?? new Set());
      return (byRfc ? 0 : sim > 0.3 ? 6 : 40) + gap * 1.2;
    }),
  );
  const assignment = hungarian(cost);
  const matched = new Map<Outflow, CfdiRecord>();
  assignment.forEach((column, row) => {
    if (column < 0) return;
    const outflow = matchable[row]!;
    if ((cost[row]?.[column] ?? FORBIDDEN) < UNASSIGNED) matched.set(outflow, candidates[column]!);
  });
  const usedCfdi = new Set([...matched.values()].map((cfdi) => cfdi.id));
  const unpaidCandidates = candidates.filter((cfdi) => !usedCfdi.has(cfdi.id));

  // Regla 5 · estatus de cada salida.
  const results: Service01Outflow[] = outflows.map((outflow) => {
    const base = {
      movement: outflow.movement,
      rfcHint: outflow.rfcHint,
    };
    const pre = preclassified.get(outflow);
    if (pre) {
      return {
        ...base,
        status: pre.status,
        cfdi: null,
        providerByRfc: false,
        gapDays: null,
        note: pre.note,
      };
    }
    const cfdi = matched.get(outflow);
    if (cfdi) {
      const byRfc = outflow.hints.includes(cfdi.rfc);
      const gap = Math.min(
        daysBetween(outflow.movement.operDate, cfdi.date),
        daysBetween(outflow.movement.liqDate, cfdi.date),
      );
      const notes: string[] = [];
      if (!byRfc) notes.push("Proveedor identificado por el concepto del movimiento, no por RFC");
      if (gap > CONCILIADO_MAX_GAP)
        notes.push(`CFDI emitido con ${gap} días de diferencia respecto al cargo`);
      if (cfdi.date < periodFrom) {
        notes.push(
          `CFDI de ${monthLabel(cfdi.date)} pagado en ${monthLabel(outflow.movement.operDate)}; se deduce en ${monthLabel(outflow.movement.operDate)}`,
        );
      }
      if (cfdi.forma === "01") {
        notes.push(
          "CFDI con forma 01 (efectivo) pero se pagó por transferencia: pedir sustitución",
        );
      }
      if (cfdi.forma === "04") {
        notes.push("CFDI con forma 04 (tarjeta de crédito) pero salió de la cuenta: revisar");
      }
      return {
        ...base,
        status: notes.length ? "CONCILIADO C/OBS" : "CONCILIADO",
        cfdi,
        providerByRfc: byRfc,
        gapDays: gap,
        note: notes.join(". "),
      };
    }
    const unmatched = { ...base, cfdi: null, providerByRfc: false, gapDays: null };
    const returned = returnedPayment(outflow);
    if (returned) {
      return {
        ...unmatched,
        status: "NO REQUIERE",
        note: `Pago devuelto el ${returned.operDate.split("-").reverse().join("/")} por el mismo importe`,
      };
    }
    const credit = firstMatch(outflow.full, catalog.parcialCredito);
    if (credit) return { ...unmatched, status: "PARCIAL", note: credit };
    const instituto = firstMatch(outflow.full, catalog.parcialInstituto);
    if (instituto) return { ...unmatched, status: "PARCIAL", note: instituto };
    const monedero = outflow.rfcHint ? catalog.monederoRfc[outflow.rfcHint] : undefined;
    if (monedero) {
      return {
        ...unmatched,
        status: "PARCIAL",
        note: `Abono a monedero electrónico de ${monedero}: el CFDI se emite al consumir, no al abonar. Conciliar por saldo del monedero`,
      };
    }
    const personal = firstMatch(outflow.full, catalog.personal);
    if (personal) return { ...unmatched, status: "SIN CFDI", note: personal };
    if (catalog.seguros.some((keyword) => outflow.full.includes(keyword.toUpperCase()))) {
      return {
        ...unmatched,
        status: "CONCILIADO C/OBS",
        note: "Póliza de seguro: el CFDI es PPD y se acredita con el complemento de pago (REP) del mes",
      };
    }
    if (
      /IVA TASA DE DESC|APLI TASA DE DES|IVA COM SERV|SERV BANCA INTERNET|COMISION/.test(
        outflow.full,
      )
    ) {
      return {
        ...unmatched,
        status: "SIN CFDI",
        note: "Comisión bancaria: se ampara con el CFDI mensual del banco",
      };
    }
    // Abono a una factura PPD mayor que la salida: el CFDI cubre sólo una parte y falta el REP.
    const ppd = outflow.hints.length
      ? unpaidCandidates.find(
          (cfdi) =>
            outflow.hints.includes(cfdi.rfc) &&
            cfdi.metodo === "PPD" &&
            Math.round(cfdi.total * 100) > outflow.amountCents,
        )
      : undefined;
    if (ppd) {
      return {
        ...unmatched,
        status: "PARCIAL",
        cfdi: ppd,
        note: `Abono de ${money(outflow.movement.cargo)} a la factura PPD ${ppd.serieFolio} de ${money(ppd.total)}: pedir el complemento de pago (REP)`,
      };
    }
    if (outflow.full.includes("PAGO CUENTA DE TERCERO") || outflow.full.includes("SPEI ENVIADO")) {
      return {
        ...unmatched,
        status: "SIN CFDI",
        note: "Transferencia a tercero sin CFDI identificado: pedir la factura o aclarar el concepto",
      };
    }
    if (outflow.rfc) {
      return {
        ...unmatched,
        status: "SIN CFDI",
        note: "Compra con tarjeta sin CFDI: pedir la factura o tratarla como no deducible",
      };
    }
    return { ...unmatched, status: "SIN CFDI", note: "Sin CFDI identificado" };
  });

  // Regla 6 · CFDI activos sin salida, con diagnóstico.
  const unpaid: Service01Unpaid[] = unpaidCandidates
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((cfdi) => ({ cfdi, diagnostico: diagnose(cfdi, catalog) }));

  const byStatus = Object.fromEntries(
    SERVICE01_STATUSES.map((status) => [status, { salidas: 0, importe: 0 }]),
  ) as Record<Service01Status, Service01StatusTotals>;
  let importeCents = 0;
  for (const result of results) {
    const entry = byStatus[result.status];
    entry.salidas++;
    entry.importe = round2(entry.importe + result.movement.cargo);
    importeCents += Math.round(result.movement.cargo * 100);
  }
  const sum = (list: { total: number }[]) =>
    round2(list.reduce((acc, item) => acc + item.total, 0));
  const matchedCfdi = candidates.filter((cfdi) => usedCfdi.has(cfdi.id));
  const egreso = cfdiFile.cfdi.filter((cfdi) => cfdi.tipo === "EGRESO");
  const cancelados = cfdiFile.cfdi.filter((cfdi) => cfdi.estatus.toLowerCase() === "cancelado");
  const abonos = statements.flatMap((s) => s.movements.filter((m) => m.abono > 0));
  const conCfdi = byStatus.CONCILIADO.importe + byStatus["CONCILIADO C/OBS"].importe;
  const requiere = importeCents / 100 - byStatus["NO REQUIERE"].importe;
  const period = `${periodFrom.slice(0, 7)}`;
  const stamp = period.replace("-", "");
  if (!client.rfc)
    warnings.push(
      "El estado de cuenta no trae RFC del titular; el catálogo se eligió por el nombre.",
    );
  if (catalog.id === DEFAULT_CATALOG.id) {
    warnings.push(
      "No hay catálogo para este cliente: se usó el genérico. Las CLABE y palabras clave aprendidas se capturan en el catálogo.",
    );
  }

  return {
    client,
    periodFrom,
    periodTo,
    catalog,
    statements,
    cfdiFileName: cfdiFile.fileName,
    outflows: results,
    unpaid,
    byStatus,
    totals: {
      salidas: results.length,
      importe: importeCents / 100,
      cargosBanco: results.length,
      cargosBancoImporte: importeCents / 100,
      abonosBanco: abonos.length,
      abonosBancoImporte: round2(abonos.reduce((acc, m) => acc + m.abono, 0)),
      cfdiActivos: candidates.length,
      cfdiMesAnterior: prior.length,
      cfdiActivosImporte: sum(candidates),
      cfdiConSalida: matchedCfdi.length,
      cfdiConSalidaImporte: sum(matchedCfdi),
      cfdiSinSalida: unpaidCandidates.length,
      cfdiSinSalidaImporte: sum(unpaidCandidates),
      rep: cfdiFile.rep.length,
      repImporte: round2(cfdiFile.rep.reduce((acc, r) => acc + r.monto, 0)),
      egreso: egreso.length,
      egresoImporte: sum(egreso),
      cancelados: cancelados.length,
      canceladosImporte: sum(cancelados),
      pctRequiereYTiene: requiere > 0 ? conCfdi / requiere : 0,
    },
    warnings,
    outputFilename: `Conciliacion_Salidas_vs_CFDI_${stamp}${client.rfc ? `_${client.rfc}` : ""}.xlsx`,
  };
}

function money(value: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

function diagnose(cfdi: CfdiRecord, catalog: Service01Catalog): string {
  if (cfdi.prior) return "CFDI del mes anterior sin pago identificado en este mes";
  const specific = catalog.unpaidDiagnostics[cfdi.rfc];
  if (specific) return specific;
  if (cfdi.metodo === "PPD") {
    return "CFDI PPD: se acredita con el complemento de pago (REP). Verificar que exista el REP";
  }
  switch (cfdi.forma) {
    case "01":
      return "CFDI en efectivo: no hay salida bancaria. Si supera $2,000 no es deducible (art. 27 fr. III LISR)";
    case "04":
      return "CFDI pagado con tarjeta de crédito: falta el estado de cuenta de la TDC";
    case "17":
      return "CFDI con forma 17 (compensación): revisar contra cuentas por pagar";
    case "30":
      return "CFDI con forma 30 (aplicación de anticipo): revisar el anticipo relacionado";
    default:
      return "Sin salida bancaria identificada: confirmar forma de pago o buscar en otra cuenta";
  }
}
