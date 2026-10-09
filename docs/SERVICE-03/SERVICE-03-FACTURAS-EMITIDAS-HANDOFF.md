# SERVICE-03 · Revisión de facturas emitidas · Handoff

Este documento transfiere a otro asistente (ChatGPT/Codex) toda la información verificable de este servicio, tal como se probó con archivos reales.

**Objetivo del handoff:** con los archivos de entrada del paquete, el motor debe producir exactamente los resultados de `03_resultados_esperados/`.

- **Nombre en las pruebas:** "Caso 6 / Servicio 6 · Revisión de emitidos". En ProConta es el **Servicio 3**.
- **Clientes:** se identifican como **B** y **C**.
- **Datos anonimizados:** RFC de receptores, razones sociales y UUID. Importes, folios, fechas, estatus y orden de renglones son los reales.
- **Lo no confirmado** dice **PENDIENTE DE VALIDAR**.

---

## 1. Objetivo del servicio

Comprobar, día por día, que las facturas de ingreso emitidas (CFDI) cobraron el IVA al 16%. Identificar las que no lo hacen por una causa justificada: tasa 0% o IEPS en la base.

El objetivo escrito por el contador es: *"Determinar que facturas tienen ingresos al 0% o No Objeto de IVA para verificar no haya errores"*.

**Trabajo manual que sustituye:** el contador descarga el reporte de CFDI emitidos y, a mano en Excel, por cada día:
- escribe sumas de subtotal, total, IVA y descuento en el renglón del último CFDI del día;
- calcula la diferencia de IVA;
- busca a ojo qué CFDI provocan las diferencias.

El despacho lo hace una vez al mes (día 1 o 2) para 4 clientes (PENDIENTE DE VALIDAR el número de clientes y la frecuencia).

---

## 2. Archivos de entrada usados en las pruebas

| # | Archivo (nombre en el paquete) | Formato | Origen | Qué contiene | Papel |
|---|---|---|---|---|---|
| 1 | `01_entradas/B_INGRESOS_2026-09_al_29.xlsx` | XLSX, 1 hoja `Hoja1` | Reporte "INGRESOS" del sistema Doc Digitales, descargado por el despacho | 327 CFDI emitidos por el cliente B del 01/09 al 29/09/2026, un renglón por CFDI | **Obligatorio** (entrada del caso B) |
| 2 | `01_entradas/C_INGRESOS_2026-09_al_30.xlsx` | XLSX, 1 hoja `Hoja1` | Reporte "INGRESOS" de Doc Digitales | 329 CFDI emitidos por el cliente C del 01/09 al 30/09/2026 | **Obligatorio** (entrada del caso C) |
| 3 | `02_referencia_manual/B_EJEMPLO_MANUAL_DESPACHO_al_17-09.xlsx` | XLSX, hojas `INGR_09` y `Hoja1` | Hecho a mano por el despacho | Hoja `INGR_09`: 176 CFDI del cliente B (01/09 a 17/09, este último parcial) con las sumas por día en S:W. Hoja `Hoja1`: "DATOS SIIGO" | **Referencia y cotejo**: muestra el método manual y sirve de prueba |
| 4 | `02_referencia_manual/B_DATOS_SIIGO.csv` | CSV | Copia de la hoja `Hoja1` del archivo 3 | Bases de IVA al 16% y al 0% del mes según el sistema contable SIIGO | **Sólo cotejo** (opcional) |
| 5 | `02_referencia_manual/AUTOMATIZACION_word_caso6_v1.docx` y `INSTRUCCIONES_CONTADOR.md` | DOCX / MD | Despacho | Instrucción escrita del contador y mensajes posteriores | **Referencia** (regla de negocio) |

**No se usaron en las pruebas:**
- El XML de los CFDI.
- Un reporte de conceptos (descripción de productos).

Doc Digitales no lo entregó; ver sección 9 y 13.

---

## 3. Estructura de los archivos

### 3.1 Entrada cliente B (`B_INGRESOS_2026-09_al_29.xlsx`)

- Una hoja, `Hoja1`. Encabezados en el renglón 1 y datos en los renglones 2 a 328.
- 17 columnas, A a Q:

| Col | Encabezado exacto | Ejemplo | Nota |
|---|---|---|---|
| A | `Serie` | FAC | Una sola serie |
| B | `Folio` | 9578 | Número entero |
| C | `Tipo de Comprobante` | INGRESO | Todos INGRESO |
| D | `R.F.C. Receptor` | XAXX010101000 | Anonimizado salvo el genérico |
| E | `Razón Social Receptor` | Ventas público general | Anonimizado salvo los genéricos |
| F | `Fecha` | 2026-09-01 15:47:00 | Fecha y hora |
| G | `UUID` | (anonimizado) | Único por renglón |
| H | `Sub Total` | 10069.83 | Número |
| I | `Total` | 11681 | Número |
| J | `Total Aplicado` | (vacío) | No se usa |
| K | `Saldo` | 11681 | No se usa |
| L | `Método de Pago` | PUE | No se usa |
| M | `Forma de Pago` | 1 | Número (1, 3, 4, 28); no se usa en el cálculo |
| N | `Estatus` | Activo / Cancelado | Clave para filtrar |
| O | `Descuento` | 0 | En B siempre 0 |
| P | `Total IVA Tras.` | 1611.17 | IVA trasladado |
| Q | `Uso Cfdi Receptor` | S01 | No se usa |

### 3.2 Entrada cliente C (`C_INGRESOS_2026-09_al_30.xlsx`)

- Una hoja, `Hoja1`. Datos en los renglones 2 a 330.
- 18 columnas, A a R, en este orden:
  `Folio`, `Tipo de Comprobante`, `R.F.C. Receptor`, `Razón Social Receptor`, `Fecha`, `UUID`, `Sub Total`, `Total`, `Total Aplicado`, `Saldo`, `Método de Pago`, `Forma de Pago`, `Estatus`, `Descuento` (N), `Total IVA Ret.` (O), `Total IVA Tras.` (P), `Total ISR Ret.` (Q), `Uso Cfdi Receptor` (R).
- Diferencias contra B:
  - no hay columna `Serie`;
  - sí hay retenciones (todas en 0 en este archivo);
  - hay descuentos distintos de 0 (suman 743.04);
  - un CFDI PPD (folio 46059) trae `Total Aplicado` vacío.

