/* ===== Settings (hide tabs, icons, buttons, functions) ===== */
const HIDE=[
 ['Tabs',[['tab-waiting','Waiting tab','hourg'],['tab-jobs','Jobs tab','jc'],['tab-held','Held tab','lock'],['tab-mill','Our mill tab','own'],['tab-parked','Parked tab','park']]],
 ['Top bar',[['bt','Bluetooth indicator','bt'],['lang','Language button','globe'],['mode','Worker / Counter switch','user'],['pr','Printer indicator','printer']]],
 ['Main screen',[['demo','Demo scale buttons','weigh'],['own','Ours today line','mill'],['search','Search box','search'],['g-jw','Job work tiles','user'],['g-mill','Our mill tiles','mill'],['g-bs','Buy / Sell tiles','rupee']]],
 ['Buttons',[['addjob','Add to a job','list'],['print','Print button','printer'],['stk','Sticker button','tag'],['hold','Hold (park) button','pause'],['khalichg','Who keeps khali','swap'],['adv','Advance buttons','rupee'],['cans','Cans (tin) counters','barrel'],['voice','Mic and speaker buttons','mic'],['wcust','Customer name / village (weighing and Waiting)','user']]],
 ['Functions',[['assistant','Voice assistant (floating icon)','bot']]]];
const CFGKEY='milldesk.cfg';
function loadCfg(){try{const c=JSON.parse(localStorage.getItem(CFGKEY)||'null');if(c&&typeof c==='object')return Object.assign({hide:{},noic:false,reply:true,vlang:'en-IN',autolisten:true,autoTok:false,autoSlip:true,stickers:false,copies:1,hideScope:'both'},c)}catch(e){}return {hide:{},noic:false,reply:true,vlang:'en-IN',autolisten:true,autoTok:false,autoSlip:true,stickers:false,copies:1,hideScope:'both'}}
function saveCfg(){try{localStorage.setItem(CFGKEY,JSON.stringify(S.cfg))}catch(e){}}
function applyCfg(){
 let st=document.getElementById('cfgcss');if(!st){st=document.createElement('style');st.id='cfgcss';document.head.appendChild(st)}
 const keys=[];HIDE.forEach(g=>g[1].forEach(x=>keys.push(x[0])));
 const sc=S.cfg.hideScope==='worker'?'body.mw':'body';
 st.textContent=keys.map(k=>`${sc}.h-${k} [data-f~="${k}"]{display:none!important}`).join('\n')+'\n[data-f^="g-"]{display:contents}';
 keys.forEach(k=>document.body.classList.toggle('h-'+k,!!S.cfg.hide[k]));
 document.body.classList.toggle('mw',S.mode==='worker');
 document.body.classList.toggle('noic',!!S.cfg.noic)}
