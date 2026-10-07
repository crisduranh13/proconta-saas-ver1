# ProConta — Plan de construcción con IA
## Resumen de la estrategia acordada en ChatGPT
### 7 de octubre de 2026

---

# 1. Objetivo de este documento

Este archivo resume la estrategia acordada para construir **ProConta**, un auxiliar contable con IA para despachos contables mexicanos.

La intención no es hacer un proyecto de "vibe coding" en el que la IA construya una caja negra.

El objetivo es:

> **Usar IA para construir una aplicación real, mientras el propietario aprende y entiende la arquitectura, el flujo de datos, la base de datos, el backend, las reglas, las pruebas y la evolución futura del producto.**

La experiencia previa del usuario es principalmente de desarrollo web:

**Lovable → GitHub → VS Code + Codex → Netlify / hosting / dominio**

Ese flujo ya se utiliza para crear sitios web comerciales.

ProConta representa el siguiente nivel:

**Frontend + backend + base de datos + almacenamiento de archivos + procesamiento de datos + reglas + auditoría + IA + generación de entregables.**

---

# 2. Contexto del producto

ProConta parte de una especificación funcional existente en `ProConta.md`.

La regla principal del producto es:

> **LA APP PROPONE. EL CONTADOR DECIDE.**

ProConta:

- lee archivos
- valida archivos
- normaliza información
- cruza datos
- calcula
- detecta inconsistencias
- clasifica hallazgos
- explica resultados
- propone acciones
- registra decisiones
- genera entregables

ProConta NO:

- presenta declaraciones
- firma declaraciones
- entra directamente a bancos
- entra directamente al SAT
- sustituye el criterio profesional del contador
- debe inventar criterios fiscales

Los archivos los descarga y posteriormente los sube un humano.

---

# 3. Los cinco servicios del MVP

El MVP contempla cinco servicios principales dentro de la aplicación:

## Servicio 1 — Conciliación SALIDAS vs CFDI recibidos

Pregunta:

> ¿Cada gasto tiene su factura?

Debe procesar movimientos bancarios y CFDI recibidos.

Debe poder:

- leer XLS/XLSX/PDF
- identificar columnas por nombre
- validar titulares
- validar RFC
- validar periodo
- validar fecha de corte
- validar totales
- normalizar movimientos
- identificar traspasos propios
- identificar retiros
- identificar pagos de tarjeta
- identificar préstamos
- cruzar por importe
- utilizar RFC en descripción cuando corresponda
- utilizar catálogo CLABE → RFC
- soportar un pago contra varios CFDI
- detectar coincidencias probables
- detectar CFDI faltantes
- detectar CFDI de otro periodo
- detectar posibles duplicidades
- detectar problemas de forma de pago
- detectar PPD sin REP
- detectar anticipos y posibles duplicidades

Estados esperados:

- Conciliado
- Con observación
- Parcial
- Sin CFDI
- No requiere
- Probable / requiere decisión

---

## Servicio 2 — IVA e ISR del mes

Pregunta:

> ¿Cuánto voy a pagar de impuestos?

Debe manejar:

- Pre cierre
- Estimado
- Final
- Bloqueado por información faltante

Debe poder trabajar con:

- CFDI emitidos
- CFDI recibidos
- movimientos bancarios
- tarjeta
- pagos
- PPD / REP
- conceptos sin CFDI
- documentos de otro periodo

Regla:

> Si faltan datos necesarios para un cálculo final, no inventar. Mostrar qué falta y por qué.

Este servicio debe tratarse inicialmente como cálculo/estimación y control, no como presentación oficial de una declaración.

---

## Servicio 3 — Revisión del trabajo del contador

Pregunta:

> ¿Mi contabilidad está bien hecha?

Compara el auxiliar contable contra un cálculo independiente.

Debe explicar cada diferencia.

Clasificación:

- Corte
- Criterio
- Documento faltante
- Error
- Pendiente de decisión

