/* ===================== LIVE LAYER (production) =====================
   Real scale (from the app page around this screen), server sync of jobs, waiting list,
   runs, own weighings, customers and barrels, offline cache, printing.
   Standalone (opened on its own or with ?demo=1): keeps the demo scale and demo data. */
(function(){
const DEMO=/[?&]demo=1/.test(location.search);
if(window.parent===window&&!DEMO&&/^\/mill\//.test(location.pathname)){location.replace('/mill');return}
const LIVE=window.parent!==window&&!DEMO;
window.MILL_LIVE=LIVE;
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
window.uid=uid;
const OWNK=['oseed','ooil','okhali','sed','other','sbuy','kbuy','obuy','osell','ksell'];
const LS='milldesk.state.v1';
// stable stringify (Postgres JSONB re-orders keys, so compare by sorted keys)
const canon=v=>JSON.stringify(v,function(k,x){if(x&&typeof x==='object'&&!Array.isArray(x)){const o={};Object.keys(x).sort().forEach(y=>o[y]=x[y]);return o}return x});
const ckey=c=>(String(c[0]||'')+'|'+String(c[1]||'')).toLowerCase();
const SY={snap:{job:{},q:{},run:{},cust:{},barrel:{}},own:{},oid:{},busy:false,again:false,pushSeq:0,online:true,pending:0,loaded:false,cur:null,next:null,needRender:false,timer:null};
window.SY=SY;
S.khali=null;
function lists(){return{job:S.jw,q:S.queue,run:S.runs,cust:CUSTS.map(c=>({id:ckey(c),name:c[0],place:c[1],mobile:c[2]||''})),
 barrel:Object.keys(S.barrels||{}).map(k=>Object.assign({id:k},S.barrels[k]))}}
function ensureIds(){S.jw.forEach(j=>{if(!j.id)j.id=uid('J')});S.queue.forEach(x=>{if(!x.id||/^Q\d+$/.test(x.id))x.id=uid('Q')});S.runs.forEach(r=>{if(!r.id)r.id=uid('R')})}
function pendingCount(){let n=0;const L=lists();for(const k in L){const sn=SY.snap[k];const ids=new Set();L[k].forEach(x=>{ids.add(x.id);if(sn[x.id]!==canon(x))n++});if(k==='q'||k==='job')for(const id in sn)if(!ids.has(id))n++}
 OWNK.forEach(k=>{n+=Math.max(0,(S.own[k]||[]).length-(SY.own[k]||0))});return n}
function batch(){ensureIds();const L=lists(),up={},del={};
 for(const k in L){const sn=SY.snap[k];const ids=new Set();up[k]=[];L[k].forEach(x=>{ids.add(x.id);const c=canon(x);if(sn[x.id]!==c)up[k].push(JSON.parse(c))});
  if(k==='q'){del.q=Object.keys(sn).filter(id=>!ids.has(id))}}
 // an entry keeps the same id until the server has it, so a retry after a lost reply cannot save it twice
 const own=[];OWNK.forEach(k=>{const a=S.own[k]||[],n=SY.own[k]||0;a.slice(n).forEach((v,i)=>{const q=k+'|'+(n+i);const id=SY.oid[q]||(SY.oid[q]=uid('O'));own.push({id,key:k,v,idx:n+i})})});
 const empty=!own.length&&!del.q.length&&Object.values(up).every(a=>!a.length);
 return empty?null:{up,del,own}}
function save(){try{localStorage.setItem(LS,JSON.stringify({at:Date.now(),jw:S.jw,queue:S.queue,runs:S.runs,own:S.own,custs:CUSTS,barrels:S.barrels,snap:SY.snap,ownSnap:SY.own,oid:SY.oid,nextJw:S.nextJw,wsn:S.wsn,me:S.me}))}catch(e){}}
function restore(){try{const d=JSON.parse(localStorage.getItem(LS)||'null');if(!d||Date.now()-d.at>3*86400000)return false;
 S.jw=d.jw||[];S.queue=d.queue||[];S.runs=d.runs||[];S.own=Object.assign(emptyOwn(),d.own||{});CUSTS.length=0;(d.custs||[]).forEach(c=>CUSTS.push(c));S.barrels=d.barrels||{};
 SY.snap=Object.assign(SY.snap,d.snap||{});SY.own=d.ownSnap||{};SY.oid=d.oid||{};S.nextJw=d.nextJw||S.nextJw;S.wsn=d.wsn||S.wsn;if(d.me)S.me=d.me;return true}catch(e){return false}}
function emptyOwn(){return{cseedNote:0,oseed:[],ooil:[],okhali:[],sed:[],other:[]}}
async function push(){if(!LIVE||!SY.loaded)return;if(SY.busy){SY.again=true;return}
 const b=batch();SY.pending=b?pendingCount():0;paintSync();if(!b)return;
 SY.busy=true;SY.pushSeq++;
 try{const r=await fetch('/api/mill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b),credentials:'same-origin'});
  if(r.status===401){location.reload();return}
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Not saved');
  for(const k in b.up)b.up[k].forEach(x=>{SY.snap[k][x.id]=canon(x)});
  (b.del.q||[]).forEach(id=>{delete SY.snap.q[id]});
  b.own.forEach(o=>{SY.own[o.key]=Math.max(SY.own[o.key]||0,o.idx+1);delete SY.oid[o.key+'|'+o.idx]});
  if(d.remap)Object.keys(d.remap).forEach(id=>{const j=S.jw.find(x=>x.id===id);if(j){toast('Invoice number changed to '+d.remap[id].replace('JW-','#')+' (another counter used it)');j.tok=d.remap[id];SY.snap.job[id]=canon(j)}});
  if(d.nextJw)S.nextJw=Math.max(S.nextJw,d.nextJw);
  SY.online=true;SY.pushSeq++}
 catch(e){SY.online=false;clearTimeout(SY.retry);SY.retry=setTimeout(push,4000)}
 finally{SY.busy=false;SY.pending=pendingCount();save();paintSync();if(SY.again){SY.again=false;setTimeout(push,50)}}}
function schedule(){if(!LIVE)return;save();clearTimeout(SY.timer);SY.timer=setTimeout(push,250)}
window.millSchedule=schedule;
function mergeList(kind,local,server){const sn=SY.snap[kind],lm=new Map(local.map(x=>[x.id,x])),out=[],seen=new Set();let ch=false;
 server.forEach(sx=>{seen.add(sx.id);const lx=lm.get(sx.id),c=canon(sx);
  if(lx&&sn[sx.id]!==canon(lx)){out.push(lx);return}// changed here, not sent yet: keep ours
  if(!lx||canon(lx)!==c)ch=true;sn[sx.id]=c;out.push(sx)});
 local.forEach(lx=>{if(seen.has(lx.id))return;if(sn[lx.id]!==undefined&&sn[lx.id]===canon(lx)){delete sn[lx.id];ch=true;return}// gone on the server
  out.push(lx)});
 return{out,ch}}
async function pull(){if(!LIVE||document.hidden)return;const seq=SY.pushSeq;
 try{const r=await fetch('/api/mill',{credentials:'same-origin',cache:'no-store'});if(r.status===401){location.reload();return}
  const d=await r.json();if(!r.ok)throw new Error(d.error||'');
  if(SY.busy||seq!==SY.pushSeq)return;// a save went out meanwhile: wait for the next pull
  let ch=false;S.me=d.me||S.me;
  let m=mergeList('job',S.jw,d.jobs||[]);S.jw=m.out;ch=ch||m.ch;
  m=mergeList('q',S.queue,d.queue||[]);S.queue=m.out;ch=ch||m.ch;
  m=mergeList('run',S.runs,d.runs||[]);S.runs=m.out;ch=ch||m.ch;
  const lc=CUSTS.map(c=>({id:ckey(c),name:c[0],place:c[1],mobile:c[2]||''}));
  m=mergeList('cust',lc,d.custs||[]);if(m.ch){CUSTS.length=0;m.out.forEach(c=>CUSTS.push([c.name,c.place,c.mobile||'']));ch=true}
  const lb=Object.keys(S.barrels||{}).map(k=>Object.assign({id:k},S.barrels[k]));
  m=mergeList('barrel',lb,d.barrels||[]);if(m.ch){const b={};m.out.forEach(x=>{const y=Object.assign({},x);delete y.id;b[x.id]=y});S.barrels=b;ch=true}
  const ownDirty=OWNK.some(k=>(S.own[k]||[]).length>(SY.own[k]||0));
  if(!ownDirty&&d.own){const o=emptyOwn();d.own.forEach(x=>{(o[x.key]=o[x.key]||[]).push(x.v)});
   if(canon(o)!==canon(Object.assign(emptyOwn(),S.own))){S.own=o;ch=true}SY.own={};SY.oid={};Object.keys(o).forEach(k=>{if(Array.isArray(o[k]))SY.own[k]=o[k].length})}
  if(d.khali&&canon(d.khali)!==canon(S.khali||null)){S.khali=d.khali;ch=true}
  if(d.nextJw)S.nextJw=Math.max(S.nextJw||1,d.nextJw);
  if(d.wsn)S.wsn=Math.max(S.wsn||1,d.wsn);
  SY.online=true;
  if(!SY.loaded){SY.loaded=true;ch=true;schedule()}
  if(ch){save();refresh()}
  SY.pending=pendingCount();paintSync()}
 catch(e){SY.online=false;paintSync()}}
window.millPull=pull;
function busyUI(){const a=document.activeElement;return a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)||(S.ast&&S.ast.pending)||(S.ast&&S.ast.open&&S.ast.listening)}
function refresh(){if(busyUI()){SY.needRender=true;return}
 const open=$('#layer').classList.contains('on');
 if(open){if(SY.cur){const c=SY.cur,sc=$('#layer .lb')?$('#layer .lb').scrollTop:0;try{window[c.fn].apply(null,c.args)}catch(e){}const lb=$('#layer .lb');if(lb)lb.scrollTop=sc}else{SY.needRender=true;return}}
 render()}
// remember which list sheet is open, so new data from the other phone can repaint it
['sheetWaiting','sheetJobs','sheetHeld','sheetMill','sheetParked','sheetJob','sheetRunOil'].forEach(fn=>{const f=window[fn];if(typeof f!=='function')return;window[fn]=function(){SY.next={fn,args:[].slice.call(arguments)};const r=f.apply(this,arguments);SY.next=null;return r}});
const _lay=layer;layer=function(){SY.cur=SY.next||null;const r=_lay.apply(this,arguments);schedule();return r};
const _render=render;render=function(){SY.needRender=false;const r=_render.apply(this,arguments);paintSync();schedule();return r};
const _close=closeLayer;closeLayer=function(){SY.cur=null;return _close.apply(this,arguments)};
function paintSync(){if(!LIVE)return;const h=$('#top h1 small');if(!h)return;let e=$('#syncst');if(!e){e=document.createElement('b');e.id='syncst';h.appendChild(e)}
 const n=SY.pending;e.className='syncst '+(!SY.loaded?'ld':!SY.online?'off':n?'pend':'ok');
 e.textContent=!SY.loaded?' · Loading…':!SY.online?` · Offline${n?' · '+n+' not sent':''}`:n?` · Sending ${n}…`:''}

/* ---------- real scale, from the app page ---------- */
S.link={on:false,name:'',fresh:false};
window.addEventListener('message',e=>{if(e.origin!==location.origin)return;const d=e.data||{};
 if(d.type==='scale'){const s=S.scale,w=Math.max(0,Math.round((+d.w||0)*20)/20);S.link={on:!!d.connected,name:d.name||'',fresh:!!d.fresh};
  const v=S.link.on&&S.link.fresh?w:0;s.from=v;s.to=v;s.t0=0;paintLink()}
 if(d.type==='me'&&d.me){S.me=d.me}
 if(d.type==='toast'&&d.text)toast(d.text,d.bad?'bad':'')});
function paintLink(){const p=document.querySelector('#top .pill[data-f="bt"]');if(!p)return;const dot=p.querySelector('.dot');if(dot)dot.style.background=!LIVE||S.link.on&&S.link.fresh?'var(--okt)':S.link.on?'#E9C46A':'#E5484D';p.title=S.link.on?(S.link.name||'Scale')+(S.link.fresh?' · connected':' · no reading'):'Scale not connected · tap to connect'}
// the barrel counter desk (lots received: gross, tare, net) is its own full screen in the app
window.millCounterOpen=function(){if(window.parent!==window)window.parent.postMessage({type:'open',to:'/mill/counter'},location.origin);else location.href='/mill/counter'};
window.millScaleTap=function(){if(window.parent!==window)window.parent.postMessage({type:'scale-connect'},location.origin)};

/* ---------- the mill label printer (Helett): ONE tap — Save prints at once, the app page sends it over Bluetooth ---------- */
const PR=window.PR={native:false,name:'',ready:false,pending:0,id:'',doc:null,copies:1,busy:false,ok:null,text:'',fix:'',fallback:false,t:0};
function paintPrint(){
 const pill=document.querySelector('#top .pill[data-f="pr"]');
 if(pill){const dot=pill.querySelector('.dot');if(dot)dot.style.background=!PR.native?'#8a96a3':!PR.ready?'#E5484D':PR.pending?'#E9C46A':'var(--okt)';
  pill.title=!PR.native?'Printing uses the normal print window here (the Android app prints in one tap)':!PR.ready?'Printer not chosen · tap to pair':(PR.name||'Printer')+(PR.pending?' · '+PR.pending+' not printed':' · ready')}
 const e=document.getElementById('prst');
 if(e){const live=PR.busy||PR.ok!==null;
  e.style.display=live?'flex':'none';e.className='prst'+(PR.busy?'':PR.ok?' ok':' bad');
  e.innerHTML=(PR.busy?'<span>Printing…</span>':'<span>'+esc(PR.text)+'</span>')+(!PR.busy&&PR.ok===false&&PR.native?'<button onclick="millPrinterTap()">Printer set-up</button>':'')}
 document.querySelectorAll('.prlbl').forEach(x=>{x.textContent=PR.native&&PR.doc?'Print again':'Print'});
 let b=document.getElementById('prpend');
 if(PR.native&&PR.pending>0&&PR.ready){if(!b){b=document.createElement('div');b.id='prpend';b.className='prpend';document.body.appendChild(b)}
  b.innerHTML='<span>'+PR.pending+' slip'+(PR.pending>1?'s':'')+' not printed</span><button onclick="window.parent.postMessage({type:\'print-pending\'},location.origin)">Print now</button>'}
 else if(b)b.remove()}
function sendPrint(doc,copies){PR.id=uid('p');PR.busy=true;PR.ok=null;PR.text='';PR.fix='';
 window.parent.postMessage({type:'print',id:PR.id,doc:doc||PR.doc,copies:copies||PR.copies},location.origin);
 clearTimeout(PR.t);PR.t=setTimeout(()=>{if(PR.busy){PR.busy=false;PR.ok=false;PR.text='The printer did not answer in time. Look at the printer first: if the slip did not come out, Print again.';paintPrint()}},150000);
 setTimeout(paintPrint,0)}
window.millPrintAuto=function(doc,copies){PR.doc=doc;PR.copies=Math.max(1,+copies||1);if(!PR.native){setTimeout(paintPrint,0);return}sendPrint()};
window.printAgain=function(){if(PR.native&&PR.doc)sendPrint();else printPaper()};
// a small sticker for a bag or barrel: the code as a QR (phone camera) plus the first lines; goes to the label printer
window.millSticker=function(){const d=PR.doc;if(!d){toast('Save the slip first','bad');return}
 if(!PR.native){toast('Stickers print from the Android app','bad');return}
 const rows=(d.rows||[]).filter(r=>r!=='-').slice(0,4);
 sendPrint({kind:'sticker',code:d.code,shop:d.shop,title:d.title,when:d.when,rows,foot:d.foot,qr:true},1)};
window.millPrinterTap=function(){if(window.parent!==window)window.parent.postMessage({type:'printer-setup'},location.origin)};
window.addEventListener('message',e=>{if(e.origin!==location.origin)return;const d=e.data||{};
 if(d.type==='printer'){PR.native=!!d.native;PR.name=d.name||'';PR.ready=!!d.ready;PR.pending=+d.pending||0;paintPrint()}
 if(d.type==='print-result'&&d.id===PR.id){clearTimeout(PR.t);PR.busy=false;PR.ok=!!d.ok;PR.text=d.text||'';PR.fix=d.fix||'';PR.fallback=!!d.fallback;paintPrint()}});
setInterval(paintPrint,2000);

/* ---------- printing: the paper on screen goes to the printer ---------- */
window.printPaper=function(){const p=document.querySelector('#layer .paper');if(!p)return;
 const n=Math.max(1,+(window.__copies||1));window.__copies=1;
 const html=Array.from({length:n},()=>p.outerHTML).join('<div class="pbrk"></div>');
 if(window.parent!==window){ // the app page prints it from a real window (printing inside this frame does nothing in the app)
  const css=Array.from(document.querySelectorAll('style')).map(x=>x.textContent).join('\n');
  window.parent.postMessage({type:'print-html',html,css},location.origin);return}
 let a=$('#printarea');if(!a){a=document.createElement('div');a.id='printarea';document.body.appendChild(a)}
 a.innerHTML=html;setTimeout(()=>window.print(),60)};

/* ---------- start ---------- */
if(LIVE){
 const d=$('#demo');if(d)d.style.display='none';
 S.jw=[];S.queue=[];S.runs=[];S.own=emptyOwn();S.barrels={};CUSTS.length=0;S.nextJw=1;S.wsn=1;S.parked=[];S.me={name:'',isOwner:false};
 try{S.parked=JSON.parse(localStorage.getItem('milldesk.parked')||'[]')}catch(e){}
 restore();
 setInterval(()=>{try{localStorage.setItem('milldesk.parked',JSON.stringify(S.parked))}catch(e){}},2000);
 setInterval(pull,4000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){pull();push()}});
 window.addEventListener('online',()=>{push();pull()});
 document.addEventListener('focusout',()=>setTimeout(()=>{if(SY.needRender&&!busyUI())refresh()},300));
 setInterval(()=>{if(SY.needRender&&!busyUI())refresh()},1500);
 window.parent.postMessage({type:'ready'},location.origin);
 pull()}
setInterval(paintLink,1000);
})();
