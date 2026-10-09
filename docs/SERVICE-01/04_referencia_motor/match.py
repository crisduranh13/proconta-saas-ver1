import pandas as pd, numpy as np, re, datetime as dt
from scipy.optimize import linear_sum_assignment
b=pd.read_pickle('banco.pkl')
b['fecha']=pd.to_datetime('2026-'+b.oper.str[3:].map({'SEP':'09'})+'-'+b.oper.str[:2])
b['liqf']=pd.to_datetime('2026-'+b.liq.str[3:].map({'SEP':'09'})+'-'+b.liq.str[:2])
b['full']=(b.desc+' '+b.det).str.upper()
b['rfc']=b.full.str.extract(r'RFC:\s*([A-ZÑ&]{3,4})\s?(\d{6}[A-Z0-9]{3})').apply(lambda r:(r[0] or '')+(r[1] or ''),axis=1)
b['clabe']=b.full.str.findall(r'\b(\d{18})\b').apply(lambda x:x[0] if x else '')
b=b.reset_index(drop=True); b['bid']=b.index
OUT=b[b.cargo>0].copy(); OUT['imp']=OUT.cargo.round(2)
# --- CFDI
raw=pd.read_excel('/mnt/user-data/uploads/RECIBIDOS_DD_09.xlsx',dtype=str)
cut=raw.index[raw['Serie'].astype(str)=='Folio'][0]
cf=raw.iloc[:cut].copy(); cf=cf[cf['Tipo de Comprobante'].isin(['INGRESO','EGRESO'])].copy()
rep=raw.iloc[cut+1:].copy(); rep.columns=['Folio','RFC','Razon','Fecha','UUID','Monto','Polizas','Estatus','FormaPago','IVARet','IVATras','ISRRet','Metodo','Uso','Com']+list(rep.columns[15:])
rep=rep[rep.UUID.notna()].copy(); rep['Monto']=pd.to_numeric(rep.Monto,errors='coerce'); rep['Fecha']=pd.to_datetime(rep.Fecha)
for c_ in ('Sub Total','Total','Total IVA Tras.','Descuento','Total IVA Ret.','Total ISR Ret.'): cf[c_]=pd.to_numeric(cf[c_],errors='coerce').fillna(0)
cf['Fecha']=pd.to_datetime(cf.Fecha); cf=cf.reset_index(drop=True); cf['cid']=cf.index
cf['SF']=(cf.Serie.fillna('').astype(str).str.strip()+'-'+cf.Folio.fillna('').astype(str).str.strip()).str.strip('-')
print('CFDI:',len(cf),'| REP:',len(rep),'| salidas:',len(OUT))
print('CFDI por tipo/estatus:',cf.groupby(['Tipo de Comprobante','Estatus']).size().to_dict())
# catálogo CLABE/concepto -> RFC
STOP=set('SPEI ENVIADO PAGO CUENTA DE TERCERO TRANSFERENCIA PROPIAS TRASPASO RETIRO SIN TARJETA COBRO AUTOMATICO RECIBO PREST BNET MBAN BMOV REF GASTOS GASTO SA CV DE LA DEL SAS RL'.split())
def toks(s):
    s=re.sub(r'[^A-ZÑ ]',' ',str(s).upper().replace('Ñ','N'))
    return {t for t in s.split() if len(t)>=4 and t not in STOP}
OUT['tk']=OUT.full.apply(toks); cf['tk']=cf['Razón Social Emisor'].apply(toks)
sim=lambda a,c: 0.0 if (not a or not c) else len(a&c)/min(len(a),len(c))
act=cf[(cf.Estatus=='Activo')&(cf['Tipo de Comprobante']=='INGRESO')].copy()
cost=np.full((len(OUT),len(act)),1e6)
O=OUT.reset_index(drop=True); A=act.reset_index(drop=True)
for i,x in O.iterrows():
    for j,y in A.iterrows():
        d=round(x.imp-y.Total,2)
        if abs(d)>1.0: continue
        gap=min(abs((x.fecha-y.Fecha.normalize()).days),abs((x.liqf-y.Fecha.normalize()).days))
        if gap>25: continue
        rfc_ok = x.rfc and x.rfc==y['R.F.C. Emisor']
        s=sim(x.tk,y.tk)
        cost[i,j]=(0 if d==0 else 60)+abs(d)*5+gap*1.5+(0 if rfc_ok else 25*(1-s))
r,c=linear_sum_assignment(cost)
pairs=[(O.bid[i],A.cid[j]) for i,j in zip(r,c) if cost[i,j]<1e5]
print('cruces:',len(pairs))
pd.to_pickle((b,OUT,cf,rep,pairs,A,O),'data.pkl')
m={bb:cc for bb,cc in pairs}
sin=O[~O.bid.isin(m)]
print('salidas sin CFDI:',len(sin),round(sin.imp.sum(),2))
print('CFDI activos sin pago:',len(A[~A.cid.isin(m.values())]),round(A[~A.cid.isin(m.values())].Total.sum(),2))
