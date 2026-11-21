import re,sys,os
D=os.path.dirname(os.path.abspath(__file__))
ROOT=os.path.abspath(os.path.join(D,'..','..'))
s=open(D+'/base.html').read()
def rep(a,b,n=1):
    global s
    if a not in s: print("MISSING:",a[:90]); sys.exit(1)
    s=s.replace(a,b,n)

# ---- icons
rep(" arrowr:'",""" gear:'<path d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z"/><path d="M19.4 13a7.5 7.5 0 000-2l2-1.5-2-3.4-2.3.9a7.5 7.5 0 00-1.7-1L15 3h-4l-.4 3a7.5 7.5 0 00-1.7 1l-2.3-.9-2 3.4 2 1.5a7.5 7.5 0 000 2l-2 1.5 2 3.4 2.3-.9a7.5 7.5 0 001.7 1L11 21h4l.4-3a7.5 7.5 0 001.7-1l2.3.9 2-3.4z"/>',
 speaker:'<path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500z"/><path d="M15.500 9a4 4 0 010 6M18 6.500a8 8 0 010 11"/>',
 bot:'<path d="M4 4h16v12h-8l-4 4v-4H4z"/><rect x="10.200" y="6.500" width="3.600" height="5" rx="1.800"/><path d="M8.800 10.500a3.200 3.200 0 006.400 0"/>',
 send:'<path d="M4 12l16-8-6 16-3-6.500z"/>',
 stopsq:'<rect x="6" y="6" width="12" height="12" rx="2"/>',
 phone:'<path d="M6 4h3l1.500 4-2 1.500a11 11 0 005 5L15 12.500l4 1.500v3a2 2 0 01-2 2C9.500 19 5 14.500 5 6a2 2 0 011-2z"/>',
 eye:'<path d="M2 12s3.500-6.500 10-6.500S22 12 22 12s-3.500 6.500-10 6.500S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
 arrowr:'""",1)

# ---- CSS + DOM
rep("</style>\n</head>","\n"+open(D+'/app_voice.css').read()+open(D+'/app_live.css').read()+"</style>\n</head>")
rep('<div class="demo" id="demo">','<div class="demo" id="demo" data-f="demo">')
rep('<div class="layer" id="layer"></div>','<div class="layer" id="layer"></div>\n <div class="ast" id="ast"></div>\n <button class="fab" id="fab" data-f="assistant" onclick="astOpen(true)" aria-label="Voice assistant"></button>')

# ---- top bar + tabs
rep("""<span class="pill"><span class="dot"></span>${ic('bt')}BT</span>""","""<span class="pill" data-f="bt" title="Bluetooth scale"><span class="dot"></span>${ic('bt')}</span>""")
rep("""<button class="pill" onclick="S.lang=S.lang==='en'?'kn':'en';render()">""","""<button class="pill" data-f="lang" onclick="S.lang=S.lang==='en'?'kn':'en';render()">""")
rep("""<button class="pill on" onclick="S.mode=S.mode==='worker'""","""${S.mode==='worker'?'':`<button class="pill" onclick="sheetSettings()" aria-label="Settings">${ic('gear')}</button>`}${S.mode==='worker'?'':`<button class="pill" onclick="millCounterOpen()" aria-label="Barrel counter desk">${icoSvg('bfull',22)}</button>`}<button class="pill on" data-f="mode" onclick="S.mode=S.mode==='worker'""")
rep("""`<button class="cp ${hl?'has':''}" onclick="${fn}">""","""`<button class="cp ${hl?'has':''}" data-f="tab-${key}" onclick="${fn}">""")
rep("""return `<div class="own"><span>""","""return `<div class="own" data-f="own"><span>""")
rep("""<label class="search">${ic('search')}<input id="q" placeholder="${t('search')}" value="${esc(S.q)}" oninput="S.q=this.value;render();const e=$('#q');e.focus();e.setSelectionRange(99,99)"></label>""","""<label class="search" data-f="search">${ic('search')}<input id="q" placeholder="${t('search')}" value="${esc(S.q)}" oninput="S.q=this.value;render();const e=$('#q');e.focus();e.setSelectionRange(99,99)">${micBtn('q','text')}</label>""")
rep("""return `<div class="grp"><span class="gi" style="background:${g.c}">${ic(g.icon)}</span>${S.lang==='kn'?g.kn:g.en}</div><div class="grid">${its.map(i=>tileBtn(i,wk)).join('')}</div>`}).join('')}""","""return `<div data-f="g-${g.id}"><div class="grp"><span class="gi" style="background:${g.c}">${ic(g.icon)}</span>${S.lang==='kn'?g.kn:g.en}</div><div class="grid">${its.map(i=>tileBtn(i,wk)).join('')}</div></div>`}).join('')}""")

