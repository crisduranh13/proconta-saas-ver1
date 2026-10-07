# Servicio 1 — Contrato técnico verificable

**Estado:** contrato de diseño aprobado con los ajustes de arquitectura V1. **Alcance del primer flujo completo:** salidas de cuentas bancarias contra CFDI recibidos. No es código, esquema SQL ni criterio fiscal aprobado.

## Evidencia, límites y convenciones

- Fuentes principales: `ProConta_Pruebas.md` casos **4.1, 4.3 y 4.4**, sección 5 (reglas aprendidas), sección 6 (errores 1, 2, 4 y 5) y sección 8 (formatos); `ProConta.md` apartados “Conciliación SALIDAS”, “Cómo se concilia una salida del banco” y “Entregables”; `ProConta_Plan_Construccion_IA.md` apartados 3, 5–7 y 13–15.
- Los resultados de 4.1 y 4.4 son **referencias históricas**, obtenidas fuera de esta aplicación. El repositorio contiene la descripción de las pruebas, pero no los archivos contables originales ni un conjunto de fixtures anonimizados. Los agregados históricos no son por sí solos tests ejecutables. Ningún ejemplo inventado abajo se presenta como dato real.
- “Periodo” significa el periodo de **la salida bancaria** que se concilia. Un CFDI puede haber sido emitido en otro periodo; esa situación se conserva y se señala, sin cambiar la fecha ni el periodo del movimiento.
- “Importe” se expresa en MXN con centavos exactos. Se compara con aritmética decimal; una tolerancia produce una **diferencia explícita**, nunca un ajuste escondido. “Alta/media/baja” describen la fuerza de la evidencia del cruce, no una probabilidad estadística ni una conclusión fiscal.
- Cada decisión de diseño que no se desprende inequívocamente de las pruebas se identifica como **propuesta** o **pregunta abierta**. Los identificadores de reglas y casos de este documento son claves de especificación; aún no son reglas implementadas.

## 1. Objetivo

Responder, **por cada salida** de las cuentas bancarias entregadas de un cliente y un periodo: qué CFDI recibido la respalda, qué parte del importe queda cubierta, qué evidencia sostiene el cruce y qué falta revisar. También distinguir las salidas que no requieren CFDI por su naturaleza confirmada. El contador revisa los cruces ambiguos, la naturaleza del gasto y los hallazgos fiscales; ProConta registra su decisión.

El Servicio 1 **no** calcula IVA/ISR del mes, no determina por sí solo deducibilidad o acreditamiento, no presenta declaraciones y no se conecta al banco ni al SAT. La factura encontrada no equivale a gasto fiscalmente válido. Su salida técnica es una clasificación reproducible de las salidas, asignaciones movimiento↔CFDI, diferencias y hallazgos trazables. [Evidencia: 4.1, 4.3, 4.4; `ProConta.md`, Servicio 1.]

## 2. Entradas iniciales

Los archivos los descarga y entrega una persona. Un perfil de lectura se identifica por **origen y layout**, no solo por extensión. Un formato no reconocido se rechaza con motivo; no se adivinan columnas por posición fija. Los archivos originales se conservan sin modificación cuando se implemente el flujo. El **primer flujo completo** usa movimientos de cuentas bancarias y CFDI recibidos; las compras de tarjeta quedan para una ampliación, aunque el modelo conserva los campos necesarios.

| Entrada | Origen y formatos iniciales | Datos mínimos para el Servicio 1 | Validaciones específicas | Rechazo o bloqueo |
| --- | --- | --- | --- | --- |
| Movimientos de cuenta BBVA PYME/personal | Export BBVA **XLS** probado en 4.1 y 4.4; estado de cuenta BBVA **PDF** probado en agosto y cotejado en 4.2. Una variante XLSX requerirá perfil y fixture propios antes de admitirse como equivalente. | Cuenta, titular identificable, fecha de operación, descripción, cargo/abono, importe y fecha de corte; RFC en descripción y CLABE destino si el layout los aporta; totales del propio archivo. | Detectar hoja/páginas y encabezado por nombre (en un XLS hubo encabezado en fila 6), separar cargos de abonos, excluir totales de filas operativas, comprobar conteos e importes de control del banco. No tomar la columna manual “SI HAY FACTURA” como verdad. | Archivo corrupto o no legible; layout/columnas críticas desconocidos; cuenta o titular no atribuibles al cliente; periodo/corte ambiguos; importes inválidos; totales que no cuadran. Si no hay control verificable, queda sin aceptar para una corrida final. |
| Reporte de CFDI **recibidos** SAT | **XLS** probado en 4.1/4.2; puede tener un renglón por concepto. | Emisor y receptor, identidad del comprobante (preferentemente UUID), fecha de emisión, total, estado, método y forma de pago cuando consten; importes por concepto para agrupar. | Agrupar renglones del mismo CFDI sin duplicar su total; verificar receptor y periodo de extracción; identificar cancelados, duplicados y totales de control disponibles. | Reporte ilegible; receptor ajeno no explicado; faltan campos para distinguir comprobantes o reconstruir sus importes; conteos o importes no cuadran con controles equivalentes del propio reporte. No equiparar la suma de conceptos con el total del CFDI sin considerar impuestos y descuentos. Una fila incompleta se aparta y bloquea su uso automático. |
| Reporte de CFDI **recibidos** Doc Digitales | **XLSX** probado en 4.4; un renglón por CFDI. | Emisor, receptor, UUID/identificador, fecha, total, método, forma de pago y estatus Activo/Cancelado. Relaciones, REP y anticipos si el reporte los expone. | Identificar columnas por encabezado; evitar UUID repetidos; comprobar receptor, estatus, periodo y totales de control disponibles. | Archivo/layout ilegible; receptor ajeno; identidad o importe crítico ausente; totales inconsistentes. Si el reporte no trae relaciones/REP, se conserva esa limitación y no se infiere que el documento no existe. |
| Compras de tarjeta de crédito: **ampliación posterior, fuera del primer flujo completo** | PDF de tarjeta probado en 4.2; export BBVA XLS de 4.4 llegó con solo **3 movimientos** y fue insuficiente. | Cuando se amplíe: identidad de tarjeta/cuenta, rango y fecha de corte, cargos por compra, fecha, comercio, importe y totales del estado. | Al ampliar, probar cobertura del rango, separar compras, intereses, comisiones y pago de tarjeta; cuadrar controles. | Un export parcial no habilita conciliación de compras. Su ausencia **no bloquea** el entregable final de cuentas bancarias si esas compras están declaradas fuera de alcance. Si una corrida futura las incluye, un archivo crítico no verificable sí la bloquea. |

