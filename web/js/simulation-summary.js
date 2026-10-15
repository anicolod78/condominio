// Riepilogo di una simulazione di sondaggio (vista admin e vista in sola lettura)
import { esc, fmtMillesimi } from './ui.js';
import { hasMajority, describeMajority, evaluate, majorityLine } from './majority.js';

// tally: Map option_id -> { count, millesimi }; none: teste senza risposta;
// totalHeads: teste con millesimi (base per la maggioranza "su tutte le teste")
export function simulationSummary(poll, options, tally, none, totalHeads) {
  const buckets = [...tally.values(), none];
  const heads = buckets.reduce((a, t) => a + t.count, 0);
  const total = buckets.reduce((a, t) => a + t.millesimi, 0);
  const answered = heads - none.count;
  const pct = (value) => `${(total ? Math.round((value / total) * 1000) / 10 : 0).toLocaleString('it-IT')}%`;

  const row = (label, t, extraClass = '', majority = '') => `
    <div class="bar-row ${extraClass}">
      <span>${esc(label)}</span>
      <span class="muted small">${t.count} test${t.count === 1 ? 'a' : 'e'} · <strong>${fmtMillesimi(t.millesimi)} ‰</strong> · ${pct(t.millesimi)}</span>
      <div class="bar"><div style="width:${total ? (t.millesimi / total) * 100 : 0}%"></div></div>
      ${majority}
    </div>`;
  const majorityFor = (t) => majorityLine(evaluate(poll, { votes: t.count, millesimi: t.millesimi }, { answered, totalHeads }), t.count, t.millesimi);

  return `
    <p class="small">Risposte: <strong>${answered}</strong> su ${heads} teste ·
      ${fmtMillesimi(total - none.millesimi)} millesimi su ${fmtMillesimi(total)} (${pct(total - none.millesimi)})</p>
    ${hasMajority(poll) ? `<p class="small majority-rule">Maggioranza richiesta: ${esc(describeMajority(poll))}</p>` : ''}
    <div class="results">
      ${options.map((o) => row(o.label, tally.get(o.id), '', majorityFor(tally.get(o.id)))).join('')}
      ${row('Senza risposta', none, 'muted-row')}
    </div>
    <p class="muted small">Le percentuali sono calcolate sul totale dei millesimi in anagrafica.</p>`;
}

// Conteggi a partire dalle risposte per condomino (residents con millesimi, choices: id -> option_id)
export function tallyFromChoices(options, residents, choices) {
  const tally = new Map(options.map((o) => [o.id, { count: 0, millesimi: 0 }]));
  const none = { count: 0, millesimi: 0 };
  for (const r of residents) {
    const bucket = tally.get(choices.get(r.id)) ?? none;
    bucket.count += 1;
    bucket.millesimi += Number(r.millesimi);
  }
  const totalHeads = residents.filter((r) => Number(r.millesimi) > 0).length;
  return { tally, none, totalHeads };
}

export const VISIBILITY = [
  { value: 'riepilogo', label: 'Solo riepilogo (totali per opzione, senza nomi)' },
  { value: 'dettaglio', label: 'Riepilogo e risposta simulata di ogni condomino' },
  { value: 'nascosta', label: 'Nascosta (solo amministratori)' },
];
