# PROCONTA — CONTEXTO COMPLETO DE PRUEBAS

Oct 2, 2026 · @Joaco

Este documento resume todas las pruebas contables de ProConta hechas con Claude hasta la fecha, para que otro asistente pueda continuarlas donde se quedaron. Los nombres de clientes se sustituyen por letras; las cifras son reales. Lo que no está confirmado dice PENDIENTE DE VALIDAR.

## 1. Qué es ProConta

ProConta es un auxiliar contable con IA para despachos contables mexicanos. Ataca el trabajo largo, repetitivo y numérico: cruzar cientos de renglones, sumar día por día, buscar la factura que falta, revisar el trabajo de otro.

**Principio:** "ProConta lee, cruza, calcula y señala; el contador revisa y decide."

**A quién va dirigido.** Etapa 1: despachos contables; el detonante fue que el despacho perdió a dos auxiliares contables. Etapa 2 (idea futura): personas y negocios pequeños sin conocimientos contables.

**Problema que resuelve.** El error humano en archivos largos y el tiempo que se va en tareas mecánicas. La meta planteada es quitar el 50% del trabajo y, más adelante, el 75%.

**Qué NO hace ProConta:**

- No presenta declaraciones ni firma nada.
- No entra a bancos ni al SAT: el humano descarga los archivos y los sube.
- No decide criterios fiscales: los señala y el contador resuelve.
- No es un sistema contable: trabaja sobre los reportes que ya generan los sistemas del despacho (SIIGO, Doc Digitales, el sistema del auxiliar contable).

## 2. Por qué empezamos estas pruebas

Un despacho contable de Veracruz se quedó sin dos auxiliares y buscó cómo absorber su trabajo. El impulsor del proyecto no es contador: es ingeniero de TI y funciona como puente entre el despacho y la IA.

El método fue siempre el mismo: pedirle a Claude que actuara como contador senior mexicano, darle archivos reales y comparar su resultado contra lo que el despacho ya había hecho a mano.

**Lo que queríamos demostrar:**

1. Que la IA puede resolver trabajos contables reales con los archivos tal como salen de los sistemas del despacho.
2. Que encuentra errores y anomalías que se le escapan al ojo humano.
3. Que sus resultados se pueden auditar: cada cifra lleva su fuente y su fórmula.
4. Qué partes se pueden automatizar y cuáles necesitan siempre al contador.

**Escepticismo inicial del despacho:** PENDIENTE DE VALIDAR. No quedó documentado en las pruebas. Sí está documentado que el despacho validó resultados (en el servicio 6 confirmó "3 días con detalles", los mismos que señaló Claude) y que fue sumando instrucciones nuevas: tasa 0% para bombas y después IEPS.

## 3. Flujo general de trabajo

Este es el flujo que se usó en todas las pruebas, descrito sólo con lo que realmente se hizo.

1. **Carga de archivos.** El usuario sube los archivos tal como salen del banco, del SAT, de Doc Digitales, de SIIGO o del sistema del auxiliar. En casi todos los casos venía también un ejemplo hecho a mano por el despacho, que sirvió de referencia.
2. **Validación.** Antes de calcular se revisa titular, RFC, periodo y fecha de corte de cada archivo, y que los totales leídos cuadren con los totales que trae el propio archivo. Ejemplo: en los PDF de agosto se comprobó que salieran exactamente 122 cargos por $333,204.28 y 31 abonos por $342,020.40, igual que el estado de cuenta.
3. **Normalización.** Cada fuente se lleva a un formato común: movimientos (fecha, descripción, cargo, abono, cuenta) y comprobantes (RFC, folio, subtotal, IVA, total, método y forma de pago, estatus). Se excluyen renglones de totales y se identifican cancelados.
4. **Cruces y cálculos.** Banco contra CFDI, CFDI contra auxiliar, abonos contra facturas, sumas por día, cálculo de IVA e ISR. Todo con fórmulas en el Excel, no con valores pegados.
5. **Detección de anomalías.** Cada renglón sale con un estatus y una observación en una frase: conciliado, con observación, parcial, sin CFDI, no requiere, riesgo alto, pendiente, otro periodo.
6. **Revisión humana.** El contador valida lo ambiguo y decide los criterios. En las pruebas, las preguntas al despacho se mandaron por WhatsApp a través del impulsor del proyecto.
7. **Entregable.** Un Excel con el original intacto, columnas de resultado con fórmulas, hojas por estatus para el cliente, una hoja de control interno que debe dar cero, y un nombre de archivo con fecha (por ejemplo `INGRESOS_09_29`, `Cta_por_Cobrar_20260917`).

## 4. Todos los servicios y casos probados

Se probaron 7 servicios del catálogo y un caso adicional. Los clientes se identifican por letra.

| Caso | Servicio | Cliente | Periodo |
| --- | --- | --- | --- |
| 4.1 | 1 · Conciliación salidas vs CFDI | A: persona física, régimen 612, vende vidrio y aluminio | Sept 2026, corte 18/09 |
| 4.2 | 2 · IVA e ISR del mes | A | Agosto 2026 |
| 4.3 | 3 · Cotejo vs auxiliar contable | A | Agosto 2026 |
| 4.4 | 1 y 2 con mes completo y emitidos | A | Sept 2026, corte 26–28/09 |
| 4.5 | 4 · Asimilados vs RESICO vs nómina | D: persona moral de autotransporte (PENDIENTE DE VALIDAR si es la misma que en 4.6 y 4.8) | Consulta |
| 4.6 | 5 · Plan México | D: persona moral de autotransporte | Compra 31/07/2026 |
| 4.7 | 6 · Revisión de CFDI emitidos | B y C: dos clientes con facturación al público | Sept 2026 |
| 4.8 | 7 · Cuentas por cobrar | D | Corte 17/09/2026 |
| 4.9 | Adicional · Cuotas IMSS de un trabajador | Otro patrón (persona física) | Jul 2025 – jun 2026 |

El despacho organizó las pruebas en un catálogo (archivo "01\_PRUEBAS\_AUTOMATIZACION"), con los servicios 1 a 5 al principio; el 6 y el 7 se agregaron después con instrucciones escritas del contador.

### 4.1 Servicio 1 · Conciliación de salidas bancarias vs CFDI recibidos

**Qué problema resuelve.** Identificar qué salida de dinero tiene su CFDI y cuál no, porque un gasto sin CFDI no se puede deducir.

**Qué recibió.**

- Movimientos BBVA en XLS de dos cuentas: PYME y personal. Traían una columna "SI HAY FACTURA" donde el despacho ya había marcado a mano.
- Reporte del SAT de CFDI recibidos de septiembre (XLS): 58 CFDI, con un renglón por concepto.

**Trabajo manual previo.** El contador revisaba salida por salida y marcaba si tenía factura.

**Qué hicimos.** Se cruzaron 101 salidas contra los 58 CFDI. El cruce usó:

- el RFC que BBVA pone en la descripción de los pagos con tarjeta;
- el importe exacto, con tolerancia de $0.05;
- la hora de autorización del cargo contra la hora de emisión del CFDI;
- la cuenta destino de cada SPEI, asociada al RFC de su proveedor.

Después el usuario pidió una hoja por estatus para enviarla al cliente.

**Resultados.**