**Fuera de la entrada inicial de matching:** CFDI emitidos, auxiliares SIIGO, XML/ZIP de CFDI, CFDI PDF individuales y conectores directos. Los emitidos y auxiliares pertenecen a otros servicios; el XML es una ampliación futura señalada como no probada en `ProConta_Pruebas.md` §8–9. Un REP, nota de crédito o relación de anticipo solo puede validarse de forma concluyente si el conjunto de archivos aporta esos datos; su ausencia en un reporte limitado se describe como “no localizado en la evidencia recibida”.

**Conjunto de corrida:** cliente, periodo objetivo, cuentas incluidas, archivos/versiones concretos y sus cortes. La salida de una cuenta al 26/09 y otra al 28/09 produce una corrida de **precierre**; no representa por sí sola el mes completo. La siguiente corrida al cierre conserva el vínculo con la anterior y vuelve a evaluar pendientes. [Evidencia: 4.4.]

## 3. Modelo canónico mínimo (conceptual, sin SQL)

**Tipos:** `ID` = identificador estable; `texto`; `fecha`; `fecha_hora` (hora y zona/origen cuando estén disponibles); `decimal` = importe exacto a centavos; `enum` = valor de catálogo; `booleano`; `lista`. **Obligación:** `Sí`, `No` u `Si consta` (obligatorio registrar el valor cuando la fuente lo proporciona, sin inventarlo si no existe). Todo dato extraído conserva su valor original además de la versión normalizada cuando haya transformación. Los campos `archivo_origen` y `ubicacion_origen` son referencias conceptuales, no rutas públicas.

### Movimiento bancario

| Campo | Tipo | Obligación | Origen | Propósito |
| --- | --- | --- | --- | --- |
| `movimiento_id` | ID | Sí | Asignado al normalizar | Identidad del renglón sin depender de su posición visual. |
| `cliente_id`, `cuenta_bancaria_id` | ID | Sí | Contexto de carga + cuenta identificada | Impedir mezcla de clientes y cuentas. |
| `archivo_origen`, `ubicacion_origen` | ID, texto | Sí | Archivo + hoja/renglón o página/posición | Volver a la evidencia exacta. |
| `fecha_operacion` | fecha | Sí | Banco | Periodo de la salida y búsqueda temporal. |
| `fecha_hora_autorizacion` | fecha_hora | No | Banco, si aparece | Desempatar cargos iguales; no fabricar horas. |
| `descripcion_original` | texto | Sí | Banco | Evidencia íntegra y extracción de pistas. |
| `tipo_movimiento` | enum `cargo/abono` | Sí | Columna/posición bancaria | Mantener ambos tipos para cuadrar; solo cargos entran al matching del Servicio 1. |
| `importe` | decimal positivo | Sí | Banco | Importe observado, nunca alterado para forzar cruce. |
| `moneda` | enum/texto | Sí | Banco o perfil explícito | Evitar comparar monedas distintas. |
| `referencia_bancaria` | texto | No | Banco | Pista auxiliar, nunca prueba única. |
| `medio_pago` | enum/texto | Si consta | Banco/perfil confirmado | Distinguir tarjeta, SPEI, efectivo u otro para la comprobación posterior. |
| `rfc_en_descripcion` | texto | No | Extracción de la descripción | Identificar comercio en cargos con tarjeta; preservar texto original. |
| `cuenta_destino_id` | ID | No | CLABE/cuenta destino en SPEI | Consultar catálogo cliente → proveedor. |
| `marca_manual_factura` | texto | No | Columna manual, si existe | Pista humana auditable; no reemplaza la búsqueda de CFDI. |

### CFDI recibido

| Campo | Tipo | Obligación | Origen | Propósito |
| --- | --- | --- | --- | --- |
| `cfdi_id` | ID | Sí | Asignado al normalizar | Identidad interna de un comprobante agrupado. |
| `archivo_origen`, `ubicaciones_origen` | ID, lista de texto | Sí | Reporte + renglones/hoja | Rastrear una o varias filas de concepto al mismo CFDI. |
| `uuid` | texto | Si consta; requerido para uso automático si el layout declara esa columna | SAT/Doc Digitales | Detección de duplicados y relaciones. Si falta, no crear un UUID ficticio ni aprobar automáticamente la identidad del CFDI. |
| `serie_folio` | texto | No | Reporte | Referencia humana; no sustituye al UUID. |
| `rfc_emisor`, `rfc_receptor` | texto | Sí | Reporte | Identificar proveedor y comprobar cliente receptor. |
| `fecha_emision` | fecha_hora o fecha | Sí | Reporte | Ventana temporal; conservar precisión realmente disponible. |
| `total` | decimal | Sí | Reporte, una vez por CFDI | Importe de comparación sin duplicar conceptos. |
| `subtotal`, `iva` | decimal | Si consta | Reporte | Evidencia y revisión posterior; no calcular impuestos en Servicio 1. |
| `moneda` | enum/texto | Sí | Reporte o perfil explícito | Comparabilidad del total. |
| `metodo_pago` | enum/texto | Si consta | Reporte | Identificar PPD y necesidad de revisar REP. |
| `forma_pago` | enum/texto | Si consta | Reporte | Comparar con medio real después del match. |
| `estatus` | enum/texto | Sí | Reporte | No usar cancelados como comprobante vigente. |
| `tipo_comprobante` | enum/texto | Si consta | Reporte | Distinguir ingreso, egreso, pago/REP u otro si la fuente lo permite. |
| `es_anticipo` | booleano/indeterminado | No | Relación/concepto, si existe | Buscar factura final y saldo sin duplicar cobertura. |

### Proveedor

| Campo | Tipo | Obligación | Origen | Propósito |
| --- | --- | --- | --- | --- |
| `proveedor_id`, `cliente_id` | ID | Sí | Catálogo del cliente | Identidad y alcance del proveedor. |
| `rfc` | texto | Sí para asociación automática | CFDI/catálogo confirmado | Clave más fuerte para reunir sus CFDI. |
| `nombre_original`, `alias_confirmados` | texto, lista | No | CFDI/catálogo/contador | Ayudar a mostrar y buscar; el nombre por sí solo no confirma un cruce. |
| `vigencia_catalogo` | intervalo de fechas | No | Alta/confirmación del contador | Evitar aplicar retroactivamente una asociación que cambió. |