function cfgToggle(k){if(k==='noic')S.cfg.noic=!S.cfg.noic;else if(k==='reply')S.cfg.reply=!S.cfg.reply;else if(k==='autolisten')S.cfg.autolisten=!S.cfg.autolisten;else if(k==='autoTok'||k==='autoSlip'||k==='stickers')S.cfg[k]=!S.cfg[k];else S.cfg.hide[k]=!S.cfg.hide[k];saveCfg();applyCfg();const sc=$('#layer .lb');const y=sc?sc.scrollTop:0;sheetSettings();const s2=$('#layer .lb');if(s2)s2.scrollTop=y}
function cfgLang(l){S.cfg.vlang=l;saveCfg();if(S.ast&&S.ast.open)astRender();else{const sc=$('#layer .lb');const y=sc?sc.scrollTop:0;sheetSettings();const s2=$('#layer .lb');if(s2)s2.scrollTop=y}}
function cfgScope(v){S.cfg.hideScope=v;saveCfg();applyCfg();sheetSettings()}
function cfgCopies(n){S.cfg.copies=n;saveCfg();sheetSettings()}
function cfgReset(){S.cfg=Object.assign(S.cfg,{hide:{},noic:false});saveCfg();applyCfg();sheetSettings()}
function sheetSettings(){
 const sw=(k,label,ico,on,w)=>`<button class="swr ${on?'on':''}" onclick="cfgToggle('${k}')"><span class="ti">${ico==='jc'?jcIcon(26):ic(ico)}</span><span class="tl">${label}</span><span class="sw" aria-hidden="true"><i></i></span><span class="st2">${on?(w?w[0]:'Shown'):(w?w[1]:'Hidden')}</span></button>`;
 const langs=[['en-IN','English'],['hi-IN','हिन्दी'],['kn-IN','ಕನ್ನಡ']];
 layer('Settings',`<div class="grp"><span class="gi" style="background:#5F82D4">${ic('globe')}</span>Screen language</div><div class="chrow"><button class="ch ${S.lang==='en'?'sel':''}" onclick="setLang('en');sheetSettings()">English</button><button class="ch ${S.lang==='kn'?'sel':''}" onclick="setLang('kn');sheetSettings()">ಕನ್ನಡ</button></div>
 <div class="grp"><span class="gi" style="background:#8A7F6E">${ic('printer')}</span>Printing</div>
 ${sw('autoSlip','Print the weight slip automatically','printer',S.cfg.autoSlip!==false,['On','Off'])}${sw('autoTok','Print the job token automatically','printer',!!S.cfg.autoTok,['On','Off'])}${sw('stickers','Bag stickers with the token','tag',!!S.cfg.stickers,['On','Off'])}
 <button class="mrow" onclick="closeLayer();millPrinterTap()">${ic('printer')}<span class="sp">Choose printers (once)</span>${ic('edit')}</button>
 <div class="note">Receipts per token (the Print button on a saved job).</div><div class="chrow">${[1,2].map(n=>`<button class="ch ${(S.cfg.copies||1)===n?'sel':''}" onclick="cfgCopies(${n})">${n} receipt${n>1?'s':''}</button>`).join('')}</div>
 <div class="note">Hide what the staff do not need. This only hides the button or tab; nothing is deleted. You can show it again here any time.</div>
 <div class="chrow"><button class="ch ${S.cfg.hideScope!=='worker'?'sel':''}" onclick="cfgScope('both')">Hide on both screens</button><button class="ch ${S.cfg.hideScope==='worker'?'sel':''}" onclick="cfgScope('worker')">Hide on Worker screen only</button></div>
 ${HIDE.map(([g,items])=>`<div class="grp"><span class="gi" style="background:#5F82D4">${ic('eye')}</span>${g}</div>${items.map(([k,l,i])=>sw(k,l,i,!S.cfg.hide[k])).join('')}`).join('')}
 <div class="grp"><span class="gi" style="background:#C98A25">${ic('eye')}</span>Icons</div>${sw('noic','Icons on buttons and tabs','eye',!S.cfg.noic)}
 <div class="grp"><span class="gi" style="background:#3F9D63">${ic('speaker')}</span>Voice</div>
 ${sw('reply','Read answers aloud','speaker',S.cfg.reply)}${sw('autolisten','Start listening when the assistant opens','mic',S.cfg.autolisten)}
 <div class="note">Speaking language</div><div class="chrow">${langs.map(([c,n])=>`<button class="ch ${S.cfg.vlang===c?'sel':''}" onclick="cfgLang('${c}')">${ic('globe')} ${n}</button>`).join('')}</div>
 <button class="sbtn" style="margin-top:10px" onclick="cfgReset()">${ic('eye')}Show everything again</button>`)}

/* ===== Optional mobile number ===== */
function cleanMobile(v){let d=String(v||'').replace(/\D/g,'');if(!d)return '';if(d.length>10&&d.startsWith('91'))d=d.slice(2);if(d.length>10&&d.startsWith('0'))d=d.slice(1);return /^[6-9]\d{9}$/.test(d)?d:null}
const fmtMob=m=>m?m.slice(0,5)+' '+m.slice(5):'';

/* ===== Speech to text (browser) ===== */
const Voice={
 R:()=>window.SpeechRecognition||window.webkitSpeechRecognition,
 ok(){return !!this.R()},
 rec:null,timer:null,
 err(code){return ({'not-allowed':'The microphone is blocked. Allow the microphone for this page in the browser, then try again.','service-not-allowed':'The microphone is blocked here. Open the app in the browser tab itself and allow the microphone.','no-speech':'I did not hear anything. Tap the mic and speak again.','audio-capture':'No microphone found.','network':'Speech needs the internet. Check the connection, or type instead.','aborted':'','language-not-supported':'This phone does not support that speaking language. Pick another.'})[code]||('Voice problem: '+code)},
 start(o){
  const R=this.R();if(!R){o.onError&&o.onError('unsupported','Voice typing is not available in this browser. Use the microphone key on your keyboard, or type.');return false}
  this.stop();
  const r=new R();this.rec=r;r.lang=o.lang||S.cfg.vlang||'en-IN';r.interimResults=true;r.continuous=false;r.maxAlternatives=3;
  let final=null,alts=[],done=false;
  const finish=()=>{if(done)return;done=true;clearTimeout(this.timer);this.rec=null;o.onEnd&&o.onEnd(final,alts)};
  r.onstart=()=>{o.onStart&&o.onStart();clearTimeout(this.timer);this.timer=setTimeout(()=>{try{r.stop()}catch(e){}},12000)};
  r.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const res=e.results[i];if(res.isFinal){final=res[0].transcript;alts=Array.from(res).map(a=>a.transcript)}else interim+=res[0].transcript}
   if(interim&&o.onInterim)o.onInterim(interim)};
  r.onerror=e=>{const m=this.err(e.error);if(m)o.onError&&o.onError(e.error,m);if(e.error!=='no-speech')done=true;if(e.error==='no-speech'){o.onError&&o.onError('no-speech',m)}};
  r.onend=finish;
  try{r.start();return true}catch(e){o.onError&&o.onError('start',String(e.message||e));return false}},
 stop(){try{this.rec&&this.rec.stop()}catch(e){}clearTimeout(this.timer);this.rec=null}};

