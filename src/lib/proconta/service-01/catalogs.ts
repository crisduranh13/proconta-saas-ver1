import type { BankStatement, Service01Catalog } from "./types";

/*
 * Catálogos por cliente del Servicio 1. Son datos: el despacho los edita en pantalla
 * (JSON) y el motor sólo los consulta. Cuando exista base de datos, se guardan ahí.
 */

const GENERIC_NO_REQUIERE: [string, string][] = [
  ["TRASPASO CUENTAS PROPIAS", "Traspaso entre cuentas propias"],
  ["RETIRO SIN TARJETA", "Retiro de efectivo"],
  ["RETIRO EN VENTANILLA", "Retiro de efectivo (soporte de los pagos en efectivo)"],
  ["RETIRO CAJERO AUTOMATICO", "Retiro de efectivo (soporte de los pagos en efectivo)"],
  ["RETIRO INV. PATRIMONIAL", "Movimiento de inversión patrimonial (no es gasto)"],
  ["DEPOSITO INV. PATRIMONIAL", "Movimiento de inversión patrimonial"],
  [
    "PAGO TARJETA DE CREDITO",
    "Pago de tarjeta de crédito: los consumos se revisan en el estado de la TDC",
  ],
  ["SPEI DEVUELTO", "SPEI devuelto"],
  ["F EXT BANCO ACTINVER", "Operación con casa de bolsa: confirmar si es inversión o pago"],
];

const GENERIC_PERSONAL: [string, string][] = [
  ["DIDI FOOD", "Consumo personal (comida)"],
  ["AMAZON", "Compra en Amazon: facturar desde el portal"],
];

const GENERIC_SEGUROS = ["AXA SEGUROS", "META SEGURA", "QUALITAS"];

export const DEFAULT_CATALOG: Service01Catalog = {
  id: "generico",
  label: "Genérico (sin catálogo del cliente)",
  matchRfc: [],
  matchName: [],
  clabeToRfc: {},
  keywordToRfc: [],
  noRequiere: GENERIC_NO_REQUIERE,
  parcialCredito: [],
  parcialInstituto: [],
  monederoRfc: {},
  personal: GENERIC_PERSONAL,
  seguros: GENERIC_SEGUROS,
  unpaidDiagnostics: {},
};

const CREDIT_NOTE =
  "Pago de crédito o arrendamiento: el CFDI ampara intereses y comisiones, no el capital. Verificar contra la tabla de amortización";

