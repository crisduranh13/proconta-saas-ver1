# Servicio 3 · paquete de pruebas

Esta carpeta conserva el paquete de referencia para la revisión de facturas emitidas. El contrato y los casos están en `SERVICE-03-FACTURAS-EMITIDAS-HANDOFF.md`.

| Carpeta | Colocar aquí |
| --- | --- |
| `01_entradas/` | Reportes INGRESOS anonimizados que recibirá el futuro motor. |
| `02_referencia_manual/` | Ejemplo del despacho, cotejo SIIGO e instrucciones. |
| `03_resultados_esperados/` | Excel validados y golden JSON con resultados por renglón. |
| `04_referencia_motor/` | Implementaciones de referencia JS y Python; no forman parte de la app React. |

Los archivos de datos y documentos contables están excluidos de Git por `.gitignore`, aunque estén anonimizados. Los marcadores `.gitkeep` conservan las carpetas privadas en un clon nuevo. No uses `git add -f` para incorporar esos archivos. Los resultados regenerados van en `04_referencia_motor/salida_regenerada/`, también excluida.

El código de referencia sirve para comparar comportamiento, no para importarlo directamente en la aplicación. La implementación de ProConta seguirá en TypeScript cuando se apruebe esa etapa.
