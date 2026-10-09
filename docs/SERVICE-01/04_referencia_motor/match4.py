import pandas as pd, numpy as np, re, itertools
from scipy.optimize import linear_sum_assignment
O,A,pairs1,rep,cf=pd.read_pickle('match3.pkl')
m={a:b for a,b,_,_ in pairs1}
est={a:('CONCILIADO' if ok and g<=3 else 'CONCILIADO C/OBS') for a,b,ok,g in pairs1}
nota={}
for a,b,ok,g in pairs1:
    x=O[O.bid==a].iloc[0]; y=A[A.cid==b].iloc[0]
    n=[]
    if not ok: n.append('Proveedor identificado por el nombre del concepto, no por RFC')
    if g>3: n.append(f'CFDI emitido {g} días antes o después del cargo')
    if str(y['Forma de Pago'])=='1': n.append('CFDI con forma 01 (efectivo); se pagó por transferencia: pedir sustitución')
    nota[a]='. '.join(n)
# ---------- 2) PPD liquidados con REP
usados=set(m.values())
reps=rep.copy(); reps['key']=reps.RFC+'|'+reps.Monto.round(2).astype(str)
ppd=A[(~A.cid.isin(usados))&(A['Método de Pago']=='PPD')]
rep_match={}
for _,y in ppd.iterrows():
    r=reps[(reps.RFC==y['R.F.C. Emisor'])]
    if len(r): rep_match[y.cid]=f"REP del {r.iloc[0].Fecha:%d/%m} por ${r.Monto.sum():,.2f}"
# ---------- 3) pagos agrupados: una salida que cubre varios CFDI del mismo proveedor
libres=A[~A.cid.isin(usados)].copy()
sin=O[~O.bid.isin(m)].copy()
grupos=[]
for rfc,g in libres.groupby('R.F.C. Emisor'):
    cand=sin[sin.rfc_h==rfc]
    if not len(cand) or len(g)>14: continue
    for _,x in cand.iterrows():
        vals=[(int(r.cid),round(r.Total,2)) for _,r in g.iterrows() if r.Total<=x.imp+0.01 and abs((r.Fecha.normalize()-x.fecha).days)<=20]
        found=None
        for k in (2,3,4):
            for combo in itertools.combinations(vals,k):
                if abs(sum(v for _,v in combo)-x.imp)<0.02: found=combo; break
            if found: break
        if found:
            grupos.append((int(x.bid),[c for c,_ in found])); g=g[~g.cid.isin([c for c,_ in found])]
            sin=sin[sin.bid!=x.bid]
print('pagos agrupados encontrados:',len(grupos))
for bid,cids in grupos:
    x=O[O.bid==bid].iloc[0]; print(f"  {x.oper} {x.desc[:28]:<28} ${x.imp:>12,.2f} = {len(cids)} CFDI")
pd.to_pickle((O,A,pairs1,rep,cf,grupos,rep_match,est,nota),'match4.pkl')