Debe existir revisión en ambos sentidos:

- encontrar errores del contador
- encontrar errores de ProConta

Los errores encontrados deben poder convertirse posteriormente en nuevas validaciones o reglas.

---

## Servicio 4 — Revisión de facturas emitidas

Pregunta:

> ¿Mis facturas cobraron correctamente el IVA?

Debe:

- revisar CFDI activos
- excluir cancelados
- identificar sustituciones
- revisar por día
- comparar subtotal
- comparar IVA
- detectar diferencias
- detectar CFDI no registrados
- identificar posibles tasas 0%
- contemplar IEPS cuando corresponda
- identificar casos que requieren revisión humana

Estados:

- Cuadra
- No cuadra
- Por confirmar
- Requiere decisión

---

## Servicio 5 — Cuentas por cobrar

Pregunta:

> ¿Quién me debe y desde cuándo?

Debe:

- identificar facturas
- identificar abonos
- aplicar abonos
- buscar coincidencia por folio
- buscar coincidencia por rango
- buscar coincidencia por monto
- utilizar FIFO cuando corresponda
- marcar aplicaciones parciales
- identificar referencias incorrectas
- calcular saldos
- calcular antigüedad
- identificar saldos mayores a 90 días
- comprobar que el resultado cuadra contra el auxiliar

Regla importante:

> La referencia del pago es una pista, no necesariamente la verdad.

Si el control no cuadra, no se debe generar el entregable final.

---

# 4. Qué NO se quiere construir

No queremos:

- una demo superficial
- cifras hardcodeadas
- arrays simulando una base de datos
- lógica contable escondida en componentes React
- reglas fiscales dentro de la UI
- un LLM haciendo cálculos que deben ser determinísticos
- una aplicación bonita pero sin backend real
- una caja negra que después sea imposible mantener

---

# 5. Arquitectura conceptual

La arquitectura acordada es:

```text
ARCHIVOS
   ↓
LECTURA / VALIDACIÓN
   ↓
NORMALIZACIÓN
   ↓
BASE DE DATOS
   ↓
MOTOR DE CRUCES
   ↓
REGLAS VERSIONADAS
   ↓
IA PARA AMBIGÜEDAD
   ↓
HALLAZGOS
   ↓
DECISIÓN DEL CONTADOR
   ↓
CONTROL
   ↓
EXCEL / ENTREGABLE
```

El sistema debe permitir contestar:

> ¿De dónde salió este número?

La trazabilidad ideal es:

```text
Archivo original
    ↓
Dato normalizado
    ↓
Regla
    ↓
Cálculo / cruce
    ↓
Resultado
    ↓
Hallazgo
    ↓
Decisión
    ↓
Entregable
```

---

# 6. Separación fundamental de capas

La arquitectura debe separar claramente:

## DATOS

Lo que realmente vino de los archivos.

## REGLAS

Cómo se determina una clasificación.

## CÁLCULOS

Operaciones matemáticas determinísticas.

## IA

Sugerencias, clasificación ambigua, explicación o detección de relaciones.

## DECISIONES

Lo que determina el contador.

Estas categorías no deben mezclarse.

---

# 7. Papel de la IA

La IA NO debe sustituir al motor determinístico.

Ejemplo:

### Incorrecto

Pedirle a un LLM:

> Calcula cuánto IVA corresponde.

### Correcto

El código calcula el IVA.

La IA puede:

- explicar
- clasificar casos ambiguos
- sugerir coincidencias
- interpretar referencias
- encontrar relaciones probables
- resumir hallazgos
- priorizar revisiones

Pero debe existir evidencia estructurada.

Una respuesta de IA nunca debe convertirse automáticamente en una verdad fiscal.

---

# 8. Estrategia de herramientas

La decisión acordada es utilizar las herramientas de forma especializada.

## ChatGPT

Papel:

- estrategia
- arquitectura
- diseño de prompts
- revisión de decisiones
- explicación técnica
- acompañamiento del proyecto