| Estatus | Salidas | Importe |
| --- | --- | --- |
| Conciliado | 33 | $54,051.29 |
| Conciliado con observación | 7 | $10,995.90 |
| Parcial (mensualidad del auto) | 1 | $6,525.26 |
| Sin CFDI | 38 | $74,348.15 |
| No requiere (traspasos, retiros, préstamos) | 22 | $54,450.00 |

Sólo el 49% del importe que requería CFDI lo tenía.

**Qué encontró.**

- **Anticipo duplicado.** El proveedor de vidrio 2 emitió un CFDI de anticipo de $1,052.53 y luego una factura final de $1,052.54 con forma de pago 03 y sin relación tipo 07. Riesgo de deducir dos veces.
- **Salidas grandes sin CFDI:**
  - SPEI de $34,786.61 al proveedor de vidrio 1;
  - cargo con tarjeta de $14,115.72 al mismo proveedor;
  - $6,378 con concepto "FACTURAS";
  - una "Parcialidad 3" de $3,471.
- **Forma de pago incorrecta en el CFDI:** uno decía 04 (crédito) y se pagó con débito; otro decía 01 (efectivo) y se pagó con tarjeta.
- **PPD sin complemento de pago (REP):** Würth, Telmex y Telcel.
- **Marca manual sin respaldo:** un retiro de $5,009.08 venía marcado "con factura", pero ningún CFDI ni combinación de CFDIs sumaba ese importe.
- **Estados de cuenta faltantes:** CFDI de Home Depot ($6,898, forma 04) que apuntan a una tarjeta de crédito no entregada, de una cuenta Banamex y de una colegiatura (uso D10).
- **CFDI de otros periodos:** comisiones bancarias de agosto llegaron en septiembre.

**Problemas y excepciones.**

- La mensualidad del auto ($6,525.26) sólo tiene CFDI por intereses e IVA ($2,797.24).
- Las comisiones de la terminal punto de venta se amparan con el CFDI mensual de BBVA, que llega al mes siguiente.

**Qué tuvimos que corregir.** Nada en el resultado. El formato de entrega se amplió con una hoja por estatus.

**Reglas que dejó.**

1. El RFC viene en la descripción del cargo con tarjeta.
2. Entre el cargo y el CFDI hay de 1 a 3 días de desfase, más en fines de semana.
3. La hora de autorización confirma el cruce.
4. Hay que mantener un catálogo de cuenta destino → RFC del proveedor.
5. Un pago puede cubrir varios CFDI.
6. Las reglas fiscales se validan aparte del cruce.

**Qué tanto se puede automatizar.** 85–90%.

**Qué sigue necesitando criterio.** Decidir si un gasto es personal o del negocio, los cruces probables y qué hacer con los gastos sin CFDI.

### 4.2 Servicio 2 · Cálculo de IVA e ISR del mes (agosto)

**Qué problema resuelve.** Determinar el IVA a pagar y la base del ISR de una persona física en régimen 612 que tributa sobre flujo de efectivo: cuenta lo cobrado y lo pagado en el mes.

**Qué recibió.**

- Estados de cuenta BBVA de agosto en PDF: PYME (14 páginas) y personal (7 páginas).
- Estado de la tarjeta de crédito, del 16/07 al 15/08.
- Reporte del SAT de CFDI recibidos de agosto: 189 CFDI.
- No hubo CFDI emitidos.

**Trabajo manual previo.** El auxiliar arma la base del mes y su propio auxiliar de IVA; ese auxiliar se cotejó en el caso 4.3.

**Qué hicimos.**

1. Se extrajeron los movimientos de los PDF y se cuadraron contra los totales del banco.
2. Ingresos: los depósitos de clientes, excluyendo traspasos propios y disposiciones de la tarjeta.
3. Deducciones: sólo CFDI pagados en agosto. Pagos con tarjeta de crédito, a la fecha de la operación.
4. Se aplicó la tarifa mensual de ISR 2026 del Anexo 8 de la RMF, que se buscó en internet.

**Resultados (ya con las correcciones del caso 4.3).**

| Concepto | Importe |
| --- | --- |
| Ingresos cobrados sin IVA | $293,143.56 |
| IVA trasladado | $46,903.00 |
| IVA acreditable | $25,818.59 |
| IVA a pagar | $21,084.41 |
| ISR del mes, tarifa mensual | $32,768.90 |

La primera versión daba IVA acreditable de $23,632.92, IVA a pagar de $23,270.08, base de $142,288.69 e ISR de $37,148.42.

**Qué encontró.**

- **Efectivo fraccionado.** 47 CFDI de dos proveedores, todos en efectivo, cada uno justo debajo de $2,000 y emitidos con minutos de diferencia, varios de madrugada.
  - En el mes se retiraron $39,000 en efectivo contra $96,590 de CFDI pagados en efectivo.
  - No se dedujeron: $78,952 de deducción y $12,632 de IVA quedaron fuera.
- **Depósito sin identificar** de $60,000 ("BMRCASH"). Se tomó como ingreso por presunción (art. 59 CFF). En septiembre se aclaró que era el cobro de un cliente.
- **Compras con tarjeta del 27 al 31/08** por $44,985 sin IVA. Caen fuera del corte de la tarjeta. Si se confirman, la base baja a unos $97,303.
- **Cruces con septiembre.** VAX FC-251384 ($14,115.72), Texin ($239.90) y Hercon ($109) se pagaron el 01/09: se deducen en septiembre.
- **Comisiones de agosto.** El CFDI ($390.63) venía impreso en la última página del estado de cuenta personal.
- **Facturas "C" del proveedor de vidrio 2 sin pago en el mes.** No se dedujeron porque parecen la factura final de anticipos ya deducidos.
- **Hay trabajadores sin CFDI de nómina.** Se pagan IMSS, Infonavit e impuesto sobre nómina de 3%, pero no llegaron CFDI de nómina.

**Problemas y excepciones.**

- Faltaron los CFDI emitidos: el IVA trasladado se calculó suponiendo que todo depósito trae 16% de IVA (PENDIENTE DE VALIDAR).
- El ISR se calculó aislado del mes. El pago provisional legal es acumulado de enero al mes, menos los pagos anteriores; no se tuvieron esos datos.

**Qué tuvimos que corregir.** Dos errores de Claude salieron al cotejar contra el auxiliar del despacho; ver caso 4.3 y sección 6.

**Reglas que dejó.**

- Efectivo de más de $2,000 por operación no es deducible.
- Fraccionar una compra en varios CFDI no esquiva ese límite.
- Combustible pagado en efectivo no es deducible.
- PPD sin REP no es deducible.
- La tarjeta de crédito cuenta a la fecha de la operación.
- Un CFDI del 31 pagado el día 1 se deduce en el mes siguiente.
- Se debe comparar el efectivo retirado contra el efectivo facturado.

**Qué tanto se puede automatizar.** 70–80%.

**Qué sigue necesitando criterio.** Qué hacer con el efectivo fraccionado, los depósitos sin identificar, los gastos personales, los límites del auto y el cálculo acumulado.

### 4.3 Servicio 3 · Cotejo del IVA acreditable contra el auxiliar contable

**Qué problema resuelve.** Verificar el trabajo del contador: comparar el IVA acreditable que registró en su sistema contra un cálculo independiente, y explicar cada diferencia.

**Qué recibió.** El auxiliar de IVA de agosto ("AUXILIAR\_DE\_IVA\_08", XLSX) con tres cuentas:

