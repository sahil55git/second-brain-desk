/* The customer allocates the shop-keeps-khali payout before deductions. */
function tempoShare(job, gross) {
 const split = job.tempoSplit;
 if (!split) return gross / 2;
 return split.mode === 'rate' ? r2(job.seedKg * split.value) : split.value;
}

function validTempoShare(job, kg) {
 const split = job.tempoSplit;
 if (job.cake !== 'SHOP' || !split) return true;
 return split.mode === 'rate' ? split.value <= RATE.SHOP : split.value <= r2(kg * RATE.SHOP);
}

const payoutInr = value => '₹' + Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function payoutRows(job, kg) {
 const gross = r2(kg * RATE.SHOP);
 const tempo = tempoShare({ ...job, seedKg: kg }, gross);
 return [['Customer share', payoutInr(gross - tempo)], ['Tempo share', payoutInr(tempo)]];
}

function payoutButton(job, kg, tok = '') {
 const rows = validTempoShare(job, kg) ? payoutRows(job, kg).map(([name, value]) => name + ' ' + value).join(' · ') : 'Adjust the tempo share for this weight';
 const shares = `<div class="note">${rows}</div>`;
 if (job.settled) return shares;
 return `<button class="sbtn" onclick="sheetPayout('${tok}')">${ic('edit')} Edit payout split</button>${shares}`;
}

function sheetPayout(tok, mode) {
 const job = tok ? S.jw.find(j => j.tok === tok) : S.slip;
 if (!job || job.settled || job.cake !== 'SHOP') return;
 const kg = tok ? job.seedKg : r2(sum(job.lines));
 const split = job.tempoSplit;
 const back = tok ? `sheetJob('${tok}')` : 'closeLayer()';
 const selected = mode || split?.mode || 'equal';
 const choices = [['equal','swap','Equal split'],['customer','user','All to customer'],['rate','scale','Tempo ₹/kg'],['amount','rupee','Tempo ₹ amount']];
 const custom = selected === 'rate' || selected === 'amount';
 layer('Edit payout split', `
  <div class="note">${f2(kg)} kg × ₹${RATE.SHOP}/kg · Total ${payoutInr(kg * RATE.SHOP)}</div>
  <div class="chrow">${choices.map(([id, icon, label]) => `<button class="ch ${selected===id?'sel':''}" onclick="sheetPayout('${tok}','${id}')">${ic(icon)} ${label}</button>`).join('')}</div>
  ${custom ? `<label class="mrow">${selected === 'rate' ? 'Tempo ₹/kg' : 'Tempo ₹ amount'} <input id="tempo-share" inputmode="decimal" type="number" min="0" step="0.01" value="${split?.mode === selected ? split.value : ''}" style="min-width:0;width:7em"></label>` : ''}
  <button class="sbtn go" onclick="savePayout('${tok}','${selected}')">${ic('check')} Save split</button>`, back);
}

function savePayout(tok, mode) {
 const job = tok ? S.jw.find(j => j.tok === tok) : S.slip;
 if (!job || job.settled || job.cake !== 'SHOP') return;
 const kg = tok ? job.seedKg : r2(sum(job.lines));
 const raw = document.getElementById('tempo-share')?.value;
 const value = mode === 'customer' ? 0 : Number(raw);
 const split = mode === 'equal' ? undefined : { mode: mode === 'rate' ? 'rate' : 'amount', value };
 if (split && (!Number.isFinite(value) || (mode !== 'customer' && !raw) || value < 0 || r2(value) !== value || !validTempoShare({ ...job, tempoSplit: split }, kg))) {
  return toast('Enter a share within the total payout (up to 2 decimal places)','bad');
 }
 if (split) job.tempoSplit = split;
 else delete job.tempoSplit;
 if (tok) sheetJob(tok);
 else closeLayer();
}
