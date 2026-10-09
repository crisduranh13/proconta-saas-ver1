import { analyzeOutflows } from "../service-01/engine";
import { hungarian } from "../service-01/hungarian";
import type { BankMovement, CfdiRecord, RepRecord } from "../service-01/types";
import { resolveService02Config } from "./config";
import { computeIsr } from "./isr";
import type {
  DeductionStatus,
  DepositClass,
  IssuedStatus,
  Service02Analysis,
  Service02Deposit,
  Service02Inputs,
  Service02Issued,
  Service02Options,
  Service02Received,
} from "./types";
import { DEDUCTION_STATUSES, DEPOSIT_CLASSES } from "./types";

/*
 * Servicio 2 · IVA e ISR del mes (persona física 612, flujo de efectivo).
 * 1. Depósitos del banco → INGRESO (cobro de un CFDI emitido PUE o de un PPD con REP),
 *    INGRESO SIN CFDI (facturar) o NO ES INGRESO (traspasos, préstamos, devoluciones).
 * 2. CFDI emitidos con su estatus de cobro.
 * 3. CFDI recibidos (más los pendientes del mes anterior) con su estatus de deducción; el
 *    "pago identificado" viene del cruce del Servicio 1.
 * 4. IVA trasladado − IVA acreditable (IVA real de cada CFDI) e ISR con la tarifa mensual.
 */

const IVA = 1.16;
const AMOUNT_TOLERANCE_CENTS = 5;
const MAX_GAP_DAYS = 20;
const FORBIDDEN = 1e6;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(
    Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000),
  );
}

function dmy(iso: string): string {
  return iso.split("-").reverse().join("/");
}