### 3.3 Particularidades comunes (comprobadas en ambos archivos)

- **Cancelados:** vienen en el mismo reporte con `Estatus` = `Cancelado` y conservan sus importes.
- **Orden:** el archivo viene ordenado por fecha y hora, no por folio. Los folios aparecen fuera de secuencia.
- **Días sin renglones:** no hay renglones para los días sin facturación (domingos y días sin ventas).
- **IEPS:** no hay columna; hay que deducirlo (sección 8, R07).
- **Descripción del producto:** no viene, así que no se puede saber si un CFDI es de una bomba.
- **IVA en cero:** no se puede distinguir entre tasa 0%, exento y no objeto de impuesto.
- **Receptor genérico:** el RFC `XAXX010101000` aparece con nombres distintos ("Ventas público general", "VENTA A MOSTRADOR", "PUBLICO EN GENERAL" y nombres de escuelas, anonimizados).
- **Layout distinto entre clientes:** el mismo dato está en columnas distintas en B y en C.

### 3.4 Ejemplo manual del despacho (`B_EJEMPLO_MANUAL_DESPACHO_al_17-09.xlsx`)

- **Hoja `INGR_09`:**
  - mismo layout de 18 columnas que el archivo C, más 5 columnas de resultados S:W con encabezados `SUBTOTAL`, `TOTAL`, `IVA`, `DESCUENTO`, `DIFERENCIA`;
  - datos en los renglones 2 a 177: 176 CFDI del cliente B del 01/09 al 17/09;
  - el 17/09 es parcial: trae 12 CFDI de los 18 que trae la descarga completa.
- **Fórmulas por día**, sólo en el renglón del último CFDI del día:
  - `S = SUM(Gi:Gf)`, `T = SUM(Hi:Hf)`, `U = SUM(Pi:Pf)`, `V = SUM(Ni:Nf)`;
  - `W = +(S-V)*0.16-U`;
  - usan `SUM` sin filtrar por estatus. En esa descarga los 176 CFDI estaban `Activo`; los folios 9687, 9689 y 9709 se cancelaron después.
- **Renglón 142:** trae fórmulas aunque no es el último del día 14/09, con `S142 = +G142` (ver error E5).
- **Renglón 183:** `W183 = SUM(W2:W182)`.
- **Hoja `Hoja1` ("DATOS SIIGO"):**
  - C5 = 370,622.20 (al 16%), D5 = 2,039.00 (al 0%), E5 = `+D5+C5`;
  - E7 = 372,661.20 (isr), E9 = `+E5-E7`.

---

## 4. Procedimiento que pidió el contador

La transcripción literal está en `02_referencia_manual/INSTRUCCIONES_CONTADOR.md`.

### Lo que dice la instrucción

1. **Sumas por día.** Por cada día, sumar de todos los CFDI emitidos:
   - `Sub Total` → columna S;
   - `Total` → columna T;
   - `Total IVA Tras.` → columna U;
   - `Descuento` → columna V.

   El resultado va en el renglón del **último CFDI del día**.
2. **Fórmula.** En ese mismo renglón: `W = (S − V) × 0.16 − U`, "así día por día".
3. **Totales.** Sumar todos los resultados de las columnas S a W.
4. **IEPS (agregado en la versión 2 del Word y por mensaje).** Verificar si los CFDI que presentan diferencia contienen IEPS en la base, y anotar el monto en una columna adicional.
5. **Tasa 0% (agregado por mensaje).** "Si dice Bomba", anotar el subtotal en una columna "TASA 0%".

### Precisiones comprobadas

- **Las letras de columna de la instrucción coinciden sólo con el layout de B.** "DESCUENTO (columna O)" y "TOTAL IVA TRASL (Columna P)" son correctas en B. En C y en el propio ejemplo del contador, `Descuento` está en la columna N, y su ejemplo suma N. Las columnas de resultado sí empiezan en S en todos los casos.
- **Cancelados:** la instrucción no los menciona. Ver R04 y la sección 13.
- **Folios faltantes, cotejo con SIIGO y nombre del archivo:** no los pidió el contador. Ver las secciones 10 y 13.

---

## 5. Caso de prueba B

| Dato | Valor |
|---|---|
| Archivo | `01_entradas/B_INGRESOS_2026-09_al_29.xlsx` |
| CFDI en el archivo | 327 |
| Activos | 324 |
| Cancelados | 3 (9687, 9689, 9709) |
| Días revisados | 26 (del 01/09 al 29/09; no hay CFDI el 06, 20 y 27) |
| Días que cuadran (\|W\| ≤ 1.00) | 23 |
| Días con diferencia (\|W\| > 1.00) | 3: 21/09 (W = 23.99), 25/09 (W = 107.03), 29/09 (W = 219.20) |
| SUBTOTAL / TOTAL / IVA / DESCUENTO del mes (sólo activos) | 372,811.19 / 432,110.86 / 59,299.67 / 0.00 |
| DIFERENCIA del mes (suma de W) | 350.12 |

**CFDI activos sin IVA** (uno en cada día con diferencia):

| Folio | Fila | Día | Subtotal = Total | IVA | Forma de pago | Receptor | Estado |
|---|---|---|---|---|---|---|---|
| 9779 | 209 | 21/09 | 149.99 | 0.00 | 3 | XAXX010101000 | Sin confirmar como tasa 0%. No está en SIIGO |
| 9856 | 286 | 25/09 | 669.00 | 0.00 | 4 | XAXX010101000 | 9856 + 9897 = 2,039.00, igual a la base al 0% de SIIGO: se trató como bomba (tasa 0%) |
| 9897 | 326 | 29/09 | 1,370.00 | 0.00 | 1 | XAXX010101000 | Igual que 9856 |

El IVA que dejan de cobrar es 149.99 × 16% = 24.00, 669 × 16% = 107.04 y 1,370 × 16% = 219.20. La W del día difiere unos centavos por los redondeos de los demás CFDI.

**Cancelados y su sustituto.** Regla: CFDI activo con el mismo RFC receptor, el mismo total y fecha igual o posterior.

