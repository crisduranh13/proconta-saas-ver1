import pandas as pd, numpy as np, re, datetime as dt, openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as L
O,A,pairs,rep,cf,grupos,rep_match,est0,nota0=pd.read_pickle('match4.pkl')
m={a:b for a,b,_,_ in pairs}; info={a:(ok,g) for a,b,ok,g in pairs}
Ai=A.set_index('cid')
MONEDERO={'GFE9707075U3':'Ferche (combustible)','OCM0505317M0':'Operadora Concesionaria (peaje)'}
NOREQ=[('TRASPASO CUENTAS PROPIAS','Traspaso entre cuentas propias'),('RETIRO SIN TARJETA','Retiro de efectivo'),
 ('RETIRO INV. PATRIMONIAL','Movimiento de inversión patrimonial (no es gasto)'),('DEPOSITO INV. PATRIMONIAL','Movimiento de inversión patrimonial'),
 ('PAGO TARJETA DE CREDITO','Pago de tarjeta de crédito: los consumos se revisan en el estado de la TDC'),
 ('SPEI DEVUELTO','SPEI devuelto'),('F EXT BANCO ACTINVER','Operación con casa de bolsa: confirmar si es inversión o pago')]
PERSONAL=[('DIDI FOOD','Consumo personal (comida)'),('AMAZON','Compra en Amazon: facturar desde el portal'),
 ('COLEG AMERICANO','Colegiatura: deducción personal en la anual, no del negocio'),('COLEGIO COAM','Colegiatura: deducción personal')]
def clasifica(x):
    bid=int(x.bid); d=x.full
    if bid in m:
        ok,g=info[bid]; y=Ai.loc[m[bid]]
        n=[]
        if not ok: n.append('Proveedor identificado por el concepto del movimiento, no por RFC')
        if g>3: n.append(f'CFDI emitido con {g} días de diferencia respecto al cargo')
        if str(y['Forma de Pago'])=='1': n.append('CFDI con forma 01 (efectivo) pero se pagó por transferencia: pedir sustitución')
        if str(y['Forma de Pago'])=='4': n.append('CFDI con forma 04 (tarjeta de crédito) pero salió de la cuenta: revisar')
        return ('CONCILIADO' if not n else 'CONCILIADO C/OBS'), y, '. '.join(n)
    for k,t in NOREQ:
        if k in d: return 'NO REQUIERE',None,t
    if 'COBRO AUTOMATICO RECIBO' in d or 'BANCO INVEX' in d or 'BANCO MULTIVA' in d or 'PAGO VIDA CREDITO' in d:
        return 'PARCIAL',None,'Pago de crédito o arrendamiento: el CFDI ampara intereses y comisiones, no el capital. Verificar contra la tabla de amortización'
    if 'IMSS/INF/AFORE' in d: return 'PARCIAL',None,'Pago SIPARE: cubre cuotas IMSS ($33,378.99), Infonavit ($27,183.27) y aportaciones; los CFDI los emiten los institutos'
    if x.rfc_h in MONEDERO: return 'PARCIAL',None,f'Abono a monedero electrónico de {MONEDERO[x.rfc_h]}: el CFDI se emite al consumir, no al abonar. Conciliar por saldo del monedero'
    for k,t in PERSONAL:
        if k in d: return 'SIN CFDI',None,t
    if 'SAT' in d.split(): return 'NO REQUIERE',None,'Pago de impuestos (línea de captura)'
    if 'AXA SEGUROS' in d or 'META SEGURA' in d or 'QUALITAS' in d: return 'CONCILIADO C/OBS',None,'Póliza de seguro: el CFDI es PPD y se acredita con el complemento de pago (REP) del mes'
    if 'PAGO CUENTA DE TERCERO' in d or 'SPEI ENVIADO' in d: return 'SIN CFDI',None,'Transferencia a tercero sin CFDI identificado: pedir la factura o aclarar el concepto'
    return 'SIN CFDI',None,'Sin CFDI identificado'
rows=[]
for _,x in O.sort_values(['fecha','bid']).iterrows():
    e,y,n=clasifica(x)
    rows.append([x.oper,x.liq,x.desc[:46],x.det[:70],float(x.imp),e,
        (y.SF if y is not None else ''),(y['R.F.C. Emisor'] if y is not None else x.rfc_h),
        (str(y['Razón Social Emisor'])[:34] if y is not None else ''),
        (y.Fecha.strftime('%d/%m/%Y') if y is not None else ''),(float(y.Total) if y is not None else None),
        (y['Método de Pago'] if y is not None else ''),('%02d'%int(float(y['Forma de Pago'])) if y is not None else ''),
        (y['Uso Cfdi Receptor'] if y is not None else ''),n])
R=pd.DataFrame(rows,columns=['Fecha oper','Fecha liq','Movimiento del banco','Referencia','Importe','Estatus','CFDI','RFC emisor','Emisor','Fecha CFDI','Total CFDI','Método','Forma','Uso','Observación del contador'])
print(R.groupby('Estatus').Importe.agg(['size','sum']).round(2))
pd.to_pickle((R,O,A,m,rep,cf),'final.pkl')
