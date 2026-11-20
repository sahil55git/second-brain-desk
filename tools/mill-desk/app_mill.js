/* ===== Our own mill: production runs (seed weighed -> machine -> oil weighed -> tank) ===== */
S.runs=[
 {id:'R1',time:'20 Nov 08:30 AM',seedKg:287.4,nb:6,state:'done',tMachine:'08:45 AM',tCrushed:'10:20 AM',tDone:'11:05 AM',oil:[[15.2,'Floor barrel'],[16.1,'Floor barrel'],[17.0,'Floor barrel']]},
 {id:'R2',time:'20 Nov 10:40 AM',seedKg:241.2,nb:5,state:'machine',tMachine:'10:50 AM',oil:[]},
 {id:'R3',time:'20 Nov 11:30 AM',seedKg:240.0,nb:5,state:'weighed',oil:[]}];
const TANKS=['K2','Floor barrel','Small tank'];
const rserial=r=>S.runs.indexOf(r)+1;
const runsActive=()=>S.runs.filter(r=>r.state!=='done').length;
const runOilKg=r=>r2(sum(r.oil.map(x=>x[0])));
function newRun(items){const r={id:'R'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),time:items[0].time||clock(),seedKg:r2(sum(items.map(x=>x.kg))),nb:sum(items.map(x=>x.nb||1)),state:'weighed',oil:[]};S.runs.push(r);return r}
// our oil can going into a tank belongs to the run that was just crushed (only when exactly one is waiting for oil)
function oilToRun(kg,tank){const w=S.runs.filter(r=>r.state==='oil');if(w.length===1){w[0].oil.push([kg,tank]);return w[0]}return null}
function runSteps(r){
 const st=[['seed','Seed weighed',true],['crush','Crushing',r.state==='oil'||r.state==='done'],['drop','Oil weighed',r.oil.length>0],['tank','In tank',r.state==='done']];
 const cur=st.findIndex(x=>!x[2]);
 return `<div class="steps">${st.map((x,i)=>`<div class="stp ${x[2]?'ok':i===cur?'cur':''}"><span>${x[0]==='crush'?ownIcon(26):ic(x[0])}${x[2]?`<i class="tk">${ic('check')}</i>`:''}</span><small>${x[1]}</small></div>`).join('<i class="sep"></i>')}</div>`}
function runAct(r){
 if(r.state==='weighed')return `<button class="sbtn go next" style="min-height:64px" onclick="runStart('${r.id}')">${ownIcon(28)}${ic('arrowr')}Put seed in machine</button>`;
 if(r.state==='machine')return `<button class="sbtn go next" style="min-height:64px" onclick="runCrushed('${r.id}')">${ownIcon(28)}${ic('check')}Crushing done</button>`;
 if(r.state==='oil')return (r.oil.length?`<button class="sbtn go next" style="min-height:64px" onclick="runFinish('${r.id}')">${ic('tank')}${ic('check')}Run finished · oil in tank</button>`:'')
  +`<button class="sbtn ${r.oil.length?'':'go next'}" style="min-height:58px" onclick="sheetRunOil('${r.id}')">${ic('drop')}${ic('arrowr')}${ic('tank')}Add oil can to tank</button>`;
 return `<div class="st ok">${ic('check')} Done · oil ${f1(runOilKg(r))} kg in tank</div>`}
function runCard(r){
 const n=rserial(r),oilPills=r.oil.map(x=>`<span class="pc gd">${ic('drop')} ${f1(x[0])} kg → ${ic('tank')} ${esc(x[1])}</span>`).join('');
 const since=r.state==='machine'?`<div class="note" style="padding:0">${ownIcon(20)} In machine since <b>${r.tMachine}</b></div>`:'';
 return `<div class="card ${r.state==='done'?'done':''}"><div class="jh run" data-run="${r.id}"><div class="snw"><b class="sn">${n}</b><small>Run</small></div><div class="jm">${dtHTML(r.time)}<div class="jn">${ic('seed')} Seed ${f1(r.seedKg)} kg · ${bagTxt(r.nb)}</div></div>${spkBtn(`sayRun('${r.id}')`)}</div>
  ${runSteps(r)}${since}${oilPills?`<div class="pillrow">${oilPills}</div>`:''}${runAct(r)}</div>`}