# ---- hideable buttons
rep("""<button class="sbtn" onclick="wToJob(${gi})">""","""<button class="sbtn" data-f="addjob" onclick="wToJob(${gi})">""")
rep("""<button class="ch ${sp.stick?'sel':''}" onclick="S.slip.stick""","""<button class="ch ${sp.stick?'sel':''}" data-f="stick" onclick="S.slip.stick""")
rep("""<button class="hold" onclick="parkSlip()">""","""<button class="hold" data-f="hold" onclick="parkSlip()">""")
rep("""<div class="cake"><button""","""<div class="cake" data-f="khalichg"><button""")
rep("""<button class="mrow" onclick="sheetNum('Customer advance (₹)',v=>{S.slip.advC""","""<button class="mrow" data-f="adv" onclick="sheetNum('Customer advance (₹)',v=>{S.slip.advC""")
rep("""<button class="mrow" onclick="sheetNum('Tempo advance (₹)',v=>{S.slip.advA""","""<button class="mrow" data-f="adv" onclick="sheetNum('Tempo advance (₹)',v=>{S.slip.advA""")
rep("""<div class="cans3">""","""<div class="cans3" data-f="cans">""")
rep("""<div class="sec"><div class="grp"><span class="gi" style="background:#C98A25">${ic('swap')}""","""<div class="sec" data-f="khalichg"><div class="grp"><span class="gi" style="background:#C98A25">${ic('swap')}""")
rep("""`<button class="trow" ${fn&&edit?""","""`<button class="trow" data-f="${/advance/i.test(label)?'adv':''}" ${fn&&edit?""")
rep("""return `<div class="trow"><span class="ti">${icoSvg(ico,36)}""","""return `<div class="trow" data-f="cans"><span class="ti">${icoSvg(ico,36)}""")

# ---- serial headers: speaker + data-tok
rep("""const jhead=(j,place)=>`<div class="jh">""","""const jhead=(j,place)=>`<div class="jh" data-tok="${j.tok}">""")
rep("""${place&&j.customer!==j.place?'<br>'+esc(j.place):''}</span></div>`;""","""${place&&j.customer!==j.place?'<br>'+esc(j.place):''}</span>${spkBtn(`sayJob('${j.tok}')`)}</div>`;""")
rep("""const whead=(n,tm)=>`<div class="jh"><div class="snw"><b class="sn">${n}</b><small>Queue</small></div><div class="jm">${dtHTML(tm)}</div></div>`;""","""const whead=(n,tm,gi)=>`<div class="jh"><div class="snw"><b class="sn">${n}</b><small>Queue</small></div><div class="jm">${dtHTML(tm)}</div>${spkBtn(`sayGroup(${gi})`)}</div>`;""")
rep("""${whead(gi+1,g.items[0].time)}""","""${whead(gi+1,g.items[0].time,gi)}""")
# job card header: phone + read aloud
rep("""${j.tok.replace('JW-','#')} · ${esc(j.place)} · ${j.time}</small>`,""","""${j.tok.replace('JW-','#')} · ${esc(j.place)} · ${j.time}${j.mobile?` · <a class="callrow" href="tel:${j.mobile}" onclick="event.stopPropagation()">${ic('phone')} ${fmtMob(j.mobile)}</a>`:''}</small>${spkBtn(`sayJob('${j.tok}')`)}`,""")