| Cuenta | Qué es | Cargos | Abonos |
| --- | --- | --- | --- |
| 1108-0001-0001 | IVA acreditable pagado | $34,428.18 | $0.00 |
| 1108-0001-0002 | IVA acreditable por pagar | $7,394.68 | $6,241.11 |
| 1108-0001-0005 | IVA acreditable efectivo | $13,213.31 | $0.00 |

**Trabajo manual previo.** Revisar a mano el auxiliar contra los CFDI y los pagos. En la práctica casi no se hace por falta de tiempo (PENDIENTE DE VALIDAR con el despacho).

**Qué hicimos.**

1. Se entendió que el IVA acreditable del mes es la suma de las cuentas 0001 y 0005: $47,641.49. La 0002 guarda lo no pagado.
2. Se cotejaron 186 partidas una por una, por serie y folio. Los CFDI sin folio se cotejaron por emisor e importe de IVA.

**Resultados.**

| Concepto | IVA auxiliar | IVA cálculo | Diferencia |
| --- | --- | --- | --- |
| Coinciden | $25,762.69 | $25,762.69 | $0.00 |
| Compras con tarjeta del 27–31/08 | $7,197.66 | $0.00 | $7,197.66 |
| Efectivo fraccionado | $12,632.36 | $0.00 | $12,632.36 |
| Documentos de otro mes | $2,048.78 | $0.00 | $2,048.78 |
| IVA que falta en el auxiliar | $0.00 | $55.90 | −$55.90 |
| **Total** | **$47,641.49** | **$25,818.59** | **$21,822.90** |

**Qué encontró.**

- **Errores de corte en el auxiliar:** acreditó el CFDI de comisiones bancarias de julio, y tres CFDI pagados el 01/09.
- **Faltantes en el auxiliar:** el CFDI de comisiones de agosto y la comisión de la tarjeta.
- **Diferencia de criterio:** el auxiliar acredita el efectivo fraccionado; Claude no.
- **Saldo inicial anómalo:** la cuenta 0002 arranca en −$36,906.51. Una cuenta "por pagar" no debería tener saldo acreedor.

**Qué tuvimos que corregir.** El cotejo encontró dos errores de Claude:

1. **Liquidaciones del proveedor de vidrio 2, $996.43 de IVA.** Cuatro pagos que Claude había dejado como "sin CFDI" eran el pago del saldo de facturas "C" después de aplicar anticipos. El auxiliar los tenía bien.
2. **CFDI del proveedor de vidrio 1 por $8,622.01, $1,189.24 de IVA.** Se pagó el 10/08 con $8,622.15. La tolerancia de $0.05 no lo encontró por $0.14 de diferencia.

**Reglas que dejó.**

- Un auxiliar puede tener varias subcuentas: hay que entender cuáles suman al acreditable.
- Clasificar cada diferencia en corte, criterio, documento faltante o error.
- Un pago puede liquidar el saldo de una factura después de aplicar anticipos.
- La tolerancia de importe debe ser más amplia cuando proveedor y fechas coinciden.
- El cotejo audita en ambos sentidos.

**Qué tanto se puede automatizar.** 90% o más.

**Qué sigue necesitando criterio.** Decidir qué lado tiene razón en las diferencias de criterio.

### 4.4 Servicios 1 y 2 con mes completo y CFDI emitidos (septiembre)

**Qué problema resuelve.** Correr la conciliación y el cálculo de impuestos juntos, como lo haría un usuario que sube todos sus archivos del mes.

**Qué recibió.**

- Movimientos de septiembre de la cuenta PYME (al 26/09) y de la personal (al 28/09).
- Export de la tarjeta de crédito, que sólo traía 3 movimientos.
- CFDI recibidos y CFDI emitidos de septiembre, en formato Doc Digitales.

**Qué hicimos.**

1. Mismo cruce del caso 4.1, con ventana de fechas de ±25 días.
2. Se aplicaron los pendientes de agosto que se pagaron el 01/09.
3. Los ingresos se tomaron de los CFDI emitidos cobrados más los depósitos sin factura.
4. Se identificó cada depósito contra su factura emitida o su complemento de pago (REP).

**Resultados del servicio 1.** El 85% del importe que requiere CFDI ya lo tiene; al corte del 18/09 era 49%.

| Estatus | Salidas | Importe |
| --- | --- | --- |
| Conciliado | 52 | $108,050.17 |
| Conciliado con observación | 7 | $16,771.99 |
| Parcial | 2 | $16,525.26 |
| Sin CFDI | 44 | $24,349.96 |
| No requiere | 35 | $148,602.60 |

**Resultados del servicio 2.**

| Concepto | Importe |
| --- | --- |
| Cobrado con CFDI emitido (con IVA) | $193,001.20 |
| Cobrado sin CFDI emitido (con IVA) | $129,710.00 |
| IVA trasladado | $44,511.89 |
| IVA acreditable | $17,963.17 |
| IVA a pagar | $26,548.72 |
| Base gravable | $160,754.25 |
| ISR del mes, tarifa mensual | $43,426.71 |

**Qué encontró.**

- **Se aclaró el misterio de agosto.** Los depósitos "BMRCASH" son de una constructora cliente: cobro de su factura PPD 5724, con REP. Eso explica también el depósito de $60,000 de agosto.
- **Un REP que no cuadra.** El segundo REP de esa constructora, por $41,104, no corresponde a la factura 5724. Liquida una factura de agosto aún no identificada (PENDIENTE DE VALIDAR).
- **$129,710 cobrados sin factura,** entre ellos $49,000 "liquidación domo", $32,000 "domo y ventanas" y $23,430 cobrados con terminal punto de venta. Se deben facturar, incluida la factura global.
- **$82,000 de "préstamos"** recibidos (04/09 y 18/09). No se acumularon, pero sin contrato el SAT los presume ingresos.
- **Notas de crédito del proveedor de vidrio 2** (forma 30) que netean sus facturas "C": el gasto va sólo con los anticipos.
- **Folios faltantes en los emitidos:** salta de la 5726 a la 5730.
- **Pendientes:**
  - Home Depot $6,898, porque falta el estado completo de la tarjeta;
  - Telcel PPD de $38,299 con abono de $10,000 sin REP;
  - el cargo del IMSS no aparece en estas cuentas.

**Problemas y excepciones.** Los movimientos llegan al 26 y al 28 de septiembre: al cerrar el mes hay que volver a correr los últimos días.

**Reglas que dejó.**

- Los ingresos se cruzan en dos direcciones: depósito contra factura emitida y factura emitida contra depósito.
- Los PPD cobrados se acumulan por el REP.
- Un depósito sin factura sigue siendo ingreso.
- Un préstamo sin contrato es un riesgo.
- Los pendientes de un mes alimentan el siguiente.

**Qué tanto se puede automatizar.** Igual que 4.1 y 4.2.

**Qué sigue necesitando criterio.** Préstamos, cobros sin factura y la identificación de cada REP.

### 4.5 Servicio 4 · Asimilados vs RESICO vs nómina

**Qué problema resuelve.** Decidir cómo pagarle a una persona que se va a contratar, comparando lo que cuesta a la empresa y lo que recibe la persona.

