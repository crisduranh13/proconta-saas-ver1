# Servicio 1 — Contrato técnico verificable

**Estado:** propuesta de diseño para revisión del despacho. **Alcance:** conciliación de SALIDAS bancarias contra CFDI recibidos. No es código, esquema SQL ni criterio fiscal aprobado.

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

Los archivos los descarga y entrega una persona. Un perfil de lectura se identifica por **origen y layout**, no solo por extensión. Un formato no reconocido se rechaza con motivo; no se adivinan columnas por posición fija. Los archivos originales se conservan sin modificación cuando se implemente el flujo.

| Entrada | Origen y formatos iniciales | Datos mínimos para el Servicio 1 | Validaciones específicas | Rechazo o bloqueo |
| --- | --- | --- | --- | --- |
| Movimientos de cuenta BBVA PYME/personal | Export BBVA **XLS** probado en 4.1 y 4.4; estado de cuenta BBVA **PDF** probado en agosto y cotejado en 4.2. Una variante XLSX requerirá perfil y fixture propios antes de admitirse como equivalente. | Cuenta, titular identificable, fecha de operación, descripción, cargo/abono, importe y fecha de corte; RFC en descripción y CLABE destino si el layout los aporta; totales del propio archivo. | Detectar hoja/páginas y encabezado por nombre (en un XLS hubo encabezado en fila 6), separar cargos de abonos, excluir totales de filas operativas, comprobar conteos e importes de control del banco. No tomar la columna manual “SI HAY FACTURA” como verdad. | Archivo corrupto o no legible; layout/columnas críticas desconocidos; cuenta o titular no atribuibles al cliente; periodo/corte ambiguos; importes inválidos; totales que no cuadran. Si no hay control verificable, queda sin aceptar para una corrida final. |
| Reporte de CFDI **recibidos** SAT | **XLS** probado en 4.1/4.2; puede tener un renglón por concepto. | Emisor y receptor, identidad del comprobante (preferentemente UUID), fecha de emisión, total, estado, método y forma de pago cuando consten; importes por concepto para agrupar. | Agrupar renglones del mismo CFDI sin duplicar su total; verificar receptor y periodo de extracción; identificar cancelados, duplicados y totales de control disponibles. | Reporte ilegible; receptor ajeno no explicado; faltan campos para distinguir comprobantes o reconstruir sus importes; conteos o importes no cuadran con controles equivalentes del propio reporte. No equiparar la suma de conceptos con el total del CFDI sin considerar impuestos y descuentos. Una fila incompleta se aparta y bloquea su uso automático. |
| Reporte de CFDI **recibidos** Doc Digitales | **XLSX** probado en 4.4; un renglón por CFDI. | Emisor, receptor, UUID/identificador, fecha, total, método, forma de pago y estatus Activo/Cancelado. Relaciones, REP y anticipos si el reporte los expone. | Identificar columnas por encabezado; evitar UUID repetidos; comprobar receptor, estatus, periodo y totales de control disponibles. | Archivo/layout ilegible; receptor ajeno; identidad o importe crítico ausente; totales inconsistentes. Si el reporte no trae relaciones/REP, se conserva esa limitación y no se infiere que el documento no existe. |
| Estado/export de tarjeta de crédito, **solo si se pretende conciliar sus compras** | PDF de tarjeta probado en 4.2; export BBVA XLS de 4.4 llegó con solo **3 movimientos** y fue insuficiente. | Identidad de tarjeta/cuenta, rango y fecha de corte, cargos por compra, fecha, comercio, importe y totales del estado. | Probar cobertura del rango necesario, separar compras, intereses, comisiones y pago de tarjeta; cuadrar contra controles disponibles. | Un export parcial no habilita conciliación completa de compras de tarjeta. Registrar la falta de cobertura y bloquear cualquier conclusión **final** que dependa de esos cargos. No inventar movimientos faltantes. |

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
7. **Corte.** Guardar la fecha de corte real por cuenta. Un corte parcial permite precierre, pero no se rotula como mes completo. Para tarjeta, comprobar que el estado cubre las compras que se pretende conciliar.
8. **Totales.** Reconciliar cargos, abonos y conteos leídos con los controles presentes en el estado/export. Para CFDI, cuadrar únicamente sumas y conteos **comparables** que el reporte realmente declara y evitar multiplicar el total por conceptos; los conceptos no tienen por qué sumar el total con impuestos y descuentos. Ejemplo histórico de PDF de agosto: 122 cargos por **$333,204.28** y 31 abonos por **$342,020.40**, iguales al estado (4.2). No usar ese valor como constante de validación de otros archivos.
9. **Aceptar o rechazar.** Aceptar solo cuando identidad, estructura, cobertura y controles requeridos son verificables; guardar motivo preciso en caso contrario. La aceptación del archivo no implica que cada movimiento tenga CFDI.