# ---- optional mobile number
rep("['Gundappa','Janawada']","['Gundappa','Janawada','9876543210']")
rep("['Sangamma','Bhalki']","['Sangamma','Bhalki','9845012345']")
rep("customer:'Gundappa',","customer:'Gundappa',mobile:'9876543210',")
rep("customer:'Sangamma',","customer:'Sangamma',mobile:'9845012345',")
a=s.index("function sheetCust(){"); b=s.index("function sheetNum(")
s=s[:a]+r'''function sheetCust(){layer('Customer',`${inpW('<input class="inp" id="cq" placeholder="Search name, village or mobile" oninput="custFilter()" autocomplete="off">','cq','text')}<div id="cres"></div>
 <div class="card"><h3>${ic('plus')} New customer</h3>${inpW('<input class="inp" id="nc" placeholder="Name (optional)" autocomplete="off">','nc','name')}
 <div style="height:8px"></div>${inpW('<input class="inp" id="nm" inputmode="numeric" maxlength="14" placeholder="Mobile number (optional)" autocomplete="off">','nm','digits')}
 <div class="chrow">${PLACES.map(p=>`<button class="ch" onclick="newCust('${p}')">${ic('pin')} ${p}</button>`).join('')}</div><div class="note">Name and mobile are optional. Tap the village to save. With no name, the village is the customer.</div></div>`);custFilter()}
function custFilter(){const q=(($('#cq')||{}).value||'').trim().toLowerCase(),qd=q.replace(/\D/g,''),m=(t)=>!q||String(t||'').toLowerCase().includes(q)||(qd.length>=3&&String(t||'').includes(qd));
 const cs=CUSTS.map((c,i)=>[c,i]).filter(([c])=>m(c[0])||m(c[1])||m(c[2])),vs=PLACES.filter(m);
 $('#cres').innerHTML=(cs.length?`<div class="chrow">${cs.map(([c,i])=>`<button class="ch" onclick="S.slip.cust=CUSTS[${i}];closeLayer()">${c[0]===c[1]?ic('pin'):ic('user')} ${esc(c[0])}${c[0]===c[1]?'':`<br><small style="color:var(--soft);font:500 13px var(--body)">${ic('pin')} ${esc(c[1])}${c[2]?' · '+ic('phone')+' '+fmtMob(c[2]):''}</small>`}</button>`).join('')}</div>`:'')
 +(vs.length?`<div class="grp" style="margin-top:10px"><span class="gi" style="background:#2E7D5B">${ic('pin')}</span>Village only (no name)</div><div class="chrow">${vs.map(p=>`<button class="ch" onclick="S.slip.cust=['${p}','${p}'];closeLayer()">${ic('pin')} ${p}</button>`).join('')}</div>`:'')
 +(!cs.length&&!vs.length?'<div class="note">No match. Add a new customer below.</div>':'')}
function newCust(p){const n=($('#nc').value||'').trim()||p,mb=cleanMobile($('#nm')?$('#nm').value:'');if(mb===null)return toast('Mobile number must be 10 digits, or leave it empty','bad');const c=[n,p,mb||''];if(n!==p&&!CUSTS.find(x=>x[0]===n&&x[1]===p))CUSTS.push(c);S.slip.cust=c;closeLayer()}
'''+s[b:]
rep("""<b>${esc(sp.cust[0])}</b> · ${esc(sp.cust[1])}<small>tap to change</small>""","""<b>${esc(sp.cust[0])}</b>${sp.cust[0]===sp.cust[1]?'':' · '+esc(sp.cust[1])}<small>${sp.cust[2]?fmtMob(sp.cust[2])+' · ':''}tap to change</small>""")
rep("""place:sp.cust[1],lines:sp.lines.slice(),""","""place:sp.cust[1],mobile:sp.cust[2]||'',lines:sp.lines.slice(),""")
rep("""['Village',j.place],['-'],""","""['Village',j.place],...(j.mobile?[['Mobile',fmtMob(j.mobile)]]:[]),['-'],""")
rep("""layer(title,`<div class="mrow" style="justify-content:flex-end"><span class="amt" id="advv\"""","""layer(title,`<div class="mrow" style="justify-content:flex-end"><button type="button" class="vbtn mic" data-f="voice" id="mb-advv" onclick="micAmount()" aria-label="Speak the amount">${ic('mic')}</button><span class="amt" id="advv\"""") if "layer(title,`<div class=\"mrow\" style=\"justify-content:flex-end\"><span class=\"amt\" id=\"advv\"" in s else None