### Cuenta bancaria de origen

| Campo | Tipo | Obligación | Origen | Propósito |
| --- | --- | --- | --- | --- |
| `cuenta_bancaria_id`, `cliente_id` | ID | Sí | Registro del cliente | Alcance de movimientos y traspasos propios. |
| `institucion`, `identificador_enmascarado` | texto | Sí | Estado/export + confirmación | Distinguir PYME y personal sin exhibir cuenta completa. |
| `titular`, `rfc_titular` | texto | `titular`: Sí; `rfc_titular`: Si consta | Estado/export o registro confirmado | Validación de pertenencia/uso autorizado. |
| `tipo_cuenta` | enum/texto | No | Registro confirmado | Cuenta corriente, personal, tarjeta u otra. |
| `autorizada_para_cliente` | booleano/indeterminado | Sí | Confirmación del despacho | Las cuentas personales del caso A no se asumen propias solo por el nombre. |

### Cuenta destino / CLABE y asociación a proveedor

| Campo | Tipo | Obligación | Origen | Propósito |
| --- | --- | --- | --- | --- |
| `cuenta_destino_id`, `cliente_id` | ID | Sí | Movimiento + catálogo del cliente | Alcance de la asociación. |
| `clabe_o_cuenta` | texto | Sí si se usa para matching | SPEI | Identificar destino sin confiar en el nombre de la transferencia. |
| `proveedor_id`, `rfc_asociado` | ID, texto | Sí para asociación automática | Catálogo confirmado | Llevar la cuenta destino al emisor del CFDI. |
| `evidencia_asociacion`, `confirmada_por`, `vigente_desde` | texto, texto, fecha | Sí para asociación automática | Decisión previa del contador/catálogo | Saber quién validó la asociación y desde cuándo. |

### Relación entre documentos

Una relación no es automáticamente un cruce bancario. Puede indicar anticipo↔factura final, nota de crédito↔factura, CFDI↔REP o sustitución. El modelo permite conservar relaciones aportadas por archivos y relaciones inferidas por el motor **sin confundirlas**.

| Campo | Tipo | Obligación | Origen | Propósito |
| --- | --- | --- | --- | --- |
| `relacion_id`, `cfdi_origen_id` | ID | Sí | Normalización/propuesta | Identificar la relación y el documento conocido. |
| `cfdi_destino_id` | ID | No | Documento relacionado, si se localiza | Identificar el segundo documento; puede quedar pendiente sin inventarlo. |
| `tipo_relacion` | enum/texto | Sí | Dato del CFDI o propuesta documentada | Anticipo, aplicación, egreso/nota de crédito, REP, sustitución. |
| `importe_relacionado` | decimal | Si consta | Documento o asignación confirmada | Calcular saldo abierto sin contar dos veces. |
| `origen_relacion` | enum `archivo/regla/contador` | Sí | Evidencia | Distinguir hecho documental de inferencia. |
| `evidencia`, `estado_confirmacion` | texto, enum | Sí | Archivo/regla/decisión | Impedir que una hipótesis se use como relación confirmada. |

**Estructuras asociadas mínimas:** `Archivo` (origen, perfil, huella, titular, periodo, corte, totales y estado), `Corrida` (archivos exactos, cortes y versiones de regla), `CandidatoCruce` y `AsignacionCruce` (movimiento, CFDI, importe aplicado y evidencia), `Hallazgo`, `Decision` y `Control`. En un cruce uno-a-varios o varios-a-uno se requieren **asignaciones con importe**, no un único `cfdi_id` dentro del movimiento. El detalle conceptual de estas estructuras se fija en §§6 y 9–11; el diseño físico vendrá después.

## 4. Validación y decisión de procesar

1. **Archivo recibido.** Registrar origen declarado, cliente, cuenta/periodo esperado e identidad del binario; conservar el original.
2. **Identificación.** Reconocer formato real y perfil de origen; un `.xls` renombrado no se trata como otro formato. Identificar hojas o páginas relevantes.
3. **Lectura.** Extraer datos y localizadores; conservar valores crudos. Registrar filas que no se pueden interpretar, sin omitirlas silenciosamente.
4. **Validación estructural.** Ubicar encabezados por significado, no letra; comprobar columnas mínimas y tipos; agrupar conceptos SAT por CFDI; separar movimientos de filas de totales, encabezados repetidos y notas.
5. **Titular/RFC.** Confirmar cuenta de origen y titular contra cliente/cuenta autorizada. En CFDI, confirmar que el receptor corresponde al cliente. Una cuenta personal usada por el cliente requiere autorización explícita, no una suposición.
6. **Periodo.** Determinar rango cubierto por cada archivo y registrar CFDI de otros periodos sin descartarlos automáticamente. Un archivo de otro cliente o periodo no declarado se rechaza para esta corrida; una factura emitida en otro periodo puede ser candidata válida o hallazgo.
7. **Corte.** Guardar la fecha de corte real por cuenta. Un corte parcial permite precierre, pero no se rotula como mes completo. La cobertura de compras de tarjeta solo se valida cuando una corrida posterior las incluya expresamente.
8. **Totales.** Reconciliar cargos, abonos y conteos leídos con los controles presentes en el estado/export. Para CFDI, cuadrar únicamente sumas y conteos **comparables** que el reporte realmente declara y evitar multiplicar el total por conceptos; los conceptos no tienen por qué sumar el total con impuestos y descuentos. Ejemplo histórico de PDF de agosto: 122 cargos por **$333,204.28** y 31 abonos por **$342,020.40**, iguales al estado (4.2). No usar ese valor como constante de validación de otros archivos.
9. **Aceptar o rechazar.** Aceptar solo cuando identidad, estructura, cobertura y controles requeridos son verificables; guardar motivo preciso en caso contrario. La aceptación del archivo no implica que cada movimiento tenga CFDI.

**No procesar un archivo** si es corrupto, tiene un layout no soportado, pierde filas o importes, no permite identificar cliente/cuenta/receptor, presenta totales discrepantes o mezcla periodos sin separar sus rangos. Un control de totales ausente deja un archivo **crítico de la corrida** no verificable hasta obtener otro control documental aprobado por el contador; no se inventa el total. Una fila ambigua se aísla: no entra a matches automáticos ni se borra del control de cobertura. Un archivo de tarjeta con solo tres compras, como en 4.4, no permite declarar completo ese origen, pero no bloquea la conciliación final **limitada a cuentas bancarias**.