**No procesar un archivo** si es corrupto, tiene un layout no soportado, pierde filas o importes, no permite identificar cliente/cuenta/receptor, presenta totales discrepantes o mezcla periodos sin separar sus rangos. Un control de totales ausente deja el archivo **no verificable** para la corrida final hasta obtener otro control documental aprobado por el contador; no se inventa el total. Una fila ambigua se aísla: no entra a matches automáticos ni se borra del control de cobertura. Un archivo de tarjeta con solo tres compras, como en 4.4, no permite declarar completo ese origen.

**Pregunta abierta:** qué evidencia externa concreta podrá sustituir un total ausente en un export bancario. La decisión y el documento usado deberán quedar registrados antes de aceptar ese perfil.

## 5. Estados de conciliación

Cada **salida** tiene un solo estado principal en una corrida. Los hallazgos son marcas adicionales: por ejemplo, `Conciliado` con una alerta sobre periodo del CFDI. Una sugerencia sin aceptar no consume saldo de un CFDI ni cambia el estado a `Conciliado`.

| Estado | Definición y condición | Evidencia mínima | Ejemplo histórico |
| --- | --- | --- | --- |
| **Conciliado** | La salida queda cubierta por uno o más CFDI vigentes, o por saldo comprobado de una factura abierta después de anticipos; identidad del proveedor y asignación son inequívocas. Una diferencia dentro de la tolerancia estricta se registra explícitamente. Sin observaciones documentales pendientes conocidas. | Movimiento, CFDI(s), importes aplicados, regla, proveedor y fechas; unicidad de la asignación. | 33 de 101 salidas en 4.1; 52 de 140 en 4.4. |
| **Con observación** | Existe cobertura documental identificada, pero un atributo o soporte exige revisión; no significa aprobación fiscal. Incluye forma de pago distinta, PPD sin REP localizado o relación de anticipo no demostrada. | Evidencia del match **y** discrepancia concreta o documento faltante, sin alterar importes. | 7 salidas en 4.1 y 7 en 4.4; Würth/Telmex/Telcel PPD sin REP; forma 04 con pago de débito. |
| **Parcial** | Solo una parte de la salida queda cubierta por documentación identificada; el remanente queda visible y sin clasificar como factura completa. | Importe de salida, asignaciones, suma cubierta y remanente no negativo. | Mensualidad del auto de **$6,525.26** con CFDI de **$2,797.24** por intereses e IVA en 4.1. |
| **Sin CFDI** | Para una salida que sí requiere comprobación, no hay CFDI utilizable **después de buscar** candidatos directos, combinaciones y saldo abierto tras anticipos. Es “no encontrado en los archivos disponibles”, no una afirmación de inexistencia universal. | Movimiento, conjunto de archivos/cortes buscados y registro de búsquedas descartadas o vacías. | 38 salidas en 4.1; 44 en 4.4. El SPEI de **$34,786.61** del caso 4.1 quedó entre las salidas grandes sin CFDI. |
| **No requiere** | La salida representa un flujo confirmado que no pide CFDI de gasto en esta conciliación: traspaso propio, retiro, pago de tarjeta o préstamo identificado. No determina tratamiento fiscal de usos posteriores del dinero. | Tipo, cuenta/contraparte y prueba o confirmación del contador. | 22 salidas en 4.1; 35 en 4.4. |
| **Probable / requiere decisión** | Hay candidato(s), pero no evidencia suficiente para asignar automáticamente: diferencia ampliada, identidad incierta, varios candidatos equivalentes o pista de fecha/hora insuficiente. También una clasificación “No requiere” meramente sugerida espera aquí confirmación. | Lista de candidatos, regla, señales a favor/en contra, diferencia y pregunta concreta. | Pago de **$8,622.15** frente a CFDI de **$8,622.01** (diferencia $0.14) descubierto en 4.3; el cruce se confirmó manualmente. |