| Cancelado | Día | Total | IVA | Sustituto | Día del sustituto | Observación |
|---|---|---|---|---|---|---|
| 9687 | 11/09 | 2,356.01 | 0.00 | 9767 | 19/09 | Se emitió sin IVA y se reexpidió con IVA (subtotal 2,031.04 + IVA 324.97) |
| 9689 | 11/09 | 277.00 | 38.21 | 9765 | 18/09 | Reexpedido igual |
| 9709 | 14/09 | 1,809.99 | 0.00 | 9768 | 19/09 | Se emitió sin IVA y se reexpidió con IVA (1,560.34 + 249.65) |

**Folios que no vienen en el archivo:** FAC-9679, FAC-9697, FAC-9825.

**Cotejo contra SIIGO:**
- Base al 16% de los CFDI excluyendo los tres sin IVA: 372,811.19 − 2,188.99 = **370,622.20**, igual al centavo a SIIGO.
- Base al 0% en SIIGO: 2,039.00 = 9856 + 9897.
- **El folio 9779 (149.99) no está registrado en SIIGO.** Con el motor y sólo 9856 y 9897 confirmados, la base al 16% difiere 149.99 y la base al 0% difiere 0.00.

**Hallazgos:**
1. Los tres días con diferencia se explican por un CFDI sin IVA cada uno.
2. Dos CFDI se emitieron sin IVA, se cancelaron y se reexpidieron con IVA.
3. Hay un CFDI sin IVA fuera de la contabilidad (9779).
4. Faltan 3 folios.

**Validación del despacho:** "3 días con detalles" (los mismos 21, 25 y 29/09). Después aclaró que las bombas van a tasa 0% y pidió la columna TASA 0%. **PENDIENTE DE VALIDAR:** si 9779 es bomba y por qué no está en SIIGO.

**Reproducción del ejemplo manual.** Con los 176 renglones del ejemplo y su mismo método (`SUM` sin filtro de estatus), los 16 días (01 a 17/09) dan idénticos al centavo en S, T, U, V y W. En el ejemplo, el 11/09 tiene W = 376.96 y el 14/09 W = 289.58: son el IVA no cobrado de 9687 y 9709, que en esa descarga todavía estaban activos.

---

## 6. Caso de prueba C

| Dato | Valor |
|---|---|
| Archivo | `01_entradas/C_INGRESOS_2026-09_al_30.xlsx` |
| CFDI en el archivo | 329 |
| Activos | 329 |
| Cancelados | 0 |
| Días revisados | 26 (del 01/09 al 30/09; no hay CFDI el 06, 13, 20 y 27) |
| Días que cuadran (sin tasa 0% confirmada) | 24 |
| Días con diferencia (REVISAR) | 2: 25/09 (W = 53.59) y 29/09 (W = 5.28) |
| SUBTOTAL / TOTAL / IVA / DESCUENTO | 1,226,811.39 / 1,422,205.89 / 196,115.32 / 743.04 |
| DIFERENCIA del mes (W) | 55.62 |
| IEPS en la base del IVA | 22.22 en 8 CFDI |
| Diferencia no explicada | 59.18 = W − (TASA 0% − IEPS) × 16% = 55.62 − (0 − 22.22) × 0.16 |

**CFDI con IEPS.** IEPS deducido = Total − (Subtotal − Descuento) − IVA + retenciones. Todos son facturas a "PUBLICO EN GENERAL".

| Folio | Día | IEPS |
|---|---|---|
| 45854 | 03/09 | 5.43 |
| 45869 | 04/09 | 1.55 |
| 45936 | 10/09 | 1.55 |
| 45968 | 12/09 | 5.17 |
| 46024 | 17/09 | 4.91 |
| 46033 | 18/09 | 1.55 |
| 46138 | 29/09 | 1.98 |
| 46141 | 30/09 | 0.08 |

En estos CFDI el IVA sale unos centavos mayor que el 16% del subtotal, porque se calcula sobre subtotal + IEPS (art. 18 LIVA). Por eso los días con IEPS tienen W negativa de centavos (por ejemplo, 03/09 W = −0.86) y quedan OK por la tolerancia.

**CFDI activos con una parte sin IVA (mixtos):**

| Folio | Fila | Día | Subtotal | Descuento | IVA | IEPS | Base sin IVA | IVA que explica |
|---|---|---|---|---|---|---|---|---|
| 46109 | 290 | 25/09 | 7,220.25 | 0.00 | 1,101.65 | 0.00 | 334.94 | 53.59 |
| 46138 | 319 | 29/09 | 10,747.12 | 216.32 | 1,679.65 | 1.98 | 34.97 | 5.60 |

Base sin IVA = Subtotal − Descuento + IEPS − IVA / 0.16. La suma de lo que explican (53.59 + 5.60 − IEPS 22.22 × 0.16) deja la diferencia no explicada en −0.01 si se confirman ambos.

**Todos los CFDI con diferencia en el IVA** (\|(Subtotal − Descuento) × 16% − IVA\| > 0.05, o con IEPS):

| Folio | Día | Diferencia del CFDI | IEPS | Base sin IVA |
|---|---|---|---|---|
| 45854 | 03/09 | -0.87 | 5.43 | 0.00 |
| 45869 | 04/09 | -0.25 | 1.55 | 0.00 |
| 45936 | 10/09 | -0.25 | 1.55 | 0.01 |
| 45968 | 12/09 | -0.83 | 5.17 | 0.00 |
| 46024 | 17/09 | -0.79 | 4.91 | 0.00 |
| 46033 | 18/09 | -0.25 | 1.55 | 0.00 |
| 46109 | 25/09 | 53.59 | 0.00 | 334.94 |
| 46138 | 29/09 | 5.28 | 1.98 | 34.97 |
| 46141 | 30/09 | -0.01 | 0.08 | 0.01 |

**Folios que no vienen en el archivo:** 45835, 45844, 46050, 46147.

**Hallazgos:**
1. 8 facturas globales con IEPS ($22.22 en total), correctas.
2. Dos facturas globales con una parte sin IVA (46109 y 46138), que explican el total de la diferencia.
3. 4 folios faltantes.

**Validación del despacho:** PENDIENTE DE VALIDAR. No hay respuesta registrada sobre si 46109 y 46138 son bombas, ni sobre los folios faltantes. También falta confirmar de qué cliente es el archivo.

---

## 7. Errores encontrados durante las pruebas