ChatGPT funciona como apoyo de arquitectura y aprendizaje.

---

## Lovable

Papel principal:

> **Diseño de UX/UI y estructura inicial del frontend.**

Lovable se utilizará de forma similar a como ya se utiliza para sitios web.

Debe construir:

- login
- dashboard
- cartera de clientes
- clientes
- periodos
- servicios
- archivos
- hallazgos
- decisiones
- vistas de conciliación
- vistas de cuentas por cobrar
- vistas de CFDI
- navegación
- tablas
- filtros
- estados
- modales
- componentes visuales

En esta fase se recomienda utilizar datos DEMO/mock.

No debe ser responsable de inventar toda la arquitectura contable/backend.

---

## GitHub

Papel:

> **Fuente de verdad del código.**

Debe contener:

- código
- documentación
- migraciones
- tests
- configuración
- README
- arquitectura

No subir:

- secretos
- credenciales
- archivos contables reales

---

## VS Code

Papel:

> **Centro de operaciones y aprendizaje.**

Aquí estará el repositorio local.

Desde aquí se:

- inspecciona código
- ejecuta el proyecto
- ejecutan tests
- hacen cambios
- revisan diferencias
- ejecutan Codex
- trabajan ramas/commits

---

## Codex

Papel principal:

> **Principal Engineer / Tech Lead / constructor del producto.**

Codex trabajará directamente sobre el repositorio dentro de VS Code.

Debe construir:

- backend
- base de datos
- APIs
- procesamiento de archivos
- reglas
- conciliaciones
- tests
- seguridad
- generación de Excel
- auditoría
- refactors

Para la primera prueba se decidió NO comenzar con Claude Code.

---

## Claude Max

Papel principal:

> **Segundo cerebro / auditor / code reviewer.**

Claude puede utilizarse después de que Codex construya una parte.

Su trabajo ideal:

- revisar arquitectura
- buscar errores
- encontrar casos límite
- revisar seguridad
- revisar lógica
- comparar contra `ProConta.md`
- intentar romper el sistema
- sugerir mejoras

No es necesario usar Claude Code todavía.

---

## Vercel

Papel:

> Deployment de la aplicación.

Se utilizará cuando el backend y arquitectura estén preparados.

No se debe confundir deployment con infraestructura completa.

Hay que definir correctamente:

- variables de entorno
- base de datos
- storage
- jobs
- logs
- errores

---

## PostgreSQL

Papel:

> Base de datos principal.

Debe almacenar, como mínimo:

- despachos
- usuarios
- clientes
- periodos
- archivos
- movimientos
- CFDI
- proveedores
- cuentas bancarias
- catálogo CLABE/RFC
- cruces
- reglas
- hallazgos
- decisiones
- criterios
- entregables
- corridas/procesos
- auditoría

---

## Storage

Los archivos originales deben conservarse.

Debe existir almacenamiento privado para:

- XLS/XLSX
- PDF
- futuros XML
- entregables

Nunca modificar el archivo original.

ProConta trabaja sobre una versión normalizada.

---

# 9. Multiempresa

La aplicación está diseñada para despachos contables.

Modelo conceptual:

```text
DESPACHO
   ↓
USUARIOS
   ↓
CLIENTES
   ↓
PERIODOS
   ↓
ARCHIVOS
   ↓
MOVIMIENTOS / CFDI
   ↓
CRUCES
   ↓
HALLAZGOS
   ↓
DECISIONES
   ↓
ENTREGABLES
```

Debe existir aislamiento estricto entre despachos y clientes.

La seguridad debe aplicarse en backend y base de datos.

No confiar solamente en esconder información en frontend.

---

# 10. Dashboard principal

Debe existir una cartera de clientes con columnas:

- Cliente
- Tipo
- Servicio 1
- Servicio 2
- Servicio 3
- Servicio 4
- Servicio 5

Cada celda puede indicar:

- pendiente
- procesando
- completo
- observaciones
- bloqueado
- requiere decisión

También:

- documentos faltantes
- decisiones abiertas
- entregables listos
- controles fallidos
- procesos recientes

---

# 11. Bandeja del contador

Debe existir una sección:

> DECISIONES PENDIENTES

Cada hallazgo debe mostrar:

- cliente
- periodo
- servicio
- problema
- importe
- evidencia
- explicación
- propuesta de ProConta
- nivel de confianza
- qué debe decidir el contador
- opciones disponibles
- comentario
- estado

Estados:

- Abierto
- En revisión
- Decidido
- Rechazado
- Pospuesto

Las decisiones quedan en bitácora.

---

# 12. Aprendizaje del sistema

Cuando un contador toma una decisión:

NO convertirla automáticamente en una regla global.

Guardar:

- criterio
- cliente
- contexto
- periodo
- regla relacionada
- decisión
- usuario
- fecha

Posteriormente algunos criterios repetitivos pueden convertirse en reglas configurables.

Separar:

- regla general
- criterio específico del cliente
- decisión puntual
- sugerencia de IA

---

# 13. Excel y control

Los entregables deben generarse desde el sistema.

No hardcodear cifras.

Conteos y totales salen del sistema.

Las fórmulas necesarias deben permanecer en el Excel.

Debe existir una hoja de Control.

Regla:

> **SI CONTROL != 0 → NO GENERAR ENTREGABLE FINAL**

No se permite maquillar un resultado para producir cero.

Si el control falla:

- bloquear
- explicar el error
- identificar dónde está
- permitir corregir
- volver a procesar

---

# 14. Procesamiento de archivos

Cada archivo debe validarse antes de procesarse.

Validaciones iniciales:

1. formato
2. encabezados
3. columnas
4. titular
5. RFC
6. periodo
7. fecha de corte
8. totales
9. integridad
10. posibles errores de layout

Los layouts pueden cambiar entre clientes.

No asumir:

> "La columna C siempre es importe."

Buscar columnas por significado y encabezado.

---

# 15. Procesamiento asíncrono

Los archivos pueden ser grandes.

No asumir que todo terminará dentro de una sola petición HTTP.

La arquitectura debe permitir:

- iniciar procesamiento
- guardar job
- mostrar progreso
- procesar
- registrar errores
- consultar estado
- reanudar cuando sea posible

La UI no debería congelarse durante el procesamiento.

---

# 16. Seguridad y privacidad

Los archivos pueden contener información sensible.

Implementar desde el principio:

- autenticación
- autorización
- aislamiento multi-tenant
- validación de archivos
- límites de tamaño
- sanitización
- almacenamiento privado
- logs
- auditoría
- variables de entorno
- cero secretos en GitHub
- protección de archivos

---

# 17. Datos DEMO

Crear datos sintéticos inspirados en la especificación.

Usar:

- Cliente A
- Cliente B
- Cliente C
- Cliente D

Nunca copiar información personal real.

El modo DEMO permitirá probar el sistema antes de utilizar archivos reales.

---

# 18. Estrategia de construcción

La construcción NO será:

> "Haz toda la aplicación."

Se hará por fases.

## Fase 0 — Auditoría

Codex debe:

- inspeccionar repositorio
- inspeccionar `ProConta.md`
- entender Lovable
- revisar package.json
- revisar estructura
- revisar APIs
- revisar base de datos
- revisar variables
- revisar tests
- revisar deployment

Primero debe entregar diagnóstico.

No debe programar todavía.

---

## Fase 1 — Arquitectura base

Construir:

- autenticación
- despachos
- usuarios
- clientes
- periodos
- archivos
- storage
- auditoría

---

## Fase 2 — UX y aplicación base

Integrar el frontend creado en Lovable con la arquitectura real.

---

## Fase 3 — Sistema genérico de procesamiento

Construir:

- carga
- validación
- normalización
- jobs
- estados
- errores

---

## Fase 4 — Servicio 1

Construir COMPLETAMENTE:

> Conciliación SALIDAS vs CFDI recibidos.

Incluye:

- upload
- validación
- normalización
- movimientos
- CFDI
- matching
- reglas
- tolerancias
- estados
- observaciones
- hallazgos
- revisión
- decisiones
- auditoría
- exportación

No avanzar al servicio 2 hasta que el servicio 1 funcione realmente.

---

## Fases posteriores

Después del Servicio 1:

- Servicio 5 — Cuentas por cobrar
- Servicio 4 — Facturas emitidas
- Servicio 3 — Revisión del trabajo del contador
- Servicio 2 — IVA e ISR

El orden puede modificarse si aparece una dependencia técnica válida, pero debe explicarse.

---

# 19. Filosofía de aprendizaje

Cada fase debe enseñarle al usuario cómo funciona el producto.

Después de cada bloque importante Codex debe explicar:

1. qué construyó
2. archivos principales
3. función de cada archivo
4. flujo de información
5. frontend
6. backend
7. base de datos
8. tests
9. problemas encontrados
10. pendientes

No se busca una clase académica.

Se busca que el dueño del producto entienda progresivamente la arquitectura.

---

# 20. Git

Trabajar con Git de manera real.

Después de cambios razonables:

- revisar diff
- ejecutar tests
- revisar errores
- hacer commit
- escribir mensajes descriptivos

Ejemplo:

```text
feat: create client and accounting period models
```

No hacer un commit gigantesco con todo el producto.

---

# 21. Primera prueba concreta

La prueba inicial acordada es:

### 1.
Diseñar ProConta en Lovable.

### 2.
Usar datos DEMO/mock.

### 3.
Subir esa versión a GitHub.

### 4.
Clonar repositorio en VS Code.

### 5.
Instalar/utilizar Codex en VS Code.

### 6.
Abrir el repositorio.

### 7.
Asegurarse de que `ProConta.md` esté dentro del proyecto.

### 8.
Dar a Codex el prompt maestro.

### 9.
Pedirle explícitamente:

> **NO PROGRAMAR TODAVÍA. AUDITAR EL REPOSITORIO Y `ProConta.md`.**

### 10.
Revisar el diagnóstico.

### 11.
Decidir qué arquitectura aceptar.

### 12.
Comenzar Fase 1.

---

# 22. Prompt maestro resumido para Codex

La primera instrucción deberá establecer:

> Actúa como Principal Software Engineer y Tech Lead de ProConta.

> Lee `ProConta.md` completo.

> Inspecciona todo el repositorio.

> No programes todavía.

> Quiero entender qué existe, qué viene de Lovable, qué funciona realmente y qué falta para convertirlo en una aplicación real.

> Propón arquitectura, base de datos, backend, almacenamiento, procesamiento y plan de fases.

> El producto debe ser mantenible y explicable.

> Yo estoy aprendiendo.

> No quiero una caja negra.

> Después de cada fase explica qué construiste, dónde está y cómo funciona.

> La regla principal del producto es:
> **LA APP PROPONE. EL CONTADOR DECIDE.**

> Empieza únicamente con la auditoría del repositorio y `ProConta.md`.

---

# 23. Prompt posterior de auditoría

Una vez que Codex haya construido funcionalidades, Claude puede actuar como auditor.

La instrucción general:

> Deja de actuar como constructor y actúa como Principal Engineer, QA Lead, Security Engineer, Data Integrity Auditor y Accounting Workflow Reviewer.

Debe intentar romper el sistema.

Buscar:

- errores matemáticos
- redondeos
- falsos positivos
- falsos negativos
- problemas de fechas
- duplicidades
- errores multi-tenant
- problemas de archivos
- procesos atorados
- entregables con control distinto de cero
- fórmulas Excel incorrectas
- datos hardcodeados
- cálculos en frontend
- reglas mal ubicadas
- decisiones de IA presentadas como hechos
- falta de trazabilidad
- contradicciones con `ProConta.md`