**Pregunta abierta:** qué evidencia externa concreta podrá sustituir un total ausente en un export bancario. La decisión y el documento usado deberán quedar registrados antes de aceptar ese perfil.

## 5. Estados independientes: cruce, revisión y corrida

Cada salida tiene **un `match_status`** que responde cuánto y con qué documento se cruzó, y **un `review_status`** que responde si hay hallazgos o decisiones. La corrida tiene **un `run_status`** diferente. Un hallazgo de PPD no deshace un match; una decisión humana no altera el archivo original. Una sugerencia sin aceptar no consume saldo de un CFDI.

### `match_status` por salida

| Valor | Condición | Evidencia mínima | Ejemplo histórico |
| --- | --- | --- | --- |
| `matched` | Cobertura documental completa y asignación inequívoca a uno o varios CFDI vigentes o al saldo comprobado tras anticipos. Puede existir diferencia permitida de $0.01–$0.05, siempre visible como finding. | Movimiento, CFDI(s), importes aplicados en ambos lados, proveedor, regla y fuentes. | 33 salidas “Conciliado” y 7 “Con observación” en la presentación de 4.1 podrían compartir este valor; el agregado histórico por sí solo no prueba la equivalencia fila por fila. |
| `partial` | Solo parte de la salida tiene asignación documental confirmada; remanente explícito no negativo. | Importe de salida, asignaciones y remanente. | Mensualidad del auto **$6,525.26** con CFDI de **$2,797.24** en 4.1. |
| `unmatched` | No hay CFDI utilizable después de buscar candidato directo, combinaciones y saldo tras anticipos en los archivos aceptados. Significa “no localizado en el conjunto aportado”. | Movimiento, fuentes/cortes buscados y descartes. | 38 salidas en 4.1 y 44 en 4.4; SPEI **$34,786.61** sin CFDI en 4.1. |
| `probable` | Existe uno o más candidatos sin prueba suficiente para asignación definitiva, incluso diferencia $0.06–$1.00 o candidato extraordinario fuera de ventana. La clasificación `not_required` no confirmada también espera revisión sin consumar match. | Candidatos, señales a favor/en contra, diferencia, pregunta al contador. | **$8,622.15** contra **$8,622.01**, diferencia **$0.14**, confirmado manualmente en 4.3. |
| `not_required` | Flujo confirmado que no busca CFDI de gasto en esta conciliación: traspaso propio, retiro, pago de tarjeta o préstamo identificado. | Motivo y cuenta/contraparte o confirmación humana. | 22 salidas en 4.1; 35 en 4.4. |

### `review_status` por salida

| Valor | Significado y regla de precedencia |
| --- | --- |
| `clear` | No hay findings asociados ni decisión pendiente. |
| `has_findings` | Existe uno o más findings abiertos que deben mostrarse, pero todavía no exigen resolver un candidato o criterio para registrar el resultado; por ejemplo, CFDI faltante que se comunicará al cliente o diferencia permitida de $0.03. |
| `requires_decision` | Al menos un candidato, clasificación o criterio necesita acción del contador; prevalece sobre `has_findings`. |
| `resolved` | Hubo findings o decisiones y todos los que exigían respuesta quedaron resueltos; la historia sigue visible. Un hallazgo que simplemente se deja como pendiente documental no pasa a `resolved` por generar Excel. |

El estado de revisión es una proyección de findings y decisiones **para una versión del resultado**; no reemplaza los estados individuales de cada finding. La UI puede mostrar “Conciliado con observación” para `match_status = matched` + `review_status = has_findings` o `requires_decision`; puede mostrar “Parcial con observación” para `partial` + `has_findings`. Las etiquetas históricas de 4.1/4.4 son de presentación y no se usarán como valores persistentes ni se traducirán mecánicamente a estos ejes.

### `run_status` por corrida

| Valor | Condición y posibilidad de entregable |
| --- | --- |
| `preclose` | Cortes bancarios anteriores al cierre completo del periodo o cobertura declarada parcial. Puede producir borrador identificado por corte; nunca se representa como cierre completo. |
| `final_with_pending` | Todos los archivos **críticos dentro del alcance declarado** son verificables, todos los cargos tienen `match_status`, controles de integridad = 0 y el periodo tiene `unmatched`, `partial`, `probable` o findings abiertos. Puede generar y liberar Excel final **con pendientes explícitos**. |
| `final` | Cobertura completa y controles = 0, sin pendientes abiertos en el alcance declarado. Puede generar y liberar Excel final. |
| `blocked` | Fallo de integridad: control ≠ 0, movimientos omitidos/duplicados/sin estado, asignaciones inconsistentes, archivo crítico no verificable o totales fuente ≠ leídos. **No** se libera entregable final. |

`run_status` no es el estado de ejecución de un job (`pending`, `processing`, `waiting_review`, `completed`, `failed`); este último describe trabajo técnico. Una corrida `final_with_pending` puede tener un job de generación `completed`. La precedencia es `blocked` ante cualquier fallo de integridad; si no, `preclose` ante corte incompleto; si el corte está completo, `final_with_pending` cuando quedan pendientes y `final` cuando no quedan. Los cortes y el alcance se declaran antes de evaluar pendientes.

## 6. Motor de matching: orden y precedencia

El motor busca **candidatos** y construye **asignaciones**; la revisión fiscal del §7 ocurre después. Cada regla registra versión, entradas, descartes y resultado. Orden propuesto con base en 4.1, 4.3 y 4.4:

| Orden | Regla | Condición verificable y salida |
| --- | --- | --- |
| M0 | Elegibilidad | Solo cargos de cuentas aceptadas. Excluir abonos del matching del Servicio 1, CFDI cancelados y monedas incompatibles. No usar un CFDI o importe ya asignado por encima de su saldo disponible. `not_required` se evalúa antes de buscar CFDI, pero **solo se aplica** si está confirmado. |
| M1 | Identidad del proveedor | Cargo con tarjeta: extraer RFC de la descripción BBVA y compararlo con RFC emisor. SPEI: usar CLABE/cuenta destino asociada a RFC en el catálogo **del cliente** y vigente. Si solo coincide un nombre o referencia libre, es pista y no autorización de match definitivo. |
| M2 | Candidatos por fecha e importe exacto | Buscar CFDI del proveedor con fecha de emisión entre **−3 y +25 días**, ambos límites incluidos, respecto de la operación bancaria; esta es la **ventana general inicial de búsqueda**, no una prueba de corrección. Priorizar diferencia **$0.00** y registrar distancia de fecha. El “±25” resumido en 4.4 no es regla universal. |
| M3 | Desempate | Entre pagos iguales del mismo proveedor —gasolina de **$479.80** en el error histórico 4— usar secuencia de fechas y hora de autorización frente a fecha/hora de emisión. Si faltan horas o persisten candidatos indistinguibles, devolver `probable`; no asignar por orden arbitrario de filas. |
| M4 | Composición exacta | Antes de aceptar un cruce aproximado, buscar varios CFDI del **mismo proveedor** cuya suma cubra exactamente un cargo; permitir varios cargos asignados, por importes explícitos, a un mismo CFDI sin exceder saldo. Una combinación matemática sola no basta si hay alternativas plausibles; en ese caso `probable`. |
| M5 | Diferencia estricta permitida | Diferencia absoluta **$0.01–$0.05**, identidad de proveedor y fechas inequívocas: `matched`, diferencia visible y finding obligatorio. Nunca modificar importes. Si hay varios candidatos, M3 o `probable`. |
| M6 | Anticipos y saldo abierto | Antes de `unmatched`, localizar factura final y anticipos/notas relacionadas del proveedor; calcular **saldo documental pendiente** sin volver a contar el anticipo. Una liquidación puede cubrir ese saldo. Si la relación o el saldo no se pueden probar, devolver `probable` o `partial`, con finding de soporte. Esto corrige los cuatro pagos omitidos del error histórico 1. |
| M7 | Tolerancia ampliada | Diferencia absoluta **$0.06–$1.00**, solo con identidad y fechas sólidas: `probable` y decisión humana; nunca ajustar el importe. **$8,622.15** contra **$8,622.01** produce diferencia **$0.14** y no `unmatched` automático. Con diferencia **mayor a $1.00**, no crear match automático basado únicamente en importe. |
| M8 | Periodos y excepción temporal | Buscar pendientes de periodos adyacentes dentro de la ventana general y etiquetar ambos periodos. Si aparece **evidencia excepcional fuerte fuera de −3/+25**, crear solo candidato extraordinario `probable` con revisión humana; registrar exactamente qué evidencia justificó salir de la ventana. Nunca trasladar automáticamente efectos fiscales. |
| M9 | Sin candidato | Solo después de M1–M8 y de documentar fuentes/cobertura, clasificar `unmatched`. Si el reporte de CFDI crítico está incompleto o no es verificable, la corrida queda `blocked`; los documentos fuera del alcance declarado no bloquean por sí solos. |

**Restricciones comunes:** comparar valores decimales en centavos; no asignar el mismo importe de CFDI dos veces; no usar un CFDI cancelado como respaldo vigente; conservar alternativas descartadas cuando influyan en una decisión; no usar porcentajes de “confianza” inventados. La ventana solo genera candidatos. Si importe, proveedor o estado son inciertos, no hay match confirmado. La decisión del contador tiene alcance explícito y no crea una regla global automática.

## 7. Revisión fiscal posterior al match

**Matching** contesta “¿qué documento podría respaldar esta salida y por cuánto?”. **Validación fiscal** señala “¿qué condición del documento o del pago requiere criterio?”. Esta segunda etapa no modifica retrospectivamente el importe bancario ni declara deducibilidad o IVA acreditable. Esos cálculos son de servicios posteriores.

| Hallazgo posterior | Comprobación documentada | Resultado del Servicio 1 |
| --- | --- | --- |
| PPD sin REP | CFDI marcado PPD y REP **no localizado entre los documentos disponibles**. | Mantener `matched` si existe; crear finding y `review_status = requires_decision` cuando haya criterio que resolver. Casos Würth, Telmex, Telcel en 4.1; Telcel con abono de $10,000 en 4.4. |
| Forma de pago distinta | Comparar `forma_pago` del CFDI contra medio bancario **en todos los cargos con tarjeta que figuren en las cuentas bancarias aceptadas**, no solo una cuenta. | Mantener el match; crear finding con evidencia de ambos valores y revisión del contador. Error histórico 5. No implica implementar parsing de compras del estado de tarjeta en el primer flujo. |
| Anticipo posiblemente duplicado | CFDI de anticipo y factura final del mismo proveedor/operación sin relación o nota que justifique el neteo. | Hallazgo de riesgo y revisión; no acreditar dos veces el mismo importe. Ejemplo $1,052.53 / $1,052.54 de 4.1; notas forma 30 en 4.4. |
| CFDI de otro periodo | Fecha de CFDI fuera del periodo del cargo; por ejemplo, comisiones de agosto recibidas en septiembre o documento del 31 pagado el 1. | Mantener fechas, señalar corte/periodo y pedir revisión cuando corresponda; no aplicar automáticamente un tratamiento fiscal. |
| Gasto personal o del negocio | Descripción/CFDI sugieren viaje, ropa, gimnasio, Amazon o colegiatura. | Hallazgo y decisión humana. La clasificación previa de Claude quedó **pendiente de validar** (§7 de Pruebas). |

La ausencia de un campo en un XLS no prueba que una relación, nota o REP no exista. Si el origen no permite decidir, se registra “evidencia insuficiente” y se solicita documento o confirmación. No se añaden aquí reglas de IVA/ISR ni se promueve una sugerencia de IA a verdad fiscal.

## 8. Salidas que no requieren CFDI en esta conciliación

| Tipo observado | Detección posible | Confirmación necesaria y límite |
| --- | --- | --- |
| Traspaso entre cuentas propias | Coincidencia de cuenta origen/destino **ambas** registradas para el cliente, fecha e importe. | Si falta una cuenta, titular o contraparte, queda como propuesta. Evitar contar el cargo como gasto y el abono como ingreso del Servicio 1. |
| Retiro de efectivo | Código/descripción bancaria de retiro. | Puede etiquetarse automáticamente como **retiro**, pero su finalidad necesita revisión si se pretende clasificar el destino del efectivo. La marca manual “con factura” de un retiro de $5,009.08 en 4.1 no prueba un CFDI relacionado. |
| Pago de tarjeta de crédito | Cuenta destino confirmada como tarjeta del cliente; cargo bancario identificado como pago del estado. | No conciliar el **pago de la tarjeta** contra cada CFDI de compra, para evitar doble conteo. Las **compras** de la tarjeta son hechos separados y requieren un estado completo si se incluyen. |
| Préstamo / movimiento financiero | Descripción o contraparte sugieren préstamo. | Requiere documento y criterio del contador antes de `No requiere`; la palabra “préstamo” sola no basta. Los **$82,000** de 4.4 son **depósitos**, no salidas: no son ejemplo de clasificación automática de este Servicio 1. |