**Qué recibió.** Sólo la consulta. Una persona moral de autotransporte iba a contratar a un lavador de tolvas por $5,000 semanales. La pregunta era si convenía asimilados a salarios (art. 94 fr. VII LISR) o que facturara como RESICO.

**Trabajo manual previo.** Recalcular tarifas, IMSS e impuestos en cada consulta.

**Qué hicimos.**

- Se calcularon los tres escenarios, incluido nómina con IMSS como referencia.
- Se usó la tarifa semanal de ISR 2026 y UMA de $117.31, que se buscó en internet.
- Se supusieron prima de riesgo de trabajo clase IV e impuesto sobre nómina de 3% (PENDIENTE DE VALIDAR para la empresa real).

**Resultados (por semana).**

| Concepto | Asimilados | RESICO | Nómina con IMSS |
| --- | --- | --- | --- |
| La empresa le deposita | $4,366.82 | $5,204.17 | $4,231.08 |
| ISR retenido | $633.18 | $62.50 (1.25%) | $633.18 |
| Costo real para la empresa | \~$5,150 | $5,000 | \~$6,809 |
| Le queda a la persona | $4,366.82 | \~$4,950 | $4,231.08 + prestaciones |

Al año, en asimilados la persona paga $32,876 de ISR; en RESICO, unos $2,600.

**Qué encontró.** Aunque RESICO gana en impuestos, la recomendación fue nómina:

- Lavar las unidades de la empresa, en su patio, con horario y pago fijo, es una relación laboral (art. 20 LFT).
- Asimilados por la fracción VII exige una actividad empresarial real y la opción por escrito de la persona.
- El mayor riesgo es un accidente: químicos, alturas o espacios confinados. Sin IMSS, la empresa paga el capital constitutivo.

**Problemas y excepciones.** Las cuotas IMSS son estimadas; dependen de la prima real de la empresa.

**Reglas que dejó.**

- RESICO: la persona moral retiene 1.25% de ISR (art. 113-J LISR) y dos terceras partes del IVA.
- Asimilados no tiene parte exenta y es deducible al 100%.
- RESICO sólo se sostiene si la persona es independiente de verdad: equipo propio, cobro por servicio, otros clientes, sin horario impuesto.

**Qué tanto se puede automatizar.** 50–60%: la calculadora sí, la decisión no.

**Qué sigue necesitando criterio.** Si hay subordinación y qué riesgo se acepta.

### 4.6 Servicio 5 · Plan México: deducción inmediata de un tractocamión

**Qué problema resuelve.** Que una empresa aproveche el estímulo fiscal del Decreto "Plan México" (DOF 21/01/2025): deducir 86% de una inversión nueva en el primer año, en lugar de depreciarla al 25% anual.

**Qué recibió.** El CFDI de compra de un tractocamión Freightliner New Cascadia 2026, fabricado en México (su NIV empieza con "3AK"):

- Subtotal $2,754,310.35, IVA $440,689.66, total $3,195,000.01.
- Forma de pago 03 y relación tipo 07 con tres CFDI de anticipo.
- Sustituye una unidad usada, ya totalmente depreciada.

**Trabajo manual previo.** El despacho, de un familiar del impulsor, no sabía armar un proyecto de inversión.

**Qué hicimos.** Se investigó en internet el decreto, los Lineamientos y el programa de vehículos pesados (ANPACT, Secretaría de Economía). Se entregó:

1. Un Excel de evaluación con checklist de requisitos.
2. Un Word con el escrito libre de solicitud y el Anexo I, Proyecto de inversión (numerales i a viii), con los datos faltantes en amarillo.
3. Una cotización de honorarios: opción A, $45,000 + IVA fijo; opción B, $25,000 + IVA más 3% del ISR diferido.
4. Respuestas sobre el procedimiento posterior a la constancia y los plazos de la Secretaría.

**Resultados.**

| Concepto | Importe |
| --- | --- |
| Deducción inmediata 2026 (86%) | $2,368,706.90 |
| Depreciación normal 2026 (25%, 5 meses) | $286,907.33 |
| ISR que se difiere en 2026 | \~$624,540 |
| Parte en pagos provisionales (6 meses, de julio a diciembre) | $394,784.48 por mes |

**Qué encontró.**

- **Constancia previa.** Se necesita la constancia del Comité de Evaluación antes de aplicar el estímulo. Plazo máximo según los Lineamientos: 51 días hábiles; a los 3 meses sin respuesta hay negativa ficta.
- **No hay aviso aparte al SAT:** sólo registro específico y aplicación en las declaraciones (reglas 11.15.x de la RMF, PENDIENTE DE VALIDAR su número en la RMF 2026).
- **Coeficiente de utilidad de 2027:** hay que sumar de regreso la deducción.
- **Anticipos de la factura:** se deben pedir los CFDI de egreso de los anticipos aplicados, para no inflar el MOI.

**Problemas y excepciones.**

- **Dos canales posibles:** la Unidad de Desarrollo Productivo de Economía (programa de vehículos pesados) o la Ventanilla Única de Hacienda (Plan México general). PENDIENTE DE VALIDAR cuál.
- **Bolsa limitada:** se asigna hasta agotarse.
- **Datos faltantes:** el despacho iba a mandar un Excel con lo que podía proporcionar, y nunca llegó.

**Qué tuvimos que corregir.** Hubo una inconsistencia en el ISR diferido; ver sección 6.

**Reglas que dejó.** Las tasas, plazos y canales cambian: cada caso exige investigar lo vigente. Lo estable es la mecánica de cálculo y la estructura del expediente.

**Qué tanto se puede automatizar.** 30–40%. El impulsor evalúa sacarlo de la app y dejarlo como consultoría.

**Qué sigue necesitando criterio.** Elegibilidad, trámite, firma y seguimiento.

### 4.7 Servicio 6 · Revisión de CFDI emitidos

**Qué problema resuelve.** Comprobar que las facturas emitidas cobraron bien el IVA y aislar las que van a tasa 0%, exentas o con IEPS.

**Qué recibió.**

- El reporte "INGRESOS" de Doc Digitales (XLSX).
- Un Word con la instrucción literal del contador.
- Un ejemplo hecho a mano al 17/09, que traía además una hoja "DATOS SIIGO" con las bases al 16% y al 0%.

**La instrucción del contador:**

- Por día, en el último CFDI del día, sumar subtotal (columna S), total (T), IVA (U) y descuento (V).
- Calcular W = (S − V) × 0.16 − U.
- Al final, sumar S a W.
- Nombre del archivo: `INGRESOS_MM_DD`.

**Trabajo manual previo.** Fórmulas día por día a mano, una vez al mes, el día 1 o 2, para 4 clientes.

**Qué hicimos.**

1. Se reprodujo su método y salió idéntico al centavo en los 16 días completos de su ejemplo.
2. Se excluyeron los cancelados de las sumas (SUMIFS con "Activo").
3. Se cotejaron los totales contra SIIGO.
4. Se buscaron folios faltantes y cancelados con su sustituto.
5. Se construyó una herramienta web que genera el Excel sola.

**Resultados con el cliente B** (327 CFDI, 324 activos, 3 cancelados, 26 días):

| Concepto | Importe |
| --- | --- |
| Subtotal | $372,811.19 |
| Total | $432,110.86 |
| IVA trasladado | $59,299.67 |
| Diferencia W del mes | $350.12 |