| # | Quién | Qué ocurrió | Cómo se detectó | Cómo se corrigió | Regla que lo evita |
|---|---|---|---|---|---|
| E1 | Claude | En la primera entrega trató los CFDI sin IVA como posibles errores y sugirió sustituirlos | El despacho aclaró que eran bombas a tasa 0% | Columna TASA 0% y estado "por confirmar" | R10: un CFDI sin IVA nunca se reporta como error; se reporta como "por confirmar" hasta que el contador lo marca |
| E2 | Claude | La tolerancia de $1.00 por día ocultaba las diferencias de centavos que produce el IEPS | Con el archivo C: días con IEPS daban W de −0.24 a −0.86 y quedaban OK sin explicación | El IEPS se calcula por CFDI y se reporta en su columna | R07 y R13: el IEPS se detecta por comprobante, no por suma diaria |
| E3 | Claude | Reportó primero "7 facturas con IEPS"; son 8 (46141 tiene IEPS de 0.08) | Al listar desde el cálculo | Se usa el conteo calculado | R07: umbral IEPS > 0.02; los conteos salen del listado, no a mano |
| E4 | Claude (riesgo comprobado) | Si se redondea W por día y luego se suma, B da 350.11; sumando sin redondear da 350.12, igual que Excel | Al comparar contra la suma de la columna en Excel | No se redondea W por día | R17 |
| E5 | Trabajo manual | En el ejemplo, el renglón 142 tiene fórmulas aunque no es el último del 14/09 (`S142 = +G142`). Sumar la columna S da 170,660.46 en vez de 170,120.80 (+539.66), y `W183` incluye −0.0044 de ese renglón: muestra 666.49 en vez de 666.50 | Al reproducir el ejemplo | El resultado generado sólo escribe fórmulas en el último CFDI de cada día | R05 |
| E6 | Trabajo manual (método) | El ejemplo suma con `SUM` sin filtrar estatus. Con la descarga final, donde 9687, 9689 y 9709 ya están cancelados, ese método sumaría los cancelados: subtotal de B 377,215.98 en vez de 372,811.19 | Al comparar el ejemplo contra la descarga del 29/09 | Las sumas filtran `Estatus = Activo` | R04 |
| E7 | Instrucción | Las letras de columna escritas ("DESCUENTO columna O") sólo valen para el layout de B; en C y en el ejemplo `Descuento` está en N | Al comparar layouts | Columnas localizadas por encabezado | R01 |
| E8 | Registro contable del cliente B | El CFDI 9779 (149.99, sin IVA) no está en SIIGO | Cotejo contra "DATOS SIIGO" | Se reporta en el cotejo | R16. PENDIENTE DE VALIDAR con el despacho |

---

## 8. Reglas definitivas aprendidas

Cada regla está probada con los casos B y/o C y se puede convertir en código o en prueba.

**R01. Columnas por encabezado.** Las columnas se localizan por el texto del encabezado del renglón 1, sin acentos, sin mayúsculas y con espacios normalizados, nunca por letra.
- Obligatorias: `Sub Total`, `Total`, `Total IVA Tras.`, `Estatus`, `Fecha`, `Folio`.
- Opcionales: `Descuento`, `Serie`, `UUID`, `R.F.C. Receptor`, `Razón Social Receptor`, `Tipo de Comprobante`, `Total IVA Ret.`, `Total ISR Ret.`.
- Si falta una obligatoria, se detiene con un mensaje que la nombra.

**R02. Un renglón por CFDI.** Si hay UUID repetidos, el archivo es un reporte por concepto y se rechaza.

**R03. Día y orden.** El día es la parte de fecha de `Fecha`. El archivo debe venir ordenado por fecha. Si un día aparece en dos bloques separados, se rechaza y se pide ordenar.

**R04. Qué se suma.** Sólo CFDI con `Estatus = Activo` y `Tipo de Comprobante = INGRESO`. Los cancelados no se suman pero se listan.

**R05. Sumas por día.** Por cada día, sólo en el renglón del último CFDI del día:
- `S = Σ Sub Total`, `T = Σ Total`, `U = Σ Total IVA Tras.`, `V = Σ Descuento`, todos de activos (0 si no hay columna `Descuento`);
- `W = (S − V) × 0.16 − U`;
- ningún otro renglón lleva fórmulas de día.

**R06. Columna de inicio.** Los resultados empiezan en la columna `max(última columna con encabezado + 1, 19)`, es decir, en S para B (17 columnas) y para C (18 columnas). Orden: SUBTOTAL, TOTAL, IVA, DESCUENTO, DIFERENCIA, TASA 0%, IEPS, REVISIÓN.

**R07. IEPS por CFDI.**
- Si existe una columna de IEPS (`Total IEPS Tras.`, `Total IEPS`, `IEPS trasladado` o `IEPS`), se usa.
- Si no: `IEPS = Total − (Sub Total − Descuento) − IVA + IVA Ret. + ISR Ret.`, redondeado a 2 decimales.
- Se considera IEPS sólo si es mayor que 0.02.
- Resultado esperado en C: 8 CFDI, 22.22.

**R08. Base sin IVA por CFDI.** `Base0 = Sub Total − Descuento + IEPS − IVA / 0.16`, redondeada a 2 decimales.

**R09. Candidatos.** Un CFDI activo es candidato a tasa 0% si `(Sub Total − Descuento + IEPS) × 0.16 − IVA > tolerancia` (1.00).
- Es "mixto" si además tiene IVA mayor que 0.
- Resultado esperado: B → 9779, 9856, 9897; C → 46109, 46138 (mixtos).

**R10. Tasa 0% confirmada.** La columna TASA 0% se llena sólo para los candidatos que el contador confirma, o cuyo concepto contiene "BOMBA" si existe un reporte de conceptos (no probado). El valor es su Base0. Nunca se llena automáticamente sin confirmación ni concepto.

**R11. Revisión por día.**
- `REVISIÓN = OK` si `|W − (Σ TASA 0% del día − Σ IEPS del día) × 0.16| ≤ tolerancia`; si no, `REVISAR`.
- Tolerancia: 1.00, editable.

**R12. Diferencia no explicada del mes.** `W_total − (X_total − IEPS_total) × 0.16`, a 2 decimales.
- B con 9856 y 9897 confirmados: 23.88.
- C sin confirmar: 59.18.