`No requiere` significa únicamente “esta salida no busca CFDI de gasto en el Servicio 1”. No es dictamen sobre el retiro, préstamo, disposición, eventual compra en efectivo ni su tratamiento en IVA/ISR.

## 9. Hallazgos

Cada hallazgo debe contener, como mínimo:

| Dato | Contenido verificable |
| --- | --- |
| Identidad y alcance | ID de hallazgo, cliente, periodo, corrida, estado y fecha de detección. |
| Movimiento | ID, cuenta enmascarada, fecha, importe y referencia al archivo/hoja/renglón o página. |
| CFDI involucrado | IDs/UUID y asignaciones, o declaración explícita “ninguno localizado”; todos con localizador de origen. |
| Regla | Clave y versión de la regla que lo produjo; parámetros usados (ventana, tolerancia, catálogo). |
| Evidencia | Señales a favor y en contra: RFC, CLABE confirmada, fechas/horas, importes, saldo tras anticipos y documentos faltantes. |
| Diferencia | Importe de salida, importe documental aplicado, residual/diferencia a centavos y fórmula de obtención. |
| Explicación | Frase comprensible: qué se encontró y por qué se marcó, sin afirmar un hecho no demostrado. |
| Confianza | `alta/media/baja`, motivada por señales; no porcentaje sin calibración estadística. |
| Decisión requerida | Pregunta concreta, opciones, responsable y estado (`abierto`, `en revisión`, `decidido`, `rechazado`, `pospuesto`). |

Un hallazgo puede ser de **matching** (candidato ambiguo, saldo parcial, sin CFDI) o de **revisión posterior** (PPD, forma de pago, anticipo, periodo). Dos hallazgos pueden referirse al mismo movimiento sin crear dos cargos ni dos asignaciones. El nivel de confianza no autoriza por sí solo una conclusión fiscal.

## 10. Decisiones del contador

Intervención obligatoria cuando: la diferencia cae en tolerancia ampliada; hay candidatos indistinguibles; faltan datos de fecha/hora/RFC/CLABE; debe confirmarse un traspaso, préstamo o uso de retiro; se propone una relación de anticipo o saldo sin soporte inequívoco; existe PPD sin REP localizado, forma de pago incompatible, CFDI de otro periodo con criterio de corte, o gasto potencialmente personal. Un movimiento `Sin CFDI` puede requerir pedir documento o confirmar que seguirá pendiente; el sistema no inventa el CFDI.

La decisión registra **quién**, **cuándo**, **cliente/periodo/corrida**, **hallazgo y evidencias vistas**, **opción**, **comentario/soporte** y **alcance** (solo este movimiento, este cliente o criterio propuesto para revisión futura). Aceptar un candidato crea la asignación confirmada; rechazarlo conserva el rechazo y permite evaluar otros candidatos. Cambiar una decisión requiere nuevo evento y motivo, sin borrar la anterior. Una decisión puntual nunca se convierte por sí sola en regla general ni cambia periodos ya cerrados sin una nueva corrida identificable.

## 11. Trazabilidad y Control

Para cualquier cifra o estado, el sistema debe recorrer: **archivo original y su huella → hoja/renglón o página/posición → valor crudo → dato normalizado y transformación → versión de regla/parámetros/catálogo → candidatos y asignación → estado y hallazgo → decisión humana → renglón/fórmula/control del Excel**. El localizador de PDF debe distinguir página y movimiento, no solo archivo. Si una celda resulta de varios CFDI, se enumeran todos y sus importes aplicados.

La identidad de la corrida fija archivos, cortes, parser, motor y versiones de reglas. Sus **revisiones de resultado** conservan qué decisiones se habían aplicado antes de generar cada entregable; una nueva decisión no reescribe el resultado ya entregado. Repetir una revisión con las mismas entradas, versiones y decisiones debe producir los mismos resultados. La corrida de cierre conserva el vínculo con el precierre.

**Control propuesto para Servicio 1:** usar verificaciones separadas, visibles y cada una igual a cero, no una sola suma que pueda compensar errores:

1. `total_cargos_fuente − total_cargos_leidos = 0` y `total_abonos_fuente − total_abonos_leidos = 0`, por archivo/cuenta donde esos controles existan; también conteos de renglones cuando el origen los informe.
2. `cargos_normalizados − (matched + partial + unmatched + probable + not_required) = 0` **tanto en cantidad como en importe bancario**, sin duplicar salidas. Cada cargo aparece exactamente una vez en `match_status`; `review_status` nunca suma cargos adicionales.
3. Por salida asignada, `importe_salida − importe_bancario_aplicado − remanente_visible = 0`; por CFDI, la suma de `importe_cfdi_aplicado` no excede su saldo disponible. La diferencia `importe_bancario_aplicado − importe_cfdi_aplicado` se registra y muestra por separado, incluso dentro de $0.05; no se esconde en una asignación.
4. No hay movimientos aceptados sin clasificación, asignaciones huérfanas, duplicadas o asociadas a documentos cancelados; cada renglón del Excel conserva su localizador de fuente.

`unmatched`, `partial`, `probable` o findings abiertos son **pendientes contables/documentales**, no errores de integridad. Con cobertura completa del alcance declarado y controles = 0 se permite `final_with_pending` y **se genera un Excel final que enumera los pendientes**. Un control distinto de cero, movimiento omitido/duplicado/sin estado, asignación inconsistente, total fuente distinto del leído o archivo crítico no verificable es **error de integridad**: `blocked`, sin liberación final. No se corrige una diferencia cambiando datos fuente. El Excel final conserva el original intacto, agrega resultados con fórmulas, hojas por estatus y una hoja Control; las cifras y conteos salen de una revisión identificada de la corrida. [Evidencia: `ProConta.md`, “Entregables”; Plan §13; decisión de alcance V1.]

## 12. Tabla de casos de prueba verificables

**Modo de lectura:** `H` = resultado histórico descrito en las fuentes; `S` = fixture sintética necesaria para un test, cuyos valores no se atribuyen al despacho. En ambos casos se exige probar la salida y su trazabilidad, no solo el texto del estado. Los resultados agregados de 4.1/4.4 se convierten en regresión únicamente cuando se cuente con archivos anonimizados autorizados.