Cuadraron 23 días. Los 3 que no (21, 25 y 29/09) tienen un CFDI sin IVA cada uno: folios 9779 ($149.99), 9856 ($669.00) y 9897 ($1,370.00). El despacho lo confirmó: "3 días con detalles".

**Qué encontró en el cliente B.**

- **Cotejo con SIIGO:** la base al 16% ($370,622.20) cuadra al centavo. La base al 0% ($2,039) es 9856 + 9897: el folio 9779 no está registrado en SIIGO.
- **Cancelados y sus sustitutos:** 9687 y 9709 eran CFDI al 0% sustituidos el 19/09 por 9767 y 9768, ya con IVA. El 9689 se reexpidió como 9765.
- **Folios que no vinieron en el archivo:** 9679, 9697 y 9825.
- **Un error en el ejemplo hecho a mano:** la fila 142 tenía fórmulas propias y la 143 la volvía a sumar. Al sumar la columna S se duplicaban $539.66.

**Instrucción nueva 1, tasa 0%.** "Si dice Bomba, una columna con el subtotal que diga Tasa 0%."

- Las bombas para riego agrícola van a tasa 0% (art. 2-A fr. I inciso e LIVA); una bomba doméstica va al 16%.
- El reporte no trae la descripción del producto, así que la herramienta permite subir un archivo de conceptos o marcar a mano.
- Archivo entregado: `CLIENTEB_INGRESOS_09_29`, con 9856 y 9897 como tasa 0% y 9779 por confirmar.

**Instrucción nueva 2, IEPS, con el cliente C.** "Verificar que los CFDI con diferencia contengan IEPS en la base, el monto en una columna adicional." El cliente C tenía 329 CFDI, todos activos.

- El reporte no trae columna de IEPS. Se dedujo con Total − (Subtotal − Descuento) − IVA + retenciones.
- 8 facturas globales traen IEPS por $22.22. Su IVA salía unos centavos mayor porque se calcula sobre subtotal + IEPS (art. 18 LIVA).
- Dos CFDI tienen una parte sin IVA:
  - 46109 (25/09): $334.94, que explican $53.59 de IVA;
  - 46138 (29/09): $34.97, que explican $5.60, además de su IEPS.
- IVA sin explicar: $59.18, exactamente esas dos partes.
- Folios faltantes: 45835, 45844, 46050 y 46147. Archivo: `INGRESOS_09_30`.

**Qué tuvimos que corregir.**

- Al principio Claude trató los CFDI sin IVA como posibles errores y sugirió sustituirlos. El despacho aclaró que eran bombas.
- La tolerancia de $1 por día ocultaba las diferencias de centavos del IEPS; el IEPS se identifica por factura, no por día.
- Ver sección 6.

**Reglas que dejó.**

- Se suman sólo los activos.
- Un día se cuadra con: diferencia W = (tasa 0% − IEPS) × 16%.
- Con el XLS no se distingue tasa 0%, exento o no objeto de impuesto. Hace falta el XML (campo ObjetoImp).
- Las columnas se buscan por nombre, no por letra: el layout cambia entre clientes.

**Qué tanto se puede automatizar.** 90% o más. Ya funciona como herramienta.

**Qué sigue necesitando criterio.** Confirmar qué producto es bomba de riego y qué CFDI mixto es correcto.

### 4.8 Servicio 7 · Cuentas por cobrar a una fecha de corte

**Qué problema resuelve.** Saber qué facturas siguen sin cobrarse, por cliente y a una fecha. Lo difícil es que los clientes pagan muchas facturas juntas y la referencia del pago no siempre dice cuáles.

**Qué recibió.**

- **El auxiliar de clientes, cuenta 1103 ("AUX\_1103", XLSX), del 01/01 al 17/09/2026.** Trae 18 cuentas de cliente, 1,608 facturas ("Venta-Docto.: A/folio"), 438 abonos y 9 notas de crédito.
  - Los abonos sólo traen en la descripción un folio, un rango ("6501-6510"), una lista o "DEP FACT VARIAS".
  - El auxiliar incluye renglones "TOTALES CUENTA" y saldos iniciales.
- **Un ejemplo del despacho de junio (XLS antiguo)** con dos hojas: "Resumen" (papel de trabajo) y "enviado" (lo que recibe el cliente).
- **La instrucción:** facturas pendientes al 17/09/2026, archivo `Cta_por_Cobrar_20260917`.

**Trabajo manual previo.** Tachar a mano las facturas cobradas y armar la hoja "enviado".

**Qué hicimos.** Cada abono se aplicó a facturas en este orden de prioridad:

1. Folio exacto.
2. Rango con sus extremos.
3. Monto exacto contra una factura.
4. Primeras en entrar (FIFO) exacto o suma de facturas antiguas.
5. Como último recurso, FIFO parcial, que queda marcado.

Se validó que el saldo de cada cliente cuadre al centavo con el auxiliar; si no cuadra, el archivo no se genera. Se agregó una hoja "Control (interno)" con antigüedad de saldos y partidas a revisar.

**Resultados.** $1,008,233.23 pendientes en 87 facturas de 8 clientes; los otros 10 en cero.

| Cliente | Saldo | Facturas |
| --- | --- | --- |
| Comercializadora de azúcar | $495,488.34 | 40 |
| Cliente agropecuario 1 | $282,262.40 | 26 |
| Fertilizantes 1 | $108,981.60 | 9 |
| Fertilizantes 2 | $48,647.20 | 5 |
| Agroindustrial | $38,673.89 | 1 + diferencia |
| Fertilizantes 3 | $15,327.20 | 1 |
| Nutrientes | $9,800.00 | 1 (de 2025) |
| Grupo comercial | $9,052.60 | 3 de 2025–2026 + diferencia |

El 31% ($316,442) tiene más de 90 días.

**Qué encontró.**

- **Cobranza detenida:** el cliente agropecuario 1 debe lo mismo que en junio, sin un solo cobro en tres meses.
- **Referencias de pago poco confiables:**
  - 395 de 438 abonos traen una referencia que coincide con facturas del cliente.
  - 35 traen folios que no corresponden. Por ejemplo, "5932-5941" pagó las facturas 6077 a 6087.
  - 8 no cuadran con ninguna combinación.
  - Ningún caso cambia el total de un cliente.
- **Diferencias de centavos:** $0.29 en un cliente, por cobros de marzo que suman $170,572.81 contra facturas por $170,573.10. Y $0.20 en otro: al reporte de junio hecho a mano le faltaron esos 20 centavos.
- **Partidas de 2025:** el auxiliar 2026 sólo trae el saldo inicial; el detalle se tomó del reporte de junio.
- **Facturas en $0.00** canceladas o sin importe, que no afectan el saldo.

**Qué tuvimos que corregir.** Varios errores de proceso; ver sección 6.

**Reglas que dejó.**

- La referencia del abono es una pista, no la verdad.
- Un rango de folios no significa "todas las facturas del rango".
- Excluir los renglones de totales.
- Considerar los saldos iniciales.
- Las diferencias de centavos van como partida visible, no escondidas en una factura.
- Cuadrar contra el auxiliar es obligatorio.

**Qué tanto se puede automatizar.** 90% o más.

**Qué sigue necesitando criterio.** Partidas de años anteriores, ajuste de centavos y qué incluir en el reporte al cliente (RFC, antigüedad).

