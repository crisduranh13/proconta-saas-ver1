import pdfplumber, re, pandas as pd
F=re.compile(r'^\d{2}/[A-ZÁ]{3}$')
rows=[]
with pdfplumber.open('/mnt/user-data/uploads/Estado_de_Cuenta_-_TRY5MQ09.pdf') as pdf:
    for pn,pg in enumerate(pdf.pages,1):
        ws=pg.extract_words(keep_blank_chars=False)
        hd={x['text']:x for x in ws if x['text'] in ('OPER','LIQ','DESCRIPCIÓN','REFERENCIA','CARGOS','ABONOS','OPERACIÓN')}
        if 'DESCRIPCIÓN' not in hd or 'CARGOS' not in hd: continue
        top=hd['DESCRIPCIÓN']['top']
        lim_liq=hd['LIQ']['x0']-4; lim_desc=hd['DESCRIPCIÓN']['x0']-4
        lim_cargo=hd['CARGOS']['x1']+6; lim_abono=hd['ABONOS']['x1']+6; lim_oper=hd['OPERACIÓN']['x1']+6
        body=[x for x in ws if x['top']>top+6 and 'BBVA MEXICO' not in x['text'] and 'Av. Paseo' not in x['text']]
        stop=[x['top'] for x in ws if x['text'] in ('Total','Cuadro','Glosario','Nombre') and x['top']>top]
        if stop: body=[x for x in body if x['top']<min(stop)-2]
        lines={}
        for x in body: lines.setdefault(round(x['top'],1),[]).append(x)
        cur=None
        for t in sorted(lines):
            seg=sorted(lines[t],key=lambda x:x['x0'])
            if F.match(seg[0]['text']) and seg[0]['x0']<lim_liq and len(seg)>1 and F.match(seg[1]['text']):
                def col(x):
                    if x<lim_liq: return 'oper'
                    if x<lim_desc-1: return 'liq'
                    if x<lim_cargo-62: return 'desc'
                    if x<lim_cargo: return 'cargo'
                    if x<lim_abono: return 'abono'
                    if x<lim_oper: return 'sal1'
                    return 'sal2'
                d={}
                for x in seg: d.setdefault(col(x['x0']),[]).append(x['text'])
                # el importe puede quedar pegado a la descripción si la columna está desplazada
                if 'cargo' not in d and 'abono' not in d and d.get('desc') and re.fullmatch(r'[\d,]+\.\d{2}',d['desc'][-1]):
                    d['cargo']=[d['desc'].pop()]
                num=lambda k: float(d[k][0].replace(',','')) if k in d and re.fullmatch(r'[\d,]+\.\d{2}',d[k][0]) else 0.0
                cur=dict(pag=pn,oper=d['oper'][0],liq=(d.get('liq') or d['oper'])[0],desc=' '.join(d.get('desc',[])),cargo=num('cargo'),abono=num('abono'),
                         saldo=num('sal1') or num('sal2'),extra=[])
                rows.append(cur)
            elif cur is not None:
                txt=' '.join(x['text'] for x in seg).strip()
                if txt: cur['extra'].append(txt)
b=pd.DataFrame(rows); b['det']=b.extra.apply(' '.join)
print('movimientos:',len(b),'| cargos:',round(b.cargo.sum(),2),(b.cargo>0).sum(),'| abonos:',round(b.abono.sum(),2),(b.abono>0).sum())
print('esperado   : 269 | cargos: 1,938,713.49 (252) | abonos: 2,034,729.60 (17)')
s=91568.16
ok=True
for _,r in b.iterrows():
    s=round(s-r.cargo+r.abono,2)
    if r.saldo and abs(s-r.saldo)>0.01: ok=False
print('saldo final:',s,'(esperado 187,584.27) | saldos intermedios consistentes:',ok)
b.to_pickle('banco.pkl')