**R13. CFDI con diferencia en el IVA.** Se listan los activos con `|(Sub Total − Descuento) × 0.16 − IVA| > 0.05`, o con IEPS > 0, con su explicación: IEPS, parte sin IVA por confirmar o confirmada, o redondeo.

**R14. Sustituto de un cancelado.** Primer CFDI activo con el mismo `R.F.C. Receptor`, el mismo `Total` (±0.01) y fecha igual o posterior.

**R15. Folios faltantes.** Por cada serie, todos los enteros entre el folio mínimo y el máximo que no aparecen, sólo si el rango es menor que 5,000. Se reportan, no se interpretan.

**R16. Cotejo con SIIGO** (opcional, si se capturan las dos bases).
- Base 16% CFDI = S − V − X, contra SIIGO al 16%.
- Base 0% CFDI = X, contra SIIGO al 0%.

**R17. Redondeo.** W por día no se redondea antes de sumar. Los totales se redondean a 2 decimales al final. Referencia en B: 350.12, no 350.11.

**R18. Totales del archivo.** En el renglón `último renglón de datos + 2`: la etiqueta "TOTAL" en la columna anterior a S, la suma de S a IEPS, y en REVISIÓN la cuenta de días "REVISAR".

**R19. Nombre y hoja.**
- La hoja se renombra a `INGR_MM`.
- El archivo se llama `[CLIENTE_]INGRESOS_MM_DD.xlsx`, con MM y DD de la última fecha del archivo.
- El prefijo del cliente es opcional, en mayúsculas y con `_` en lugar de espacios.
- Esperado: `CLIENTE_B_INGRESOS_09_29.xlsx` y `INGRESOS_09_30.xlsx`.

**R20. Varios meses.** Si el archivo trae más de un mes, se avisa (no se probó con datos reales).

**R21. Original intacto.** Las columnas originales del reporte no se modifican; sólo se agregan columnas y una hoja.

**R22. Control interno.** El subtotal directo de activos menos la suma de los días debe dar 0.

---

## 9. Casos que NO se pueden decidir automáticamente

| Situación | Ejemplo real | Qué hace el servicio | Quién decide |
|---|---|---|---|
| CFDI sin IVA no confirmado como tasa 0% | B: 9779 (149.99) | Lo lista como candidato "por confirmar" y el día queda REVISAR | Contador |
| Saber si un CFDI sin IVA es bomba | B: 9856 y 9897 se trataron como bombas porque su suma coincide con la base al 0% de SIIGO | Sin conceptos o XML no se sabe | Contador |
| Bomba para riego agrícola o de uso doméstico | Ninguno identificado | El criterio fiscal (riego agrícola a tasa 0%; doméstica al 16%) lo aplica el contador | Contador |
| CFDI mixtos (parte con IVA y parte sin IVA) | C: 46109 y 46138 | Calcula la base sin IVA; no confirma | Contador |
| Tasa 0%, exento o no objeto | Todos los CFDI sin IVA | El reporte XLS no lo distingue; haría falta el XML (campo ObjetoImp) | PENDIENTE DE VALIDAR (no hubo XML) |
| Causa de un folio faltante | B: 9679, 9697, 9825; C: 45835, 45844, 46050, 46147 | Los lista | Despacho: confirmar si fue cancelado y no se descargó, o si no se timbró |
| Cancelado sin sustituto, o con varios posibles | No ocurrió | Lo lista sin sustituto | Contador |
| Diferencias contra SIIGO | B: 9779 no está en SIIGO | Muestra la diferencia | Contador |
| Corrección del IEPS (tasa y producto) | C: 8 CFDI | Sólo detecta el monto, no valida la tasa | Contador |
| Archivo desordenado o con un día partido | No ocurrió | Rechaza el archivo | Usuario (re-descargar) |

---

## 10. Resultado esperado

Es lo que ya producen los archivos de `03_resultados_esperados/`.

**Archivo.** `[CLIENTE_]INGRESOS_MM_DD.xlsx` con dos hojas.

### Hoja `INGR_MM`

El reporte original sin cambios, más 8 columnas desde la S. En el renglón 1 van los encabezados `SUBTOTAL`, `TOTAL`, `IVA`, `DESCUENTO`, `DIFERENCIA`, `TASA 0%`, `IEPS` y `REVISIÓN`.

**Contenido por columna:**

| Columna | Dónde se llena | Contenido |
|---|---|---|
| SUBTOTAL, TOTAL, IVA, DESCUENTO | Renglón del último CFDI de cada día | Fórmula `SUMIFS(columna del día, Estatus del día, "Activo")` |
| DIFERENCIA | Mismo renglón | Fórmula `+(S−V)*0.16−U` |
| TASA 0% | Sólo en los CFDI confirmados | `ROUND(SubTotal − Descuento + IEPS − IVA/0.16, 2)` |
| IEPS | Sólo en los CFDI activos con IEPS | `ROUND(Total − SubTotal + Descuento − IVA + IVA Ret + ISR Ret, 2)` |
| REVISIÓN | Último renglón de cada día | Fórmula OK/REVISAR con la tolerancia de `Resumen!B4` |

**Renglón TOTAL** (último renglón de datos + 2): sumas de S a IEPS y `COUNTIF` de "REVISAR". En B es el renglón 330 y en C el 332.

**Formato condicional:**
- cancelados tachados en gris;
- activos con TASA 0% o IEPS en azul claro;
- activos con IVA menor al esperado en rojo claro;
- REVISIÓN en verde si es OK y en rojo si es REVISAR.

Encabezado inmovilizado.

### Hoja `Resumen`

1. Título con cliente, mes y fecha de corte, más una nota de fuente y fórmula.
2. Tolerancia en B4 (1.00).
3. **Resultado del mes:**
   - CFDI en el archivo, activos y cancelados;
   - SUBTOTAL, TOTAL, IVA trasladado, DESCUENTO;
   - DIFERENCIA, Ventas a TASA 0% confirmadas, IEPS incluido en la base;
   - IVA que explican la tasa 0% y el IEPS;
   - DIFERENCIA NO EXPLICADA, con "OK: todo explicado" o "REVISAR";
   - días a revisar;
   - control (debe dar 0).
