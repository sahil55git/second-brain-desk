/* Mill Desk voice engine: pure parser (no DOM). Source of truth; inlined into counter.html by build.py.
   Speech -> text is done by the browser; this turns text (English, Hindi, Kannada, Hinglish) into a command.
   Nothing here saves money or stock: the executor only opens screens and pre-fills; risky steps need a tap or a spoken yes. */
(function(root){
'use strict';
const DIG={'೦':0,'೧':1,'೨':2,'೩':3,'೪':4,'೫':5,'೬':6,'೭':7,'೮':8,'೯':9,'०':0,'१':1,'२':2,'३':3,'४':4,'५':5,'६':6,'७':7,'८':8,'९':9};
const SMALL={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,
 ek:1,teen:3,chaar:4,paanch:5,panch:5,saat:7,aath:8,das:10,bees:20,pachaas:50,pachas:50,
 एक:1,दो:2,तीन:3,चार:4,पांच:5,पाँच:5,छह:6,छः:6,सात:7,आठ:8,नौ:9,दस:10,ग्यारह:11,बारह:12,पंद्रह:15,बीस:20,तीस:30,चालीस:40,पचास:50,साठ:60,सत्तर:70,अस्सी:80,नब्बे:90,
 ondu:1,eradu:2,mooru:3,nalku:4,naalku:4,aidu:5,aaru:6,elu:7,entu:8,ombattu:9,hattu:10,
 ಒಂದು:1,ಎರಡು:2,ಮೂರು:3,ನಾಲ್ಕು:4,ಐದು:5,ಆರು:6,ಏಳು:7,ಎಂಟು:8,ಒಂಬತ್ತು:9,ಹತ್ತು:10,ಹನ್ನೆರಡು:12,ಹದಿನೈದು:15,ಇಪ್ಪತ್ತು:20,ಮೂವತ್ತು:30,ನಲವತ್ತು:40,ಐವತ್ತು:50,ಅರವತ್ತು:60,ಎಪ್ಪತ್ತು:70,ಎಂಬತ್ತು:80,ತೊಂಬತ್ತು:90};
const MULT={hundred:100,sau:100,सौ:100,ನೂರು:100,nooru:100,thousand:1000,hazaar:1000,hazar:1000,हज़ार:1000,हजार:1000,ಸಾವಿರ:1000,saavira:1000,lakh:100000,लाख:100000,ಲಕ್ಷ:100000};
/* words in other languages -> the English command word the parser knows. Longest first. */
const PH=[
 ['crushing done','crushed'],['crush done','crushed'],['ho gaya','done'],['हो गया','done'],['हो गई','done'],['पूरा','done'],['ಆಯಿತು','done'],['ಮುಗಿದಿದೆ','done'],['ಮುಗಿಯಿತು','done'],['पेराई','crush'],['ಗಾಣ','crush'],
 ['oil out','oilout'],['oil give','oilout'],['तेल दो','oilout'],['तेल दे','oilout'],['ಎಣ್ಣೆ ಕೊಡು','oilout'],['ಎಣ್ಣೆ ಕೊಡಿ','oilout'],
 ['what can i say','help'],['मदद','help'],['ಸಹಾಯ','help'],
 ['खोलो','open'],['खोलिए','open'],['खोल','open'],['kholo','open'],['ತೆರೆಯಿರಿ','open'],['ತೆರೆ','open'],
 ['दिखाओ','show'],['दिखाइए','show'],['dikhao','show'],['ತೋರಿಸು','show'],['ತೋರಿಸಿ','show'],
 ['ಕಾಯುವ ಪಟ್ಟಿ','waiting'],['ಕಾಯುತ್ತಿರುವವರ ಪಟ್ಟಿ','waiting'],['ಕೆಲಸದ ಪಟ್ಟಿ','jobs'],['ಕೆಲಸಗಳ ಪಟ್ಟಿ','jobs'],
 ['वेटिंग','waiting'],['प्रतीक्षा','waiting'],['ವೇಟಿಂಗ್','waiting'],['ಕಾಯುತ್ತಿರುವ','waiting'],
 ['जॉब','jobs'],['काम','jobs'],['ಜಾಬ್','jobs'],['ಕೆಲಸ','jobs'],
 ['होल्ड','held'],['ಹೆಲ್ಡ್','held'],['ಹೋಲ್ಡ್','held'],
 ['पार्क','parked'],['ಪಾರ್ಕ್','parked'],
 ['मिल','mill'],['ಮಿಲ್','mill'],['मशीन','machine'],['ಮೆಷಿನ್','machine'],['ಯಂತ್ರ','machine'],['सेटिंग','settings'],['ಸೆಟ್ಟಿಂಗ್','settings'],
 ['ग्राहक','customer'],['grahak','customer'],['ಗ್ರಾಹಕರು','customer'],['ಗ್ರಾಹಕ','customer'],
 ['गांव','village'],['गाँव','village'],['gaon','village'],['ಊರು','village'],['ಗ್ರಾಮ','village'],
 ['मोबाइल','mobile'],['मोबाईल','mobile'],['नंबर','mobile'],['ಮೊಬೈಲ್','mobile'],['ನಂಬರ್','mobile'],
 ['एडवांस','advance'],['अडवांस','advance'],['ಅಡ್ವಾನ್ಸ್','advance'],['ಅಡ್ವಾನ್ಸ್','advance'],
 ['टेम्पो','tempo'],['ಟೆಂಪೋ','tempo'],['ऑटो','tempo'],['ಆಟೋ','tempo'],
 ['खली','khali'],['ಹಿಂಡಿ','khali'],['oil cake','khali'],['oilcake','khali'],
 ['दुकान','shop'],['dukan','shop'],['ಅಂಗಡಿ','shop'],
 ['टोकन','token'],['ಟೋಕನ್','token'],['सीरियल','token'],
 ['हाँ','yes'],['हां','yes'],['ಹೌದು','yes'],['haan','yes'],['ji','yes'],['नहीं','no'],['nahi','no'],['ಇಲ್ಲ','no'],
 ['रद्द','cancel'],['ರದ್ದು','cancel'],['वापस','back'],['ಹಿಂದೆ','back'],
 ['पैसे','pay'],['ಹಣ','pay'],['तेल','oil'],['ಎಣ್ಣೆ','oil'],['रुपये','rs'],['रुपए','rs'],['ರೂಪಾಯಿ','rs'],['ರೂ','rs']
].sort((a,b)=>b[0].length-a[0].length);
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const PHRE=PH.map(([f,t])=>[new RegExp('(^|[\\s,.?!])'+esc(f)+'(?=$|[\\s,.?!])','g'),t]);

function numberize(tokens){
  const out=[];let i=0;
  const isDigitTok=t=>/^\d$/.test(t)||(SMALL[t]!==undefined&&SMALL[t]<=9&&t!=='ten');
  while(i<tokens.length){
    // a run of single spoken digits (phone number) -> one digit string
    let j=i;while(j<tokens.length&&isDigitTok(tokens[j]))j++;
    if(j-i>=6){out.push(tokens.slice(i,j).map(t=>/^\d$/.test(t)?t:String(SMALL[t])).join(''));i=j;continue}
    const t=tokens[i];
    if(/^\d+(\.\d+)?$/.test(t)){
      // "2 hundred", "5 thousand", "1.5 thousand"
      let v=parseFloat(t),k=i+1;
      while(k<tokens.length&&MULT[tokens[k]]!==undefined&&MULT[tokens[k]]>=100){v*=MULT[tokens[k]];k++}
      out.push(String(Math.round(v*100)/100));i=k;continue}
    if(SMALL[t]!==undefined||MULT[t]!==undefined){
      let total=0,cur=0,k=i,any=false;
      while(k<tokens.length){
        const w=tokens[k];
        if(SMALL[w]!==undefined){cur+=SMALL[w];any=true}
        else if(/^\d+$/.test(w)&&any&&cur%100===0&&cur>0&&false){}
        else if(MULT[w]!==undefined){const m=MULT[w];if(m===100){cur=(cur||1)*100}else{total+=(cur||1)*m;cur=0}any=true}
        else if(w==='and'&&any){}
        else break;
        k++}
      out.push(String(total+cur));i=k;continue}
    out.push(t);i++}
  return out}

function normalize(raw){
  let s=' '+String(raw||'').toLowerCase()+' ';
  s=s.replace(/[೦-೯०-९]/g,d=>String(DIG[d]));
  s=s.replace(/₹/g,' rs ');
  s=s.replace(/(\d),(\d)/g,'$1$2');
  s=s.replace(/[.,!?;:"“”]/g,m=>m==='.'?'.':' ');
  s=s.replace(/(\d)\s*(kg|kgs|kilo)\b/g,'$1 kg');
  for(const [re,t] of PHRE)s=s.replace(re,'$1'+t);
  s=s.replace(/\s+/g,' ').trim();
  const tokens=numberize(s.split(' ').filter(Boolean));
  return tokens.join(' ')}

/* ---------- fuzzy name matching (Latin spelling; handles bh/b, kh/k, double letters, vowels) ---------- */
function key(w){
  w=String(w).toLowerCase().replace(/[^a-zऀ-ॿಀ-೿]/g,'');
  w=w.replace(/bh/g,'b').replace(/kh/g,'k').replace(/gh/g,'g').replace(/dh/g,'d').replace(/th/g,'t').replace(/ph/g,'f').replace(/ch/g,'c').replace(/sh/g,'s').replace(/w/g,'v').replace(/z/g,'j').replace(/q/g,'k').replace(/x/g,'ks')
   .replace(/ee/g,'i').replace(/oo/g,'u').replace(/aa/g,'a').replace(/([a-z])\1+/g,'$1');
  return w[0]?w[0]+w.slice(1).replace(/[aeiouy]/g,''):'' }
function lev(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;let p=Array.from({length:n+1},(_,j)=>j);
  for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]}
function sim(a,b){a=a.toLowerCase();b=b.toLowerCase();if(!a||!b)return 0;if(a===b)return 1;
  const ka=key(a),kb=key(b);
  const s1=1-lev(a,b)/Math.max(a.length,b.length),s2=ka&&kb?1-lev(ka,kb)/Math.max(ka.length,kb.length):0;
  let s=Math.max(s1,s2*0.95);
  if(a.length>=3&&b.length>=3&&(b.startsWith(a)||a.startsWith(b)))s=Math.max(s,0.86);
  return s}
/* match query (may be several words) against candidates [{id,names:[...]}] */
function matchBest(q,cands){
  q=q.trim();if(!q)return [];
  const res=[];
  for(const c of cands){let best=0;
    for(const n of c.names){
      best=Math.max(best,sim(q,n));
      // each word of the query against each word of the name ("sangamma bhalki" vs "Sangamma")
      const nw=n.split(/\s+/),qw=q.split(/\s+/);
      for(const w of qw)for(const x of nw)if(w.length>=3)best=Math.max(best,sim(w,x)*0.97)}
    if(best>=0.72)res.push({id:c.id,score:best,c})}
  return res.sort((a,b)=>b.score-a.score)}

const STOP=new Set(['open','show','go','to','the','a','an','of','for','please','me','my','is','are','and','from','in','at','on','with','this','that','now','set','add','make','new','select','choose','pick','job','jobs','card','token','customer','village','mobile','number','phone','name','by','called','named','whose','who','what','which','how','many','much','kg','rs','advance','tempo','khali','shop','keeps','takes','take','keep','crushed','crush','done','pay','oil','oilout','give','mark','ok','okay','yes','no','search','find','tap','press','click','hey','hi','hello','assistant','bot','list','screen','page','tab','menu','today','todays']);
const NAV={waiting:/\bwaiting\b|\bqueue\b/,jobs:/\bjobs\b|\bjob list\b|\bwork list\b/,held:/\bheld\b|\bhold(ing)? list\b|\bhold\b/,parked:/\bparked\b|\bpark list\b/,mill:/\bmill\b|\bproduction\b|\bmachine\b|\bour crushing\b/,settings:/\bsettings?\b|\boptions\b|\bconfig/,home:/\bhome\b|\bmain( screen)?\b|\bcounter\b|\bstart\b/};

/* ctx: {customers:[{name,place,mobile,aliases?}], places:[{name,aliases:[...]}], jobs:[{tok,serial,customer,place,date,state}], cardOpen:tok|null, pending:obj|null, view:'pick'|'slip'|...} */
function parse(text,ctx){
  ctx=ctx||{};const raw=String(text||'').trim();
  const s=normalize(raw);
  const out=(o)=>Object.assign({heard:raw,norm:s,conf:1},o);
  if(!s)return out({t:'empty'});
  const has=r=>r.test(s);
  const nums=(s.match(/\d+(?:\.\d+)?/g)||[]);
  const phone=(s.match(/\b[6-9]\d{9}\b/)||[])[0]||null;

  if(ctx.pending){
    if(has(/\b(yes|yeah|yep|ok|okay|confirm|correct|sure|do it|right)\b/))return out({t:'yes'});
    if(has(/\b(no|nope|cancel|stop|dont|don't|wrong|nahi)\b/))return out({t:'no'});
  }
  if(has(/^(help|commands|what can (you|i) (do|say)|how to use)$|\bhelp\b|\bexamples?\b/))return out({t:'help'});
  if(has(/^(cancel|stop|close|exit|quit|dismiss|never ?mind|back|go back|undo|ok close)$/))return out({t:has(/^(back|go back)$/)?'back':has(/^undo$/)?'undo':'close'});

  // questions
  if(has(/\b(how many|how much|count|what|who|which|any|is there|status|next)\b/)&&!has(/\badvance\b|\bkhali (keeps|takes)\b/)){
    if(has(/\bmachine\b|\bmill\b|\bproduction\b|\bruns?\b/)&&!has(/\bwaiting\b/))return out({t:'ask',q:'mill'});
    if(has(/\bnext\b|\bfirst\b|\bwho is next\b|\bwhose turn\b/))return out({t:'ask',q:'next'});
    if(has(/\bwaiting\b/))return out({t:'ask',q:'waiting'});
    if(has(/\bheld\b|\bpending\b|\bmoney\b|\bto pay\b/))return out({t:'ask',q:'held'});
    if(has(/\bjobs\b|\bcrush(ed|ing)?\b|\bto crush\b|\bwork\b/))return out({t:'ask',q:'jobs'});
    if(has(/\bkhali\b/))return out({t:'ask',q:'khali'});
    if(has(/\boil\b/))return out({t:'ask',q:'oil'});
    if(has(/\bseed\b/))return out({t:'ask',q:'seed'})}

  // own mill production runs: "run 2 done", "start run 3", "put run 3 in machine"
  const rm=s.match(/\brun\s*(?:no\.?|number)?\s*(\d{1,3})\b/);
  if(rm)return out({t:'run',n:+rm[1],act:has(/\b(done|finished|finish|complete|completed|crushed)\b/)?'done':has(/\b(start|started|begin|put|load|machine|in)\b/)?'start':'open'});
  // job reference: "token 3", "job 3", "serial 3" -> serial of today
  let ref=null;
  const tm=s.match(/\b(?:token|serial|no|number|job)\s*(?:no\.?|number)?\s*(\d{1,4})\b/);
  if(tm&&!/\bmobile\b/.test(s.slice(Math.max(0,tm.index-8),tm.index)))ref={serial:+tm[1]};
  const inv=s.match(/\b(?:invoice|inv|bill)\s*#?\s*(\d{1,5})\b/);
  if(inv)ref={inv:inv[1].padStart(4,'0')};

  // quick intent words
  const wantsCrushed=has(/\bcrushed\b|\bcrushing\b.*\bdone\b|\bdone\b.*\bcrush|\bmark (it )?done\b|\bfinished\b|\bcomplete(d)?\b/);
  const wantsOilOut=has(/\boilout\b|\boil (out|given|gave|delivery)\b|\bgive (the )?oil\b/);
  const wantsPay=has(/\b(pay|paid|payment|settle)\b/)&&!has(/\badvance\b/);

  // advance (customer / tempo)
  if(has(/\badvance\b/)){
    const am=s.match(/\badvance\b\D{0,12}?(\d+(?:\.\d+)?)/)||s.match(/(\d+(?:\.\d+)?)\D{0,8}\badvance\b/)||(nums.length?[0,nums[nums.length-1]]:null);
    const who=has(/\btempo\b|\bdriver\b/)?'tempo':'cust';
    if(am)return out({t:'adv',who,amt:Math.round(+am[1]),ref});
    return out({t:'adv',who,amt:null,ref,need:'amount'})}
  // khali ownership
  if(has(/\bkhali\b/)&&has(/\b(shop|we keep|keeps|keep)\b|\bcustomer\b|\btakes?\b|\bcarry\b/)){
    const cust=has(/\bcustomer (takes?|will take|carry|takes it)\b|\btakes?\b.*\bcustomer\b|\bcustomer\b.*\bkhali\b.*\btakes?\b|\bcustomer\b/)&&!has(/\bshop\b.*\bkeeps?\b|\bshop (will )?keep/)&&!has(/\bshop\b/);
    return out({t:'khali',who:cust?'CUSTOMER':'SHOP',ref})}
  if(has(/\bkhali\b/)&&has(/\bshop\b/))return out({t:'khali',who:'SHOP',ref});
  // mobile for the customer being created / chosen
  if(phone&&!has(/\b(customer|village)\b\s+[a-z]{3,}/)){return out({t:'mobile',value:phone})}

  // navigation (screens)
  for(const k of Object.keys(NAV))if(NAV[k].test(s)&&!wantsCrushed&&!wantsOilOut&&!wantsPay&&!ref&&!has(/\bkhali\b/)){
    if(k==='held'&&has(/\bhold\b/)&&has(/\bpark|\bhold (it|the slip|this)\b/))break;
    return out({t:'nav',to:k})}

  // pending customer fields
  const cm=s.match(/\b(?:customer|name|called|named)\s+([^\d]+?)(?=\s+(?:village|from|of|in|mobile|number|phone|at)\b|$)/);
  const vm=s.match(/\b(?:village|from|of|in|at)\s+([^\d]+?)(?=\s+(?:mobile|number|phone|customer|name)\b|$)/);
  const wantsNew=has(/\bnew customer\b|\badd customer\b|\bnew party\b|\bcreate customer\b/);

  // job actions on a named customer or token
  const jobCands=(ctx.jobs||[]).map(j=>({id:j.tok,names:[j.customer,j.place].filter(Boolean),j}));
  const findJob=()=>{
    if(ref&&ref.serial){const j=(ctx.jobs||[]).filter(x=>x.serial===ref.serial);if(j.length===1)return {job:j[0]};if(j.length>1)return {many:j.slice(0,4)}}
    if(ref&&ref.inv){const j=(ctx.jobs||[]).find(x=>String(x.tok).replace(/\D/g,'')===ref.inv);if(j)return {job:j}}
    if(ctx.cardOpen&&!cm&&!vm){const j=(ctx.jobs||[]).find(x=>x.tok===ctx.cardOpen);if(j)return {job:j}}
    const left=s.split(' ').filter(w=>!STOP.has(w)&&!/^\d+(\.\d+)?$/.test(w)).join(' ');
    if(left){const r=matchBest(left,jobCands);if(r.length){if(r.length>1&&r[0].score-r[1].score<0.04&&r[0].c.j.customer!==r[1].c.j.customer)return {many:r.slice(0,4).map(x=>x.c.j)};return {job:r[0].c.j,score:r[0].score}}}
    return {}};
  if(wantsCrushed||wantsOilOut||wantsPay){
    const f=findJob();
    const kind=wantsCrushed?'crushed':wantsOilOut?'oilout':'pay';
    if(f.job)return out({t:'jobact',act:kind,tok:f.job.tok});
    if(f.many)return out({t:'pick',act:kind,options:f.many.map(j=>j.tok)});
    return out({t:'jobact',act:kind,tok:null,need:'job'})}
  if(ref||(/\b(job card|jobcard|card)\b/.test(s))){
    const f=findJob();
    if(f.job)return out({t:'job',tok:f.job.tok});
    if(f.many)return out({t:'pick',act:'open',options:f.many.map(j=>j.tok)});
    if(ref)return out({t:'job',tok:null,need:'job',ref})}

  // customer selection / creation
  const places=(ctx.places||[]).map(p=>({id:p.name,names:[p.name].concat(p.aliases||[])}));
  const custs=(ctx.customers||[]).map((c,i)=>({id:i,names:[c.name].concat(c.aliases||[]),c}));
  const leftover=s.split(' ').filter(w=>!STOP.has(w)&&!/^\d+(\.\d+)?$/.test(w)&&!/^[6-9]\d{9}$/.test(w));
  let nameQ=cm?cm[1].trim():'',placeQ=vm?vm[1].trim():'';
  if(!nameQ&&!placeQ&&leftover.length){
    const q=leftover.join(' ');
    // bare words: first try a customer, then a village, then "name village"
    const cr=matchBest(q,custs),pr=matchBest(q,places);
    if(!wantsNew&&cr.length&&(!pr.length||cr[0].score>=pr[0].score)){
      if(cr.length>1&&cr[0].score-cr[1].score<0.04&&cr[0].c.c.name!==cr[1].c.c.name)return out({t:'pickCust',options:cr.slice(0,4).map(x=>x.id)});
      return out({t:'cust',mode:'select',idx:cr[0].id,score:cr[0].score,mobile:phone})}
    if(!wantsNew&&pr.length)return out({t:'cust',mode:'village',place:pr[0].id,score:pr[0].score,mobile:phone});
    if(wantsNew)nameQ=q;else return out({t:'unknown',conf:0,guess:q})}
  if(nameQ||placeQ||wantsNew){
    let pl=null;
    if(placeQ){const pr=matchBest(placeQ,places);if(pr.length)pl=pr[0].id;else pl=placeQ.replace(/\b\w/g,c=>c.toUpperCase())}
    // a trailing village inside the name ("ramesh bhalki")
    if(nameQ&&!pl){const ws=nameQ.split(' ');if(ws.length>1){const last=ws[ws.length-1],pr=matchBest(last,places);if(pr.length&&pr[0].score>=0.85){pl=pr[0].id;nameQ=ws.slice(0,-1).join(' ')}}}
    // existing customer?
    if(nameQ&&!wantsNew){const cr=matchBest(nameQ,custs);if(cr.length&&cr[0].score>=0.8&&(!pl||sim(cr[0].c.c.place,pl)>0.8||true)){
      if(cr.length>1&&cr[0].score-cr[1].score<0.04&&cr[0].c.c.name!==cr[1].c.c.name)return out({t:'pickCust',options:cr.slice(0,4).map(x=>x.id)});
      return out({t:'cust',mode:'select',idx:cr[0].id,score:cr[0].score,mobile:phone})}}
    if(!nameQ&&pl)return out({t:'cust',mode:'village',place:pl,mobile:phone});
    const nm=nameQ.replace(/\b\w/g,c=>c.toUpperCase());
    return out({t:'cust',mode:'new',name:nm||null,place:pl,mobile:phone})}
  return out({t:'unknown',conf:0})}

const api={normalize,parse,matchBest,sim,key};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MillVoice=api;
})(typeof window!=='undefined'?window:globalThis);