**Precedencia propuesta para el estado principal:** `No requiere` solo con naturaleza confirmada; después, si hay candidato ambiguo, `Probable`; si hay asignación confirmada incompleta, `Parcial`; si es completa con hallazgo documental, `Con observación`; si es completa y sin hallazgo, `Conciliado`; si no hay candidato tras la búsqueda completa, `Sin CFDI`. Un hallazgo fiscal puede cambiar `Conciliado` a `Con observación`, pero no borrar la asignación. Las decisiones y las corridas anteriores permanecen trazables.

## 6. Motor de matching: orden y precedencia

El motor busca **candidatos** y construye **asignaciones**; la revisión fiscal del §7 ocurre después. Cada regla registra versión, entradas, descartes y resultado. Orden propuesto con base en 4.1, 4.3 y 4.4:

| Orden | Regla | Condición verificable y salida |
| --- | --- | --- |
| M0 | Elegibilidad | Solo cargos de cuentas aceptadas. Excluir abonos del matching del Servicio 1, CFDI cancelados y monedas incompatibles. No usar un CFDI o importe ya asignado por encima de su saldo disponible. Las categorías `No requiere` se evalúan antes de buscar CFDI, pero **solo se aplican** si están confirmadas. |
| M1 | Identidad del proveedor | Cargo con tarjeta: extraer RFC de la descripción BBVA y compararlo con RFC emisor. SPEI: usar CLABE/cuenta destino asociada a RFC en el catálogo **del cliente** y vigente. Si solo coincide un nombre o referencia libre, es pista y no autorización de match definitivo. |
| M2 | Importe exacto y fecha | Priorizar importe idéntico a centavo, proveedor confirmado y ventana temporal válida. La ventana **propuesta** para fecha de emisión del CFDI respecto de la operación bancaria es **−3 a +25 días**, según `ProConta.md`; el texto de 4.4 resume “±25 días”. Registrar la fecha y la distancia; no crear un match solo por importe/fecha si el proveedor es desconocido. |
| M3 | Desempate | Entre pagos iguales del mismo proveedor —gasolina de **$479.80** en el error histórico 4— usar secuencia de fechas y hora de autorización frente a fecha/hora de emisión. Si faltan horas o persisten candidatos indistinguibles, devolver `Probable`; no asignar por orden arbitrario de filas. |
| M4 | Tolerancia estricta | Con identidad de proveedor y fecha sólidas, evaluar diferencia absoluta de hasta **$0.05** como tolerancia inicial de 4.1. Registrar la diferencia. Si existen dos candidatos que cumplen, aplicar M3 o dejar `Probable`. La aceptación automática exacta de diferencias no nulas queda sujeta a revisión del despacho (§14). |
| M5 | Composición de pagos | Buscar varios CFDI del **mismo proveedor** cuya suma cubra un cargo; y permitir varios cargos asignados, por importes explícitos, a un mismo CFDI sin exceder saldo. Una combinación matemática sola no basta si hay varias alternativas plausibles; en ese caso `Probable`. |
| M6 | Anticipos y saldo abierto | Antes de `Sin CFDI`, localizar factura final y anticipos/notas relacionadas del proveedor; calcular **saldo documental pendiente** sin volver a contar el anticipo. Una liquidación puede cubrir ese saldo. Si la relación o el saldo no se pueden probar, devolver `Probable` o `Parcial`, con hallazgo de soporte. Esto corrige los cuatro pagos omitidos del error histórico 1. |
| M7 | Tolerancia ampliada | Solo si RFC/proveedor y fechas coinciden claramente, proponer diferencias superiores a $0.05 y **hasta $1.00** como `Probable / requiere decisión`; nunca ajustar el importe. El pago **$8,622.15** contra CFDI **$8,622.01** debe aparecer aquí con diferencia **$0.14**, no en `Sin CFDI`. El límite de $1 es una propuesta tomada de `ProConta.md`; se valida con el despacho. |
| M8 | Cruce entre periodos | Mantener candidatos de periodos adyacentes dentro de la ventana, incluidos cargos/CFDI pendientes de la corrida anterior. Etiquetar el periodo de cada documento. Las comisiones bancarias pueden tener CFDI emitido al mes siguiente; no trasladar automáticamente efectos fiscales. |
| M9 | Sin candidato | Solo después de M1–M8 y de documentar fuentes/cobertura, clasificar `Sin CFDI`. Si falta un estado de cuenta o el reporte de CFDI está incompleto, la conclusión se limita explícitamente a los archivos disponibles y puede impedir cierre final. |