4. **Cotejo vs SIIGO** (sólo si se capturan las bases): base 16% y base 0%, con SIIGO, CFDI y diferencia.
5. **CFDI con diferencia en el IVA:** folio, fecha, receptor, subtotal, IVA, diferencia, IEPS, base 0% y explicación.
6. **Cancelados:** folio, fecha, receptor, subtotal, IVA, total y posible sustituto.
7. **Folios que no vienen en el archivo.**
8. **CFDI activos que no son de ingreso** (sólo si existen; no ocurrió).
9. **Criterio fiscal:** dos notas, IEPS (art. 18 LIVA) y bombas para riego agrícola (art. 2-A fr. I inciso e LIVA).

**Estados:**
- por día: OK / REVISAR;
- por CFDI con diferencia: "Contiene IEPS…", "Parte sin IVA: confirmar si es bomba (tasa 0%)", "Parte a tasa 0% confirmada" o "Diferencia de redondeo";
- del mes: "OK: todo explicado" / "REVISAR".

---

## 11. Golden results

Todos los números provienen de los archivos de entrada anonimizados. Se calcularon dos veces: con el motor validado (`04_referencia_motor/engine.js`) y con un cálculo independiente en Python (`04_referencia_motor/golden.py`). Coinciden al centavo.

Las versiones legibles por máquina están en `03_resultados_esperados/golden_B.json` y `golden_C.json`.

### 11.1 Totales del mes

| Concepto | B | C |
|---|---|---|
| CFDI / activos / cancelados | 327 / 324 / 3 | 329 / 329 / 0 |
| Días | 26 | 26 |
| SUBTOTAL (S) | 372,811.19 | 1,226,811.39 |
| TOTAL (T) | 432,110.86 | 1,422,205.89 |
| IVA (U) | 59,299.67 | 196,115.32 |
| DESCUENTO (V) | 0.00 | 743.04 |
| DIFERENCIA (W) | 350.12 | 55.62 |
| IEPS | 0.00 | 22.22 |
| Archivo de salida | `CLIENTE_B_INGRESOS_09_29.xlsx` (hoja `INGR_09`) | `INGRESOS_09_30.xlsx` (hoja `INGR_09`) |
| Renglón TOTAL | 330 | 332 |
| Folios faltantes | FAC-9679, FAC-9697, FAC-9825 | 45835, 45844, 46050, 46147 |
| Cancelados → sustituto | 9687→9767 (19/09), 9689→9765 (18/09), 9709→9768 (19/09) | — |
| Subtotal sin filtrar estatus (prueba de R04) | 377,215.98 | 1,226,811.39 |
| W redondeando por día (prueba de R17; no debe usarse) | 350.11 | 55.62 |

### 11.2 Escenarios de confirmación de tasa 0%

Los escenarios "validado" reproducen las entregas al despacho. Los "sintético" prueban la regla con confirmaciones que el despacho todavía no dio.

**Cliente B**

| Escenario | Folios confirmados a tasa 0% | TASA 0% (X) | IEPS | IVA explicado | Diferencia no explicada | Días REVISAR |
|---|---|---|---|---|---|---|
| sin marcar ningun folio | — | 0.00 | 0.00 | 0.00 | 350.12 | 3 |
| validado: 9856 y 9897 confirmados | 9856, 9897 | 2,039.00 | 0.00 | 326.24 | 23.88 | 1 |
| sintetico: los tres sin IVA confirmados | 9779, 9856, 9897 | 2,188.99 | 0.00 | 350.24 | -0.12 | 0 |

**Cliente C**

| Escenario | Folios confirmados a tasa 0% | TASA 0% (X) | IEPS | IVA explicado | Diferencia no explicada | Días REVISAR |
|---|---|---|---|---|---|---|
| validado: sin marcar | — | 0.00 | 22.22 | -3.56 | 59.18 | 2 |
| sintetico: 46109 y 46138 confirmados | 46109, 46138 | 369.91 | 22.22 | 55.63 | -0.01 | 0 |

### 11.3 Cliente B por día

Escenario validado: 9856 y 9897 confirmados, tolerancia 1.00.

