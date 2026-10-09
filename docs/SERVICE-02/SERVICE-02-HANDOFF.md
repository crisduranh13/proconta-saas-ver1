# SERVICE-02 · IVA e ISR del mes

Persona física, régimen 612, flujo de efectivo. Es el caso B del S1, de septiembre de 2026, con datos reales sin anonimizar.

**Depende del S1:** "pago identificado" sale del cruce de salidas contra CFDI recibidos.

## Entradas (`01_entradas/`)

- **Banco.** Los mismos 3 XLSX del caso B del S1: BBVA PYME, BBVA personal y TDC.
- **`cfdi_recibidos_DocDigitales_sep2026.xlsx`** (CFDI + REP).
- **`cfdi_emitidos_DocDigitales_sep2026.xlsx`.** Arriba los CFDI emitidos y, desde el renglón 10 (columna A = "Folio"), los REP emitidos.
- **`cfdi_mes_anterior_pendientes_ago2026.xlsx`** (nuevo). Son los 3 CFDI de agosto que se pagaron en septiembre, con los valores reales del SAT y en formato Doc Digitales. Representa el arrastre del mes anterior.
  - Son los 3 que le faltaban al caso B del S1. Agréguenlo también como entrada opcional del S1: así el caso B del S1 queda exacto.

## Reglas

### 1. Depósitos (abonos del banco)

| Clasificación | Qué entra |
|---|---|
| `INGRESO` | Cobro de un CFDI emitido PUE, o de un PPD con REP |
| `INGRESO SIN CFDI` | Cobro a cliente sin CFDI emitido (facturar), o cobro con TPV ("VENTAS CREDITO/DEBITO": emitir factura global) |
| `NO ES INGRESO` | Traspaso entre cuentas propias, préstamo recibido (Banorte: marcar "documentar con contrato"), devolución |

- **Cobrado con IVA** = INGRESO + INGRESO SIN CFDI.
- **Base** = cobrado / 1.16, sobre el total del mes, no renglón por renglón.
- **IVA trasladado** = cobrado − base.

### 2. CFDI emitidos

Cada uno lleva su estatus de cobro: COBRADO, COBRADO VÍA REP o PENDIENTE DE COBRO.

### 3. CFDI recibidos, más los pendientes del mes anterior

| Estatus | Cuándo |
|---|---|
| `DEDUCIBLE` | Pago identificado por el S1; efectivo hasta $2,000; cuotas IMSS e INFONAVIT; PPD con REP; intereses dentro de la mensualidad del crédito automotriz; CFDI del mes anterior pagado este mes |
| `NO DEDUCIBLE` | Factura final de un anticipo ya neteada con nota de crédito (el gasto ya se dedujo con el CFDI del anticipo); colegiatura (uso D10: deducción personal); PPD sin REP |
| `NO APLICA` | CFDI en $0.00; nota de crédito con forma 30 que netea un anticipo |
| `OTRO PERIODO` | Comisiones del banco de un mes ya deducido |
| `PENDIENTE` | Sin pago identificado; pago con TDC sin estado de cuenta completo (forma 04); cuenta de otro banco sin estado de cuenta |

### 4. Impuestos del mes

- **IVA acreditable** = Σ IVA de los CFDI DEDUCIBLE, con el **IVA real del CFDI** (nunca total/1.16, porque la gasolina trae IEPS).
- **IVA a pagar** = trasladado − acreditable.
- **ISR del mes** = tarifa mensual 2026 (`tarifa_isr_2026_mensual.csv`) aplicada a: base de ingresos − Σ subtotal de los CFDI DEDUCIBLE.

## Golden (`golden_S2.json`; detalle en los CSV)

| Concepto | Valor |
|---|---|
| Depósitos: INGRESO / SIN CFDI / NO ES INGRESO | 8 / 10 / 26 (193,001.20 / 129,710.00 / 119,003.12) |
| Cobrado con IVA → base → IVA trasladado | 322,711.20 → 278,199.31 → 44,511.89 |
| Recibidos: DEDUCIBLE | 71 CFDI · subtotal 117,445.87 · IVA 17,962.36 |
| NO DEDUCIBLE / NO APLICA / OTRO PERIODO / PENDIENTE | 6 / 5 / 1 / 5 |
| **IVA a pagar** | **26,549.53** |
| Base gravable ISR | 160,753.44 |
| **ISR del mes** | **43,426.43** (límite inferior 141,880.67 · cuota fija 37,009.69 · 34%) |

`golden_recibidos.csv` trae el estatus de cada uno de los 88 CFDI; `golden_ingresos.csv`, la clasificación de cada uno de los 44 depósitos; `golden_emitidos.csv`, el cobro de cada CFDI emitido.

**Corrección contra el Excel que se entregó al despacho** (`referencia_excel_entregado_sin_corregir.xlsx`): dos CFDI de agosto usaron IVA estimado como total/1.16.

| | Excel entregado | Golden corregido |
|---|---|---|
| IVA acreditable | 17,963.17 | 17,962.36 |
| IVA a pagar | 26,548.72 | 26,549.53 |
| ISR | 43,426.71 | 43,426.43 |

El golden manda.

## Salida (Excel, 3 hojas)

1. `Resumen`: ingresos, IVA, ISR y controles.
2. `Ingresos`: depósitos y CFDI emitidos.
3. `Recibidos`: estatus de deducción de cada CFDI.

## PENDIENTE DE VALIDAR

- ISR provisional acumulado (enero al mes, menos pagos anteriores). Hoy sólo se calcula el del mes.
- Préstamos de $82,000 sin contrato: hoy se clasifican NO ES INGRESO, pero el SAT podría presumirlos ingreso.
- Validación formal del despacho.
