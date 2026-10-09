// Referencia: regenera 03_resultados_esperados con el motor validado (engine.js).
// Uso, desde la raíz del paquete:  npm i exceljs@4.4.0  &&  node 04_referencia_motor/run_golden.js  <carpeta_salida>
const path = require('path'); const fs = require('fs'); const ExcelJS = require('exceljs'); const E = require(path.join(__dirname, 'engine.js'));
const ROOT = path.join(__dirname, '..'); const OUT = process.argv[2] || path.join(ROOT, 'salida_regenerada');
fs.mkdirSync(OUT, { recursive: true });
async function caso(entrada, opts, folios) {
  const A = await E.analizar(ExcelJS, fs.readFileSync(path.join(ROOT, entrada)), { cliente: opts.cliente || '' });
  const marcados = A.candidatos.filter(c => folios.includes(c.folio)).map(c => c.r);
  fs.writeFileSync(path.join(OUT, A.filename), Buffer.from(await E.generar(A, { ...opts, marcados })));
  console.log(A.filename, JSON.stringify(A.totales), JSON.stringify(E.resumenCalc(A, marcados)));
}
(async () => {
  await caso('01_entradas/B_INGRESOS_2026-09_al_29.xlsx', { cliente: 'CLIENTE B', siigo16: 370622.20, siigo0: 2039 }, ['9856', '9897']);
  await caso('01_entradas/C_INGRESOS_2026-09_al_30.xlsx', {}, []);
})().catch(e => { console.error(e); process.exit(1); });
