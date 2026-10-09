import pandas as pd, openpyxl, datetime as dt
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import CellIsRule
R,O,A,m,rep,cf=pd.read_pickle('final.pkl'); N=pd.read_pickle('N.pkl')
wb=openpyxl.load_workbook('base.xlsx')
F='Arial'; H=Font(name=F,bold=True,color='FFFFFF',size=10); HF=PatternFill('solid',fgColor='1F3864')
B=Font(name=F,size=10); BB=Font(name=F,size=10,bold=True); BLUE=Font(name=F,size=10,color='0000FF'); GREY=Font(name=F,size=9,italic=True,color='595959')
TOT=PatternFill('solid',fgColor='D9E1F2'); KEY=PatternFill('solid',fgColor='FFF2CC'); OK=PatternFill('solid',fgColor='C6EFCE'); BAD=PatternFill('solid',fgColor='FFC7CE')
ACC='#,##0.00;[Red]-#,##0.00;-'
COL={'CONCILIADO':'C6EFCE','CONCILIADO C/OBS':'FFEB9C','PARCIAL':'FFD8A8','SIN CFDI':'FFC7CE','NO REQUIERE':'E7E6E6'}
rs=wb.create_sheet('Resumen',0)
for c,w in zip('ABCDE',[62,16,16,14,72]): rs.column_dimensions[c].width=w
rs['A1']='CONCILIACIÓN DE SALIDAS vs CFDI RECIBIDOS · SEPTIEMBRE 2026'; rs['A1'].font=Font(name=F,bold=True,size=13)
rs['A2']='CESAR BERMUDEZ CARMONA · BECC840424JS4 · BBVA Maestra PYME cuenta 0175219310 · del 01/09/2026 al 30/09/2026'; rs['A2'].font=B
rs['A3']='Fuente: estado de cuenta BBVA (22 páginas) y reporte de CFDI recibidos. La app propone; el contador revisa y decide.'; rs['A3'].font=GREY
S="'Conciliación salidas'"
def band(r,t,cols=()):
    rs[f'A{r}']=t; rs[f'A{r}'].font=BB
    for c in 'ABCDE': rs[f'{c}{r}'].fill=TOT
    for c,v in zip('BCD',cols): rs[f'{c}{r}']=v; rs[f'{c}{r}'].font=BB; rs[f'{c}{r}'].alignment=Alignment(horizontal='center')
band(5,'1. VALIDACIÓN DEL ESTADO DE CUENTA',('Leído','Documento','Diferencia'))
chk=[('Número de cargos (salidas)',252,252,'0'),('Importe total de cargos',1938713.49,1938713.49,ACC),
     ('Número de abonos',17,17,'0'),('Importe total de abonos',2034729.60,2034729.60,ACC),
     ('Saldo final: inicial 91,568.16 − cargos + abonos',187584.27,187584.27,ACC)]
for k,(t,a,b_,f) in enumerate(chk,6):
    rs[f'A{k}']=t; rs[f'B{k}']=a; rs[f'C{k}']=b_; rs[f'D{k}']=f'=ROUND(B{k}-C{k},2)'; rs[f'E{k}']=f'=IF(D{k}=0,"OK","REVISAR")'
    for c in 'BCD': rs[f'{c}{k}'].number_format=f; rs[f'{c}{k}'].font=B
    rs[f'C{k}'].font=BLUE; rs[f'A{k}'].font=B; rs[f'E{k}'].font=BB
rs.conditional_formatting.add('E6:E10',CellIsRule(operator='equal',formula=['"OK"'],fill=OK))
rs.conditional_formatting.add('E6:E10',CellIsRule(operator='equal',formula=['"REVISAR"'],fill=BAD))
band(12,'2. RESULTADO DE LA CONCILIACIÓN',('Salidas','Importe','% del importe'))
r=13
for e in ['CONCILIADO','CONCILIADO C/OBS','PARCIAL','SIN CFDI','NO REQUIERE']:
    rs[f'A{r}']=e; rs[f'A{r}'].fill=PatternFill('solid',fgColor=COL[e]); rs[f'A{r}'].font=B
    rs[f'B{r}']=f'=COUNTIF({S}!F2:F{N},A{r})'; rs[f'C{r}']=f'=SUMIF({S}!F2:F{N},A{r},{S}!E2:E{N})'; rs[f'D{r}']=f'=IFERROR(C{r}/$C$18,0)'
    rs[f'C{r}'].number_format=ACC; rs[f'D{r}'].number_format='0.0%'
    for c in 'BCD': rs[f'{c}{r}'].font=B
    r+=1