# ---- khali icon on Jobs/Held buttons
s=s.replace("<span class=\"pc gd\">${j.cake==='SHOP'?'khali: shop':'khali: customer'}</span>","<span class=\"pc gd\">${ic('bag')}${j.cake==='SHOP'?'khali: shop':'khali: customer'}</span>")
rep("ic('swap')+' Khali'","ic('swap')+ic('bag')+' Khali'")
rep("${ic(!j.settled?'rupee':'oilout')}${ic('arrowr')}","${!j.settled&&j.cake!=='SHOP'?ic('bag'):''}${ic(!j.settled?'rupee':'oilout')}${ic('arrowr')}")
rep("['rupee',dirIn?'Khali payment':'Pay customer',j.settled]","[dirIn?'bag':'rupee',dirIn?'Khali payment':'Pay customer',j.settled]")
rep("${ic('down')} Khali payment","${ic('down')}${ic('bag')} Khali payment")
rep("</span>${dirIn?'Khali payment':'Pay customer'} – ${amt}","</span>${dirIn?ic('bag'):''}${dirIn?'Khali payment':'Pay customer'} – ${amt}")
rep("<span class=\"sp\">${dirIn?'Khali payment':'Pay customer'} – ${amt}","<span class=\"sp\">${dirIn?ic('bag'):''}${dirIn?'Khali payment':'Pay customer'} – ${amt}")
rep("<span class=\"pc gd\">Khali out","<span class=\"pc gd\">${ic('bag')}Khali out")
# ---- own mill: tab, labels, hooks
rep("const L={en:{waiting:'Waiting',","const L={en:{mill:'Our mill',waiting:'Waiting',")
rep("${ico==='jc'?jcIcon(24):ic(ico)}","${ico==='jc'?jcIcon(24):ico==='own'?ownIcon(24):ic(ico)}")
rep("+cnt(S.parked.length,'park','parked','sheetParked()',S.parked.length);","+cnt(runsActive(),'own','mill','sheetMill()',runsActive())+cnt(S.parked.length,'park','parked','sheetParked()',S.parked.length);")
rep("g.items.forEach(x=>(S.own[key]=S.own[key]||[]).push(x.kg));toast('Saved');","g.items.forEach(x=>(S.own[key]=S.own[key]||[]).push(x.kg));if(key==='oseed'){const r=newRun(g.items);toast('Saved · Run '+rserial(r)+' to start')}else toast('Saved');")
rep("oseed:[287.4,241.2]","oseed:[287.4,241.2,240.0]")
rep("(m[1]==='jc'?jcIcon(28):ic(m[1]))","(m[1]==='jc'?jcIcon(28):m[1]==='own'?ownIcon(28):ic(m[1]))")
rep("[/^Waiting/,'hourg']","[/^Waiting/,'hourg'],[/^Our mill/,'own']")

# ---- production layer patches
rep("by:'Raju',cno:x.cno||0,slip:sn}","by:(S.me&&S.me.name)||'Worker',cno:x.cno||0,slip:sn}")
rep("tr.forEach(x=>S.queue.push({id:'Q'+(S.qn++),","tr.forEach(x=>S.queue.push({id:uid('Q'),")
rep("<div class=\"sr\"><span>By Raju</span>","<div class=\"sr\"><span>By ${esc((S.me&&S.me.name)||'Worker')}</span>")
rep("""<div style="text-align:center;font-size:12px;letter-spacing:.1em">${sn}</div></div>
  <button class="sbtn go next" onclick="closeLayer()">${ic('check')}${t('done')}</button>`)}""","""<div style="text-align:center;font-size:12px;letter-spacing:.1em">${sn}</div></div>
  <button class="sbtn go next" onclick="printPaper()">${ic('printer')}Print</button><button class="sbtn" onclick="closeLayer()">${ic('check')}${t('done')}</button>`)}""")
rep("""<div class="qrw">${qrSvg(tok)}</div></div>
  <button class="sbtn go next" onclick="closeLayer()">${ic('check')}${t('done')}</button>`)}""","""<div class="qrw">${qrSvg(tok)}</div></div>
  <button class="sbtn go next" onclick="window.__copies=${sp.copies||1};printPaper()">${ic('printer')}Print · ${sp.copies||1}</button><button class="sbtn" onclick="closeLayer()">${ic('check')}${t('done')}</button>`)}""")