### 4.9 Caso adicional · Resumen de cuotas IMSS pagadas por un trabajador

**Qué problema resuelve.** Responder "todo lo pagado de un trabajador" entre dos fechas (03/07/2025 al 22/06/2026). Este caso no está en el catálogo de 7 servicios.

**Qué recibió.** 12 archivos XLS de emisiones del IMSS, de julio 2025 a junio 2026:

- EMA, cuotas mensuales; EBA, cuotas bimestrales de retiro, cesantía e Infonavit.
- Cada uno con hojas "Emisión" y "Movimientos" por trabajador.

**Trabajo manual previo.** Buscar al trabajador en cada archivo y sumar.

**Qué hicimos.**

1. Se extrajeron sus renglones por número de seguridad social.
2. Se separó la cuota patronal de la obrera.
3. Se revisaron sus movimientos ante el IMSS: baja el 22/06/2026 y reingreso el 25/06/2026.

**Resultados.** Total del periodo: $37,004.54 en 357 días cotizados.

| Concepto | Patronal | Obrera | Total |
| --- | --- | --- | --- |
| Cuotas mensuales (EMA) | $20,293.98 | $1,387.70 | $21,681.68 |
| Retiro, cesantía y vejez (EBA) | $8,523.12 | $1,248.94 | $9,772.06 |
| Infonavit 5% | $5,550.80 | $0.00 | $5,550.80 |
| **Total** | **$34,367.90** | **$2,636.64** | **$37,004.54** |

**Qué encontró.**

- **Se excluyeron $649.16 del reingreso del 25/06,** porque la fecha de corte pedida coincide con la baja.
- **Julio 2025 se emitió completo, 31 días.** Si el criterio es estricto desde el 03/07, hay que restar $118.35 de EMA y $78.59 de EBA: el total queda en $36,807.60. Se dejó la decisión al cliente.
- **El salario base subió** de $292.54 a $330.57 diarios desde el 01/01/2026.
- **La prima de riesgo bajó** de 6.58875% a 5.58875% desde marzo 2026.
- **No tiene crédito Infonavit.**

**Problemas y excepciones.** EMA y EBA son lo que determina el IMSS, no el comprobante de pago. Para acreditar el pago hacen falta las líneas de captura o los recibos bancarios.

**Reglas que dejó.**

- Los movimientos de baja y reingreso definen qué se incluye.
- Las cuotas no se prorratean por día dentro del mes emitido.
- Siempre separar patronal y obrera.

**Qué tanto se puede automatizar.** Alto: es búsqueda y suma (PENDIENTE DE VALIDAR con más casos).

**Qué sigue necesitando criterio.** El prorrateo del primer mes y para qué se usará el dato (juicio laboral, finiquito).

## 5. Reglas que hemos aprendido

Todas salieron de las pruebas de la sección 4; entre paréntesis, el caso donde se probaron.

**Banco contra CFDI**

- En los cargos con tarjeta BBVA, el RFC del comercio viene en la descripción. Es el dato más confiable para cruzar (4.1).
- Entre el cargo y el CFDI hay de 1 a 3 días de desfase; en fin de semana se aplica el lunes. La hora de autorización suele coincidir con la de emisión del CFDI (4.1).
- Hay CFDI que se emiten días después del pago: hasta 14 días en un SPEI y 10 en gasolina. Con mismo proveedor e importe exacto se acepta una ventana amplia (4.2, 4.4).
- El importe exacto puede diferir por centavos ($0.01–$0.14). Con mismo proveedor, la tolerancia debe ser mayor a $0.05 (4.3).
- Si hay varios cargos iguales al mismo proveedor (gasolina de $479.80), se asignan por fecha y hora (4.2).
- Un pago puede cubrir varios CFDI, y un CFDI puede pagarse en varios abonos (4.1, 4.3).
- Traspasos entre cuentas propias, retiros, pagos de tarjeta y préstamos no requieren CFDI (4.1).

**Reconocimiento de proveedores**

- En un SPEI la descripción no trae RFC. Se identifica por la cuenta o CLABE destino y se guarda un catálogo cuenta → proveedor por cliente (4.1).
- El nombre en el SPEI puede ser el del titular, no el del proveedor ("MATERIAL" + nombre de la clienta iba al proveedor de vidrio 1) (4.1).

**Cruces entre meses**

- Un CFDI del día 31 pagado el día 1 se deduce en el mes siguiente (4.2, 4.4).
- Las comisiones bancarias se amparan con el CFDI mensual del banco, que se emite el primer día del mes siguiente. Si llega antes de declarar, se deduce en el mes del cargo (4.2).
- Los movimientos al día 26 o 28 obligan a correr de nuevo al cierre (4.4).

**PPD y REP**

- Un CFDI PPD sin complemento de pago no es deducible ni acreditable (4.1, 4.2).
- Un PPD emitido se acumula por lo cobrado, con su REP (4.4).
- Un REP puede no corresponder a la factura que se espera (4.4).

**Efectivo**

- Pagos de más de $2,000 en efectivo no son deducibles (art. 27 fr. III LISR).
- El límite aplica a la operación, no a cada CFDI: muchos CFDI de menos de $2,000 del mismo proveedor el mismo día son una señal de fraccionamiento (4.2).
- Comparar el efectivo retirado del banco contra el efectivo facturado (4.2).
- Combustible pagado en efectivo no es deducible (4.2).

**Anticipos y facturas duplicadas**

- El CFDI de anticipo se deduce al pagarse.
- La factura final debe relacionarse (tipo 07, forma 30) o netearse con nota de crédito. Si no, hay riesgo de deducir dos veces (4.1, 4.2, 4.4).
- Los pagos de "liquidación" cubren el saldo de la factura final después del anticipo (4.3).
- Al comprar un activo con anticipos, pedir los CFDI de egreso para no inflar su valor (4.6).

**Forma de pago**

- La forma de pago del CFDI debe coincidir con el medio real; si no, se pide sustitución (4.1).

**Folios y cancelados**

- Los cancelados no se suman.
- Un cancelado suele tener un sustituto con el mismo receptor y total, o con el mismo total ya con IVA (4.7).
- Los huecos en la secuencia de folios se reportan para confirmar si faltan en la descarga (4.4, 4.7).

**Diferencias de IVA en emitidos**

- La diferencia del día es (subtotal − descuento) × 16% − IVA. Si da cero, el día está bien (4.7).
- Una diferencia positiva indica una parte sin IVA (tasa 0%, exento o no objeto). Una diferencia negativa de centavos indica IEPS (4.7).
- Cuadre completo: diferencia = (base tasa 0% − IEPS) × 16% (4.7).
- Con XLS no se distingue tasa 0%, exento o no objeto; hace falta el XML (4.7).

**IEPS**

- Si el reporte no trae columna de IEPS, se obtiene con Total − (Subtotal − Descuento) − IVA + retenciones (4.7).
- El IVA se calcula sobre el precio más el IEPS (art. 18 LIVA) (4.7).
- El IEPS se detecta por factura, no por día: una tolerancia diaria de $1 lo ocultaría (4.7).

**Tasa 0%**

- Las bombas para riego agrícola van a tasa 0% (art. 2-A fr. I inciso e LIVA); una bomba de uso doméstico va al 16% (4.7).
- La palabra "bomba" sólo aparece en el concepto del CFDI, que el reporte de Doc Digitales no trae (4.7).
- Una base al 0% en SIIGO que no cuadra con los CFDI suele ser un folio no registrado (4.7).