| Día | Filas | CFDI | Cancel. | SUBTOTAL (S) | TOTAL (T) | IVA (U) | DESC. (V) | DIFERENCIA (W) | IEPS | TASA 0% | REVISIÓN |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 01/09 | 2–10 | 9 | 0 | 11,458.62 | 13,292.00 | 1,833.38 | 0.00 | -0.00 | 0.00 | 0.00 | OK |
| 02/09 | 11–32 | 22 | 0 | 18,866.49 | 21,885.15 | 3,018.66 | 0.00 | -0.02 | 0.00 | 0.00 | OK |
| 03/09 | 33–51 | 19 | 0 | 14,631.99 | 16,973.10 | 2,341.11 | 0.00 | 0.01 | 0.00 | 0.00 | OK |
| 04/09 | 52–58 | 7 | 0 | 6,941.37 | 8,051.99 | 1,110.62 | 0.00 | -0.00 | 0.00 | 0.00 | OK |
| 05/09 | 59–70 | 12 | 0 | 6,129.33 | 7,110.03 | 980.70 | 0.00 | -0.01 | 0.00 | 0.00 | OK |
| 07/09 | 71–79 | 9 | 0 | 8,013.78 | 9,295.99 | 1,282.21 | 0.00 | -0.01 | 0.00 | 0.00 | OK |
| 08/09 | 80–89 | 10 | 0 | 5,351.73 | 6,208.02 | 856.29 | 0.00 | -0.01 | 0.00 | 0.00 | OK |
| 09/09 | 90–100 | 11 | 0 | 10,290.56 | 11,937.05 | 1,646.49 | 0.00 | -0.00 | 0.00 | 0.00 | OK |
| 10/09 | 101–112 | 12 | 0 | 17,148.28 | 19,892.01 | 2,743.73 | 0.00 | -0.01 | 0.00 | 0.00 | OK |
| 11/09 | 113–122 | 10 | 2 | 11,469.00 | 13,304.04 | 1,835.04 | 0.00 | 0.00 | 0.00 | 0.00 | OK |
| 12/09 | 123–134 | 12 | 0 | 6,482.74 | 7,519.99 | 1,037.25 | 0.00 | -0.01 | 0.00 | 0.00 | OK |
| 13/09 | 135–136 | 2 | 0 | 1,478.46 | 1,715.02 | 236.56 | 0.00 | -0.01 | 0.00 | 0.00 | OK |
| 14/09 | 137–143 | 7 | 1 | 18,584.51 | 21,558.05 | 2,973.54 | 0.00 | -0.02 | 0.00 | 0.00 | OK |
| 15/09 | 144–156 | 13 | 0 | 12,227.64 | 14,184.05 | 1,956.41 | 0.00 | 0.01 | 0.00 | 0.00 | OK |
| 16/09 | 157–165 | 9 | 0 | 10,161.32 | 11,787.14 | 1,625.82 | 0.00 | -0.01 | 0.00 | 0.00 | OK |
| 17/09 | 166–183 | 18 | 0 | 15,681.06 | 18,190.01 | 2,508.95 | 0.00 | 0.02 | 0.00 | 0.00 | OK |
| 18/09 | 184–196 | 13 | 0 | 8,096.99 | 9,392.51 | 1,295.52 | 0.00 | -0.00 | 0.00 | 0.00 | OK |
| 19/09 | 197–208 | 12 | 0 | 14,868.55 | 17,247.52 | 2,378.97 | 0.00 | -0.00 | 0.00 | 0.00 | OK |
| 21/09 | 209–221 | 13 | 0 | 11,502.54 | 13,318.96 | 1,816.42 | 0.00 | 23.99 | 0.00 | 0.00 | REVISAR |
| 22/09 | 222–241 | 20 | 0 | 33,646.62 | 39,030.10 | 5,383.48 | 0.00 | -0.02 | 0.00 | 0.00 | OK |
| 23/09 | 242–259 | 18 | 0 | 11,410.36 | 13,236.04 | 1,825.68 | 0.00 | -0.02 | 0.00 | 0.00 | OK |
| 24/09 | 260–274 | 15 | 0 | 27,777.59 | 32,222.00 | 4,444.41 | 0.00 | 0.00 | 0.00 | 0.00 | OK |
| 25/09 | 275–288 | 14 | 0 | 12,251.77 | 14,105.02 | 1,853.25 | 0.00 | 107.03 | 0.00 | 669.00 | OK |
| 26/09 | 289–297 | 9 | 0 | 8,627.59 | 10,008.00 | 1,380.41 | 0.00 | 0.00 | 0.00 | 0.00 | OK |
| 28/09 | 298–312 | 15 | 0 | 50,274.18 | 58,318.05 | 8,043.87 | 0.00 | -0.00 | 0.00 | 0.00 | OK |
| 29/09 | 313–328 | 16 | 0 | 19,438.12 | 22,329.02 | 2,890.90 | 0.00 | 219.20 | 0.00 | 1,370.00 | OK |

### 11.4 Cliente C por día

Escenario validado: ninguno confirmado, tolerancia 1.00.

| Día | Filas | CFDI | Cancel. | SUBTOTAL (S) | TOTAL (T) | IVA (U) | DESC. (V) | DIFERENCIA (W) | IEPS | TASA 0% | REVISIÓN |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 01/09 | 2–12 | 11 | 0 | 28,139.80 | 32,629.18 | 4,500.59 | 11.21 | -0.02 | 0.00 | 0.00 | OK |
| 02/09 | 13–23 | 11 | 0 | 42,987.97 | 49,866.06 | 6,878.09 | 0.00 | -0.01 | 0.00 | 0.00 | OK |
| 03/09 | 24–36 | 13 | 0 | 68,472.69 | 79,434.61 | 10,956.49 | 0.00 | -0.86 | 5.43 | 0.00 | OK |
| 04/09 | 37–51 | 15 | 0 | 63,737.28 | 73,744.44 | 10,171.64 | 166.03 | -0.24 | 1.55 | 0.00 | OK |
| 05/09 | 52–56 | 5 | 0 | 21,947.25 | 25,458.81 | 3,511.56 | 0.00 | 0.00 | 0.00 | 0.00 | OK |
| 07/09 | 57–71 | 15 | 0 | 56,190.94 | 65,181.49 | 8,990.55 | 0.00 | 0.00 | 0.00 | 0.00 | OK |
| 08/09 | 72–88 | 17 | 0 | 25,954.06 | 29,996.24 | 4,137.44 | 95.26 | -0.03 | 0.00 | 0.00 | OK |
| 09/09 | 89–106 | 18 | 0 | 55,053.89 | 63,862.49 | 8,808.60 | 0.00 | 0.02 | 0.00 | 0.00 | OK |
| 10/09 | 107–118 | 12 | 0 | 101,559.37 | 117,623.06 | 16,223.86 | 161.72 | -0.24 | 1.55 | 0.00 | OK |
| 11/09 | 119–141 | 23 | 0 | 92,008.17 | 106,729.45 | 14,721.28 | 0.00 | 0.03 | 0.00 | 0.00 | OK |
| 12/09 | 142–150 | 9 | 0 | 35,483.09 | 41,166.40 | 5,678.14 | 0.00 | -0.85 | 5.17 | 0.00 | OK |
| 14/09 | 151–162 | 12 | 0 | 83,862.50 | 97,280.52 | 13,418.02 | 0.00 | -0.02 | 0.00 | 0.00 | OK |
| 15/09 | 163–177 | 15 | 0 | 52,429.32 | 60,818.02 | 8,388.70 | 0.00 | -0.01 | 0.00 | 0.00 | OK |
| 16/09 | 178–183 | 6 | 0 | 8,648.27 | 10,032.00 | 1,383.73 | 0.00 | -0.01 | 0.00 | 0.00 | OK |
| 17/09 | 184–206 | 23 | 0 | 110,536.18 | 128,205.76 | 17,683.55 | 18.88 | -0.78 | 4.91 | 0.00 | OK |
| 18/09 | 207–215 | 9 | 0 | 24,198.25 | 28,071.77 | 3,871.97 | 0.00 | -0.25 | 1.55 | 0.00 | OK |
| 19/09 | 216–223 | 8 | 0 | 20,082.78 | 23,296.02 | 3,213.24 | 0.00 | 0.00 | 0.00 | 0.00 | OK |
| 21/09 | 224–239 | 16 | 0 | 43,333.51 | 50,223.88 | 6,927.44 | 37.07 | -0.01 | 0.00 | 0.00 | OK |
| 22/09 | 240–257 | 18 | 0 | 79,851.00 | 92,617.26 | 12,774.79 | 8.53 | 0.01 | 0.00 | 0.00 | OK |
| 23/09 | 258–270 | 13 | 0 | 27,733.56 | 32,168.74 | 4,437.08 | 1.90 | -0.01 | 0.00 | 0.00 | OK |
| 24/09 | 271–279 | 9 | 0 | 22,865.70 | 26,524.20 | 3,658.50 | 0.00 | 0.01 | 0.00 | 0.00 | OK |
| 25/09 | 280–291 | 12 | 0 | 41,343.94 | 47,905.38 | 6,561.44 | 0.00 | 53.59 | 0.00 | 0.00 | REVISAR |
| 26/09 | 292–300 | 9 | 0 | 15,386.91 | 17,848.81 | 2,461.90 | 0.00 | 0.01 | 0.00 | 0.00 | OK |
| 28/09 | 301–310 | 10 | 0 | 47,115.11 | 54,653.52 | 7,538.41 | 0.00 | 0.01 | 0.00 | 0.00 | OK |
| 29/09 | 311–319 | 9 | 0 | 32,001.43 | 36,867.43 | 5,080.34 | 216.32 | 5.28 | 1.98 | 0.00 | REVISAR |
| 30/09 | 320–330 | 11 | 0 | 25,888.42 | 30,000.35 | 4,137.97 | 26.12 | -0.00 | 0.08 | 0.00 | OK |