/* ===== Text to speech ===== */
const TTS={
 ok:()=>'speechSynthesis' in window,
 say(text,lang){if(!this.ok()||!text)return;try{const u=new SpeechSynthesisUtterance(text),L=lang||S.cfg.vlang||'en-IN';u.lang=L;u.rate=0.95;
  const v=speechSynthesis.getVoices().find(x=>x.lang===L)||speechSynthesis.getVoices().find(x=>x.lang&&x.lang.slice(0,2)===L.slice(0,2));if(v)u.voice=v;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}},
 stop(){try{speechSynthesis.cancel()}catch(e){}}};

/* ===== Mic button on any input ===== */
const micBtn=(id,kind)=>`<button type="button" class="vbtn mic" data-f="voice" id="mb-${id}" onclick="dictate('${id}','${kind}')" aria-label="Speak">${ic('mic')}</button>`;
const inpW=(inner,id,kind)=>`<div class="inpw">${inner}${micBtn(id,kind)}</div>`;
function capWords(s){return s.replace(/\S+/g,w=>w[0].toUpperCase()+w.slice(1))}
function dictate(id,kind){
 const el=document.getElementById(id),btn=document.getElementById('mb-'+id);if(!el)return;
 if(Voice.rec&&btn&&btn.classList.contains('live')){Voice.stop();return}
 const off=()=>document.querySelectorAll('.vbtn.live').forEach(b=>b.classList.remove('live'));
 off();
 const ok=Voice.start({
  onStart(){btn&&btn.classList.add('live');toast('Listening… speak now')},
  onInterim(t){if(kind==='text')el.value=t},
  onError(c,m){off();if(c==='unsupported'){el.focus();toast('No voice typing here. Use the mic key on your keyboard.','bad')}else if(m)toast(m,'bad')},
  onEnd(final){off();if(!final)return;let v=final.trim();
   if(kind==='digits'||kind==='amount'){const n=MillVoice.normalize(v);v=kind==='digits'?(n.match(/\d+/g)||[]).join(''):((n.match(/\d+(?:\.\d+)?/)||[''])[0]);if(kind==='digits'){const c=cleanMobile(v);if(c===null)toast('Heard '+v+'. A mobile number has 10 digits.','bad');else if(c)v=c}}
   else if(kind==='name')v=capWords(v);
   if(kind==='amount'&&id==='advv'){S._adv=String(v).slice(0,6);$('#advv').textContent='₹ '+(+S._adv||0).toLocaleString('en-IN');return}
   el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));if(kind!=='amount')toast('Heard: '+v)}});
 if(!ok){off()}}
function micAmount(){dictate('advv','amount')}

/* ===== Read aloud (cards) ===== */
const spkBtn=(js)=>`<button type="button" class="vbtn spk" data-f="voice" onclick="event.stopPropagation();${js}" aria-label="Read aloud">${ic('speaker')}</button>`;
function jobSay(j){const st=!j.crushed?'Crushing pending':!j.settled?(j.cake==='SHOP'?'Crushed. Pay customer pending':'Crushed. Khali payment pending'):!j.given?'Money done. Oil out pending':'Closed';
 return `Token ${jserial(j)}. ${j.customer===j.place?j.place:j.customer+', '+j.place}. ${f1(j.seedKg)} kilos, ${bagTxt(bagsOf(j))}. Khali ${j.cake==='SHOP'?'kept by shop':'taken by customer'}. ${st}.`}
