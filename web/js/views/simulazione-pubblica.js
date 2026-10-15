import { supabase } from '../supabase.js';
import { NOME_CONDOMINIO } from '../../config.js';
import { esc, ensure, fmtDate, fmtMillesimi, sortAttrs, sortControl, bindSort } from '../ui.js';
import { simulationSummary } from '../simulation-summary.js';

// Simulazione di un sondaggio in sola lettura, per i condomini.
// Il database restituisce solo ciò che l'admin ha reso visibile (riepilogo o dettaglio).
export async function render(app, pollId) {
  const [poll, summary, detail] = await Promise.all([
    supabase.from('polls').select('*, poll_options(*)').eq('id', pollId).maybeSingle().then(ensure),
    supabase.rpc('simulation_summary', { p_poll_id: pollId }).then(ensure),
    // Il dettaglio è facoltativo: se non è disponibile si mostra comunque il riepilogo
    supabase.rpc('simulation_detail', { p_poll_id: pollId }).then(({ data, error }) => {
      if (error) console.warn('Dettaglio della simulazione non disponibile', error);
      return error ? [] : data;
    }),
  ]);

  const back = '<p class="no-print"><a href="#/sondaggi">← Tutti i sondaggi</a></p>';
  if (!poll || !summary.length) {
    app.innerHTML = `${back}<div class="card"><p class="muted">Per questo sondaggio non c'è una simulazione disponibile.</p></div>`;
    return;
  }

  const options = [...poll.poll_options].sort((a, b) => a.position - b.position);
  const tally = new Map(options.map((o) => [o.id, { count: 0, millesimi: 0 }]));
  const none = { count: 0, millesimi: 0 };
  let totalHeads = 0;
  for (const row of summary) {
    const bucket = tally.get(row.option_id) ?? none;
    bucket.count += Number(row.heads);
    bucket.millesimi += Number(row.millesimi);
    totalHeads += Number(row.heads_with_millesimi);
  }
  const answerLabel = (optionId) => options.find((o) => o.id === optionId)?.label ?? '—';

  app.innerHTML = `
    ${back}
    <header class="print-only print-head">
      <strong>${esc(NOME_CONDOMINIO)}</strong> · Simulazione di sondaggio · stampata il ${esc(fmtDate(new Date()))}
    </header>

    <section class="card">
      <div class="card-head">
        <h2>Simulazione: ${esc(poll.question)}</h2>
        <button type="button" class="secondary no-print" id="sim-print">Stampa</button>
      </div>
      <p class="small hint">Questa simulazione è preparata dall'amministrazione del portale, che stima la posizione
        di ogni condomino in vista dell'assemblea: non è un voto e non è una delibera.</p>
      ${simulationSummary(poll, options, tally, none, totalHeads)}
    </section>

    ${detail.length ? `
    <section class="card">
      <h2>Risposte simulate per condomino</h2>
      <div class="list-tools no-print">
        <input type="search" id="sim-search" placeholder="Cerca per nome o unità…">
        ${sortControl()}
      </div>
      <table class="sim readonly">
        <thead><tr><th>Unità</th><th>Condomino</th><th class="num">Millesimi</th><th>Risposta simulata</th></tr></thead>
        <tbody>
        ${detail.map((r) => `
          <tr data-text="${esc(`${r.full_name} ${r.unit ?? ''}`.toLowerCase())}" ${sortAttrs(r, r.unit_code)}>
            <td class="nowrap">${esc(r.unit ?? '—')}</td>
            <td>${esc(r.full_name)}</td>
            <td class="num">${fmtMillesimi(r.millesimi)}</td>
            <td class="answer-text">${esc(answerLabel(r.option_id))}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>` : ''}`;

  const table = app.querySelector('.sim');
  const showAllRows = () => {
    const search = app.querySelector('#sim-search');
    if (search) search.value = '';
    app.querySelectorAll('tr[data-text]').forEach((tr) => { tr.hidden = false; });
  };
  if (table) {
    bindSort(app, table);
    app.querySelector('#sim-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      app.querySelectorAll('tr[data-text]').forEach((tr) => { tr.hidden = !tr.dataset.text.includes(q); });
    });
  }
  window.onbeforeprint = showAllRows;
  app.querySelector('#sim-print').addEventListener('click', () => {
    showAllRows();
    window.print();
  });
}