**Restricciones comunes:** comparar valores decimales en centavos; no asignar el mismo importe de CFDI dos veces; no usar un CFDI cancelado como respaldo vigente; conservar todas las alternativas descartadas cuando influyan en una decisión; no usar porcentajes de “confianza” inventados. Si un documento tiene importe, proveedor o estado incierto, el motor no lo eleva a hecho confirmado. El contador puede aprobar o rechazar una propuesta; la siguiente corrida usa esa decisión con su alcance, sin crear una regla global automática.

## 7. Revisión fiscal posterior al match

**Matching** contesta “¿qué documento podría respaldar esta salida y por cuánto?”. **Validación fiscal** señala “¿qué condición del documento o del pago requiere criterio?”. Esta segunda etapa no modifica retrospectivamente el importe bancario ni declara deducibilidad o IVA acreditable. Esos cálculos son de servicios posteriores.

| Hallazgo posterior | Comprobación documentada | Resultado del Servicio 1 |
| --- | --- | --- |
| PPD sin REP | CFDI marcado PPD y REP **no localizado entre los documentos disponibles**. | Mantener match si existe; `Con observación` y solicitar/verificar REP. Casos Würth, Telmex, Telcel en 4.1; Telcel con abono de $10,000 en 4.4. |
| Forma de pago distinta | Comparar `forma_pago` del CFDI contra medio bancario **en todos los cargos con tarjeta y cuentas aportadas**, no solo una tarjeta. | `Con observación`, evidencia de ambos valores y revisión del contador. Error histórico 5. |
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

El resultado pertenece a una **corrida inmutable** de un conjunto de archivos y cortes definidos. Repetirla con las mismas entradas, reglas, catálogo y decisiones debe producir los mismos resultados; una corrida al cierre puede generar resultados distintos y conservar la comparación con el precierre.

**Control propuesto para Servicio 1:** usar verificaciones separadas, visibles y cada una igual a cero, no una sola suma que pueda compensar errores:

1. `total_cargos_fuente − total_cargos_leidos = 0` y `total_abonos_fuente − total_abonos_leidos = 0`, por archivo/cuenta donde esos controles existan; también conteos de renglones cuando el origen los informe.
2. `cargos_normalizados − (Conciliado + Con observación + Parcial + Sin CFDI + No requiere + Probable) = 0` **tanto en cantidad como en importe**, sin duplicar salidas. Cada cargo aparece exactamente una vez en su estado principal.
3. Por salida asignada, `importe_salida − importe_aplicado − remanente_visible = 0`; la tolerancia o diferencia no se esconde en una asignación. Por CFDI, la suma aplicada no excede el saldo documental disponible. Todos los residuos se muestran como partidas explícitas.
4. No hay movimientos aceptados sin clasificación, asignaciones huérfanas, duplicadas o asociadas a documentos cancelados; cada renglón del Excel conserva su localizador de fuente.

Un `Sin CFDI`, `Parcial` o `Probable` **no hace fallar automáticamente** el control aritmético: su importe debe estar contabilizado y visible. Puede impedir un **cierre final** por revisión o documentos faltantes, según la política que apruebe el despacho. **Si cualquier control es distinto de cero, no se genera el entregable final.** No se corrige una diferencia cambiando datos fuente. El Excel final conserva el original intacto, agrega resultados con fórmulas, hojas por estatus y una hoja Control; las cifras y conteos salen de la corrida. [Evidencia: `ProConta.md`, “Entregables”; Plan §13.]