rs['A18']='TOTAL DE SALIDAS'; rs['B18']='=SUM(B13:B17)'; rs['C18']='=SUM(C13:C17)'; rs['D18']='=SUM(D13:D17)'
for c in 'ABCD': rs[f'{c}18'].font=BB; rs[f'{c}18'].fill=TOT
rs['C18'].number_format=ACC; rs['D18'].number_format='0.0%'
rs['A19']='Control: total de la hoja de conciliación contra el estado de cuenta'; rs['A19'].font=B
rs['B19']=f"={S}!E{N+1}"; rs['C19']='=B7'; rs['D19']='=ROUND(B19-C19,2)'; rs['E19']='=IF(D19=0,"OK","REVISAR")'
for c in 'BCD': rs[f'{c}19'].number_format=ACC; rs[f'{c}19'].font=B
rs['E19'].font=BB
rs.conditional_formatting.add('E19',CellIsRule(operator='equal',formula=['"OK"'],fill=OK))
rs['A20']='% del importe que requiere CFDI y ya lo tiene identificado'; rs['A20'].font=B
rs['C20']='=IFERROR((C13+C14)/(C18-C17),0)'; rs['C20'].number_format='0.0%'; rs['C20'].font=BB; rs['C20'].fill=KEY
band(22,'3. CFDI RECIBIDOS',('Cantidad','Importe',''))
cfd=[('CFDI del mes (activos, tipo ingreso)',len(A),float(A.Total.sum())),
     ('  Con salida bancaria identificada',len(m),float(A[A.cid.isin(m.values())].Total.sum())),
     ('  Sin salida bancaria identificada',len(A)-len(m),float(A[~A.cid.isin(m.values())].Total.sum())),
     ('Complementos de pago (REP) recibidos',len(rep),float(rep.Monto.sum())),
     ('CFDI de egreso (notas de crédito)',3,float(cf[(cf['Tipo de Comprobante']=='EGRESO')].Total.sum())),
     ('CFDI cancelados (no se consideran)',1,float(cf[cf.Estatus=='Cancelado'].Total.sum()))]
for k,(t,a,b_) in enumerate(cfd,23):
    rs[f'A{k}']=t; rs[f'B{k}']=a; rs[f'C{k}']=b_; rs[f'B{k}'].number_format='0'; rs[f'C{k}'].number_format=ACC
    for c in 'ABC': rs[f'{c}{k}'].font=B
band(30,'4. HALLAZGOS')
h=[('Monederos electrónicos de combustible y peaje. Ferche (28 salidas, $316,683) y Operadora Concesionaria (26 salidas, $43,700) funcionan por monedero: el dinero sale al abonar y el CFDI se emite al consumir, así que nunca coinciden uno a uno. Los 9 CFDI de peaje por $125,800 están fechados el 30/09 a las 23:59, que es el cierre del mes. Se concilian por saldo del monedero, no por movimiento.',62),
 ('Créditos y arrendamientos (64 salidas, $559,171). Los cobros automáticos de recibo, Invex, Multiva y los seguros de crédito amortizan capital e intereses. El CFDI sólo ampara intereses y comisiones, así que el cargo bancario siempre será mayor. Hay que validarlos contra la tabla de amortización de cada crédito.',52),
 ('Transferencias a personas sin CFDI (79 salidas, $463,170). La mayoría son SPEI y pagos a cuenta de tercero con conceptos como "gastos juan", "rauliam" o "adelanto sueldo". Si son reembolsos de gastos hace falta el CFDI del proveedor; si son pagos a trabajadores, el CFDI de nómina. Es el bloque más grande por atender.',52),
 ('Gastos personales mezclados: DIDI Food (12 cargos, $2,327), Amazon ($1,076) y colegiaturas del Colegio Americano y COAM ($9,350). Las colegiaturas son deducción personal en la anual, no gasto del negocio.',40),
 ('CFDI en efectivo sin salida bancaria: 20 comprobantes por $38,787. Los que superen $2,000 por operación no son deducibles (art. 27 fr. III LISR). Revisar cómo se pagaron.',34),
 ('Un CFDI PPD de Molinos Azteca por $382,500 (30/09) no tiene pago en el mes: es la factura más grande del periodo y se acredita cuando llegue su complemento de pago.',34),
 ('SIPARE del 17/09 por $60,562.26: cubre IMSS ($33,378.99) e Infonavit ($27,183.27). Los CFDI los emiten los institutos y juntos no suman el total del cargo; la diferencia es la aportación al Afore.',40),
 ('El estado de cuenta se leyó completo y cuadra: 252 cargos, 17 abonos y el saldo final de $187,584.27 coinciden con el documento del banco.',28)]
r=31
for k,(t,alt) in enumerate(h,1):
    rs.merge_cells(f'A{r}:E{r}'); rs[f'A{r}']=f'{k}. {t}'; rs[f'A{r}'].font=B
    rs[f'A{r}'].alignment=Alignment(wrap_text=True,vertical='top'); rs.row_dimensions[r].height=alt; r+=1
r+=1; band(r,'5. PENDIENTES PARA EL DESPACHO'); r+=1
p=['Estado de cuenta de la tarjeta de crédito: hay dos pagos de TDC por $83,095.55 y CFDI con forma 04.',
 'Saldos y consumos de los monederos de Ferche y Operadora Concesionaria, para conciliarlos por saldo.',
 'CFDI de nómina o comprobantes de los reembolsos a personas (Rauliam, Juan, Adolfo, Kyara, Montero y demás).',
 '¿Las salidas de inversión patrimonial ($110,000 y $216,412.17 a cuenta de tercero) son inversión, préstamo o pago?',
 'Confirmar si la cuenta es sólo del negocio: aparecen consumos personales y colegiaturas.',
 'Catálogo de proveedores: confirmar las CLABE que la app ya aprendió (Suchixtlahuaca, Ánimas, El Saucillo, Tractoaccesorios, PYSA, Ferche).']
for k,t in enumerate(p,1):
    rs.merge_cells(f'A{r}:E{r}'); rs[f'A{r}']=f'{k}. {t}'; rs[f'A{r}'].font=B; rs[f'A{r}'].alignment=Alignment(wrap_text=True,vertical='top'); r+=1
wb.move_sheet('Resumen',offset=-wb.sheetnames.index('Resumen'))
wb.active=0
out='/mnt/user-data/outputs/Conciliacion_Salidas_vs_CFDI_Sep2026_BECC840424JS4.xlsx'
wb.save(out); print(out)