rep("Sent to the mill printer. The counter person sees these in Waiting.","Saved. Tap Print for the weight slip. The counter person sees these in Waiting.")
rep("j={nb:sum(nbs),tok,customer:","j={id:uid('J'),nb:sum(nbs),tok,customer:")
rep("""<span class="pill" data-f="bt" title="Bluetooth scale">""","""<span class="pill" data-f="bt" title="Bluetooth scale" onclick="millScaleTap()">""")
# the mill label printer (Helett): a dot in the top bar, one-tap print of the slip and the token, a status line + Print again
rep("""onclick="millScaleTap()"><span class="dot"></span>${ic('bt')}</span>""","""onclick="millScaleTap()"><span class="dot"></span>${ic('bt')}</span><span class="pill" data-f="pr" title="Printer" onclick="millPrinterTap()"><span class="dot"></span>${ic('printer')}</span>""")
rep("""<button class="sbtn go next" onclick="printPaper()">${ic('printer')}Print</button>""","""<button class="sbtn go next" onclick="window.__copies=1;printAgain()">${ic('printer')}<span class="prlbl">Print</span></button><button class="sbtn" onclick="millSticker()">${ic('printer')}Sticker</button>""")
rep("""<button class="sbtn go next" onclick="window.__copies=${sp.copies||1};printPaper()">${ic('printer')}Print · ${sp.copies||1}</button>""","""<button class="sbtn go next" onclick="window.__copies=${sp.copies||1};printAgain()">${ic('printer')}<span class="prlbl">Print</span> · ${sp.copies||1}</button><button class="sbtn" onclick="millSticker()">${ic('printer')}Sticker</button>""")
rep("Saved. Tap Print for the weight slip. The counter person sees these in Waiting.</div>","Saved · the counter person sees these in Waiting.</div><div id=\"prst\" class=\"prst\"></div>")
rep("The codes below are real and scan.</div>","The codes below are real and scan.</div><div id=\"prst\" class=\"prst\"></div>")
rep("S.wtray=[];S.wdone={sn,n:tr.length};","S.wtray=[];S.wdone={sn,n:tr.length};millPrintAuto({kind:'slip',code:sn,shop:'MAHADEV TRADERS',title:'Mill 1 · WEIGHT SLIP',when:nowFull(),rows:tr.map(x=>[IT[x.k].wl+(x.cno?' · '+cnoL()+' '+x.cno:'')+(isBagK(x.k)?' · '+bagTxt(x.nb||1):''),f2(x.kg)+' kg']),foot:['By '+((S.me&&S.me.name)||'Worker'),nowFull()]},1);")
rep(" clearSlip();\n layer('Token printed',"," clearSlip();\n millPrintAuto({kind:'token',code:tok,shop:'MAHADEV TRADERS',title:'JOB-WORK TOKEN',sub:'Bidar · Mill 1',when:nowFull(),rows:rows.map(r=>r[0]==='-'?'-':[r[0],r[1]]),total:['Estimate',inr(est)],foot:['Date · time',nowFull()],qr:true},sp.copies||1);\n layer('Token printed',")
# our seed tapped at the counter starts a crushing run, like Waiting's "Add to today's crushing"
rep(" const key=k;(S.own[key]=S.own[key]||[]).push(kg);toast(IT[k].wl+' '+f1(kg)+' kg saved');afterSave()}",
    " const key=k;(S.own[key]=S.own[key]||[]).push(kg);if(k==='oseed'){const r=newRun([{kg,nb:1,time:clock()}]);toast('Seed '+f1(kg)+' kg · Run '+rserial(r)+' to start')}else toast(IT[k].wl+' '+f1(kg)+' kg saved');afterSave()}")
rep("""onclick="S.own.ooil.push([${kg},'${x}']);closeLayer();toast('${f1(kg)} kg → ${x}');afterSave()\"""","""onclick="S.own.ooil.push([${kg},'${x}']);const rr=oilToRun(${kg},'${x}');closeLayer();toast('${f1(kg)} kg → ${x}'+(rr?' · Run '+rserial(rr):''));afterSave()\"""")
rep("function wOil(gi,tank){const g=takeG(gi);g.items.forEach(x=>S.own.ooil.push([x.kg,tank]));","function wOil(gi,tank){const g=takeG(gi);g.items.forEach(x=>{S.own.ooil.push([x.kg,tank]);oilToRun(x.kg,tank)});")
# the khali stack from the server: bags weighed in minus khali sold at the counter (one figure, worked out there)
rep("<span>khali <b>${f1(sum(o.okhali))} kg</b> (${o.okhali.length} bags)</span>","<span>khali <b>${f1(sum(o.okhali))} kg</b> (${o.okhali.length} bags)</span>${S.khali&&S.khali.bags?`<span title=\"All khali bags weighed minus khali sold\">stack <b>${f1(S.khali.stackKg)} kg</b></span>`:''}")
# the counts in brackets are hidden on a phone (one short line); the kg stay
rep("(${o.ooil.length} cans)","<i class=\"cn\">(${o.ooil.length} cans)</i>")
rep("(${o.okhali.length} bags)</span>${S.khali","<i class=\"cn\">(${o.okhali.length} bags)</i></span>${S.khali")

