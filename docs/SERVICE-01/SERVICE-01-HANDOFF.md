# SERVICE-01 · Conciliación de salidas bancarias vs CFDI recibidos

**Objetivo.** Clasificar cada salida (cargo) del estado de cuenta según si tiene CFDI que la ampare.

**Datos reales, sin anonimizar.** Mantener en `docs/` local; no subir a un repo público.

## Entradas

**Caso A (obligatorio, prueba exacta).** Cliente persona física, régimen 612, BBVA, septiembre 2026.
- `estado_cuenta_BBVA_sep2026.pdf`: 22 páginas.
  - Las columnas cambian de posición entre páginas: se ubican con el encabezado de cada página.
  - Una fila puede ocupar varios renglones.
  - Al final de la página 19 hay importes pegados a la descripción.
- `cfdi_recibidos_DocDigitales_sep2026.xlsx`: dos tablas en la misma hoja.
  - Primero los CFDI.
  - Después, desde el renglón cuya columna A dice `Folio`, los REP (complementos de pago), con sus propios encabezados.

**Caso B (prueba por totales).** Otra cliente, cuentas BBVA en XLS: PYME al 26/09, personal al 28/09, más tarjeta de crédito (sólo trae 3 movimientos). CFDI de Doc Digitales con el mismo formato.

## Reglas, en orden

1. **Validar la extracción del banco.** El número y el importe de cargos y abonos, y el saldo corrido, deben coincidir con lo que dice el documento. Si no, error y no se procesa. Caso A: 252 cargos por 1,938,713.49; 17 abonos por 2,034,729.60; saldo 91,568.16 → 187,584.27.
2. **Qué se cruza.** Las salidas son los cargos. Los CFDI candidatos son los de tipo INGRESO con estatus Activo. Los cancelados y los de EGRESO no se cruzan, pero se cuentan.
3. **Proveedor de cada salida.** En este orden:
   1. el RFC que trae la descripción del cargo con tarjeta (`RFC: XXX 999999XX9`);
   2. el catálogo CLABE → RFC;
   3. el catálogo de palabras clave → RFC.

   Los dos catálogos son **por cliente y editables** (ver `04_referencia_motor/match3.py`).
4. **Cruce 1 a 1.**
   - Importe con diferencia de ±0.05.
   - Fecha con diferencia de ±20 días contra la fecha de operación o la de liquidación.
   - Asignación óptima global (algoritmo húngaro), con costo = 40 si el proveedor no coincide (6 si el nombre coincide en más del 30%) + 1.2 × días.
5. **Estatus de cada salida:**

| Estatus | Cuándo |
|---|---|
| `CONCILIADO` | Cruce con proveedor por RFC, a 3 días o menos, y la forma de pago del CFDI es congruente |
| `CONCILIADO C/OBS` | Cruce con alguna observación: proveedor sólo por nombre, más de 3 días de diferencia, CFDI con forma 01 (efectivo) o 04 (tarjeta de crédito) pagado por transferencia. También los seguros (AXA, META SEGURA, QUALITAS), que son PPD con REP |
| `PARCIAL` | El CFDI sólo cubre una parte: créditos y arrendamientos (cobro automático de recibo, Invex, Multiva, seguro de crédito), pago SIPARE del IMSS, abonos a monederos de combustible o peaje (el CFDI se emite al consumir) |
| `NO REQUIERE` | Traspasos entre cuentas propias, retiros, inversión patrimonial, pago de tarjeta de crédito, SPEI devuelto, pago al SAT, operaciones con casa de bolsa |
| `SIN CFDI` | Todo lo demás. Los consumos personales (DIDI, Amazon, colegiaturas) llevan esa observación |

6. **CFDI sin pago.** Los CFDI activos que no se cruzaron se listan con un diagnóstico: PPD (espera REP), efectivo, forma 04, monedero o compensación.

## Salida (Excel, 3 hojas)

1. `Resumen`:
   - validación del banco, con OK/REVISAR;
   - tabla de estatus con número de salidas, importe y %;
   - control: el total de salidas debe ser igual a los cargos del banco;
   - % del importe que requiere CFDI y ya lo tiene.
2. `Salidas`: una fila por cargo. Columnas: fecha de operación, fecha de liquidación, descripción, referencia, importe, estatus, CFDI (serie-folio), RFC, emisor, fecha del CFDI, total del CFDI, método, forma, uso y observación.
3. `CFDI sin pago`: con su diagnóstico.

## Golden

**Caso A, exacto.** `golden_A.json` y `golden_A_movimientos.csv` (estatus y CFDI de cada una de las 252 salidas).

| Estatus | Salidas | Importe |
|---|---|---|
| CONCILIADO | 28 | 63,412.69 |
| CONCILIADO C/OBS | 71 | 408,996.04 |
| PARCIAL | 64 | 559,171.27 |
| SIN CFDI | 79 | 463,170.44 |
| NO REQUIERE | 10 | 443,963.05 |
| **Total** | **252** | **1,938,713.49** |

Otros resultados esperados:
- CFDI activos: 180, de los cuales 93 tienen salida y 87 no.
- REP: 20.
- % del importe que requiere CFDI y ya lo tiene: 31.6%.

**Caso B, por estatus.** `golden_B.json`.

| Estatus | Salidas | Importe |
|---|---|---|
| CONCILIADO | 52 | 108,050.17 |
| CONCILIADO C/OBS | 7 | 16,771.99 |
| PARCIAL | 2 | 16,525.26 |
| SIN CFDI | 44 | 24,349.96 |
| NO REQUIERE | 35 | 148,602.60 |
| **Total** | **140** | **314,299.98** |

Tolerancia: ±2 salidas por estatus, porque este caso no tiene script de referencia.

## PENDIENTE DE VALIDAR

- El despacho no ha validado formalmente ninguno de los dos casos.
- Las listas de palabras clave son de estos clientes. Deben ser un catálogo por cliente en la base de datos, no reglas fijas en el código.
- Estados de cuenta de Santander y de otros bancos: hay lector probado para Santander PDF en el servicio de conciliación bancaria; aquí no se probó.
- Cruce de pagos agrupados (una salida que paga varios CFDI): se buscó, pero en el caso A no apareció ninguno.
