# Motor de referencia del Servicio 1 (caso A)

Son los scripts de Python que produjeron `03_resultados_esperados/caso_A_esperado.xlsx`. Sirven como referencia de las reglas: no son el código a portar línea por línea.

Orden en que corren: `parse2.py` → `match.py` → `match3.py` → `match4.py` → `build.py` → `excel.py` → `resumen.py`. Se pasan los datos entre sí con archivos `.pkl` y tienen rutas fijas a `/mnt/user-data/uploads`.

Qué hace cada uno:
- `parse2.py`: lector del PDF BBVA. Detecta las columnas por la posición del encabezado en cada página y valida contra los totales y el saldo.
- `match3.py`: catálogo de CLABE y palabras clave → RFC del proveedor, y asignación óptima (algoritmo húngaro) con costo = importe + fecha + RFC/nombre.
- `match4.py`: PPD con REP, y búsqueda de pagos agrupados.
- `build.py`: clasificación final en estatus, con su observación.