# tap the weight card to type the weight when the scale is not connected; a typed weight ends with the save
rep("""<div class="wrow"><div class="wcard"><div class="lbl">""","""<div class="wrow"><div class="wcard" onclick="weightTap()"><div class="lbl">""")
rep("function afterSave(){S.needZero=true;","function afterSave(){S.manual=0;S.needZero=true;")

# ===== update 2 (21 Nov): payment direction, optional token print, advance returned, Name, fixed mode =====
rep(r"""function settlement(j){const rate=RATE[j.cake],gross=j.seedKg*rate,cans=canCharge(j.cans),adv=(j.advC||0)+(j.advA||0);
 if(j.cake==='SHOP'){const half=gross/2;return{rate,gross,cans,adv,due:gross-adv-cans,dir:'out',cust:half-(j.advC||0)-cans,auto:half-(j.advA||0)}}
 return{rate,gross,cans,adv,due:gross+cans-adv,dir:'in',cust:gross+cans-adv,auto:0}}""",
r"""function settlement(j){const rate=RATE[j.cake],gross=j.seedKg*rate,cans=canCharge(j.cans),aC=Math.max(0,(j.advC||0)-(j.advR||0)),adv=aC+(j.advA||0);
 if(j.cake==='SHOP'){const half=gross/2,due=gross-adv-cans;return{rate,gross,cans,adv,due,dir:due>=0?'out':'in',cust:half-aC-cans,auto:half-(j.advA||0),advR:j.advR||0}}
 const due=gross+cans-adv;return{rate,gross,cans,adv,due,dir:due>=0?'in':'out',cust:due,auto:0,advR:j.advR||0}}
/* who pays whom: 'in' = the customer pays us, 'out' = we pay the customer (cans and advances are taken off first) */
const payLbl=(j,dirIn)=>dirIn?(j.cake==='SHOP'?'Customer pays':'Khali payment'):'Pay customer';
const splitNote=s=>'Customer '+(s.cust>=0?'gets ':'owes ')+inr(s.cust)+' · Tempo '+(s.auto>=0?'gets ':'owes ')+inr(s.auto);
function resRows(j,s){const net=`<div class="ar res"><span>${s.dir==='in'?ic('down')+(j.cake==='SHOP'?'':ic('bag'))+' '+(j.cake==='SHOP'?'Customer pays you':'Khali payment'):ic('up')+' You pay customer'}</span><b>${inr(s.due)}</b></div>`;
 if(j.cake!=='SHOP')return net;
 const line=(ico,pay,owe,v)=>`<div class="ar"><span>${ic(ico)} ${v>=0?pay:owe}</span><b>${inr(v)}</b></div>`;
 return line('user','Pay customer','Customer owes shop',s.cust)+line('auto','Pay tempo','Tempo owes shop',s.auto)+net}""")
s=s.replace("dirIn?'Khali payment':'Pay customer'","payLbl(j,dirIn)")
rep("function jobSteps(j){const dirIn=j.cake!=='SHOP';","function jobSteps(j){const dirIn=settlement(j).dir==='in';")
rep(r"""${dirIn?`<div class="ar res"><span>${ic('down')}${ic('bag')} Khali payment</span><b>${inr(s.cust)}</b></div>`:`<div class="ar res"><span>${ic('up')} Pay customer</span><b>${inr(s.cust)}</b></div><div class="ar res"><span>${ic('auto')} Pay tempo</span><b>${inr(s.auto)}</b></div>`}</div>`;""","${resRows(j,s)}</div>`;")
rep("<span>${dirIn?'Customer takes khali · ₹10/kg':'Shop keeps khali · ₹6/kg'}</span>","<span>${j.cake!=='SHOP'?'Customer takes khali · ₹10/kg':'Shop keeps khali · ₹6/kg'}</span>")
rep("(dirIn?'not weighed yet':'shop keeps')","(j.cake!=='SHOP'?'not weighed yet':'shop keeps')")
rep("""${j.advA?`<div class="ar"><span>− tempo advance</span><b>${inr(j.advA)}</b></div>`:''}${s.cans?""","""${j.advA?`<div class="ar"><span>− tempo advance</span><b>${inr(j.advA)}</b></div>`:''}${j.advR?`<div class="ar"><span>+ advance returned</span><b>${inr(j.advR)}</b></div>`:''}${s.cans?""")
rep(r"""${!dirIn&&!j.settled?`<div class="note">Customer ${inr(s.cust)} · Tempo ${inr(s.auto)} · after advance${s.cans?' and cans':''}</div>`:''}""",r"""${j.cake==='SHOP'&&!j.settled?`<div class="note">${splitNote(s)} · after advance${s.cans?' and cans':''}</div>`:''}""")
rep("${one('user','Customer',j.advC,dirIn?0:st.cust,j.settled)}${one('auto','Tempo',j.advA,st.auto,j.settled&&!dirIn)}","${one('user','Customer',j.advC,j.cake==='SHOP'?st.cust:0,j.settled)}${one('auto','Tempo',j.advA,j.cake==='SHOP'?st.auto:0,j.settled&&j.cake==='SHOP')}")
rep("<span>Paid${final?' '+inr(final):''}","<span>${final<0?'Received':'Paid'}${final?' '+inr(final):''}")
# the job card: advance returned, editable until paid
rep(r"""${row(ic('auto'),'Tempo advance',j.advA?inr(j.advA):'₹ —',`sheetNum('Tempo advance (₹)',v=>setAdv('${tok}','advA',v),'sheetJob(\'${tok}\')')`)}""",
r"""${row(ic('auto'),'Tempo advance',j.advA?inr(j.advA):'₹ —',`sheetNum('Tempo advance (₹)',v=>setAdv('${tok}','advA',v),'sheetJob(\'${tok}\')')`)}
   ${row(`<span class="coin sm">↓</span>`,'Advance returned',j.advR?inr(j.advR):'₹ —',`sheetNum('Advance returned by customer (₹)',v=>setAdv('${tok}','advR',v),'sheetJob(\'${tok}\')')`)}""")