| ID | Entrada | Contexto | Resultado esperado | Regla | Origen |
| --- | --- | --- | --- | --- | --- |
| S1-01 | Cargo y CFDI activo del mismo proveedor, misma moneda, **importe exacto**, fechas válidas. | S, fixture mínima. | Una asignación exacta, diferencia 0, `match_status = matched`, `review_status = clear` si no hay findings; localizadores de ambas fuentes. | M1–M2 | Patrón de 4.1. |
| S1-02 | Cargo y CFDI del mismo proveedor con diferencia de **$0.01–$0.05**. | S; no hay ejemplo individual completo publicado. | `matched` con `has_findings`, diferencia conservada y visible; nunca redondear para simular importe exacto. | M5 | Regla de 4.1; ajuste V1. |
| S1-03 | Cargo **$8,622.15**, CFDI **$8,622.01**, mismo proveedor y fechas compatibles. | H: se pagó 10/08, se omitió inicialmente por tolerancia $0.05. | Diferencia **$0.14**; `probable` + `requires_decision`, nunca `unmatched` automático. Tras confirmación humana queda vínculo y diferencia auditada. | M7 | 4.3; error histórico 2. |
| S1-04 | Un cargo igual a la suma de **varios CFDI** del mismo proveedor. | S basada en capacidad comprobada, sin importes individuales publicados. | Una salida con varias asignaciones; suma aplicada igual al cargo; cada CFDI queda vinculado una sola vez. Si hay varias combinaciones plausibles, `probable`. | M4 | 4.1; `ProConta.md`, Servicio 1. |
| S1-05 | Dos o más pagos aplicables a un solo CFDI, con importes explícitos. | S, capacidad documentada. | Varias asignaciones al mismo CFDI sin exceder saldo; cada pago conserva su estado y fuente. | M4 | Reglas aprendidas §5; 4.1/4.3. |
| S1-06 | Cuatro liquidaciones de facturas “C” del proveedor de vidrio 2, después de anticipos. | H; en la primera lectura quedaron “Sin CFDI”; **$996.43 de IVA** fue la consecuencia hallada por el cotejo, no un importe a calcular en Servicio 1. | Buscar factura, anticipo y **saldo abierto** antes de `unmatched`; proponer/registrar asignaciones con evidencia. Si la relación no es demostrable, `probable`, no vínculo inventado. | M6 | 4.3; error histórico 1. |
| S1-07 | Anticipo **$1,052.53** y factura final **$1,052.54** sin relación tipo 07 documentada. | H. | Hallazgo de posible doble cobertura/deducción; no contar ambos como respaldo independiente de la misma operación; solicitar revisión. | M6 + F-ANT | 4.1. |
| S1-08 | Varios cargos de gasolina de **$479.80** al mismo proveedor con CFDI de igual importe. | H: antes se asignaron a CFDI equivocados. | Emparejar por fecha/hora disponible; si no hay desempate único, `probable` sin asignar arbitrariamente. | M3 | 4.2/4.4; error histórico 4. |
| S1-09 | CFDI PPD de Würth/Telmex/Telcel con movimiento relacionado; REP no localizado en lo aportado. | H. | `matched` conservado, finding “REP no localizado” y revisión; no declarar deducibilidad. | F-PPD | 4.1. |
| S1-10 | Cargo con débito y CFDI forma 04; cargo con tarjeta y CFDI forma 01. | H. | Match conservado + finding para ambos, con medio y forma visibles; aplicar a todos los cargos con tarjeta en **las cuentas bancarias aportadas**. | F-FORMA | 4.1; error histórico 5 de 4.4. |
| S1-11 | CFDI de comisiones de agosto recibido/emitido en septiembre, o CFDI del 31 pagado el 1 del mes siguiente. | H. | Conservar fecha de cada fuente, permitir candidato entre periodos y crear hallazgo de corte; no reasignar automáticamente efecto fiscal. | M8 + F-PERIODO | 4.1, 4.3, 4.4; reglas §5. |
| S1-12 | SPEI **$34,786.61** a proveedor de vidrio 1 sin CFDI utilizable en archivos entregados. | H. | `unmatched` **solo después** de M1–M8; registrar catálogo CLABE consultado y cobertura documental. | M9 | 4.1. |
| S1-13 | Traspaso entre dos cuentas confirmadas del cliente; pago de tarjeta confirmado. | S a partir de categorías observadas. | `not_required` en el cargo bancario, con razón y contraparte; las compras de tarjeta quedan fuera del primer flujo y no se eliminan del alcance futuro. | M0 + NR | 4.1/4.4; ajuste V1. |
| S1-14 | Retiro **$5,009.08** marcado manualmente “con factura”, sin CFDI ni combinación que cuadre. | H. | La marca manual no produce match. Registrar retiro y discrepancia; `not_required` como retiro solo con clasificación confirmada; no afirmar que la compra ulterior tenga factura. | M0 + NR | 4.1. |
| S1-15 | Candidato del mismo proveedor/fecha con diferencia $0.06–$1.00. | S para fronteras; S1-03 es el caso H de $0.14. | `probable` + `requires_decision`; sin asignación definitiva ni diferencia absorbida. | M7 | `ProConta.md`, “Cómo cruza”; 4.3; ajuste V1. |
| S1-16 | CFDI de SAT repetido por varios conceptos en el XLS. | H, estructura del archivo. | Un solo CFDI normalizado; total contado **una vez** y lista de renglones fuente completa. | V-ESTRUCTURA | 4.1; Pruebas §8. |
| S1-17 | PDF BBVA agosto con control 122 cargos/$333,204.28 y 31 abonos/$342,020.40. | H, cifras de referencia de un archivo específico. | Aceptar si conteos y sumas extraídos son iguales al propio estado; rechazar con motivo ante cualquier discrepancia. | V-TOTALES | 4.2 citado por `ProConta.md`/Pruebas §3. |
| S1-18 | Export de tarjeta con **3 movimientos** frente a cobertura requerida mayor; bancos al 26 y 28/09. | H. | Marcar tarjeta como fuente insuficiente para **compras futuras**, sin bloquear por ello el alcance bancario. La corrida histórica con cortes 26/28 sigue `preclose`; no inventar cargos de cierre. | V-CORTE | 4.4; ajuste V1. |
| S1-19 | Conjunto anonimizado de 4.1: 101 salidas; etiquetas de presentación **33/7/1/38/22** en orden Conciliado/Con observación/Parcial/Sin CFDI/No requiere. | H, regresión de agregados condicionada a obtener fixtures. | Reproducir las etiquetas y sumas históricas al nivel de presentación; **no** inferir solo del agregado la distribución interna de `match_status`/`review_status`; cada salida aparece una vez. | V-CONTROL | 4.1. |
| S1-20 | Conjunto anonimizado de 4.4: 140 salidas; etiquetas de presentación **52/7/2/44/35** y total **$314,299.98**. | H, regresión condicionada a fixtures y corte 26/28. | Totales por etiqueta **$108,050.17 / $16,771.99 / $16,525.26 / $24,349.96 / $148,602.60**; suma y conteos cuadran, sin ocultar faltantes de cierre. No inferir ejes internos del agregado. | V-CONTROL | 4.4; `ProConta.md`, Servicio 1. |
| S1-21 | Misma entrada con Control distinto de cero por fila omitida, asignación duplicada o total alterado. | S, prueba negativa. | Error localizado; **no** se libera Excel final. La diferencia no se “ajusta” para obtener cero. | V-CONTROL | Plan §13; lección general de Pruebas §6. |
| S1-22 | Cargo/CFDI con diferencia **>$1.00**, sin otra evidencia extraordinaria. | S, frontera. | No hay match automático basado solo en importe; `unmatched` si no queda candidato válido tras búsqueda, o `probable` únicamente si surge otra evidencia fuerte registrada. | M7–M9 | Ajuste V1. |
| S1-23 | CFDI fuera de **−3/+25** con evidencia excepcional fuerte de identidad y relación. | S, excepción. | Solo candidato extraordinario `probable` + `requires_decision`; no asignación automática. | M8 | Ajuste V1. |
| S1-24 | Periodo completo con `unmatched`, `partial`, `probable` y findings abiertos, controles = 0. | S, prueba de liberación. | `run_status = final_with_pending`; Excel final liberable con pendientes y fuentes explícitos. | V-CONTROL | Ajuste V1. |
| S1-25 | Periodo con totales fuente ≠ leídos, archivo bancario crítico no verificable o movimiento sin `match_status`. | S, prueba negativa. | `run_status = blocked`; no Excel final, aunque haya pendientes contables que podrían listarse. | V-CONTROL | Ajuste V1. |