### 11.5 Ejemplo manual (cliente B, 01 a 17/09)

- Calculando sobre los 176 renglones del ejemplo con `SUM` sin filtro de estatus, los 16 días dan idénticos a S:W del ejemplo.
- W del ejemplo: 666.50 exacto; la celda `W183` muestra 666.49 por el renglón 142.
- El 11/09 tiene W = 376.96 y el 14/09 W = 289.58.

### 11.6 Cotejo SIIGO (cliente B)

| Base | SIIGO | CFDI (motor, 9856 y 9897 confirmados) | Diferencia |
|---|---|---|---|
| 16% | 370,622.20 | 370,772.19 | 149.99 |
| 0% | 2,039.00 | 2,039.00 | 0.00 |

La diferencia de 149.99 es el folio 9779.

---

## 12. Archivos que debo transferir

| Archivo | Qué representa | ¿Datos sensibles? | ¿Anonimizar? | Tipo |
|---|---|---|---|---|
| `01_entradas/B_INGRESOS_2026-09_al_29.xlsx` | Reporte INGRESOS del cliente B | Ya no: RFC, nombres y UUID sintéticos | Ya anonimizado | Entrada |
| `01_entradas/C_INGRESOS_2026-09_al_30.xlsx` | Reporte INGRESOS del cliente C | Ya no | Ya anonimizado | Entrada |
| `02_referencia_manual/B_EJEMPLO_MANUAL_DESPACHO_al_17-09.xlsx` | Trabajo manual del despacho y "DATOS SIIGO" | Ya no | Ya anonimizado (mismo mapeo que la entrada B) | Referencia manual |
| `02_referencia_manual/B_DATOS_SIIGO.csv` | Bases SIIGO del mes | No | No | Referencia (cotejo) |
| `02_referencia_manual/AUTOMATIZACION_word_caso6_v1.docx` | Instrucción original del contador | No (metadatos neutralizados) | No | Referencia manual |
| `02_referencia_manual/INSTRUCCIONES_CONTADOR.md` | Transcripción de instrucciones y mensajes | No | No | Referencia manual |
| `03_resultados_esperados/CLIENTE_B_INGRESOS_09_29.xlsx` | Salida esperada del caso B | No | Ya anonimizado | Resultado final |
| `03_resultados_esperados/INGRESOS_09_30.xlsx` | Salida esperada del caso C | No | Ya anonimizado | Resultado final |
| `03_resultados_esperados/golden_B.json`, `golden_C.json` | Números esperados para pruebas automáticas | No | No | Resultado final |
| `04_referencia_motor/engine.js`, `run_golden.js`, `golden.py` | Motor que generó los resultados y cálculo independiente | No | No | Referencia del comportamiento validado (no es una propuesta de implementación) |

**No transferir:**
- Los archivos originales sin anonimizar.
- El mapa de anonimización. Se queda sólo en la conversación de origen y no está en el paquete.

---

## 13. Qué falta por validar

- PENDIENTE DE VALIDAR: si el folio 9779 (cliente B, 21/09, 149.99) es una bomba a tasa 0%, y por qué no está en SIIGO.
- PENDIENTE DE VALIDAR: si 46109 y 46138 (cliente C) tienen partes a tasa 0% (bombas) y de qué producto son.
- PENDIENTE DE VALIDAR: confirmación explícita del despacho de que los cancelados se excluyen de las sumas. Hoy sólo es implícita: validaron "3 días con detalles" sobre un resultado que ya los excluía.
- PENDIENTE DE VALIDAR: la tolerancia de 1.00 por día (la eligió Claude).
- PENDIENTE DE VALIDAR: la convención de nombre `[CLIENTE_]INGRESOS_MM_DD.xlsx` y la hoja `INGR_MM`. La hoja viene del ejemplo; el nombre de archivo, del registro de pruebas.
- PENDIENTE DE VALIDAR: la causa de los folios faltantes en B y C.
- PENDIENTE DE VALIDAR: los textos literales de los mensajes del despacho (`INSTRUCCIONES_CONTADOR.md`, sección 3).
- PENDIENTE DE VALIDAR: si Doc Digitales puede exportar el reporte con la descripción de conceptos, o los XML. Sin eso, "BOMBA" no se detecta sola y no se distingue tasa 0%, exento y no objeto.
- PENDIENTE DE VALIDAR: el layout final (columna IEPS en Y y REVISIÓN en Z) con el despacho para el cliente B. La entrega original de B se hizo antes de existir la columna IEPS (REVISIÓN estaba en Y); los importes son idénticos.
- PENDIENTE DE VALIDAR: de qué cliente es el archivo C, y el número de clientes y la frecuencia con que se corre el servicio.
- No probado: archivos con más de un mes, con CFDI de tipo distinto a INGRESO, con columna de IEPS explícita, o con varias series de folio.