# the counter slip: sign-aware estimate, per-party lines, advance returned; stickers/receipts leave this screen
rep("${est.due<0?'Customer owes shop':sp.cake==='SHOP'?'Shop pays (estimate)':'Customer pays (estimate)'}","${est.dir==='in'?(sp.cake==='SHOP'?'Customer pays you (estimate)':'Customer pays (khali · estimate)'):'You pay customer (estimate)'}")
rep("""<b>${inr(est.cans)}</b></div>`:''}</div>""","""<b>${inr(est.cans)}</b></div>`:''}${sp.advR?`<div class="ar"><span>+ advance returned</span><b>${inr(sp.advR)}</b></div>`:''}${sp.cake==='SHOP'?`<div class="ar"><span>${est.cust>=0?'Customer gets':'Customer owes shop'}</span><b>${inr(est.cust)}</b></div><div class="ar"><span>${est.auto>=0?'Tempo gets':'Tempo owes shop'}</span><b>${inr(est.auto)}</b></div>`:''}</div>""")
rep("advC:sp.advC,advA:sp.advA,cans:sp.cans})}","advC:sp.advC,advA:sp.advA,advR:sp.advR,cans:sp.cans})}")
rep("\n  <div class=\"cans3\" data-f=\"cans\">","""
  <button class="mrow" data-f="adv" onclick="sheetNum('Advance returned by customer (₹)',v=>{S.slip.advR=v;closeLayer()},'closeLayer()')"><span class="coin">₹</span><span class="arr in">↓</span><span class="sp">Advance returned</span><span class="amt">${sp.advR?inr(sp.advR):'₹ —'}</span>${ic('edit')}</button>
  <div class="cans3" data-f="cans">""")