/** Caso A · persona física, régimen 612, BBVA Maestra PYME. */
export const CATALOG_A: Service01Catalog = {
  id: "becc840424js4",
  label: "Cliente A · BECC840424JS4",
  matchRfc: ["BECC840424JS4"],
  matchName: ["CESAR BERMUDEZ CARMONA"],
  clabeToRfc: {
    "00014610655047727481": "GSU010620SB9",
    "00646180167300304911": "CGA010307N18",
    "00646180167300310549": "GFE9707075U3",
    "00646180219700000035": "GFE9707075U3",
    "00014905655031692761": "ESS081204Q70",
    "00030905900007720383": "TAC1603178D3",
    "00002853097437734783": "PSA980223677",
    "00072823005407841182": "ESM1507015Y1",
    "00014910655071527807": "GDC080123L17",
  },
  keywordToRfc: [
    ["GAS SUCHIX", "GSU010620SB9"],
    ["GAS ANIMAS", "CGA010307N18"],
    ["SAUCILLO", "ESS081204Q70"],
    ["COSTA SUR", "TAC1603178D3"],
    ["TRACTOACCESORIOS", "TAC1603178D3"],
    ["TRACTO ACCESORIOS", "TAC1603178D3"],
    ["QUALITAS", "QCS931209G49"],
    ["AXA SEGUROS", "ASE931116231"],
    ["MARRIVER", "ESM1507015Y1"],
    ["PYSA", "PSA980223677"],
    ["NURBAN", "GCB131029JY5"],
    ["LLANTAS Y RINES", "GSO120427I62"],
    ["OPERADORA CONCESIONA", "OCM0505317M0"],
    ["IMSS/INF/AFORE", "IMS421231I45"],
    ["GAS Y DERIVADOS", "GDC080123L17"],
    ["AUTOPARTES VERACRUZ", "AVE0000000X0"],
    ["TELEFONOS DE MEXICO", "TME840315KT6"],
    ["TELCEL", "RDI841003QJ4"],
    ["COLEG AMERICANO", "CAX140219M75"],
    ["COLEGIO COAM", "CXA1302207U6"],
    ["BANCO MULTIVA", "BMI061005NY5"],
    ["META SEGURA", "SBB961118TIA"],
    ["PAGO VIDA CREDITO", "SBB961118TIA"],
    ["SERV BANCA INTERNET", "BBA830831LJ2"],
    ["IVA COM SERV", "BBA830831LJ2"],
    ["COBRO AUTOMATICO RECIBO", "BBA830831LJ2"],
    ["BANCO INVEX", "RAD130627IH2"],
    ["GRUPO FERCHE", "GFE9707075U3"],
    ["FERCHEGAS", "GFE9707075U3"],
    ["FERCHE", "GFE9707075U3"],
  ],
  noRequiere: GENERIC_NO_REQUIERE,
  parcialCredito: [
    ["COBRO AUTOMATICO RECIBO", CREDIT_NOTE],
    ["BANCO INVEX", CREDIT_NOTE],
    ["BANCO MULTIVA", CREDIT_NOTE],
    ["PAGO VIDA CREDITO", CREDIT_NOTE],
  ],
  parcialInstituto: [
    [
      "IMSS/INF/AFORE",
      "Pago SIPARE: cubre cuotas IMSS, Infonavit y aportaciones; los CFDI los emiten los institutos",
    ],
  ],
  monederoRfc: {
    GFE9707075U3: "Ferche (combustible)",
    OCM0505317M0: "Operadora Concesionaria (peaje)",
  },
  personal: [
    ["DIDI FOOD", "Consumo personal (comida)"],
    ["AMAZON", "Compra en Amazon: facturar desde el portal"],
    ["COLEG AMERICANO", "Colegiatura: deducción personal en la anual, no del negocio"],
    ["COLEGIO COAM", "Colegiatura: deducción personal"],
  ],
  seguros: GENERIC_SEGUROS,
  unpaidDiagnostics: {
    GFE9707075U3:
      "Consumo del monedero de combustible: el abono al monedero ya salió del banco en otra fecha",
    OCM0505317M0:
      "Peaje: el CFDI se emite al cierre del mes por los consumos; los abonos salieron durante el mes",
    CGA010307N18: "Combustible: revisar si se pagó con monedero, en efectivo o desde otra cuenta",
    GSU010620SB9: "Combustible: revisar si se pagó con monedero, en efectivo o desde otra cuenta",
  },
};

/** Caso B · cuentas BBVA PYME, personal y TDC (reportes XLSX de banca en línea). */
export const CATALOG_B: Service01Catalog = {
  id: "soto-virues-berenice",
  label: "Cliente B · SOTO VIRUES BERENICE",
  matchRfc: [],
  matchName: ["SOTO VIRUES BERENICE"],
  clabeToRfc: {
    "0194858948": "RUVC620923M34",
    "00067596759": "VPX080813QP7",
  },
  keywordToRfc: [
    // Los SPEI a Scotiabank pagan a los proveedores de vidrio y a un contratista.
    ["SPEI ENVIADO SCOTIABANK", ["VAX0506278MA", "RIRT740811282"]],
    ["SPEI ENVIADO SANTANDER", "APE100720V63"],
    ["TELCEL", "RDI841003QJ4"],
    ["TOYOTA FINANCIAL", "TFS011012M18"],
  ],
  noRequiere: [
    ...GENERIC_NO_REQUIERE,
    [
      "SPEI ENVIADO BANAMEX",
      "Traspaso a cuenta propia en Banamex (existe CFDI de comisiones de Banamex a su nombre): confirmar",
    ],
  ],
  parcialCredito: [
    [
      "TOYOTA FINANCIAL",
      "Crédito automotriz: el CFDI ampara intereses e IVA; el capital no lleva CFDI mensual",
    ],
  ],
  parcialInstituto: [],
  monederoRfc: {},
  personal: [["AMAZON", "Amazon: facturar desde el portal"]],
  seguros: GENERIC_SEGUROS,
  unpaidDiagnostics: {},
};