## 12. Tabla de casos de prueba verificables

**Modo de lectura:** `H` = resultado histórico descrito en las fuentes; `S` = fixture sintética necesaria para un test, cuyos valores no se atribuyen al despacho. En ambos casos se exige probar la salida y su trazabilidad, no solo el texto del estado. Los resultados agregados de 4.1/4.4 se convierten en regresión únicamente cuando se cuente con archivos anonimizados autorizados.

| ID | Entrada | Contexto | Resultado esperado | Regla | Origen |
| --- | --- | --- | --- | --- | --- |
| S1-01 | Cargo y CFDI activo del mismo proveedor, misma moneda, **importe exacto**, fechas válidas. | S, fixture mínima. | Una asignación exacta, diferencia 0, `Conciliado` si no hay alertas; localizadores de ambas fuentes. | M1–M2 | Patrón de 4.1. |
| S1-02 | Cargo y CFDI del mismo proveedor con diferencia de **$0.01–$0.05**. | S; no hay ejemplo individual completo publicado. | Candidato bajo tolerancia estricta, diferencia conservada y visible; nunca redondear para simular importe exacto. Estado definitivo de diferencia no nula sujeto a §14. | M4 | Regla de 4.1; corrección de 4.3. |
| S1-03 | Cargo **$8,622.15**, CFDI **$8,622.01**, mismo proveedor y fechas compatibles. | H: se pagó 10/08, se omitió inicialmente por tolerancia $0.05. | Diferencia **$0.14**; candidato `Probable / requiere decisión`, nunca `Sin CFDI` automático. Tras confirmación humana queda vínculo y diferencia auditada. | M7 | 4.3; error histórico 2. |
| S1-04 | Un cargo igual a la suma de **varios CFDI** del mismo proveedor. | S basada en capacidad comprobada, sin importes individuales publicados. | Una salida con varias asignaciones; suma aplicada igual al cargo; cada CFDI queda vinculado una sola vez. Si hay varias combinaciones plausibles, `Probable`. | M5 | 4.1; `ProConta.md`, Servicio 1. |
| S1-05 | Dos o más pagos aplicables a un solo CFDI, con importes explícitos. | S, capacidad documentada. | Varias asignaciones al mismo CFDI sin exceder saldo; cada pago conserva su estado y fuente. | M5 | Reglas aprendidas §5; 4.1/4.3. |
| S1-06 | Cuatro liquidaciones de facturas “C” del proveedor de vidrio 2, después de anticipos. | H; en la primera lectura quedaron `Sin CFDI`; **$996.43 de IVA** fue la consecuencia hallada por el cotejo, no un importe a calcular en Servicio 1. | Buscar factura, anticipo y **saldo abierto** antes de `Sin CFDI`; proponer/registrar asignaciones con evidencia. Si la relación no es demostrable, `Probable`, no vínculo inventado. | M6 | 4.3; error histórico 1. |
| S1-07 | Anticipo **$1,052.53** y factura final **$1,052.54** sin relación tipo 07 documentada. | H. | Hallazgo de posible doble cobertura/deducción; no contar ambos como respaldo independiente de la misma operación; solicitar revisión. | M6 + F-ANT | 4.1. |
| S1-08 | Varios cargos de gasolina de **$479.80** al mismo proveedor con CFDI de igual importe. | H: antes se asignaron a CFDI equivocados. | Emparejar por fecha/hora disponible; si no hay desempate único, `Probable` sin asignar arbitrariamente. | M3 | 4.2/4.4; error histórico 4. |
| S1-09 | CFDI PPD de Würth/Telmex/Telcel con movimiento relacionado; REP no localizado en lo aportado. | H. | Match documental conservado, estado `Con observación`, hallazgo “REP no localizado”; no declarar deducibilidad. | F-PPD | 4.1. |
| S1-10 | Cargo con débito y CFDI forma 04; cargo con tarjeta y CFDI forma 01. | H. | `Con observación` para ambos, con medio y forma visibles; evaluar la regla en **las dos cuentas/tarjetas aportadas**. | F-FORMA | 4.1; error histórico 5 de 4.4. |
| S1-11 | CFDI de comisiones de agosto recibido/emitido en septiembre, o CFDI del 31 pagado el 1 del mes siguiente. | H. | Conservar fecha de cada fuente, permitir candidato entre periodos y crear hallazgo de corte; no reasignar automáticamente efecto fiscal. | M8 + F-PERIODO | 4.1, 4.3, 4.4; reglas §5. |
| S1-12 | SPEI **$34,786.61** a proveedor de vidrio 1 sin CFDI utilizable en archivos entregados. | H. | `Sin CFDI` **solo después** de M1–M8; registrar catálogo CLABE consultado y cobertura documental. | M9 | 4.1. |
| S1-13 | Traspaso entre dos cuentas confirmadas del cliente; pago de tarjeta confirmado. | S a partir de categorías observadas. | `No requiere` en el cargo bancario, con razón y contraparte; las compras de tarjeta no se eliminan por ello. | M0 + NR | 4.1/4.4; reglas §5. |
| S1-14 | Retiro **$5,009.08** marcado manualmente “con factura”, sin CFDI ni combinación que cuadre. | H. | La marca manual no produce match. Registrar retiro y discrepancia; `No requiere` como retiro solo con clasificación confirmada; no afirmar que la compra ulterior tenga factura. | M0 + NR | 4.1. |
| S1-15 | Candidato del mismo proveedor/fecha con diferencia mayor a $0.05 y ≤ $1.00. | S para frontera; S1-03 es el caso H de $0.14. | `Probable / requiere decisión`; sin asignación definitiva ni diferencia absorbida. | M7 | `ProConta.md`, “Cómo cruza”; 4.3. |
| S1-16 | CFDI de SAT repetido por varios conceptos en el XLS. | H, estructura del archivo. | Un solo CFDI normalizado; total contado **una vez** y lista de renglones fuente completa. | V-ESTRUCTURA | 4.1; Pruebas §8. |
| S1-17 | PDF BBVA agosto con control 122 cargos/$333,204.28 y 31 abonos/$342,020.40. | H, cifras de referencia de un archivo específico. | Aceptar si conteos y sumas extraídos son iguales al propio estado; rechazar con motivo ante cualquier discrepancia. | V-TOTALES | 4.2 citado por `ProConta.md`/Pruebas §3. |
| S1-18 | Export de tarjeta con **3 movimientos** frente a cobertura requerida mayor; bancos al 26 y 28/09. | H. | Marcar cobertura insuficiente y corrida de precierre; no llamar “final” ni inventar cargos de cierre. | V-CORTE | 4.4. |
| S1-19 | Conjunto anonimizado de 4.1: 101 salidas; estados **33/7/1/38/22** en orden Conciliado/Con observación/Parcial/Sin CFDI/No requiere. | H, regresión de agregados condicionada a obtener fixtures. | Estados y sumas por categoría iguales al resultado documentado; cada salida aparece una vez. | V-CONTROL | 4.1. |
| S1-20 | Conjunto anonimizado de 4.4: 140 salidas; **52/7/2/44/35** y total **$314,299.98**. | H, regresión condicionada a fixtures y corte 26/28. | Totales por estado **$108,050.17 / $16,771.99 / $16,525.26 / $24,349.96 / $148,602.60**; suma y conteos cuadran, sin ocultar faltantes de cierre. | V-CONTROL | 4.4; `ProConta.md`, Servicio 1. |
| S1-21 | Misma entrada con Control distinto de cero por fila omitida, asignación duplicada o total alterado. | S, prueba negativa. | Error localizado; **no** se libera Excel final. La diferencia no se “ajusta” para obtener cero. | V-CONTROL | Plan §13; lección general de Pruebas §6. |