Las fixtures S deben usar nombres/RFC ficticios. Los casos H no deben codificarse como cifras sueltas que “pasen” sin sus archivos y resultados por renglón. El caso 4.3 valida aquí la **calidad del matching**, no introduce el cálculo de IVA del Servicio 3.

## 13. Criterios de aceptación del Servicio 1

Se considerará terminado **solo cuando** se pueda demostrar con fixtures aprobadas y una corrida integral:

1. Los perfiles iniciales declarados leen y validan archivos reales anonimizados de BBVA y reportes recibidos SAT/Doc Digitales; los archivos ilegibles, ajenos o sin cuadre se rechazan con causa y localizador. Ningún total, RFC, fila o documento faltante se inventa.
2. Cada cargo de las cuentas y cortes aceptados aparece **una sola vez** en `match_status` y tiene `review_status` independiente; cargos y abonos cuadran con el control de su archivo. Los reportes SAT con varias filas por CFDI no duplican importes.
3. Cada cruce, descarte y cifra del entregable es recorrible hasta archivo, ubicación, dato original, regla/versiones, asignación, hallazgo y decisión si la hubo.
4. Con las mismas entradas, configuración y decisiones, la conciliación es reproducible. Una nueva corrida de cierre no borra el resultado de precierre.
5. Se cumplen los casos S1-01 a S1-25 que sean aplicables; los errores históricos **1, 2, 4 y 5** de Pruebas §6 tienen tests de regresión por renglón. La comparación completa de agregados históricos requiere sus fixtures anonimizadas y autorización para usarlas.
6. Los casos ambiguos quedan para revisión del contador. Puede aceptar, rechazar, posponer o pedir evidencia; su elección, autor, motivo y alcance quedan registrados. Ninguna sugerencia de IA o del motor se transforma automáticamente en criterio fiscal.
7. Matching, hallazgos fiscales y decisiones siguen separados. Encontrar un CFDI no suprime alertas de PPD, forma de pago, anticipos o periodo.
8. El Excel final conserva el original intacto, tiene fórmulas y hojas por estado, incluye Control y reproduce las cifras de una revisión identificada. **Todas** las comprobaciones de Control dan **$0.00**. Una corrida `final_with_pending` puede liberarlo con pendientes contables/documentales explícitos; si falla integridad, queda `blocked` y **no se genera ni libera el entregable final**.
9. El despacho valida los resultados y excepciones de una corrida de extremo a extremo del Servicio 1 antes de comenzar otro servicio.

## 14. Decisiones cerradas y preguntas pendientes

**Cerrado para V1:** ventana general de candidatos **−3/+25 días**; diferencia $0.00 exacta; $0.01–$0.05 permite `matched` con finding visible si identidad/fecha son inequívocas; $0.06–$1.00 produce `probable` con decisión; >$1 no da match automático por importe; excepción temporal fuera de ventana solo como candidato extraordinario revisable. `final_with_pending` libera Excel con pendientes explícitos si la integridad cuadra; las compras de tarjeta quedan fuera del primer flujo completo.

**Aún por resolver con el despacho:**

1. ¿Qué evidencia documental alternativa permite aceptar un export bancario sin total propio, y quién la valida? Sin control verificable, un archivo crítico bloquea la corrida final.
2. ¿Qué columnas y controles concretos contienen los layouts originales de SAT/Doc Digitales cuando faltan UUID, estatus o relaciones? No se llenarán por inferencia silenciosa.
3. ¿Puede el despacho proporcionar versiones anonimizadas de los archivos y resultados **por renglón** de 4.1, 4.3 y 4.4? Sin ellas los agregados históricos no son tests ejecutables.
4. ¿Qué cuentas bancarias del cliente deben incluirse para declarar completo un periodo y qué evidencia confirma una cuenta personal usada por el negocio? El alcance y los cortes deben declararse antes de iniciar la corrida.

Estas preguntas son límites del conocimiento documental, no permisos para inferir datos. Se pueden aprobar las partes no controvertidas del contrato y cerrar cada punto antes de programar la regla afectada.