export const SERVICE01_CATALOGS: Service01Catalog[] = [CATALOG_A, CATALOG_B, DEFAULT_CATALOG];

/** Elige el catálogo del cliente a partir del titular o RFC del estado de cuenta. */
export function resolveCatalog(statements: BankStatement[]): Service01Catalog {
  const rfcs = statements.map((statement) => statement.rfc.toUpperCase()).filter(Boolean);
  const holders = statements.map((statement) => statement.holder.toUpperCase());
  for (const catalog of SERVICE01_CATALOGS) {
    if (catalog.matchRfc.some((rfc) => rfcs.includes(rfc.toUpperCase()))) return catalog;
    if (
      catalog.matchName.some((name) =>
        holders.some((holder) => holder.includes(name.toUpperCase())),
      )
    ) {
      return catalog;
    }
  }
  return DEFAULT_CATALOG;
}

function pairs(value: unknown): [string, string][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is [unknown, unknown] => Array.isArray(entry) && entry.length >= 2)
    .map((entry) => [String(entry[0]), String(entry[1])]);
}

function record(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, String(entry)]),
  );
}

/** Convierte un JSON editado por el contador en un catálogo completo; lo que falte toma el valor genérico. */
export function normalizeCatalog(input: unknown, base: Service01Catalog = DEFAULT_CATALOG) {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const keywordToRfc: [string, string | string[]][] = Array.isArray(source["keywordToRfc"])
    ? (source["keywordToRfc"] as unknown[])
        .filter((entry): entry is [unknown, unknown] => Array.isArray(entry) && entry.length >= 2)
        .map((entry) => [
          String(entry[0]),
          Array.isArray(entry[1]) ? entry[1].map(String) : String(entry[1]),
        ])
    : base.keywordToRfc;
  const catalog: Service01Catalog = {
    id: typeof source["id"] === "string" ? source["id"] : base.id,
    label: typeof source["label"] === "string" ? source["label"] : base.label,
    matchRfc: Array.isArray(source["matchRfc"]) ? source["matchRfc"].map(String) : base.matchRfc,
    matchName: Array.isArray(source["matchName"])
      ? source["matchName"].map(String)
      : base.matchName,
    clabeToRfc: "clabeToRfc" in source ? record(source["clabeToRfc"]) : base.clabeToRfc,
    keywordToRfc,
    noRequiere: "noRequiere" in source ? pairs(source["noRequiere"]) : base.noRequiere,
    parcialCredito:
      "parcialCredito" in source ? pairs(source["parcialCredito"]) : base.parcialCredito,
    parcialInstituto:
      "parcialInstituto" in source ? pairs(source["parcialInstituto"]) : base.parcialInstituto,
    monederoRfc: "monederoRfc" in source ? record(source["monederoRfc"]) : base.monederoRfc,
    personal: "personal" in source ? pairs(source["personal"]) : base.personal,
    seguros: Array.isArray(source["seguros"]) ? source["seguros"].map(String) : base.seguros,
    unpaidDiagnostics:
      "unpaidDiagnostics" in source ? record(source["unpaidDiagnostics"]) : base.unpaidDiagnostics,
  };
  return catalog;
}