Las fixtures S deben usar nombres/RFC ficticios. Los casos H no deben codificarse como cifras sueltas que “pasen” sin sus archivos y resultados por renglón. El caso 4.3 valida aquí la **calidad del matching**, no introduce el cálculo de IVA del Servicio 3.

## 13. Criterios de aceptación del Servicio 1

Se considerará terminado **solo cuando** se pueda demostrar con fixtures aprobadas y una corrida integral:

1. Los perfiles iniciales declarados leen y validan archivos reales anonimizados de BBVA y reportes recibidos SAT/Doc Digitales; los archivos ilegibles, ajenos o sin cuadre se rechazan con causa y localizador. Ningún total, RFC, fila o documento faltante se inventa.
2. Cada cargo de las cuentas y cortes aceptados aparece **una sola vez** en un estado principal; cargos y abonos cuadran con el control de su archivo. Los reportes SAT con varias filas por CFDI no duplican importes.
3. Cada cruce, descarte y cifra del entregable es recorrible hasta archivo, ubicación, dato original, regla/versiones, asignación, hallazgo y decisión si la hubo.
4. Con las mismas entradas, configuración y decisiones, la conciliación es reproducible. Una nueva corrida de cierre no borra el resultado de precierre.
5. Se cumplen los casos S1-01 a S1-21 que sean aplicables; los errores históricos **1, 2, 4 y 5** de Pruebas §6 tienen tests de regresión por renglón. La comparación completa de agregados históricos requiere sus fixtures anonimizadas y autorización para usarlas.
6. Los casos ambiguos quedan para revisión del contador. Puede aceptar, rechazar, posponer o pedir evidencia; su elección, autor, motivo y alcance quedan registrados. Ninguna sugerencia de IA o del motor se transforma automáticamente en criterio fiscal.
7. Matching, hallazgos fiscales y decisiones siguen separados. Encontrar un CFDI no suprime alertas de PPD, forma de pago, anticipos o periodo.
8. El Excel final conserva el original intacto, tiene fórmulas y hojas por estado, incluye Control y reproduce las cifras de la corrida. **Todas** las comprobaciones de Control dan **$0.00**. Si cualquiera da distinto de cero, **no se genera ni libera el entregable final**; se informa la diferencia concreta.
9. El despacho valida los resultados y excepciones de una corrida de extremo a extremo del Servicio 1 antes de comenzar otro servicio.

