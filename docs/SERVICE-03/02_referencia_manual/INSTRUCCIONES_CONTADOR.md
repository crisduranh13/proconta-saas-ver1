# Instrucciones originales del contador · Servicio de revisión de facturas emitidas

En las pruebas este servicio se llamó **Caso 6 / Servicio 6 "REVISION EMITIDOS"**. En ProConta pasa a ser el **Servicio 3**.

## 1. Word del despacho, versión 1 (texto literal)

Archivo: `AUTOMATIZACION_word_caso6_v1.docx` (incluido; sólo trae este caso).

| CASO | DESCRIPCION | ARCH FUENTE | INDICACION | OBJETIVO |
|---|---|---|---|---|
| 6 | REVISION EMITIDOS | Ingresos | DETERMINAR 1º sumar todas los CFDI emitidos del dia la columna SUB TOTALel resultado va en la columna S, sumar la columna TOTAL y el resultado en la columna T sumar la columna TOTAL IVA TRASL (Columna P) resultado en la columna U sumar la DESCUENTO (columna O) resultado en la columna V. En la fila del ultimo CFDI emitido en ese dia, hacer la siguiente formula / =+(S10-V10)*0.16-U10 / ASI DIA POR DIA / 2º) SUMA de todos los Resultados, columnas S a W | Determinar que facturas tienen ingresos al 0% o No Objeto de IVA para verificar no haya errores |

## 2. Word del despacho, versión 2 (texto literal del renglón del caso 6)

Este Word no se incluye porque también trae otro caso con el nombre de otro cliente. El renglón del caso 6 dice:

> DETERMINAR 1º sumar todas los CFDI emitidos del dia la columna SUB TOTAL el resultado va en la columna S, sumar la columna TOTAL y el resultado en la columna T sumar la columna TOTAL IVA TRASL (Columna P) resultado en la columna U sumar la DESCUENTO (columna O) resultado en la columna V. En la fila del ultimo CFDI emitido en ese dia, hacer la siguiente formula / =+(S10-V10)*0.16-U10 / ASI DIA POR DIA / 2º) SUMA de todos los Resultados, columnas S a W / **3º) Verificar que, si los CFDI que presenten diferencia, contienen en la base fiscal IEPS, el monto se anota en una columna adicional.**

Objetivo (igual que en la versión 1): "Determinar que facturas tienen ingresos al 0% o No Objeto de IVA para verificar no haya errores".

## 3. Mensajes del despacho durante las pruebas

Transcritos del registro de pruebas. **PENDIENTE DE VALIDAR** contra los mensajes originales (llegaron por WhatsApp o correo vía el impulsor del proyecto).

| Momento | Mensaje | Qué cambió |
|---|---|---|
| Después de la primera entrega del cliente B | "3 días con detalles" | Confirma que los días con diferencia son 21, 25 y 29/09, los mismos que marcó el cálculo. |
| Después de la primera entrega del cliente B | "Si dice Bomba, una columna con el subtotal que diga Tasa 0%" | Se agrega la columna TASA 0%. Las bombas (para riego) son ventas a tasa 0%, no un error. |
| Con el archivo del cliente C | "Verificar que los CFDI con diferencia contengan IEPS en la base, el monto en una columna adicional" | Se agrega la columna IEPS. Es el mismo punto 3º del Word versión 2. |

## 4. Lo que la instrucción NO dice

Estas reglas surgieron en las pruebas y no están escritas por el contador:

- Excluir los CFDI cancelados de las sumas.
- La tolerancia de $1.00 por día.
- Reportar los folios faltantes.
- El nombre del archivo de salida.

Su estado está en la sección 13 del handoff.