Para cada problema:

- severidad
- archivo/módulo
- causa
- riesgo
- reproducción
- solución
- test preventivo

---

# 24. Por qué NO usar Claude Code todavía

No se considera necesario al inicio.

El usuario ya tiene:

- Claude Max
- VS Code
- ChatGPT Plus
- Codex
- GitHub
- Lovable

La primera meta es aprender:

> **VS Code + Git + GitHub + Codex**

Después se puede experimentar con Claude Code para comparar herramientas.

Una prueba futura puede ser:

> Construir el mismo módulo con Codex y Claude Code y comparar arquitectura, calidad, tests y mantenibilidad.

---

# 25. Flujo completo acordado

```text
                   USUARIO
                      │
                      ▼
             CHATGPT / ARQUITECTURA
                      │
                      ▼
                  LOVABLE
              UX / UI / FRONTEND
                      │
                      ▼
                   GITHUB
                      │
                      ▼
                  VS CODE
                      │
             ┌────────┴────────┐
             ▼                 ▼
          CODEX              USUARIO
       CONSTRUYE             APRENDE
             │
             ▼
       BASE DE DATOS
       STORAGE
       BACKEND
       RULES
       TESTS
             │
             ▼
           GITHUB
             │
             ▼
           VERCEL
             │
             ▼
          PROCONTA
             ▲
             │
          CLAUDE
     AUDITOR / REVIEWER
```

---

# 26. Primera meta realista

La primera meta NO es:

> "Tener los cinco servicios."

La primera meta es:

```text
Subir XLS
   ↓
Validar
   ↓
Normalizar
   ↓
Procesar
   ↓
Conciliar
   ↓
Mostrar hallazgos
   ↓
Contador decide
   ↓
Registrar decisión
   ↓
Generar Excel
   ↓
Control = $0.00
```

Si esto funciona de punta a punta, ya existe un MVP técnico mucho más serio que una simple demo.

---

# 27. Principio final del proyecto

ProConta no debe construirse como:

> "Una IA que hace contabilidad."

Debe construirse como:

> **Un sistema de procesamiento, control y auditoría contable que utiliza IA únicamente donde aporta valor y mantiene al contador como responsable de las decisiones.**

Y la meta del usuario en esta primera etapa es doble:

### Producto

Construir ProConta.

### Aprendizaje

Entender:

- Git
- GitHub
- VS Code
- Codex
- frontend
- backend
- API
- PostgreSQL
- storage
- procesamiento de archivos
- reglas
- tests
- deployment
- arquitectura de una aplicación real

---

# 28. Estado actual del plan

## Decidido

- Lovable para diseño/UI inicial
- GitHub como fuente de verdad
- VS Code como centro de trabajo
- Codex como principal constructor
- Claude Max como auditor/segunda opinión
- Vercel para deployment
- PostgreSQL para datos
- Storage privado para archivos
- construcción por fases
- comenzar por auditoría
- comenzar funcionalmente por Servicio 1
- mantener separación entre reglas, cálculos, IA y decisiones
- mantener trazabilidad
- no comenzar todavía con Claude Code

## Siguiente paso

1. Terminar/diseñar la versión inicial en Lovable.
2. Subirla a GitHub.
3. Clonarla en VS Code.
4. Tener `ProConta.md` dentro del repositorio.
5. Ejecutar Codex.
6. Darle el prompt de auditoría inicial.
7. Revisar juntos su diagnóstico.
8. Iniciar Fase 1.

---

# 29. Nota sobre la documentación de origen

`ProConta.md` proviene de un trabajo previo realizado con Claude y representa la especificación funcional que se está utilizando como base para esta etapa de construcción.

El propósito de esta estrategia no es reemplazar esa especificación, sino transformarla en una arquitectura de software mantenible y comprensible.