**Ingresos**

- Un depósito sin factura sigue siendo ingreso; sin prueba en contrario, el SAT lo presume ingreso (art. 59 CFF) (4.2, 4.4).
- Un préstamo recibido debe respaldarse con contrato (4.4).
- Los cobros con terminal se reportan brutos; la comisión va aparte (4.2).

**Cuentas por cobrar**

- La referencia del abono es una pista: 35 de 438 traían folios equivocados (4.8).
- Prioridad de aplicación: folio exacto, rango con extremos, monto exacto, FIFO exacto o suma de facturas antiguas, y FIFO parcial marcado (4.8).
- Excluir renglones de totales y considerar saldos iniciales (4.8).
- Cada cliente debe cuadrar al centavo con el auxiliar; las diferencias de centavos se muestran como partida aparte (4.8).
- Facturas en $0.00 o canceladas no se reportan como pendientes (4.8).

**Documentos faltantes**

- Un CFDI con forma 04 apunta a una tarjeta de crédito: hace falta su estado de cuenta (4.1, 4.2).
- Un CFDI de un banco que no está entre los estados entregados revela una cuenta no entregada (4.1).
- Pagar IMSS, Infonavit e impuesto sobre nómina implica trabajadores: hacen falta los CFDI de nómina (4.2).
- EMA y EBA del IMSS son lo determinado; el pago se acredita con línea de captura o recibo (4.9).

**Impuestos del mes**

- El ISR provisional legal es acumulado de enero al mes, menos los pagos anteriores. El cálculo aislado del mes es sólo una estimación (4.2, 4.4).
- Las tarifas 2026 se actualizaron (Anexo 8 RMF, factor 1.1321) y deben estar versionadas por año (4.2).

## 6. Errores que cometimos durante las pruebas

Se registran todos los errores encontrados, de Claude y de los archivos manuales, con la validación que evitaría repetirlos.

| # | Caso | Qué error ocurrió | Cómo nos dimos cuenta | Cómo se corrigió | Validación que debe existir |
| --- | --- | --- | --- | --- | --- |
| 1 | 4.2 | Claude dejó como "sin CFDI" cuatro pagos al proveedor de vidrio 2 que eran liquidaciones de facturas "C" ($996.43 de IVA no acreditado) | Al cotejar contra el auxiliar del despacho (4.3) | Se acreditó el IVA de esos pagos | Antes de marcar "sin CFDI", buscar facturas abiertas del mismo proveedor y su saldo después de anticipos |
| 2 | 4.2 | Una tolerancia de $0.05 no relacionó un pago de $8,622.15 con su CFDI de $8,622.01 ($1,189.24 de IVA) | Mismo cotejo (4.3) | Se relacionó manualmente | Tolerancia mayor (hasta \~$1) cuando proveedor y fechas coinciden, marcada como "probable" |
| 3 | 4.2 | Se supuso que todo depósito traía 16% de IVA, a falta de CFDI emitidos | En septiembre aparecieron préstamos ($82,000) y cobros de un PPD dentro de los depósitos | Se recalculó con CFDI emitidos en 4.4 | No calcular IVA trasladado sin CFDI emitidos; si faltan, marcarlo como estimado |
| 4 | 4.2 y 4.4 | Gasolinas de igual importe ($479.80) asignadas al CFDI equivocado | Al revisar fechas antes de entregar | Asignación por fecha y hora | Con importes repetidos del mismo proveedor, ordenar por fecha y hora |
| 5 | 4.4 | La regla de "forma de pago incorrecta" sólo revisaba una tarjeta | Al revisar los conteos por estatus | Se generalizó a cualquier cargo con tarjeta | Probar cada regla con casos de las dos cuentas |
| 6 | 4.7 | Claude trató los CFDI sin IVA como posibles errores y sugirió sustituirlos | El despacho aclaró que eran bombas de riego a tasa 0% | Columna "TASA 0%" y estatus "por confirmar" | Un CFDI sin IVA se marca "por confirmar", nunca "error", hasta conocer el giro del cliente |
| 7 | 4.7 | Una tolerancia diaria de $1 habría ocultado las diferencias de centavos del IEPS | Con el segundo cliente (C) | El IEPS se calcula por factura | Detectar impuestos por factura, no por suma diaria |
| 8 | 4.7 | Claude reportó primero "7 facturas con IEPS"; eran 8 (una de $0.08) | La herramienta listó 8 | Se usa el conteo de la herramienta | No reportar conteos manuales: salen del listado generado |
| 9 | 4.7 | El ejemplo del despacho tenía una fila 142 con fórmulas propias que la 143 volvía a sumar ($539.66 duplicados) | Al reproducir su ejemplo | Se señaló al despacho; el archivo nuevo no lo permite | Fórmulas generadas sólo en el último CFDI de cada día |
| 10 | 4.8 | La primera lectura sumó los renglones "TOTALES CUENTA" y los saldos salían al doble | El saldo calculado no coincidía con el saldo del auxiliar | Se excluyeron esos renglones | Comparar siempre contra el saldo final del propio archivo |
| 11 | 4.8 | El primer cruce, sólo por referencia, dejaba diferencias grandes: un abono "5932-5941" de $195,832 no tenía facturas en ese rango | Mismo control | Prioridad por monto exacto, FIFO y sumas | La referencia es pista, no regla |
| 12 | 4.8 | Un abono de rango ("5499-5567") se tomó como abono parcial de la 5567 y dio saldos negativos en el Excel (−$142,869.58 y −$68,263.42) | La hoja de control mostró diferencias distintas de cero | Búsqueda exacta del folio y validación obligatoria | El archivo no se genera si un cliente no cuadra con el auxiliar |
| 13 | 4.8 | Un residuo de $0.29 quedó pegado a una factura como si estuviera abierta | Al revisar el detalle | Se muestra como "diferencia por conciliar" | Residuos menores a $1 en facturas grandes van como partida aparte |
| 14 | 4.6 | El ISR diferido se presentó de dos formas: \~$710,612 (86% × valor × 30%) y \~$624,540 (sólo lo que se adelanta frente a la depreciación normal) | Al preparar este documento | PENDIENTE DE VALIDAR cuál cifra usar con el cliente | Una sola definición de "beneficio" en todos los entregables |
| 15 | 4.6 | Se indicó un solo canal de envío (Economía); después apareció también la Ventanilla Única de Hacienda | Al investigar los plazos | PENDIENTE DE VALIDAR por llamada | En temas normativos, confirmar canal y vigencia antes de entregar |

**Lecciones generales.**

- Los errores de Claude salieron al cotejar contra trabajo humano, y los del trabajo humano al cotejar contra Claude. El cotejo cruzado es el mejor control que se ha probado.
- Cada entregable debe tener una hoja de control que dé cero.

## 7. Casos donde el contador tuvo que decidir

En todos estos casos la IA calculó o detectó, pero la decisión final es profesional. Estado: "Decidido" significa que el despacho respondió; "Abierto", que sigue pendiente.

