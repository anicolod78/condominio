import { supabase } from '../../supabase.js';
import { NOME_CONDOMINIO } from '../../../config.js';
import { esc, ensure, flash, guarded, bindForm, fmtDate, fmtMillesimi, sortAttrs, sortControl, bindSort } from '../../ui.js';
import { hasMajority, describeMajority, evaluate, majorityLine, majorityFields, bindMajorityFields, readMajority } from '../../majority.js';

const firstCode = (r) => (r.units ?? []).map((u) => u.unit_code).filter(Boolean).sort()[0] ?? '';

// Simulazione di un sondaggio: una risposta per ogni testa (condomino) dell'anagrafica,
// salvata subito e con i risultati in millesimi ricalcolati a ogni modifica
export async function render(panel, pollId) {
  const [poll, residents, saved] = await Promise.all([
    supabase.from('polls').select('*, poll_options(*)').eq('id', pollId).maybeSingle().then(ensure),
    supabase.from('residents').select('id, full_name, unit, millesimi, units(unit_code)')
      .order('unit', { nullsFirst: false }).order('full_name').then(ensure),
    supabase.from('poll_simulations').select('resident_id, option_id').eq('poll_id', pollId).then(ensure),
  ]);

  if (!poll) {
    panel.innerHTML = '<p class="error">Sondaggio non trovato.</p><p><a href="#/gestione/sondaggi">← Tutti i sondaggi</a></p>';
    return;
  }

  const options = [...poll.poll_options].sort((a, b) => a.position - b.position);
  const choices = new Map(saved.map((s) => [s.resident_id, s.option_id]));
  const answerLabel = (optionId) => options.find((o) => o.id === optionId)?.label ?? '—';
  const optionSelect = (selected, attrs = '') => `
    <select ${attrs}>
      <option value="">— nessuna risposta —</option>
      ${options.map((o) => `<option value="${o.id}" ${o.id === selected ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>`;

  panel.innerHTML = `
    <p class="no-print"><a href="#/gestione/sondaggi">← Tutti i sondaggi</a></p>

    <header class="print-only print-head">
      <strong>${esc(NOME_CONDOMINIO)}</strong> · Simulazione di sondaggio · stampata il <span id="print-date"></span>
    </header>

    <section class="card">
      <div class="card-head">
        <h2>Simulazione: ${esc(poll.question)}</h2>
        <button type="button" class="secondary no-print" id="sim-print">Stampa</button>
      </div>
      <p class="muted small no-print">Visibile solo agli admin. Le risposte simulate sono salvate a parte
        e non modificano i voti reali dei condomini.</p>
      <p class="print-only small">Documento di lavoro: le risposte sono simulate dall'amministrazione del portale
        e non costituiscono voto né delibera assembleare.</p>
      <div id="sim-summary"></div>
      <details class="majority-edit no-print">
        <summary>${hasMajority(poll) ? 'Cambia la maggioranza richiesta' : 'Imposta la maggioranza richiesta'}</summary>
        <form id="f-maggioranza" class="stack">
          ${majorityFields(poll)}
          <button type="submit">Salva maggioranza</button>
        </form>
      </details>
    </section>

    <section class="card">
      <h2>Risposte per condomino</h2>
      <div class="sim-tools no-print">
        <div class="list-tools">
          <input type="search" id="sim-search" placeholder="Cerca per nome o unità…">
          ${sortControl()}
        </div>
        <div class="sim-bulk">
          <span class="small">Assegna</span>
          ${optionSelect(null, 'id="bulk-option"')}
          <button type="button" class="secondary" id="bulk-apply">a tutte le teste senza risposta</button>
          <button type="button" class="link danger" id="sim-reset">Azzera simulazione</button>
        </div>
      </div>
      <div id="sim-tally" class="sim-tally no-print" aria-live="polite"></div>
      <table class="sim">
        <thead><tr><th>Unità</th><th>Condomino</th><th class="num">Millesimi</th><th>Risposta</th></tr></thead>
        <tbody>
        ${residents.map((r) => `
          <tr data-text="${esc(`${r.full_name} ${r.unit ?? ''}`.toLowerCase())}" ${sortAttrs(r, firstCode(r))}>
            <td class="nowrap">${esc(r.unit ?? '—')}</td>
            <td>${esc(r.full_name)}</td>
            <td class="num">${fmtMillesimi(r.millesimi)}</td>
            <td>
              ${optionSelect(choices.get(r.id) ?? null, `data-resident="${r.id}"`)}
              <span class="print-only answer-text" data-answer="${r.id}">${esc(answerLabel(choices.get(r.id)))}</span>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>`;

  const summary = panel.querySelector('#sim-summary');
  const tally = panel.querySelector('#sim-tally');
  const updateSummary = () => {
    summary.innerHTML = summaryView(poll, options, residents, choices);
    tally.innerHTML = tallyView(options, residents, choices);
  };
  updateSummary();

  const majorityForm = panel.querySelector('#f-maggioranza');
  bindMajorityFields(majorityForm);
  bindForm(majorityForm, async () => {
    ensure(await supabase.from('polls').update(readMajority(majorityForm)).eq('id', poll.id));
    flash('Maggioranza salvata');
    await render(panel, pollId);
  });

  bindSort(panel, panel.querySelector('.sim'));

  const prepareForPrint = () => {
    const search = panel.querySelector('#sim-search');
    if (!search) return;
    search.value = '';
    panel.querySelectorAll('tr[data-text]').forEach((tr) => { tr.hidden = false; });
    panel.querySelector('#print-date').textContent = fmtDate(new Date());
  };
  prepareForPrint();
  window.onbeforeprint = prepareForPrint; // anche con Ctrl+P o dal menu del browser
  panel.querySelector('#sim-print').addEventListener('click', () => {
    prepareForPrint();
    window.print();
  });

  panel.querySelector('#sim-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    panel.querySelectorAll('tr[data-text]').forEach((tr) => { tr.hidden = !tr.dataset.text.includes(q); });
  });

  panel.querySelectorAll('select[data-resident]').forEach((select) => {
    select.addEventListener('change', guarded(async () => {
      const residentId = Number(select.dataset.resident);
      const previous = choices.get(residentId) ?? null;
      const optionId = select.value ? Number(select.value) : null;
      select.disabled = true;
      try {
        const { error } = optionId
          ? await supabase.from('poll_simulations').upsert(
            { poll_id: poll.id, resident_id: residentId, option_id: optionId, updated_at: new Date().toISOString() },
            { onConflict: 'poll_id,resident_id' },
          )
          : await supabase.from('poll_simulations').delete().eq('poll_id', poll.id).eq('resident_id', residentId);
        if (error) {
          select.value = previous ?? '';
          throw error;
        }
        if (optionId) choices.set(residentId, optionId); else choices.delete(residentId);
        panel.querySelector(`[data-answer="${residentId}"]`).textContent = answerLabel(optionId);
        updateSummary();
      } finally {
        select.disabled = false;
      }
    }));
  });

  panel.querySelector('#bulk-apply').addEventListener('click', guarded(async () => {
    const optionId = Number(panel.querySelector('#bulk-option').value);
    if (!optionId) throw new Error('Scegli prima la risposta da assegnare');
    const missing = residents.filter((r) => !choices.has(r.id));
    if (!missing.length) throw new Error('Tutte le teste hanno già una risposta');
    const label = options.find((o) => o.id === optionId).label;
    if (!confirm(`Assegnare "${label}" alle ${missing.length} teste senza risposta?`)) return;
    ensure(await supabase.from('poll_simulations').insert(
      missing.map((r) => ({ poll_id: poll.id, resident_id: r.id, option_id: optionId })),
    ));
    flash(`Risposta assegnata a ${missing.length} teste`);
    await render(panel, pollId);
  }));

  panel.querySelector('#sim-reset').addEventListener('click', guarded(async () => {
    if (!choices.size) throw new Error('La simulazione è già vuota');
    if (!confirm('Cancellare tutte le risposte simulate di questo sondaggio?')) return;
    ensure(await supabase.from('poll_simulations').delete().eq('poll_id', poll.id));
    flash('Simulazione azzerata');
    await render(panel, pollId);
  }));
}

// Riepilogo compatto che resta in vista mentre si scorre l'elenco (utile su smartphone)
function tallyView(options, residents, choices) {
  const sums = new Map(options.map((o) => [o.id, 0]));
  let none = 0;
  for (const r of residents) {
    const id = choices.get(r.id);
    if (sums.has(id)) sums.set(id, sums.get(id) + Number(r.millesimi)); else none += Number(r.millesimi);
  }
  return [
    ...options.map((o) => `<span><strong>${esc(o.label)}</strong> ${fmtMillesimi(sums.get(o.id))}‰</span>`),
    `<span class="muted">Senza risposta ${fmtMillesimi(none)}‰</span>`,
  ].join('');
}

function summaryView(poll, options, residents, choices) {
  const total = residents.reduce((sum, r) => sum + Number(r.millesimi), 0);
  const pct = (value) => `${(total ? Math.round((value / total) * 1000) / 10 : 0).toLocaleString('it-IT')}%`;

  const tally = new Map(options.map((o) => [o.id, { count: 0, millesimi: 0 }]));
  const none = { count: 0, millesimi: 0 };
  for (const r of residents) {
    const bucket = tally.get(choices.get(r.id)) ?? none;
    bucket.count += 1;
    bucket.millesimi += Number(r.millesimi);
  }
  const answered = residents.length - none.count;
  const totalHeads = residents.filter((r) => Number(r.millesimi) > 0).length;

  const row = (label, t, extraClass = '', majority = '') => `
    <div class="bar-row ${extraClass}">
      <span>${esc(label)}</span>
      <span class="muted small">${t.count} test${t.count === 1 ? 'a' : 'e'} · <strong>${fmtMillesimi(t.millesimi)} ‰</strong> · ${pct(t.millesimi)}</span>
      <div class="bar"><div style="width:${total ? (t.millesimi / total) * 100 : 0}%"></div></div>
      ${majority}
    </div>`;
  const majorityFor = (t) => majorityLine(evaluate(poll, { votes: t.count, millesimi: t.millesimi }, { answered, totalHeads }), t.count, t.millesimi);

  return `
    <p class="small">Risposte: <strong>${answered}</strong> su ${residents.length} teste ·
      ${fmtMillesimi(total - none.millesimi)} millesimi su ${fmtMillesimi(total)} (${pct(total - none.millesimi)})</p>
    ${hasMajority(poll) ? `<p class="small majority-rule">Maggioranza richiesta: ${esc(describeMajority(poll))}</p>` : ''}
    <div class="results">
      ${options.map((o) => row(o.label, tally.get(o.id), '', majorityFor(tally.get(o.id)))).join('')}
      ${row('Senza risposta', none, 'muted-row')}
    </div>
    <p class="muted small">Le percentuali sono calcolate sul totale dei millesimi in anagrafica.</p>`;
}