function sheetMill(){
 const by=s=>S.runs.filter(r=>r.state===s);
 const sec=(t,ico,col,l)=>l.length?`<div class="grp"><span class="gi" style="background:${col}">${ico==='own'?ownIcon(22):ic(ico)}</span>${t} (${l.length})</div>`+l.map(runCard).join(''):'';
 const o=S.own,sum2=`<div class="wsum"><span class="pc tk">${ic('seed')}Seed ${f1(sum(o.oseed))} kg</span><span class="pc tk">${ic('drop')}Oil ${f1(sum(o.ooil.map(x=>x[0])))} kg</span><span class="pc tk">${ic('bag')}Khali · Oil cake ${f1(sum(o.okhali))} kg</span></div>`;
 layer('Our mill · production',sum2+`<div class="note">Our own seed: weigh the seed, put it in the machine, then weigh the oil and put it in the tank. Tap the glowing button for the next step.</div>`
  +sec('To start · seed weighed','seed','#C98A25',by('weighed'))+sec('In machine · crushing','own','#C98A25',by('machine'))+sec('Oil to tank','drop','#5F82D4',by('oil'))+sec('Done today','check','#3F9D63',by('done'))
  +(S.runs.length?'':'<div class="note">No run yet. Weigh the seed, then in Waiting tap “Add to today’s crushing”.</div>'))}
function runStart(id){const r=S.runs.find(x=>x.id===id);if(!r||r.state!=='weighed')return;r.state='machine';r.tMachine=t12(new Date());toast('Seed in machine · Run '+rserial(r));sheetMill();render()}
function runCrushed(id){const r=S.runs.find(x=>x.id===id);if(!r||r.state!=='machine')return;r.state='oil';r.tCrushed=t12(new Date());toast('Crushing done · weigh the oil next');sheetMill();render()}
function runFinish(id){const r=S.runs.find(x=>x.id===id);if(!r||r.state!=='oil'||!r.oil.length)return;r.state='done';r.tDone=t12(new Date());toast('Run '+rserial(r)+' finished · '+f1(runOilKg(r))+' kg oil in tank');sheetMill();render()}
function sheetRunOil(id){const r=S.runs.find(x=>x.id===id),q=S.queue.filter(x=>x.k==='ooil');
 layer(`Add oil can · Run ${rserial(r)}`,q.length?`<div class="note">Pick the weighed can, then the tank it goes into.</div>`+q.map(x=>`<div class="card"><h3>${ic('drop')} ${f1(x.kg)} kg <span class="t">${x.time}</span></h3><div class="chrow">${TANKS.map(tk=>`<button class="ch" onclick="runOil('${id}','${x.id}','${tk}')">${ic('tank')} ${tk}</button>`).join('')}</div></div>`).join('')
  :`<div class="note">${ic('hand')} No oil can is waiting. Weigh the oil can on the scale first (tile 5 · Our oil can).</div><button class="sbtn" onclick="sheetMill()">${ic('arrowr')}Back</button>`,'sheetMill()')}
function runOil(id,qid,tank){const r=S.runs.find(x=>x.id===id),qi=S.queue.findIndex(x=>x.id===qid);if(!r||qi<0)return;const x=S.queue.splice(qi,1)[0];r.oil.push([x.kg,tank]);S.own.ooil.push([x.kg,tank]);toast(f1(x.kg)+' kg → '+tank);sheetMill();render()}
function sayRun(id){const r=S.runs.find(x=>x.id===id);if(!r)return;const st={weighed:'Waiting to go in the machine',machine:'In the machine, crushing',oil:'Crushed. Oil to tank',done:'Done'}[r.state];TTS.say(`Run ${rserial(r)}. Seed ${f1(r.seedKg)} kilos, ${bagTxt(r.nb)}. ${st}.${r.oil.length?' Oil '+f1(runOilKg(r))+' kilos.':''}`,'en-IN')}