s=re.sub(r'  <div class="chrow"><button class="ch \$\{sp\.stick.*?receipt\(s\)</button></div>\n','',s,count=1,flags=re.S)
rep("lines:[],advC:0,advA:0,cans:{}","lines:[],advC:0,advA:0,advR:0,cans:{}")
# save the job: no compulsory printout; Print / Sticker are optional, Done is separate
rep("<span>${ic('printer')}${ic('check')}</span>Token · ${f1(kg)} kg</button>","<span>${ic('check')}</span>Save job · ${f1(kg)} kg</button>")
rep("function confirmSlip(){const sp=S.slip;","function confirmSlip(){S.slip.stick=!!S.cfg.stickers;S.slip.copies=S.cfg.copies||1;const sp=S.slip;")
rep("advC:sp.advC||0,advA:sp.advA||0,cans:Object.assign","advC:sp.advC||0,advA:sp.advA||0,advR:sp.advR||0,cans:Object.assign")
rep("sp.advA?['Tempo advance',inr(sp.advA)]:null,","sp.advA?['Tempo advance',inr(sp.advA)]:null,sp.advR?['Advance returned',inr(sp.advR)]:null,")
rep("millPrintAuto({kind:'token',","millPrintGo(S.cfg.autoTok,{kind:'token',")
rep("millPrintAuto({kind:'slip',","millPrintGo(S.cfg.autoSlip!==false,{kind:'slip',")
rep("total:['Estimate',inr(est)]","total:[settlement(j).dir==='in'?'Customer pays (est.)':'We pay (est.)',inr(est)]")
rep("<div class=\"sr\"><span>Estimate</span><span class=\"tot\">","<div class=\"sr\"><span>${settlement(j).dir==='in'?'Customer pays (est.)':'We pay (est.)'}</span><span class=\"tot\">")
rep("layer('Token printed',","layer('Job saved',")
rep("${sp.copies} receipt(s): one for the customer, one stuck on the bags${sp.stick?' · stickers print per customer no.':''}. The codes below are real and scan.","Job saved. Printing is optional: tap Print only if the customer needs a paper token. The codes below are real and scan.")
s=s.replace('onclick="millSticker()"','data-f="stk" onclick="millSticker()"')
s=s.replace('onclick="window.__copies=1;printAgain()"','data-f="print" onclick="window.__copies=1;printAgain()"')
rep(r"""<button class="sbtn go next" onclick="window.__copies=${sp.copies||1};printAgain()">${ic('printer')}<span class="prlbl">Print</span> · ${sp.copies||1}</button><button class="sbtn" data-f="stk" onclick="millSticker()">${ic('printer')}Sticker</button><button class="sbtn" onclick="closeLayer()">${ic('check')}${t('done')}</button>""",
r"""<button class="sbtn go next" onclick="closeLayer()">${ic('check')}${t('done')}</button><button class="sbtn" data-f="print" onclick="window.__copies=${sp.copies||1};printAgain()">${ic('printer')}<span class="prlbl">Print</span> · ${sp.copies||1}</button><button class="sbtn" data-f="stk" onclick="millSticker()">${ic('printer')}Sticker</button><button class="sbtn" data-f="adv" onclick="sheetJob('${j.tok}')">${ic('edit')}Edit advance · cans</button>""")
# name field, fixed mode, language button
rep("who:'Who is this customer?'","who:'Name'")
rep("who:'ಯಾವ ಗ್ರಾಹಕ?'","who:'ಹೆಸರು'")
rep("S.view='slip';S.mode='counter';closeLayer()","S.view='slip';closeLayer()")
rep("onclick=\"S.slip=S.parked.splice(${i},1)[0];","onclick=\"if(S.mode==='worker'){toast('Switch to Counter mode to finish this bill','bad');return}S.slip=S.parked.splice(${i},1)[0];")
rep("onclick=\"S.mode=S.mode==='worker'?'counter':'worker';S.view='pick';render()\"","onclick=\"setMode(S.mode==='worker'?'counter':'worker')\"")
rep("onclick=\"S.lang=S.lang==='en'?'kn':'en';render()\"","onclick=\"setLang(S.lang==='en'?'kn':'en')\"")

rep("S.view='slip';S.mode='counter';closeLayer();toast('Loaded into a new job — choose the customer')","S.view='slip';closeLayer();toast(S.mode==='worker'?'Loaded into a new job — switch to Counter to choose the customer':'Loaded into a new job — choose the customer')")

# ---- engine + app code before the final render()
eng=open(D+'/voice_engine.js').read()
app=open(D+'/app_voice.js').read()+"\n/*APP-MILL*/\n"+open(D+'/app_mill.js').read()
tail="""
S.cfg=loadCfg();
"""
wrap="""
(function(){const _layer=layer;layer=function(){window.__cardTok=null;return _layer.apply(this,arguments)};
 const _sj=sheetJob;sheetJob=function(t){_sj(t);window.__cardTok=t};
 const _cl=closeLayer;closeLayer=function(){window.__cardTok=null;return _cl()}})();
applyCfg();document.getElementById('fab').innerHTML=ic('bot');
"""+open(D+"/app_live.js").read()+"""
"""
i=s.rindex("\nrender();\n</script>")
s=s[:i]+"\n/*VOICE-ENGINE*/\n"+eng+"\n/*APP-VOICE*/\n"+tail+app+wrap+s[i:]
open(D+'/preview.html','w').write(s)
print('built',len(s))
p=s.replace('https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js','/mill/vendor/JsBarcode.all.min.js').replace('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js','/mill/vendor/qrcode.min.js')
p=p.replace('<title>','<meta name="robots" content="noindex">\n<title>',1)
open(ROOT+'/public/mill/desk.html','w').write(p)
print('prod',len(p))

