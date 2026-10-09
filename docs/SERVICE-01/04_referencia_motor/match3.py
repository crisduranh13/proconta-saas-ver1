import pandas as pd, numpy as np, re
from scipy.optimize import linear_sum_assignment
b,OUT,cf,rep,*_=pd.read_pickle('data.pkl')
O=OUT.reset_index(drop=True).copy(); O['rfc']=O.rfc.fillna('')
A=cf[(cf.Estatus=='Activo')&(cf['Tipo de Comprobante']=='INGRESO')].reset_index(drop=True).copy()
CLABE={'00014610655047727481':'GSU010620SB9','00646180167300304911':'CGA010307N18','00646180167300310549':'GFE9707075U3',
       '00646180219700000035':'GFE9707075U3','00014905655031692761':'ESS081204Q70','00030905900007720383':'TAC1603178D3',
       '00002853097437734783':'PSA980223677','00072823005407841182':'ESM1507015Y1','00014910655071527807':'GDC080123L17'}
PAL=[('GAS SUCHIX','GSU010620SB9'),('GAS ANIMAS','CGA010307N18'),('SAUCILLO','ESS081204Q70'),('COSTA SUR','TAC1603178D3'),
     ('TRACTOACCESORIOS','TAC1603178D3'),('TRACTO ACCESORIOS','TAC1603178D3'),('QUALITAS','QCS931209G49'),('AXA SEGUROS','ASE931116231'),
     ('MARRIVER','ESM1507015Y1'),('PYSA','PSA980223677'),('NURBAN','GCB131029JY5'),('LLANTAS Y RINES','GSO120427I62'),
     ('OPERADORA CONCESIONA','OCM0505317M0'),('IMSS/INF/AFORE','IMS421231I45'),('GAS Y DERIVADOS','GDC080123L17'),
     ('AUTOPARTES VERACRUZ','AVE0000000X0'),('TELEFONOS DE MEXICO','TME840315KT6'),('TELCEL','RDI841003QJ4'),
     ('COLEG AMERICANO','CAX140219M75'),('COLEGIO COAM','CXA1302207U6'),('BANCO MULTIVA','BMI061005NY5'),
     ('META SEGURA','SBB961118TIA'),('PAGO VIDA CREDITO','SBB961118TIA'),('SERV BANCA INTERNET','BBA830831LJ2'),
     ('IVA COM SERV','BBA830831LJ2'),('COBRO AUTOMATICO RECIBO','BBA830831LJ2'),('BANCO INVEX','RAD130627IH2'),
     ('GRUPO FERCHE','GFE9707075U3'),('FERCHEGAS','GFE9707075U3'),('FERCHE','GFE9707075U3')]
def hint(r):
    if r.rfc: return r.rfc
    for cl,v in CLABE.items():
        if cl in r.full: return v
    for p,v in PAL:
        if p in r.full: return v
    return ''
O['rfc_h']=O.apply(hint,axis=1)
print('salidas con proveedor identificado:',(O.rfc_h!='').sum(),'de',len(O))
STOP=set('SPEI ENVIADO PAGO CUENTA TERCERO TRANSFERENCIA PROPIAS TRASPASO RETIRO TARJETA COBRO AUTOMATICO RECIBO PREST BNET MBAN BMOV GASTOS GASTO SA CV DE LA DEL RL SAPI SERVICIOS COMPANIA SEGUROS GRUPO BANCO INSTITUCION BANCA MULTIPLE FINANCIERO MEXICO'.split())
def toks(s):
    s=re.sub(r'[^A-ZÑ ]',' ',str(s).upper().replace('Ñ','N'))
    return {t for t in s.split() if len(t)>=4 and t not in STOP}
O['tk']=O.full.apply(toks); A['tk']=A['Razón Social Emisor'].apply(toks)
sim=lambda a,c: 0.0 if (not a or not c) else len(a&c)/min(len(a),len(c))
cost=np.full((len(O),len(A)),1e6)
for i,x in O.iterrows():
    for j,y in A.iterrows():
        if abs(round(x.imp-y.Total,2))>0.05: continue
        gap=min(abs((x.fecha-y.Fecha.normalize()).days),abs((x.liqf-y.Fecha.normalize()).days))
        if gap>20: continue
        rfc_ok = x.rfc_h and x.rfc_h==y['R.F.C. Emisor']
        s=sim(x.tk,y.tk)
        cost[i,j]=(0 if rfc_ok else (6 if s>0.3 else 40))+gap*1.2
r,c=linear_sum_assignment(cost)
pairs=[(int(O.bid[i]),int(A.cid[j]),bool(O.rfc_h[i] and O.rfc_h[i]==A['R.F.C. Emisor'][j]),int(min(abs((O.fecha[i]-A.Fecha[j].normalize()).days),abs((O.liqf[i]-A.Fecha[j].normalize()).days)))) for i,j in zip(r,c) if cost[i,j]<1e5]
m={a:bb for a,bb,_,_ in pairs}
print('cruces:',len(pairs),'| por RFC:',sum(1 for *_,ok,g in pairs if ok))
sin=O[~O.bid.isin(m)]; nop=A[~A.cid.isin(m.values())]
print('salidas sin CFDI:',len(sin),round(sin.imp.sum(),2),'| CFDI sin pago:',len(nop),round(nop.Total.sum(),2))
pd.to_pickle((O,A,pairs,rep,cf),'match3.pkl')