## 14. Preguntas abiertas que requieren decisión antes de implementar reglas definitivas

1. **Ventana temporal.** `ProConta.md` fija **−3 a +25 días**; Pruebas 4.4 dice **±25 días**. ¿Se aprueba la primera como ventana general, o habrá ventanas por tipo de operación/proveedor? Los casos de SPEI hasta 14 días y gasolina hasta 10 días son observaciones históricas, no límites universales.
2. **Tolerancia estricta.** ¿Una diferencia de $0.01–$0.05 con proveedor y fecha inequívocos queda `Conciliado` con diferencia visible, o `Con observación` hasta confirmación? El caso $0.14 queda `Probable` en cualquier variante.
3. **Identidad documental incompleta.** ¿Qué hacer si un reporte no trae UUID, relaciones, estatus o totales propios? Este contrato impide el match automático inseguro; falta acordar el control documental sustituto y el alcance de la revisión humana.
4. **Cierre con pendientes.** ¿Puede emitirse un entregable final de conciliación con salidas `Sin CFDI`, `Parcial` o `Probable` claramente listadas y Control aritmético en cero, o ciertos pendientes bloquean el cierre hasta decisión? El borrador de septiembre se mantuvo pendiente de corte completo.
5. **Cobertura de tarjeta.** ¿Las compras de tarjeta forman parte del primer alcance operativo o solo se señalan como fuente faltante hasta tener el estado completo? El pago bancario de la tarjeta sí debe evitar doble conteo.
6. **Fixtures históricas.** ¿Puede el despacho proporcionar los archivos de 4.1, 4.3 y 4.4 anonimizados y sus resultados por renglón, o habrá que reconstruir fixtures sintéticas equivalentes? Sin ellos no se puede afirmar regresión automática de los agregados reales.

Estas preguntas son límites del conocimiento documental, no permisos para inferir datos. Se pueden aprobar las partes no controvertidas del contrato y cerrar cada punto antes de programar la regla afectada.