function sayJob(tok){const j=S.jw.find(x=>x.tok===tok);if(j)TTS.say(jobSay(j),'en-IN')}
function sayGroup(gi){const g=groups()[gi];if(!g)return;const i=IT[g.k];TTS.say(`Queue ${gi+1}. ${i.wl}. ${f1(sum(g.items.map(x=>x.kg)))} kilos${isBagK(g.k)?', '+bagTxt(sum(g.items.map(x=>x.nb||1))):''}${g.cno?'. Customer number '+g.cno:''}.`,'en-IN')}

/* ===== Assistant (chat + voice commands) ===== */
const VPLACES=[{name:'Bidar',aliases:['ಬೀದರ್','बीदर']},{name:'Kamthana',aliases:['ಕಮಠಾಣ','कमठाणा']},{name:'Chidri',aliases:['ಚಿದ್ರಿ','चिद्री']},{name:'Naubad',aliases:['ನೌಬಾದ್','नौबाद']},{name:'Janawada',aliases:['ಜನವಾಡ','जनवाडा']},{name:'Humnabad',aliases:['ಹುಮನಾಬಾದ್','हुमनाबाद']},{name:'Bhalki',aliases:['ಭಾಲ್ಕಿ','भालकी']},{name:'Chitguppa',aliases:['ಚಿಟಗುಪ್ಪ','चिटगुप्पा']}];
const VCUSTNAMES={'Gundappa':['ಗುಂಡಪ್ಪ'],'Sangamma':['ಸಂಗಮ್ಮ'],'Ravi Kumar':['ರವಿ ಕುಮಾರ್','ರವಿ','रवि'],'Mohammed Ali':['मोहम्मद अली','ಮೊಹಮ್ಮದ್ ಅಲಿ'],'Mallamma':['ಮಲ್ಲಮ್ಮ'],'Shivakumar Patil':['ಶಿವಕುಮಾರ್ ಪಾಟೀಲ್']};
function vctx(){return {customers:CUSTS.map(c=>({name:c[0],place:c[1],mobile:c[2]||'',aliases:VCUSTNAMES[c[0]]||[]})),places:VPLACES,
 jobs:S.jw.map(j=>({tok:j.tok,serial:jserial(j),customer:j.customer,place:j.place})),cardOpen:window.__cardTok||null,pending:S.ast.pending}}
S.ast={open:false,msgs:[],listening:false,pending:null,expect:null,interim:'',undo:null};
const ASTEX=['open mill','open waiting','open jobs','who is next','how many waiting','customer Sangamma','village Bhalki','advance 500','tempo advance 200','shop keeps khali','crushing done for Ravi','pay Sangamma','token 2','new customer Ramesh from Humnabad'];
function astOpen(listen){S.ast.open=true;document.getElementById('app').classList.add('ast-open');if(!S.ast.msgs.length)astBot('Hello. Tap the mic and speak, or type. Try: “open waiting”, “customer Sangamma”, “advance 500”.','info');astRender();if(listen&&S.cfg.autolisten)astMic()}
function astClose(){Voice.stop();TTS.stop();S.ast.open=false;S.ast.listening=false;S.ast.pending=null;S.ast.expect=null;document.getElementById('app').classList.remove('ast-open');astRender()}
function astBot(text,kind,extra){text=text?text[0].toUpperCase()+text.slice(1):text;S.ast.msgs.push(Object.assign({who:'bot',text,kind:kind||'ok'},extra||{}));if(S.ast.msgs.length>40)S.ast.msgs.shift();if(S.cfg.reply&&kind!=='info')TTS.say(text)}
function astYou(text){S.ast.msgs.push({who:'you',text});if(S.ast.msgs.length>40)S.ast.msgs.shift()}
function astRender(){
 const p=document.getElementById('ast');if(!p)return;
 p.classList.toggle('on',S.ast.open);document.getElementById('fab').style.display=S.ast.open?'none':'';
 if(!S.ast.open){p.innerHTML='';return}
 const langs=[['en-IN','EN'],['hi-IN','हिं'],['kn-IN','ಕನ್']];
 const msgs=S.ast.msgs.map(m=>m.who==='you'?`<div class="am you">${esc(m.text)}</div>`:`<div class="am bot ${m.kind||''}">${esc(m.text)}${(m.buttons||[]).length?`<div class="abtns">${m.buttons.map(b=>`<button class="ch ${b.cls||''}" onclick="${b.js}">${esc(b.label)}</button>`).join('')}</div>`:''}</div>`).join('');
 const chips=S.ast.pending?'':ASTEX.slice(0,6).map(x=>`<button class="ch sm" onclick="astRun('${x.replace(/'/g,"\\'")}')">${esc(x)}</button>`).join('');
 const keep=(document.getElementById('ain')||{}).value||'';
 p.innerHTML=`<div class="ahd">${ic('bot')}<b>Assistant</b><span class="alg">${langs.map(([c,n])=>`<button class="${S.cfg.vlang===c?'sel':''}" onclick="cfgLang('${c}')">${n}</button>`).join('')}</span><button class="pill" onclick="astClose()" aria-label="Close">${ic('x')}</button></div>
 <div class="amsgs" id="amsgs">${msgs}${S.ast.listening?`<div class="am you live">${ic('mic')} ${esc(S.ast.interim||'Listening…')}</div>`:''}</div>
 <div class="ach">${chips}</div>
 <div class="arow"><button class="amic ${S.ast.listening?'live':''}" onclick="astMic()" aria-label="Speak">${ic(S.ast.listening?'stopsq':'mic')}</button><input id="ain" placeholder="Speak, or type a command" autocomplete="off" onkeydown="if(event.key==='Enter')astSend()" value="${esc(keep)}"><button class="asend" onclick="astSend()" aria-label="Send">${ic('send')}</button></div>`;
 const m=document.getElementById('amsgs');if(m)m.scrollTop=m.scrollHeight}
