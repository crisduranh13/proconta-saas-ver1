
/* ProConta · Caso 6 · Revisión de CFDI emitidos (motor, sin interfaz) */
(function (root) {
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const num = v => {
    if (v == null || v === '') return 0;
    if (typeof v === 'object') { if ('result' in v) return num(v.result); if (v.richText) return num(v.richText.map(t => t.text).join('')); }
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s]/g, ''));
    return isFinite(n) ? n : 0;
  };
  const txt = v => { if (v == null) return ''; if (typeof v === 'object') { if (v.richText) return v.richText.map(t => t.text).join(''); if ('result' in v) return String(v.result); if (v.text) return String(v.text); } return String(v); };
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const colL = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const pad = n => String(n).padStart(2, '0');
  function toDate(v) {
    if (v instanceof Date) return { key: `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`, d: v };
    if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return toDate(d); }
    const s = txt(v).trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { key: `${m[1]}-${m[2]}-${m[3]}`, d: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) };
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return { key: `${m[3]}-${pad(m[2])}-${pad(m[1])}`, d: new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) };
    return null;
  }
  const COLS = {
    subtotal: ['sub total', 'subtotal'], total: ['total'], iva: ['total iva tras.', 'total iva tras', 'iva trasladado', 'total iva trasladado'],
    descuento: ['descuento'], estatus: ['estatus', 'status'], fecha: ['fecha', 'fecha emision', 'fecha de emision'], folio: ['folio'],
    serie: ['serie'], uuid: ['uuid', 'folio fiscal'], rfc: ['r.f.c. receptor', 'rfc receptor'], receptor: ['razon social receptor', 'nombre receptor'],
    tipo: ['tipo de comprobante', 'tipo'], forma: ['forma de pago'], metodo: ['metodo de pago'], uso: ['uso cfdi receptor', 'uso cfdi'],
    concepto: ['descripcion', 'concepto', 'descripcion del concepto', 'conceptos'],
    ivaret: ['total iva ret.', 'total iva ret', 'iva retenido'], isrret: ['total isr ret.', 'total isr ret', 'isr retenido'], ieps: ['total ieps tras.', 'total ieps', 'ieps trasladado', 'ieps']
  };
  function mapHeaders(ws) {
    const h = {}; const row = ws.getRow(1);
    row.eachCell({ includeEmpty: false }, (c, i) => { const k = norm(txt(c.value)); for (const [key, names] of Object.entries(COLS)) if (!h[key] && names.includes(k)) h[key] = i; });
    let lastCol = 0; row.eachCell({ includeEmpty: false }, (c, i) => { if (txt(c.value).trim()) lastCol = Math.max(lastCol, i); });
    h._last = lastCol; return h;
  }
  async function readConceptos(ExcelJS, buffer) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0]; const h = mapHeaders(ws); const map = new Map();
    if (!h.uuid || !h.concepto) throw new Error('El archivo de conceptos debe traer las columnas UUID y Descripción.');
    for (let r = 2; r <= ws.rowCount; r++) {
      const u = txt(ws.getCell(r, h.uuid).value).trim().toUpperCase(); if (!u) continue;
      const d = txt(ws.getCell(r, h.concepto).value).trim();
      map.set(u, map.has(u) ? map.get(u) + ' | ' + d : d);
    }
    return map;
  }
  async function analizar(ExcelJS, buffer, opts = {}) {
    const kw = (opts.keywords || ['BOMBA']).map(k => norm(k)).filter(Boolean);
    const tol = opts.tolerancia ?? 1;
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0]; const h = mapHeaders(ws); const avisos = [];
    const faltan = ['subtotal', 'total', 'iva', 'estatus', 'fecha', 'folio'].filter(k => !h[k]);
    if (faltan.length) throw new Error('No encuentro estas columnas en el archivo: ' + faltan.join(', ') + '. ¿Es el reporte INGRESOS de Doc Digitales?');
    const rows = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const folio = txt(ws.getCell(r, h.folio).value).trim(); const f = toDate(ws.getCell(r, h.fecha).value);
      if (!folio && !f) continue;
      if (!f) { avisos.push(`Renglón ${r}: fecha no válida, no se incluye.`); continue; }
      rows.push({
        r, folio, serie: h.serie ? txt(ws.getCell(r, h.serie).value).trim() : '', uuid: h.uuid ? txt(ws.getCell(r, h.uuid).value).trim().toUpperCase() : '',
        dia: f.key, fecha: f.d, fechaTxt: txt(ws.getCell(r, h.fecha).value), sub: num(ws.getCell(r, h.subtotal).value), tot: num(ws.getCell(r, h.total).value),
        iva: num(ws.getCell(r, h.iva).value), desc: h.descuento ? num(ws.getCell(r, h.descuento).value) : 0,
        est: txt(ws.getCell(r, h.estatus).value).trim(), tipo: h.tipo ? txt(ws.getCell(r, h.tipo).value).trim().toUpperCase() : 'INGRESO',
        rfc: h.rfc ? txt(ws.getCell(r, h.rfc).value).trim() : '', receptor: h.receptor ? txt(ws.getCell(r, h.receptor).value).trim() : '',
        forma: h.forma ? txt(ws.getCell(r, h.forma).value).trim() : '', uso: h.uso ? txt(ws.getCell(r, h.uso).value).trim() : '',
        concepto: h.concepto ? txt(ws.getCell(r, h.concepto).value).trim() : '',
        ivaret: h.ivaret ? num(ws.getCell(r, h.ivaret).value) : 0, isrret: h.isrret ? num(ws.getCell(r, h.isrret).value) : 0,
        iepsCol: h.ieps ? num(ws.getCell(r, h.ieps).value) : null
      });
    }
    if (!rows.length) throw new Error('El archivo no trae CFDI.');
    for (const x of rows) { const e = x.iepsCol != null ? x.iepsCol : r2(x.tot - (x.sub - x.desc) - x.iva + x.ivaret + x.isrret); x.ieps = e > 0.02 ? r2(e) : 0; }
    const uu = rows.filter(x => x.uuid).map(x => x.uuid); if (new Set(uu).size !== uu.length) throw new Error('Hay UUID repetidos: este parece un reporte por concepto. Sube el reporte INGRESOS por comprobante y este como archivo de conceptos.');
    if (opts.conceptos) for (const x of rows) if (!x.concepto && opts.conceptos.has(x.uuid)) x.concepto = opts.conceptos.get(x.uuid);
    const activo = x => norm(x.est) === 'activo' && (x.tipo === 'INGRESO' || x.tipo === 'I' || x.tipo === '');
    // bloques por día (el archivo debe venir ordenado por fecha)
    const dias = []; const vistos = new Set();
    for (let i = 0; i < rows.length; i++) {
      const d = rows[i].dia; let j = i; while (j + 1 < rows.length && rows[j + 1].dia === d) j++;
      if (vistos.has(d)) throw new Error(`El día ${d} aparece en dos partes del archivo. Ordénalo por la columna Fecha y vuelve a subirlo.`);
      vistos.add(d); const blk = rows.slice(i, j + 1);
      const a = blk.filter(activo);
      dias.push({ dia: d, fecha: rows[i].fecha, a: rows[i].r, b: rows[j].r, n: blk.length, cancel: blk.filter(x => norm(x.est) === 'cancelado').length,
        S: r2(a.reduce((s, x) => s + x.sub, 0)), T: r2(a.reduce((s, x) => s + x.tot, 0)), U: r2(a.reduce((s, x) => s + x.iva, 0)), V: r2(a.reduce((s, x) => s + x.desc, 0)), I: r2(a.reduce((s, x) => s + x.ieps, 0)) });
      i = j;
    }
    dias.forEach(d => d.W = (d.S - d.V) * 0.16 - d.U);
    // CFDI activos con IVA menor al 16% de su base
    const candidatos = rows.filter(x => activo(x) && (x.sub - x.desc + x.ieps) * 0.16 - x.iva > tol).map(x => {
      const base0 = r2(x.sub - x.desc + x.ieps - x.iva / 0.16); const c = norm(x.concepto);
      return { ...x, base0, mixto: x.iva > 0, auto: !!(c && kw.some(k => c.includes(k))), conConcepto: !!x.concepto };
    });
    const conDif = rows.filter(x => activo(x) && (Math.abs((x.sub - x.desc) * 0.16 - x.iva) > 0.05 || x.ieps > 0)).map(x => ({ ...x, dif: r2((x.sub - x.desc) * 0.16 - x.iva), base0: Math.max(0, r2(x.sub - x.desc + x.ieps - x.iva / 0.16)) }));
    const cancelados = rows.filter(x => norm(x.est) === 'cancelado').map(x => {
      const sust = rows.find(y => activo(y) && y.fecha >= x.fecha && Math.abs(y.tot - x.tot) < 0.01 && y.rfc === x.rfc && y !== x);
      return { ...x, sustituto: sust ? `${sust.folio} (${sust.dia.slice(8, 10)}/${sust.dia.slice(5, 7)})` : '' };
    });
    const noIngreso = rows.filter(x => norm(x.est) === 'activo' && !activo(x));
    // folios faltantes por serie
    const faltantes = []; const porSerie = {};
    rows.forEach(x => { const n = parseInt(x.folio, 10); if (isFinite(n)) (porSerie[x.serie] = porSerie[x.serie] || []).push(n); });
    for (const [s, arr] of Object.entries(porSerie)) { const set = new Set(arr); const mn = Math.min(...arr), mx = Math.max(...arr);
      if (mx - mn < 5000) for (let n = mn; n <= mx; n++) if (!set.has(n)) faltantes.push({ serie: s, folio: n }); }
    const ult = rows[rows.length - 1].fecha; const ultimo = dias[dias.length - 1].fecha;
    const MM = pad(ultimo.getUTCMonth() + 1), DD = pad(ultimo.getUTCDate()), YYYY = ultimo.getUTCFullYear();
    const pref = (opts.cliente || '').trim().toUpperCase().replace(/[^A-Z0-9Ñ]+/g, '_').replace(/^_|_$/g, '');
    const meses = new Set(dias.map(d => d.dia.slice(0, 7))); if (meses.size > 1) avisos.push('El archivo trae más de un mes: ' + [...meses].join(', ') + '.');
    return { wb, ws, h, rows, dias, candidatos, conDif, cancelados, noIngreso, faltantes, avisos, tol, kw: opts.keywords || ['BOMBA'],
      MM, DD, YYYY, filename: `${pref ? pref + '_' : ''}INGRESOS_${MM}_${DD}.xlsx`, sheet: `INGR_${MM}`,
      totales: { n: rows.length, activos: rows.filter(activo).length, cancel: cancelados.length, S: r2(dias.reduce((s, d) => s + d.S, 0)), T: r2(dias.reduce((s, d) => s + d.T, 0)), U: r2(dias.reduce((s, d) => s + d.U, 0)), V: r2(dias.reduce((s, d) => s + d.V, 0)), I: r2(dias.reduce((s, d) => s + d.I, 0)), W: r2(dias.reduce((s, d) => s + d.W, 0)) },
      periodo: { de: rows[0].dia, a: dias[dias.length - 1].dia } };
  }
  function resumenCalc(A, marcados) {
    const m = new Set(marcados); const X = r2(A.candidatos.filter(c => m.has(c.r)).reduce((s, c) => s + c.base0, 0));
    const revisar = A.dias.filter(d => { const x = A.candidatos.filter(c => m.has(c.r) && c.r >= d.a && c.r <= d.b).reduce((s, c) => s + c.base0, 0); return Math.abs(d.W - (x - d.I) * 0.16) > A.tol; }).length;
    return { X, I: A.totales.I, noExplicada: r2(A.totales.W - (X - A.totales.I) * 0.16), revisar };
  }
  async function generar(A, opts = {}) {
    const { wb, ws, h } = A; const marc = new Set(opts.marcados || []); const tol = A.tol;
    ws.name = A.sheet; const last = A.rows[A.rows.length - 1].r;
    const c0 = Math.max(h._last + 1, 19);
    const [cS, cT, cU, cV, cW, cX, cI, cY] = [0, 1, 2, 3, 4, 5, 6, 7].map(k => c0 + k);
    const L = colL; const E = L(h.estatus), SUB = L(h.subtotal), TOT = L(h.total), IVA = L(h.iva), DES = h.descuento ? L(h.descuento) : null;
    const MON = '"$"#,##0.00;[Red]\\-"$"#,##0.00';
    const hdrFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    ['SUBTOTAL', 'TOTAL', 'IVA', 'DESCUENTO', 'DIFERENCIA', 'TASA 0%', 'IEPS', 'REVISIÓN'].forEach((t, k) => {
      const c = ws.getCell(1, c0 + k); c.value = t; c.font = { bold: true, name: 'Arial', size: 10 }; c.fill = hdrFill; c.alignment = { horizontal: 'center' };
      ws.getColumn(c0 + k).width = k === 7 ? 12 : 15; });
    const RES = "Resumen!$B$4";
    const iepsF = r => h.ieps ? `ROUND(${L(h.ieps)}${r},2)` : `ROUND(${TOT}${r}-${SUB}${r}${DES ? `+${DES}${r}` : ''}-${IVA}${r}${h.ivaret ? `+${L(h.ivaret)}${r}` : ''}${h.isrret ? `+${L(h.isrret)}${r}` : ''},2)`;
    for (const d of A.dias) {
      const rg = (col) => `${col}${d.a}:${col}${d.b}`;
      const S = (col, v) => ({ formula: `SUMIFS(${rg(col)},${rg(E)},"Activo")`, result: v });
      ws.getCell(d.b, cS).value = S(SUB, d.S); ws.getCell(d.b, cT).value = S(TOT, d.T); ws.getCell(d.b, cU).value = S(IVA, d.U);
      ws.getCell(d.b, cV).value = DES ? S(DES, d.V) : 0;
      ws.getCell(d.b, cW).value = { formula: `+(${L(cS)}${d.b}-${L(cV)}${d.b})*0.16-${L(cU)}${d.b}`, result: d.W };
      const x = A.candidatos.filter(c => marc.has(c.r) && c.r >= d.a && c.r <= d.b).reduce((s, c) => s + c.base0, 0);
      ws.getCell(d.b, cY).value = { formula: `IF(ABS(${L(cW)}${d.b}-(SUM(${L(cX)}${d.a}:${L(cX)}${d.b})-SUM(${L(cI)}${d.a}:${L(cI)}${d.b}))*0.16)<=${RES},"OK","REVISAR")`, result: Math.abs(d.W - (x - d.I) * 0.16) <= tol ? 'OK' : 'REVISAR' };
      for (const c of [cS, cT, cU, cV, cW]) ws.getCell(d.b, c).numFmt = MON;
    }
    for (const c of A.candidatos) if (marc.has(c.r)) {
      const f = `ROUND(${SUB}${c.r}${DES ? `-${DES}${c.r}` : ''}+${L(cI)}${c.r}-${IVA}${c.r}/0.16,2)`;
      ws.getCell(c.r, cX).value = { formula: f, result: c.base0 }; ws.getCell(c.r, cX).numFmt = MON;
    }
    const activoN = x => norm(x.est) === 'activo';
    for (const x of A.rows) if (activoN(x) && x.ieps > 0) { ws.getCell(x.r, cI).value = { formula: iepsF(x.r), result: x.ieps }; ws.getCell(x.r, cI).numFmt = MON; }
    for (const x of A.rows) if (activoN(x) && x.ieps > 0 && marc.has(x.r)) ws.getCell(x.r, cX).value = { formula: `ROUND(${SUB}${x.r}${DES ? `-${DES}${x.r}` : ''}+${L(cI)}${x.r}-${IVA}${x.r}/0.16,2)`, result: A.candidatos.find(c => c.r === x.r).base0 };
    const TR = last + 2; ws.getCell(TR, c0 - 1).value = 'TOTAL'; ws.getCell(TR, c0 - 1).font = { bold: true };
    const rc = resumenCalc(A, [...marc]);
    const totRes = [A.totales.S, A.totales.T, A.totales.U, A.totales.V, A.totales.W, rc.X, A.totales.I];
    [cS, cT, cU, cV, cW, cX, cI].forEach((c, k) => { const cell = ws.getCell(TR, c); cell.value = { formula: `SUM(${L(c)}2:${L(c)}${last})`, result: totRes[k] }; cell.numFmt = MON; cell.font = { bold: true }; cell.fill = hdrFill; });
    ws.getCell(TR, cY).value = { formula: `COUNTIF(${L(cY)}2:${L(cY)}${last},"REVISAR")`, result: rc.revisar }; ws.getCell(TR, cY).font = { bold: true }; ws.getCell(TR, cY).fill = hdrFill;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const lc = L(h._last);
    ws.addConditionalFormatting({ ref: `A2:${lc}${last}`, rules: [
      { type: 'expression', priority: 1, formulae: [`$${E}2="Cancelado"`], style: { font: { strike: true, color: { argb: 'FF808080' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD9D9D9' } } } },
      { type: 'expression', priority: 2, formulae: [`AND($${E}2="Activo",OR(ISNUMBER($${L(cX)}2),ISNUMBER($${L(cI)}2)))`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDDEBF7' } } } },
      { type: 'expression', priority: 3, formulae: [`AND($${E}2="Activo",($${SUB}2${DES ? `-$${DES}2` : ''})*0.16-$${IVA}2>${RES})`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } } } } ] });
    ws.addConditionalFormatting({ ref: `${L(cY)}2:${L(cY)}${last}`, rules: [
      { type: 'cellIs', operator: 'equal', priority: 4, formulae: ['"REVISAR"'], style: { font: { bold: true, color: { argb: 'FF9C0006' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } } } },
      { type: 'cellIs', operator: 'equal', priority: 5, formulae: ['"OK"'], style: { font: { color: { argb: 'FF006100' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } } } } ] });
    // ---------------- RESUMEN
    const rs = wb.addWorksheet('Resumen'); const SH = `'${A.sheet}'`; const B = { name: 'Arial', size: 10 }; const BB = { ...B, bold: true };
    const title = (r, t) => { const c = rs.getCell(r, 1); c.value = t; c.font = BB; for (let k = 1; k <= 9; k++) rs.getCell(r, k).fill = hdrFill; };
    rs.getCell('A1').value = `REVISIÓN DE CFDI EMITIDOS${opts.cliente ? ' · ' + opts.cliente.toUpperCase() : ''} · ${A.MM}/${A.YYYY} (al ${A.DD}/${A.MM}/${A.YYYY})`; rs.getCell('A1').font = { name: 'Arial', bold: true, size: 13 };
    rs.getCell('A2').value = 'Fuente: reporte INGRESOS de Doc Digitales sin modificar. Por día, al último CFDI: DIFERENCIA = (SUBTOTAL − DESCUENTO) × 16% − IVA. Solo CFDI activos. IEPS = Total − (Subtotal − Descuento) − IVA + retenciones.'; rs.getCell('A2').font = { name: 'Arial', size: 9, italic: true };
    rs.getCell('A4').value = 'Tolerancia por redondeo ($)'; rs.getCell('B4').value = tol; rs.getCell('B4').font = { name: 'Arial', size: 10, color: { argb: 'FF0000FF' } }; rs.getCell('B4').numFmt = '#,##0.00';
    title(6, 'RESULTADO DEL MES');
    const cnt = (crit) => ({ formula: `COUNTIF(${SH}!${E}2:${E}${last},"${crit}")` });
    const R = {}; let rr = 7;
    const put = (key, label, val, fmt, bold) => { R[key] = rr; rs.getCell(rr, 1).value = label; rs.getCell(rr, 2).value = val; rs.getCell(rr, 2).numFmt = fmt; rs.getCell(rr, 1).font = B; rs.getCell(rr, 2).font = bold ? BB : B; rr++; };
    put('n', 'CFDI en el archivo', A.totales.n, '0');
    put('act', '  Activos', { ...cnt('Activo'), result: A.rows.filter(activoN).length }, '0');
    put('can', '  Cancelados (no se suman)', { ...cnt('Cancelado'), result: A.totales.cancel }, '0');
    put('S', 'SUBTOTAL', { formula: `${SH}!${L(cS)}${TR}`, result: A.totales.S }, '#,##0.00', true);
    put('T', 'TOTAL', { formula: `${SH}!${L(cT)}${TR}`, result: A.totales.T }, '#,##0.00', true);
    put('U', 'IVA trasladado', { formula: `${SH}!${L(cU)}${TR}`, result: A.totales.U }, '#,##0.00');
    put('V', 'DESCUENTO', { formula: `${SH}!${L(cV)}${TR}`, result: A.totales.V }, '#,##0.00');
    put('W', 'DIFERENCIA (suma de la columna DIFERENCIA)', { formula: `${SH}!${L(cW)}${TR}`, result: A.totales.W }, '#,##0.00', true);
    put('X', 'Ventas a TASA 0% confirmadas', { formula: `${SH}!${L(cX)}${TR}`, result: rc.X }, '#,##0.00');
    put('I', 'IEPS incluido en la base del IVA', { formula: `${SH}!${L(cI)}${TR}`, result: A.totales.I }, '#,##0.00');
    put('E', '  IVA que explican la tasa 0% y el IEPS', { formula: `ROUND((B${R.X}-B${R.I})*0.16,2)`, result: r2((rc.X - A.totales.I) * 0.16) }, '#,##0.00');
    put('NE', 'DIFERENCIA NO EXPLICADA', { formula: `ROUND(B${R.W}-B${R.E},2)`, result: rc.noExplicada }, '#,##0.00', true);
    put('dr', 'Días a revisar', { formula: `${SH}!${L(cY)}${TR}`, result: rc.revisar }, '0', true);
    for (const k of [1, 2]) rs.getCell(R.NE, k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    rs.getCell(R.NE, 3).value = { formula: `IF(ABS(B${R.NE})<=B4,"OK: todo explicado","REVISAR")`, result: Math.abs(rc.noExplicada) <= tol ? 'OK: todo explicado' : 'REVISAR' }; rs.getCell(R.NE, 3).font = BB;
    rr++; rs.getCell(rr, 1).value = 'Control: subtotal directo de activos − suma de los días (debe dar 0)';
    rs.getCell(rr, 2).value = { formula: `ROUND(SUMIFS(${SH}!${SUB}2:${SUB}${last},${SH}!${E}2:${E}${last},"Activo")-B${R.S},2)`, result: 0 };
    rs.getCell(rr, 3).value = { formula: `IF(B${rr}=0,"OK","REVISAR")`, result: 'OK' }; rs.getCell(rr, 1).font = B; rs.getCell(rr, 3).font = BB;
    let r = rr + 2;
    if (opts.siigo16 != null || opts.siigo0 != null) {
      title(r, 'COTEJO vs SIIGO'); r++;
      ['Concepto', 'SIIGO', 'CFDI', 'Diferencia'].forEach((t, k) => { rs.getCell(r, k + 1).value = t; rs.getCell(r, k + 1).font = BB; }); r++;
      const s16 = r2(A.totales.S - A.totales.V - rc.X);
      [['Base al 16%', opts.siigo16 ?? 0, { formula: `B${R.S}-B${R.V}-B${R.X}`, result: s16 }], ['Base al 0%', opts.siigo0 ?? 0, { formula: `B${R.X}`, result: rc.X }]].forEach(([a, sv, cv]) => {
        rs.getCell(r, 1).value = a; rs.getCell(r, 2).value = sv; rs.getCell(r, 2).font = { name: 'Arial', size: 10, color: { argb: 'FF0000FF' } }; rs.getCell(r, 3).value = cv;
        rs.getCell(r, 4).value = { formula: `ROUND(C${r}-B${r},2)`, result: r2(cv.result - sv) }; [2, 3, 4].forEach(k => rs.getCell(r, k).numFmt = '#,##0.00'); r++; });
      rs.getCell(r, 1).value = 'Una diferencia en la base al 0% suele ser un CFDI de tasa 0% que no se registró en SIIGO, o uno sin IVA que no es bomba.'; rs.getCell(r, 1).font = { name: 'Arial', size: 9, italic: true }; r += 2;
    }
    title(r, 'CFDI CON DIFERENCIA EN EL IVA (revisión por comprobante)'); r++;
    ['Folio', 'Fecha', 'Receptor', 'Subtotal', 'IVA', 'Diferencia', 'IEPS', 'Base 0%', 'Explicación'].forEach((t, k) => { rs.getCell(r, k + 1).value = t; rs.getCell(r, k + 1).font = BB; }); r++;
    if (!A.conDif.length) { rs.getCell(r, 1).value = 'Ninguno: todos los CFDI activos traen IVA exacto al 16%.'; r++; }
    for (const c of A.conDif) {
      const b0 = c.base0 * 0.16 > 0.05 ? c.base0 : 0; const ok0 = b0 > 0 && marc.has(c.r);
      let ex = [];
      if (c.ieps > 0) ex.push('Contiene IEPS en la base del IVA: el IVA se calculó sobre subtotal + IEPS');
      if (b0 > 0) ex.push(ok0 ? 'Parte a tasa 0% confirmada' : 'Parte sin IVA: confirmar si es bomba (tasa 0%)');
      if (!ex.length) ex.push('Diferencia de redondeo');
      [c.folio, c.dia, c.receptor, c.sub, c.iva, c.dif, c.ieps || null, b0 || null, ex.join('. ')].forEach((v, k) => { rs.getCell(r, k + 1).value = v; rs.getCell(r, k + 1).font = B; if (k >= 3 && k <= 7) rs.getCell(r, k + 1).numFmt = '#,##0.00'; });
      rs.getCell(r, 9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: b0 > 0 && !ok0 ? 'FFFFC7CE' : 'FFDDEBF7' } }; r++;
    }
    r++; title(r, 'CANCELADOS (no se suman)'); r++;
    ['Folio', 'Fecha', 'Receptor', 'Subtotal', 'IVA', 'Total', 'Posible sustituto'].forEach((t, k) => { rs.getCell(r, k + 1).value = t; rs.getCell(r, k + 1).font = BB; }); r++;
    if (!A.cancelados.length) { rs.getCell(r, 1).value = 'Ninguno.'; r++; }
    for (const c of A.cancelados) { [c.folio, c.dia, c.receptor, c.sub, c.iva, c.tot, c.sustituto || 'No se encontró uno con el mismo total y receptor'].forEach((v, k) => { rs.getCell(r, k + 1).value = v; rs.getCell(r, k + 1).font = B; if (k >= 3 && k <= 5) rs.getCell(r, k + 1).numFmt = '#,##0.00'; }); r++; }
    r++; title(r, 'FOLIOS QUE NO VIENEN EN EL ARCHIVO'); r++;
    if (!A.faltantes.length) { rs.getCell(r, 1).value = 'Ninguno: la secuencia está completa.'; r++; }
    for (const f of A.faltantes) { rs.getCell(r, 1).value = (f.serie ? f.serie + '-' : '') + f.folio; rs.getCell(r, 2).value = 'Confirmar si es un CFDI que no bajó el sistema o un folio no timbrado.'; r++; }
    if (A.noIngreso.length) { r++; title(r, 'CFDI ACTIVOS QUE NO SON DE INGRESO (no se suman)'); r++; for (const x of A.noIngreso) { rs.getCell(r, 1).value = x.folio; rs.getCell(r, 2).value = x.tipo; rs.getCell(r, 4).value = x.tot; r++; } }
    r++; title(r, 'CRITERIO FISCAL'); r++;
    rs.getCell(r, 1).value = 'IEPS: cuando un producto causa IEPS, el IVA se calcula sobre el precio más el IEPS (art. 18 LIVA); por eso esos CFDI traen un IVA mayor al 16% del subtotal.'; rs.getCell(r, 1).font = { name: 'Arial', size: 9 }; r++;
    rs.getCell(r, 1).value = 'Tasa 0% en bombas: aplica a equipo para riego agrícola (art. 2-A, fr. I, inciso e, LIVA). Una bomba de uso doméstico va al 16%. El contador confirma.'; rs.getCell(r, 1).font = { name: 'Arial', size: 9 };
    rs.getColumn(1).width = 46; rs.getColumn(2).width = 16; rs.getColumn(3).width = 28; [4, 5, 6, 7, 8].forEach(k => rs.getColumn(k).width = 12); rs.getColumn(9).width = 70;
    return await wb.xlsx.writeBuffer();
  }
  const api = { analizar, generar, readConceptos, resumenCalc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ProContaCaso6 = api;
})(typeof window !== 'undefined' ? window : globalThis);

