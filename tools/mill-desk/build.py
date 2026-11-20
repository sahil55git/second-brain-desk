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
# our seed tapped at the counter starts a crushing run, like Waiting's "Add to today's crushing"
rep(" const key=k;(S.own[key]=S.own[key]||[]).push(kg);toast(IT[k].wl+' '+f1(kg)+' kg saved');afterSave()}",
    " const key=k;(S.own[key]=S.own[key]||[]).push(kg);if(k==='oseed'){const r=newRun([{kg,nb:1,time:clock()}]);toast('Seed '+f1(kg)+' kg · Run '+rserial(r)+' to start')}else toast(IT[k].wl+' '+f1(kg)+' kg saved');afterSave()}")
rep("""onclick="S.own.ooil.push([${kg},'${x}']);closeLayer();toast('${f1(kg)} kg → ${x}');afterSave()\"""","""onclick="S.own.ooil.push([${kg},'${x}']);const rr=oilToRun(${kg},'${x}');closeLayer();toast('${f1(kg)} kg → ${x}'+(rr?' · Run '+rserial(rr):''));afterSave()\"""")
rep("function wOil(gi,tank){const g=takeG(gi);g.items.forEach(x=>S.own.ooil.push([x.kg,tank]));","function wOil(gi,tank){const g=takeG(gi);g.items.forEach(x=>{S.own.ooil.push([x.kg,tank]);oilToRun(x.kg,tank)});")
# the khali stack from the server: bags weighed in minus khali sold at the counter (one figure, worked out there)
rep("<span>khali <b>${f1(sum(o.okhali))} kg</b> (${o.okhali.length} bags)</span>","<span>khali <b>${f1(sum(o.okhali))} kg</b> (${o.okhali.length} bags)</span>${S.khali&&S.khali.bags?`<span title=\"All khali bags weighed minus khali sold\">stack <b>${f1(S.khali.stackKg)} kg</b></span>`:''}")

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