function astSend(){const i=document.getElementById('ain');const v=(i.value||'').trim();if(!v)return;i.value='';astRun(v)}
function astMic(){
 if(S.ast.listening){Voice.stop();return}
 if(!Voice.ok()){astBot('Voice typing is not available in this browser. Type the command below, or use the microphone key on your keyboard.','warn');astRender();const i=document.getElementById('ain');i&&i.focus();return}
 TTS.stop();S.ast.interim='';
 Voice.start({onStart(){S.ast.listening=true;astRender()},onInterim(t){S.ast.interim=t;const l=document.querySelector('.am.live');if(l)l.innerHTML=ic('mic')+' '+esc(t)},
  onError(c,m){S.ast.listening=false;if(m){astBot(m,'warn')}astRender()},
  onEnd(final,alts){S.ast.listening=false;S.ast.interim='';if(final){astRun(final,alts)}else astRender()}})}
function astRun(text,alts){
 astYou(text);
 let best=null;const cx=vctx();
 const cands=[text].concat((alts||[]).filter(a=>a&&a!==text));
 for(const c of cands){const r=MillVoice.parse(c,cx);if(!best||(best.t==='unknown'&&r.t!=='unknown'))best=r;if(best.t!=='unknown')break}
 try{astExec(best,text)}catch(e){astBot('Something went wrong: '+e.message,'warn')}
 astRender()}