| Caso | Qué detectó o calculó la IA | Qué tiene que decidir el contador | Estado |
| --- | --- | --- | --- |
| 4.2 | 47 CFDI en efectivo fraccionados ($78,952 de deducción, $12,632 de IVA) | Si se deducen, se rechazan o se revisan contra la lista 69-B | Abierto. El auxiliar los acreditó; Claude no |
| 4.2 | Depósito de $60,000 sin identificar | Si es ingreso | Decidido con datos de septiembre: era cobro de un cliente |
| 4.2 | Intereses del auto dentro de la mensualidad | Aplicar el límite del art. 36 LISR y la depreciación del vehículo | Abierto |
| 4.1, 4.2 | Gastos de viaje, ropa, gimnasio, Amazon y colegiatura | Personal o del negocio | Clasificados por Claude como no deducibles. PENDIENTE DE VALIDAR por el contador |
| 4.4 | $82,000 de "préstamos" | Si hay contrato o se acumulan como ingreso | Abierto |
| 4.4 | $129,710 cobrados sin CFDI | Emitir CFDI o factura global antes de declarar | Abierto |
| 4.5 | RESICO es lo más barato | Contratar por nómina por subordinación y riesgo | Recomendación entregada; decisión del cliente PENDIENTE |
| 4.6 | Beneficio de $2,368,706.90 en deducción | Elegibilidad, canal, firma, presentar o no | Abierto |
| 4.7 | 3 CFDI sin IVA (cliente B) | Si son bombas de riego a tasa 0% | Parcial: 9856 y 9897 ya registrados al 0% en SIIGO; el 9779 está abierto |
| 4.7 | 2 CFDI mixtos con parte sin IVA (cliente C) | Si la parte es tasa 0% válida | Abierto |
| 4.7 | Excluir cancelados de las sumas | Si se confirma el criterio | Implícito: el despacho confirmó "3 días con detalles" |
| 4.8 | Diferencias de $0.29 y $0.20 | Dejarlas visibles o ajustarlas | Abierto |
| 4.8 | Partidas de 2025 tomadas del reporte de junio | Si siguen abiertas | Abierto |
| 4.9 | Julio 2025 completo vs prorrateo desde el día 3 | Qué criterio usar | Abierto: dejado al cliente |

## 8. Archivos y ejemplos utilizados

Todos los archivos fueron reales, tal como salen de los sistemas.

| Tipo | Formato | Casos | Particularidades encontradas |
| --- | --- | --- | --- |
| Movimientos BBVA, cuenta PYME y cuenta personal | XLS | 4.1, 4.4 | Encabezado en la fila 6. En 4.1 traía la columna "SI HAY FACTURA" marcada a mano |
| Estados de cuenta BBVA | PDF (14 y 7 páginas) | 4.2 | La columna de cargo o abono se distingue por posición. Al final viene el CFDI de comisiones del mes |
| Estado de tarjeta de crédito BBVA | PDF | 4.2 | Corte el día 15. Incluye pagos con desglose de interés, IVA y capital |
| Export de movimientos de la tarjeta | XLS | 4.4 | Sólo traía 3 movimientos: insuficiente |
| CFDI recibidos, reporte del SAT | XLS | 4.1, 4.2 | Un renglón por concepto: hay que agrupar por CFDI. Trae descripción del producto |
| CFDI recibidos y emitidos, Doc Digitales | XLSX | 4.4, 4.7 | Un renglón por CFDI. Sin descripción del producto ni columna de IEPS. Trae estatus Activo o Cancelado |
| CFDI individual | PDF | 4.6 | Factura de un tractocamión con complemento de venta de vehículos y relación tipo 07 |
| Auxiliar de IVA (cuenta 1108) | XLSX | 4.3 | Tres subcuentas; saldo inicial anómalo en una |
| Auxiliar de clientes (cuenta 1103) | XLSX | 4.8 | Renglones de totales por cuenta, saldos iniciales y abonos con referencias informales |
| Ejemplos hechos a mano por el despacho | XLSX y XLS antiguo | 4.7, 4.8 | Sirvieron de referencia de formato y de prueba: se reprodujeron y se les encontraron errores |
| Datos de SIIGO | Hoja dentro del ejemplo | 4.7 | Bases al 16% y al 0% del mes, para cotejo |
| Instrucciones del contador | Word y WhatsApp | 4.7, 4.8 | Columnas por letra, nombre de archivo con fecha. Algunos mensajes requirieron "traducción" |
| Emisiones IMSS (EMA y EBA) | XLS, 12 archivos | 4.9 | Hojas "Emisión" y "Movimientos". El bimestre se emite en meses pares |
| Catálogo de pruebas del despacho | XLSX | General | Lista de los casos 1 a 5 |

**Lo que aprendimos de los archivos.**

- Los mismos datos llegan en formatos distintos según el sistema: SAT, Doc Digitales, BBVA en XLS o PDF.
- Las columnas se mueven entre clientes. Se localizan por nombre de encabezado, no por letra.
- El XML del CFDI no se usó en ninguna prueba. Habría resuelto tasa 0%, exento, no objeto, IEPS y conceptos (PENDIENTE DE PROBAR).

## 9. Qué hemos demostrado hasta ahora

Se consideró PROBADO sólo lo que tuvo evidencia real: cuadró contra el propio archivo, contra un trabajo manual o fue confirmado por el despacho.

| Capacidad | Estado | Evidencia |
| --- | --- | --- |
| Leer XLS y PDF bancarios y cuadrar contra sus totales | PROBADO | Agosto: 122 cargos y 31 abonos idénticos al banco (4.2) |
| Cruzar salidas bancarias contra CFDI recibidos | PROBADO | 101 y 140 salidas clasificadas por estatus (4.1, 4.4) |
| Cotejar un auxiliar contable renglón por renglón y explicar cada diferencia | PROBADO | $21,822.90 explicados al centavo (4.3) |
| Reproducir exactamente el método manual del contador | PROBADO | 16 días idénticos al ejemplo del caso 6 (4.7) |
| Revisión de IVA de emitidos con tasa 0% e IEPS | PROBADO | 2 clientes; el despacho confirmó "3 días con detalles" (4.7) |
| Herramienta que ejecuta el caso 6 sin intervención de Claude | PROBADO | Excel generado y validado con los dos clientes (4.7) |
| Cuentas por cobrar cuadradas contra el auxiliar | PROBADO | 18 clientes con diferencia cero (4.8) |
| Encontrar errores en trabajo manual | PROBADO | Fila duplicada del ejemplo, 20 centavos del reporte de junio, errores de corte del auxiliar (4.3, 4.7, 4.8) |
| Detectar anomalías fiscales (efectivo fraccionado, anticipos duplicados, PPD sin REP, formas de pago) | PROBADO | Casos 4.1 y 4.2 |
| Cálculo de IVA del mes | EN PRUEBA | Hecho en agosto y septiembre; falta validar contra una declaración presentada |
| Cálculo de ISR provisional | EN PRUEBA | Sólo aislado del mes; el acumulado legal no se ha probado |
| Calculadora de esquemas de contratación | EN PRUEBA | Un caso; cuotas IMSS estimadas |
| Expediente de Plan México | EN PRUEBA | Documentos entregados; sin respuesta de la autoridad |
| Resumen de cuotas IMSS por trabajador | EN PRUEBA | Un caso |
| Lectura de XML de CFDI | IDEA FUTURA | No probado |
| Etapa 2 para personas y negocios pequeños | IDEA FUTURA | Sólo planteada |