function money(value: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

interface Collectible {
  key: string;
  kind: "cfdi" | "rep";
  cfdi: CfdiRecord | null;
  rep: RepRecord | null;
  amountCents: number;
  date: string;
  label: string;
}

export function analyzeMonthTaxes(
  inputs: Service02Inputs,
  options: Service02Options = {},
): Service02Analysis {
  const { statements, recibidos, emitidos } = inputs;
  const previousMonth = inputs.previousMonth ?? null;
  const outflows = analyzeOutflows(statements, recibidos, {
    previousMonth,
    ...(options.catalog ? { catalog: options.catalog } : {}),
  });
  const config = resolveService02Config(outflows.catalog.id, options.config ?? {});
  const warnings = [...outflows.warnings];
  const { periodFrom, periodTo } = outflows;

  // ───── 1. Depósitos ─────
  const deposits: { movement: BankMovement; full: string }[] = [];
  for (const statement of statements) {
    if (statement.kind === "bbva-tdc") continue; // los abonos a la TDC son pagos, no cobros
    for (const movement of statement.movements) {
      if (movement.abono > 0) {
        deposits.push({
          movement,
          full: `${movement.description} ${movement.detail}`.toUpperCase(),
        });
      }
    }
  }
  deposits.sort(
    (a, b) =>
      a.movement.account.localeCompare(b.movement.account) ||
      a.movement.operDate.localeCompare(b.movement.operDate) ||
      a.movement.id - b.movement.id,
  );

  const issuedCfdi = emitidos.cfdi.filter(
    (cfdi) => cfdi.tipo === "INGRESO" && cfdi.estatus.toLowerCase() === "activo",
  );
  const issuedReps = emitidos.rep.filter((rep) => rep.estatus.toLowerCase() !== "cancelado");
  const collectibles: Collectible[] = [
    ...issuedCfdi
      .filter((cfdi) => cfdi.metodo === "PUE")
      .map((cfdi) => ({
        key: `cfdi:${cfdi.id}`,
        kind: "cfdi" as const,
        cfdi,
        rep: null,
        amountCents: cents(cfdi.total),
        date: cfdi.date,
        label: `CFDI ${cfdi.serieFolio} ${cfdi.emisor}`,
      })),
    ...issuedReps.map((rep, index) => ({
      key: `rep:${index}`,
      kind: "rep" as const,
      cfdi: null,
      rep,
      amountCents: cents(rep.monto),
      date: rep.date,
      label: `REP ${rep.folio || rep.uuid.slice(0, 8)} ${rep.emisor}`,
    })),
  ];

  const preclassified = new Map<number, { classification: DepositClass; note: string }>();
  deposits.forEach((deposit, index) => {
    const { full } = deposit;
    if (full.includes("TRASPASO CUENTAS PROPIAS")) {
      preclassified.set(index, {
        classification: "NO ES INGRESO",
        note: "Traspaso entre cuentas propias",
      });
    } else if (/DEVOLUCI|DEVUELT/.test(full)) {
      preclassified.set(index, {
        classification: "NO ES INGRESO",
        note: "Devolución (préstamo otorgado / pago devuelto)",
      });
    } else if (/PRESTAMO|PR.STAMO/.test(full)) {
      preclassified.set(index, {
        classification: "NO ES INGRESO",
        note: "Préstamo recibido: documentar con contrato; sin contrato el SAT lo presume ingreso (art. 59 CFF)",
      });
    } else if (/VENTAS (CREDITO|DEBITO)/.test(full)) {
      preclassified.set(index, {
        classification: "INGRESO SIN CFDI",
        note: "Cobro con TPV: emitir factura global de público en general",
      });
    }
  });
  const matchable = deposits.map((_, index) => index).filter((index) => !preclassified.has(index));
  const cost = matchable.map((index) => {
    const deposit = deposits[index]!;
    return collectibles.map((item) => {
      if (Math.abs(cents(deposit.movement.abono) - item.amountCents) > AMOUNT_TOLERANCE_CENTS) {
        return FORBIDDEN;
      }
      const gap = daysBetween(deposit.movement.operDate, item.date);
      return gap > MAX_GAP_DAYS ? FORBIDDEN : gap;
    });
  });
  const matchedCollectible = new Map<number, Collectible>();
  hungarian(cost).forEach((column, row) => {
    if (column >= 0 && (cost[row]?.[column] ?? FORBIDDEN) < FORBIDDEN) {
      matchedCollectible.set(matchable[row]!, collectibles[column]!);
    }
  });
  const collectedKeys = new Set([...matchedCollectible.values()].map((item) => item.key));

  const depositRows: Service02Deposit[] = deposits.map((deposit, index) => {
    const abono = deposit.movement.abono;
    const taxed = (classification: DepositClass, note: string, reference = "") => {
      const income = classification !== "NO ES INGRESO";
      const base = income ? round2(abono / IVA) : 0;
      return {
        movement: deposit.movement,
        classification,
        reference,
        base,
        iva: income ? round2(abono - base) : 0,
        note,
      };
    };
    const pre = preclassified.get(index);
    if (pre) return taxed(pre.classification, pre.note);
    const item = matchedCollectible.get(index);
    if (item) {
      return taxed(
        "INGRESO",
        item.kind === "cfdi"
          ? `Cobro del CFDI ${item.cfdi!.serieFolio} (${item.cfdi!.emisor})`
          : `Cobro de factura PPD con REP del ${dmy(item.date)} (${item.rep!.emisor})`,
        item.label,
      );
    }
    return taxed("INGRESO SIN CFDI", "Cobro a cliente sin CFDI emitido: facturar");
  });

  // ───── 2. CFDI emitidos ─────
  const issued: Service02Issued[] = [];
  const repRemaining = new Map<RepRecord, number>(issuedReps.map((rep) => [rep, cents(rep.monto)]));
  const cfdiRemaining = new Map<CfdiRecord, number>(
    issuedCfdi.map((cfdi) => [cfdi, cents(cfdi.total)]),
  );
  const appliedReps = new Map<CfdiRecord, RepRecord[]>();
  for (const rep of [...issuedReps].sort((a, b) => a.date.localeCompare(b.date))) {
    const target = issuedCfdi
      .filter(
        (cfdi) =>
          cfdi.metodo === "PPD" &&
          cfdi.rfc === rep.rfc &&
          cfdi.date <= rep.date &&
          (cfdiRemaining.get(cfdi) ?? 0) + AMOUNT_TOLERANCE_CENTS >= cents(rep.monto),
      )
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!target) continue;
    cfdiRemaining.set(target, (cfdiRemaining.get(target) ?? 0) - cents(rep.monto));
    appliedReps.set(target, [...(appliedReps.get(target) ?? []), rep]);
    repRemaining.set(rep, 0);
  }
  for (const cfdi of issuedCfdi) {
    const base = {
      key: cfdi.serieFolio,
      cfdi,
      rep: null,
      receptorRfc: cfdi.rfc,
      receptor: cfdi.emisor,
      date: cfdi.date,
      metodo: cfdi.metodo,
      subtotal: cfdi.subtotal,
      iva: cfdi.iva,
      total: cfdi.total,
    };
    if (cfdi.metodo === "PUE") {
      const collected = collectedKeys.has(`cfdi:${cfdi.id}`);
      issued.push({
        ...base,
        status: collected ? "COBRADO" : "PENDIENTE DE COBRO",
        cobrado: collected ? cfdi.total : 0,
        note: collected
          ? "Cobro identificado en banco"
          : "PUE sin cobro identificado en el mes: revisar si se cobró en otra cuenta o en efectivo",
      });
      continue;
    }
    const reps = appliedReps.get(cfdi) ?? [];
    const cobrado = round2(reps.reduce((sum, rep) => sum + rep.monto, 0));
    const saldo = round2(cfdi.total - cobrado);
    issued.push({
      ...base,
      status: reps.length ? "COBRADO VÍA REP" : "PENDIENTE DE COBRO",
      cobrado,
      note: reps.length
        ? `PPD ${money(cfdi.total)}: ${reps.map((rep) => `REP ${dmy(rep.date)} por ${money(rep.monto)}`).join(", ")}${saldo > 0 ? `. Saldo ${money(saldo)}` : ""}`
        : `PPD ${money(cfdi.total)} sin REP: sin cobro en el mes, no se acumula`,
    });
  }
  issuedReps.forEach((rep, index) => {
    if ((repRemaining.get(rep) ?? 0) === 0) return;
    const collected = collectedKeys.has(`rep:${index}`);
    issued.push({
      key: `REP ${rep.folio || rep.uuid.slice(0, 8)}`,
      cfdi: null,
      rep,
      receptorRfc: rep.rfc,
      receptor: rep.emisor,
      date: rep.date,
      metodo: "REP",
      subtotal: null,
      iva: null,
      total: null,
      status: "COBRADO VÍA REP",
      cobrado: rep.monto,
      note: `REP por ${money(rep.monto)}${collected ? " con depósito identificado" : ""}. No aplica a ninguna factura emitida del mes: identificar la factura (de un mes anterior) que liquida`,
    });
  });

  // ───── 3. CFDI recibidos ─────
  const priorCfdi = (previousMonth?.cfdi ?? []).map((cfdi) => ({ ...cfdi, prior: true }));
  const allReceived: CfdiRecord[] = [...recibidos.cfdi, ...priorCfdi];
  const paidByBank = new Set(
    outflows.outflows
      .filter((o) => o.cfdi && (o.status === "CONCILIADO" || o.status === "CONCILIADO C/OBS"))
      .map((o) => o.cfdi!.uuid),
  );
  const partialByRfc = new Map<string, number>();
  for (const o of outflows.outflows) {
    if (o.status !== "PARCIAL" || !o.rfcHint) continue;
    partialByRfc.set(o.rfcHint, (partialByRfc.get(o.rfcHint) ?? 0) + cents(o.movement.cargo));
  }
  // REP recibidos: se aplican a un PPD del mismo emisor fechado antes del REP y con saldo.
  const receivedReps = recibidos.rep.filter((rep) => rep.estatus.toLowerCase() !== "cancelado");
  const ppdRemaining = new Map<CfdiRecord, number>(
    allReceived.filter((cfdi) => cfdi.metodo === "PPD").map((cfdi) => [cfdi, cents(cfdi.total)]),
  );
  const ppdReps = new Map<CfdiRecord, RepRecord[]>();
  const unappliedReps: RepRecord[] = [];
  for (const rep of [...receivedReps].sort((a, b) => a.date.localeCompare(b.date))) {
    const target = allReceived
      .filter(
        (cfdi) =>
          cfdi.metodo === "PPD" &&
          cfdi.rfc === rep.rfc &&
          cfdi.date <= rep.date &&
          (ppdRemaining.get(cfdi) ?? 0) + AMOUNT_TOLERANCE_CENTS >= cents(rep.monto),
      )
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!target) {
      unappliedReps.push(rep);
      continue;
    }
    ppdRemaining.set(target, (ppdRemaining.get(target) ?? 0) - cents(rep.monto));
    ppdReps.set(target, [...(ppdReps.get(target) ?? []), rep]);
  }

  const classify = (cfdi: CfdiRecord): { status: DeductionStatus; note: string } => {
    if (cfdi.estatus.toLowerCase() === "cancelado") {
      return { status: "NO APLICA", note: "CFDI cancelado" };
    }
    if (cents(cfdi.total) === 0) return { status: "NO APLICA", note: "CFDI en $0.00" };
    if (cfdi.tipo === "EGRESO") {
      return {
        status: "NO APLICA",
        note:
          cfdi.forma === "30"
            ? "Nota de crédito (forma 30): netea la factura final del anticipo"
            : "Nota de crédito (CFDI de egreso): no es deducción",
      };
    }
    if (
      config.anticipoFinal.some(
        (entry) => entry.rfc === cfdi.rfc && cfdi.serie.toUpperCase() === entry.serie.toUpperCase(),
      )
    ) {
      return {
        status: "NO DEDUCIBLE",
        note: "Factura final de anticipo ya neteada con nota de crédito: el gasto se dedujo con el CFDI del anticipo",
      };
    }
    if (config.usosPersonales.includes(cfdi.uso.toUpperCase())) {
      return {
        status: "NO DEDUCIBLE",
        note: `Uso ${cfdi.uso} (deducción personal en la anual, no del negocio)`,
      };
    }
    const paid = paidByBank.has(cfdi.uuid);
    if (!paid && config.ownBankRfcs.includes(cfdi.rfc) && Number(cfdi.date.slice(8, 10)) <= 3) {
      return {
        status: "OTRO PERIODO",
        note: "Comisiones del banco del mes anterior (CFDI mensual emitido al inicio del mes): ya deducidas",
      };
    }
    if (paid) {
      return {
        status: "DEDUCIBLE",
        note: cfdi.prior
          ? "CFDI del mes anterior pagado en este mes: pago identificado en estado de cuenta (IVA real del CFDI)"
          : "Pago identificado en estado de cuenta",
      };
    }
    if (config.institutoRfcs.includes(cfdi.rfc)) {
      return {
        status: "DEDUCIBLE",
        note: "Cuotas patronales (el CFDI lo emite el instituto al pagar). El cargo no está en las cuentas entregadas",
      };
    }
    if (cfdi.metodo === "PPD") {
      const reps = ppdReps.get(cfdi) ?? [];
      const remaining = ppdRemaining.get(cfdi) ?? cents(cfdi.total);
      if (reps.length && remaining <= AMOUNT_TOLERANCE_CENTS) {
        return {
          status: "DEDUCIBLE",
          note: `PPD con REP ${reps.map((rep) => `${rep.folio || rep.uuid.slice(0, 8)} del ${dmy(rep.date)}`).join(", ")}`,
        };
      }
      if (!reps.length) {
        return {
          status: "NO DEDUCIBLE",
          note: "PPD sin REP: se deduce cuando llegue el complemento de pago",
        };
      }
      return {
        status: "PENDIENTE",
        note: `PPD con REP parcial (${money(round2((cents(cfdi.total) - remaining) / 100))} de ${money(cfdi.total)}): sin pago identificado`,
      };
    }
    const partial = partialByRfc.get(cfdi.rfc) ?? 0;
    if (partial >= cents(cfdi.total)) {
      return {
        status: "DEDUCIBLE",
        note: `Intereses y comisiones dentro de un cargo mayor (${money(partial / 100)}); el capital no lleva CFDI`,
      };
    }
    if (cfdi.forma === "01" && cfdi.total <= config.efectivoMaximo) {
      return {
        status: "DEDUCIBLE",
        note: `Efectivo ≤ ${money(config.efectivoMaximo)}: deducible sin pago bancario (art. 27 fr. III LISR)`,
      };
    }
    if (cfdi.forma === "01") {
      return {
        status: "NO DEDUCIBLE",
        note: `Efectivo mayor a ${money(config.efectivoMaximo)}: no deducible (art. 27 fr. III LISR)`,
      };
    }
    if (cfdi.forma === "04") {
      return {
        status: "PENDIENTE",
        note: "Pagado con tarjeta de crédito: falta el estado de cuenta completo de la TDC",
      };
    }
    return { status: "PENDIENTE", note: "Sin pago identificado en las cuentas entregadas" };
  };

  const received: Service02Received[] = allReceived.map((cfdi) => {
    const { status, note } = classify(cfdi);
    const iva = round2(cfdi.iva);
    // Subtotal neto: el Sub Total del CFDI menos descuento (incluye IEPS y otros no acreditables).
    const subtotal =
      cfdi.subtotal > 0 ? round2(cfdi.subtotal - cfdi.descuento) : round2(cfdi.total - iva);
    return {
      key: cfdi.serieFolio,
      cfdi,
      rep: null,
      date: cfdi.date,
      tipo: cfdi.tipo,
      rfc: cfdi.rfc,
      emisor: cfdi.emisor,
      serieFolio: cfdi.serieFolio,
      metodo: cfdi.metodo,
      forma: cfdi.forma,
      uso: cfdi.uso,
      subtotal,
      iva,
      total: round2(cfdi.total),
      status,
      note,
      prior: Boolean(cfdi.prior),
    };
  });
  for (const rep of unappliedReps) {
    const base = round2(rep.monto / IVA);
    received.push({
      key: `REP ${rep.folio || rep.uuid.slice(0, 8)}`,
      cfdi: null,
      rep,
      date: rep.date,
      tipo: "REP",
      rfc: rep.rfc,
      emisor: rep.emisor,
      serieFolio: `REP ${rep.folio || rep.uuid.slice(0, 8)} del ${dmy(rep.date)} (CFDI PPD de un mes anterior)`,
      metodo: "PPD",
      forma: "99",
      uso: "",
      subtotal: base,
      iva: round2(rep.monto - base),
      total: round2(rep.monto),
      status: "DEDUCIBLE",
      note: "Pago acreditado con complemento de pago de un CFDI PPD anterior (IVA estimado a 16 %: confirmar con el CFDI)",
      prior: true,
    });
  }
  received.sort((a, b) => a.date.localeCompare(b.date) || (a.cfdi?.id ?? 0) - (b.cfdi?.id ?? 0));

  // ───── 4. Impuestos ─────
  const byDeposit = Object.fromEntries(
    DEPOSIT_CLASSES.map((c) => [c, { depositos: 0, importe: 0 }]),
  ) as Record<DepositClass, { depositos: number; importe: number }>;
  let depositCents = 0;
  let cobradoCents = 0;
  for (const row of depositRows) {
    byDeposit[row.classification].depositos++;
    byDeposit[row.classification].importe = round2(
      byDeposit[row.classification].importe + row.movement.abono,
    );
    depositCents += cents(row.movement.abono);
    if (row.classification !== "NO ES INGRESO") cobradoCents += cents(row.movement.abono);
  }
  const cobrado = cobradoCents / 100;
  const base = round2(cobrado / IVA);
  const trasladado = round2(cobrado - base);

  const byIssued = { COBRADO: 0, "COBRADO VÍA REP": 0, "PENDIENTE DE COBRO": 0 } as Record<
    IssuedStatus,
    number
  >;
  for (const row of issued) byIssued[row.status]++;

  const byDeduction = Object.fromEntries(
    DEDUCTION_STATUSES.map((s) => [s, { cfdi: 0, subtotal: 0, iva: 0 }]),
  ) as Record<DeductionStatus, { cfdi: number; subtotal: number; iva: number }>;
  let acreditableCents = 0;
  let deduccionesCents = 0;
  for (const row of received) {
    const entry = byDeduction[row.status];
    entry.cfdi++;
    entry.subtotal = round2(entry.subtotal + row.subtotal);
    entry.iva = round2(entry.iva + row.iva);
    if (row.status === "DEDUCIBLE") {
      acreditableCents += cents(row.iva);
      deduccionesCents += cents(row.subtotal);
    }
  }
  const acreditable = acreditableCents / 100;
  const deducciones = deduccionesCents / 100;
  const isr = computeIsr(round2(base - deducciones));
  if (previousMonth === null) {
    warnings.push(
      "No se cargaron CFDI del mes anterior: los pagos de facturas de meses previos quedarán SIN CFDI en el S1 y no se deducen aquí.",
    );
  }
  if (byDeposit["INGRESO SIN CFDI"].depositos) {
    warnings.push(
      `${byDeposit["INGRESO SIN CFDI"].depositos} depósito(s) por ${money(byDeposit["INGRESO SIN CFDI"].importe)} sin CFDI emitido: se acumulan como ingreso y hay que facturarlos.`,
    );
  }

  return {
    client: outflows.client,
    periodFrom,
    periodTo,
    config,
    outflows,
    deposits: depositRows,
    issued,
    received,
    byDeposit,
    byIssued,
    byDeduction,
    ingresos: {
      depositos: depositRows.length,
      importe: depositCents / 100,
      cobradoConIva: cobrado,
      baseSinIva: base,
      ivaTrasladado: trasladado,
    },
    iva: { trasladado, acreditable, aPagar: round2(trasladado - acreditable) },
    isr: { ...isr, ingresos: base, deducciones },
    warnings,
    outputFilename: `IVA_ISR_${periodFrom.slice(0, 7).replace("-", "")}${outflows.client.rfc ? `_${outflows.client.rfc}` : ""}.xlsx`,
  };
}