const NAVSAY={mill:()=>`Our mill. ${runsActive()} run${runsActive()===1?'':'s'} in progress.`,waiting:()=>`Waiting list. ${S.queue.length} weighing${S.queue.length===1?'':'s'} to sort.`,jobs:()=>`Jobs. ${S.jw.filter(j=>!j.crushed).length} to crush, ${held().length} held.`,held:()=>`Held. ${held().length} job${held().length===1?'':'s'} with money or oil pending.`,parked:()=>`Parked. ${S.parked.length} slip${S.parked.length===1?'':'s'} parked.`,settings:()=>'Settings.'};
const NAVFN={mill:()=>sheetMill(),waiting:()=>sheetWaiting(),jobs:()=>sheetJobs(),held:()=>sheetHeld(),parked:()=>sheetParked(),settings:()=>sheetSettings()};
function jobName(tok){const j=S.jw.find(x=>x.tok===tok);return j?`token ${jserial(j)}, ${j.customer}`:tok}
function glowJob(tok){setTimeout(()=>{const el=document.querySelector(`#layer [data-tok="${tok}"]`);const c=el&&el.closest('.card');if(c){c.scrollIntoView({block:'center',behavior:'smooth'});c.classList.add('voicehl');setTimeout(()=>c.classList.remove('voicehl'),4000)}},60)}
function markCrushed(tok){const J=S.jw.find(x=>x.tok===tok);if(!J||J.crushed)return false;J.crushed=true;J.tCrushed=clock();render();return true}
function setSlipCust(c){S.slip.cust=c;render()}
function askConfirm(text,yesFn,label){S.ast.pending={fn:yesFn};astBot(text,'q',{buttons:[{label:'Yes',cls:'sel',js:'astYes()'},{label:'No',js:'astNo()'}]})}
function astYes(){const p=S.ast.pending;S.ast.pending=null;if(p){try{p.fn()}catch(e){astBot('Something went wrong: '+e.message,'warn')}}astRender()}
function astNo(){S.ast.pending=null;astBot('Cancelled. Nothing was changed.','ok');astRender()}
function astPickJob(act,tok){S.ast.pending=null;astExec({t:act==='open'?'job':'jobact',act,tok},'')}
function astPickCust(i){S.ast.pending=null;astExec({t:'cust',mode:'select',idx:i,score:1},'');astRender()}
function openCustSheet(){if(!document.getElementById('nc'))sheetCust()}
function astExec(i,heard){
 // slot filling: the bot asked a question and this is the answer
 const ex=S.ast.expect;
 if(ex&&!['nav','close','help','back','yes','no'].includes(i.t)){
  S.ast.expect=null;
  if(ex.kind==='name'){const nm=capWords(String(heard).trim());const e=document.getElementById('nc');if(e)e.value=nm;ex.name=nm;return astNewCust(Object.assign({},ex,{name:nm}))}
  if(ex.kind==='amount'){const n=(i.norm||'').match(/\d+(?:\.\d+)?/);if(n)return astExec({t:'adv',who:ex.who,amt:Math.round(+n[0]),ref:ex.ref},heard);astBot('I need a number, like 500.','warn');S.ast.expect=ex;return}
  if(ex.kind==='village'){const pr=MillVoice.matchBest(i.norm||'',VPLACES.map(p=>({id:p.name,names:[p.name].concat(p.aliases)})));const pl=pr.length?pr[0].id:capWords(String(heard).trim());return astNewCust(Object.assign({},ex,{place:pl}))}
  if(ex.kind==='job'){const f=MillVoice.matchBest(i.norm||'',S.jw.map(j=>({id:j.tok,names:[j.customer,j.place]})));if(f.length){return astExec({t:'jobact',act:ex.act,tok:f[0].id},heard)}astBot('Which job? Say the token number or the customer name.','warn');S.ast.expect=ex;return}}
 S.ast.expect=null;
 switch(i.t){
 case 'empty':return astBot('I did not hear anything.','warn');
 case 'yes':if(S.ast.pending)return astYes();return astBot('Okay.');
 case 'no':if(S.ast.pending)return astNo();return astBot('Okay.');
 case 'help':return astBot('You can say: open waiting, jobs, held, parked · customer Sangamma · village Bhalki · new customer Ramesh from Humnabad · mobile 98450 12345 · advance 500 · tempo advance 200 · shop keeps khali · customer takes khali · crushing done for Ravi · token 2 · pay Sangamma · oil out Gundappa · who is next · how many waiting. Hindi and Kannada work too.','info');
 case 'close':case 'back':if($('#layer').classList.contains('on')){closeLayer();return astBot('Closed.')}return astClose();
 case 'undo':if(S.ast.undo){const u=S.ast.undo;S.ast.undo=null;u();return astBot('Undone.')}return astBot('Nothing to undo.');
 case 'nav':if(i.to==='home'){closeLayer();return astBot('Main screen.')}NAVFN[i.to]();return astBot(NAVSAY[i.to]());
 case 'ask':{const q=i.q;
  if(q==='mill'){const m=S.runs.filter(r=>r.state==='machine'),w=S.runs.filter(r=>r.state==='weighed'),o=S.runs.filter(r=>r.state==='oil');return astBot(!S.runs.length?'No run today.':`In machine: ${m.length?m.map(r=>'run '+rserial(r)+' since '+r.tMachine).join(', '):'none'}. Waiting to start: ${w.length?w.map(r=>'run '+rserial(r)).join(', '):'none'}. Oil to tank: ${o.length?o.map(r=>'run '+rserial(r)).join(', '):'none'}.`)}
  if(q==='waiting')return astBot(S.queue.length?`${S.queue.length} weighing${S.queue.length===1?'':'s'} waiting. Seed ${f1(sum(S.queue.filter(x=>KIND(x.k)==='seed').map(x=>x.kg)))} kg, oil ${f1(sum(S.queue.filter(x=>KIND(x.k)==='oil').map(x=>x.kg)))} kg, khali ${f1(sum(S.queue.filter(x=>KIND(x.k)==='khali').map(x=>x.kg)))} kg.`:'Nothing is waiting.');
  if(q==='next'){const n=S.jw.filter(j=>!j.crushed).sort(sortJ)[0];return astBot(n?`Next to crush: token ${jserial(n)}, ${n.customer}${n.customer===n.place?'':', '+n.place}. ${f1(n.seedKg)} kg, ${bagTxt(bagsOf(n))}.`:'No job is waiting to be crushed.')}
  if(q==='held'){const h=held();return astBot(h.length?`${h.length} held: ${h.map(j=>'token '+jserial(j)+' '+j.customer).join(', ')}.`:'Nothing held.')}
  if(q==='jobs')return astBot(`${S.jw.filter(j=>!j.crushed).length} to crush, ${held().length} crushed with money or oil pending, ${S.jw.filter(j=>j.settled&&j.given).length} closed.`);
  if(q==='khali')return astBot(`Our khali today ${f1(sum(S.own.okhali))} kg in ${S.own.okhali.length} bags.`);
  if(q==='oil')return astBot(`Our oil today ${f1(sum(S.own.ooil.map(x=>x[0])))} kg in ${S.own.ooil.length} cans.`);
  if(q==='seed')return astBot(`Our seed to crushing today ${f1(sum(S.own.oseed))} kg.`);
  return astBot('Ask: how many waiting, who is next, how many jobs.')}
 case 'run':{const r=S.runs[i.n-1];if(!r)return astBot(`There is no run ${i.n} today.`,'warn');sheetMill();setTimeout(()=>{const el=document.querySelector(`#layer [data-run="${r.id}"]`);const c=el&&el.closest('.card');if(c){c.scrollIntoView({block:'center',behavior:'smooth'});c.classList.add('voicehl');setTimeout(()=>c.classList.remove('voicehl'),4000)}},60);
  if(i.act==='start'){if(r.state!=='weighed')return astBot(`Run ${i.n} is ${r.state==='machine'?'already in the machine':'already past that step'}.`,'warn');return askConfirm(`Put run ${i.n} (${f1(r.seedKg)} kg seed) in the machine?`,()=>{runStart(r.id);astBot(`Run ${i.n} is in the machine.`)})}
  if(i.act==='done'){if(r.state!=='machine')return astBot(r.state==='weighed'?`Run ${i.n} is not in the machine yet.`:`Run ${i.n} is already crushed.`,'warn');return askConfirm(`Mark run ${i.n} crushing done?`,()=>{runCrushed(r.id);astBot(`Run ${i.n} crushed. Now weigh the oil and add it to a tank.`)})}
  return astBot(`Run ${i.n}: seed ${f1(r.seedKg)} kg, ${r.state==='weighed'?'waiting to start':r.state==='machine'?'in the machine':r.state==='oil'?'crushed, oil to tank':'done'}.`)}
 case 'job':if(!i.tok)return astBot(`I could not find token ${i.ref&&i.ref.serial}. Say the token number or the customer name.`,'warn');sheetJob(i.tok);return astBot(`Job card: ${jobName(i.tok)}.`);
 case 'pick':return astBot('Which one?','q',{buttons:i.options.map(t=>({label:jobName(t),js:`astPickJob('${i.act}','${t}')`}))});
 case 'pickCust':return astBot('Which customer?','q',{buttons:i.options.map(ix=>({label:CUSTS[ix][0]+' · '+CUSTS[ix][1],js:`astPickCust(${ix})`}))});
 case 'jobact':{
  if(!i.tok){S.ast.expect={kind:'job',act:i.act};return astBot('Which job? Say the token number or the customer name.','q')}
  const j=S.jw.find(x=>x.tok===i.tok);
  if(i.act==='crushed'){if(j.crushed)return astBot(`${jobName(j.tok)} is already marked crushed.`);return askConfirm(`Mark ${jobName(j.tok)} as crushing done?`,()=>{markCrushed(j.tok);sheetJobs();glowJob(j.tok);astBot(`Done. ${jobName(j.tok)} is crushed and now in Held.`)})}
  // money and oil steps are never saved by voice: open Held and light up the card
  sheetHeld();glowJob(j.tok);
  if(!j.crushed)return astBot(`${jobName(j.tok)} is not crushed yet. Mark crushing done first.`,'warn');
  return astBot(i.act==='pay'?`${jobName(j.tok)}. Tap the glowing money button to ${j.cake==='SHOP'?'pay the customer':'take the khali payment'}.`:`${jobName(j.tok)}. ${j.settled||j.cake==='SHOP'&&!j.settled?'':'Khali payment first. '}Tap the glowing Oil out button.`)}
 case 'adv':{
  const f=i.who==='cust'?'advC':'advA',lab=i.who==='cust'?'Customer advance':'Tempo advance';
  let tok=null;if(i.ref){const j=S.jw.find(x=>jserial(x)===i.ref.serial);if(j)tok=j.tok}else if(window.__cardTok)tok=window.__cardTok;
  if(i.amt==null){S.ast.expect={kind:'amount',who:i.who,ref:i.ref};return astBot('How much?','q')}
  if(tok){const j=S.jw.find(x=>x.tok===tok);if(j.settled)return astBot('That job is already paid. The advance cannot be changed.','warn');const old=j[f];setAdv(tok,f,i.amt);S.ast.undo=()=>setAdv(tok,f,old);return astBot(`${lab} ${i.amt} rupees set for ${jobName(tok)}.`)}
  const old=S.slip[f];S.slip[f]=i.amt;S.ast.undo=()=>{S.slip[f]=old;render()};render();return astBot(`${lab} ${i.amt} rupees set on the slip.`)}
 case 'khali':{
  let tok=null;if(i.ref){const j=S.jw.find(x=>jserial(x)===i.ref.serial);if(j)tok=j.tok}else if(window.__cardTok)tok=window.__cardTok;
  const txt=i.who==='SHOP'?'Shop keeps the khali (oil cake).':'Customer takes the khali (oil cake).';
  if(tok){const j=S.jw.find(x=>x.tok===tok);if(j.settled)return astBot('That job is already paid. Khali cannot be changed now.','warn');const old=j.cake;setCake(tok,i.who);S.ast.undo=()=>setCake(tok,old);return astBot(`${txt} ${jobName(tok)}.`)}
  const old=S.slip.cake;S.slip.cake=i.who;S.ast.undo=()=>{S.slip.cake=old;render()};render();return astBot(`${txt} On the slip.`)}
 case 'mobile':{const m=cleanMobile(i.value);if(!m)return astBot('A mobile number has 10 digits. Say it again.','warn');
  const nm=document.getElementById('nm');if(nm){nm.value=m;return astBot(`Mobile ${m.split('').join(' ')}.`)}
  if(S.slip.cust){const c=S.slip.cust.slice();c[2]=m;const ci=CUSTS.findIndex(x=>x[0]===c[0]&&x[1]===c[1]);if(ci>=0)CUSTS[ci][2]=m;S.slip.cust=c;render();return astBot(`Mobile ${m.split('').join(' ')} saved for ${c[0]}.`)}
  return astBot('Choose a customer first, then say the mobile number.','warn')}
 case 'cust':{
  if(i.mode==='select'){const c=CUSTS[i.idx];
   const apply=()=>{const had=S.slip.cust;S.slip.cust=[c[0],c[1],c[2]||''];if(i.mobile&&!S.slip.cust[2])S.slip.cust[2]=i.mobile;S.ast.undo=()=>{S.slip.cust=had;render()};if($('#cq'))closeLayer();else render();return astBot(`Customer: ${c[0]}${c[0]===c[1]?'':', '+c[1]}.${S.slip.cust[2]?' Mobile '+fmtMob(S.slip.cust[2])+'.':''}`)};
   if(i.score<0.85)return askConfirm(`Did you mean ${c[0]}${c[0]===c[1]?'':' from '+c[1]}?`,apply);return apply()}
  if(i.mode==='village'){const had=S.slip.cust;S.slip.cust=[i.place,i.place,i.mobile||''];S.ast.undo=()=>{S.slip.cust=had;render()};if($('#cq'))closeLayer();else render();return astBot(`Village only: ${i.place}. No customer name.`)}
  return astNewCust(i)}
 default:return astBot(`Sorry, I did not understand “${heard}”. Try: open waiting · customer Sangamma · advance 500 · crushing done for Ravi.`,'warn')}}
function astNewCust(i){
 openCustSheet();
 const nc=document.getElementById('nc'),nm=document.getElementById('nm');
 if(i.name&&nc)nc.value=i.name;if(i.mobile&&nm)nm.value=i.mobile;
 if(!i.name){S.ast.expect={kind:'name',place:i.place,mobile:i.mobile};return astBot('New customer. What is the name? You can also say just the village.','q')}
 if(!i.place){astBot(`New customer ${i.name}. Say the village, or tap one.`,'q');S.ast.expect={kind:'village',name:i.name,mobile:i.mobile};return}
 return askConfirm(`Add new customer ${i.name}, ${i.place}${i.mobile?', mobile '+fmtMob(i.mobile):''}?`,()=>{const c=[i.name,i.place,i.mobile||''];if(!CUSTS.find(x=>x[0]===c[0]&&x[1]===c[1]))CUSTS.push(c);S.slip.cust=c;if($('#cq'))closeLayer();else render();astBot(`Saved. Customer: ${c[0]}, ${c[1]}.`)})}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.ast.open)astClose()});
if('speechSynthesis' in window){try{speechSynthesis.getVoices();speechSynthesis.onvoiceschanged=()=>{}}catch(e){}}
