// Maggioranze dei sondaggi: regole predefinite (art. 1136 c.c.), modulo di
// scelta e verifica del raggiungimento per teste e millesimi.
import { TOTALE_MILLESIMI } from '../config.js';
import { esc, fmtMillesimi } from './ui.js';

const round3 = (n) => Math.round(n * 1000) / 1000;

// Le frazioni sono calcolate sul totale delle tabelle millesimali (TOTALE_MILLESIMI)
export const PRESETS = [
  // Doppia maggioranza obbligatoria in ogni convocazione
  { id: 'amm', label: 'Nomina o revoca dell\'amministratore (art. 1136 c. 4 c.c.)', heads: 'votanti', fraction: 1 / 2, fractionText: '1/2' },
  { id: 'c1', label: '1ª convocazione (art. 1136 c. 2 c.c.)', heads: 'votanti', fraction: 1 / 2, fractionText: '1/2' },
  { id: 'c2', label: '2ª convocazione (art. 1136 c. 3 c.c.)', heads: 'votanti', fraction: 1 / 3, fractionText: '1/3' },
  { id: 'inn', label: 'Innovazioni (art. 1136 c. 5 c.c.)', heads: 'votanti', fraction: 2 / 3, fractionText: '2/3' },
].map((p) => ({ ...p, millesimi: round3(TOTALE_MILLESIMI * p.fraction) }));

export const hasMajority = (poll) => Boolean(poll.majority_heads) || poll.majority_millesimi != null;

export function describeMajority(poll) {
  const parts = [];
  if (poll.majority_heads === 'votanti') parts.push('più della metà delle teste che hanno risposto');
  if (poll.majority_heads === 'tutti') parts.push('più della metà di tutte le teste');
  if (poll.majority_millesimi != null) parts.push(`almeno ${fmtMillesimi(poll.majority_millesimi)} millesimi`);
  return `${poll.majority_label ? `${poll.majority_label}: ` : ''}${parts.join(' e ')}`;
}

// votes/millesimi: a favore dell'opzione; answered: teste che hanno risposto; totalHeads: tutte le teste
export function evaluate(poll, { votes, millesimi }, { answered, totalHeads }) {
  if (!hasMajority(poll)) return null;
  const base = poll.majority_heads === 'tutti' ? totalHeads : answered;
  const headsNeeded = Math.floor(base / 2) + 1; // più della metà
  const headsOk = poll.majority_heads ? votes >= headsNeeded : null;
  const millNeeded = poll.majority_millesimi != null ? Number(poll.majority_millesimi) : null;
  const millOk = millNeeded != null ? millesimi >= millNeeded - 0.0005 : null;
  return { headsOk, headsNeeded, millOk, millNeeded, passed: headsOk !== false && millOk !== false };
}

// Riga sotto ogni opzione: esito complessivo e dettaglio di teste e millesimi
export function majorityLine(result, votes, millesimi) {
  if (!result) return '';
  const mark = (ok) => (ok ? '<span class="ok">✔</span>' : '<span class="error">✘</span>');
  const parts = [];
  if (result.headsOk != null) parts.push(`${mark(result.headsOk)} teste ${votes} su ${result.headsNeeded} necessarie`);
  if (result.millOk != null) parts.push(`${mark(result.millOk)} millesimi ${fmtMillesimi(millesimi)} su ${fmtMillesimi(result.millNeeded)} necessari`);
  return `
    <div class="majority ${result.passed ? 'passed' : 'failed'}">
      <strong>${result.passed ? 'Maggioranza raggiunta' : 'Maggioranza non raggiunta'}</strong>
      <span>${parts.join(' · ')}</span>
    </div>`;
}

// Campi del modulo per scegliere la maggioranza (creazione e modifica del sondaggio)
export function majorityFields(poll = {}) {
  const preset = PRESETS.find((p) => p.label === poll.majority_label
    && p.heads === poll.majority_heads && Number(poll.majority_millesimi) === p.millesimi);
  const selected = !hasMajority(poll) ? '' : preset ? preset.id : 'custom';
  return `
    <fieldset class="attachments majority-fields">
      <legend>Maggioranza richiesta</legend>
      <select name="majority">
        <option value="" ${selected === '' ? 'selected' : ''}>Nessuna: mostra solo i risultati</option>
        ${PRESETS.map((p) => `
          <option value="${p.id}" ${selected === p.id ? 'selected' : ''}>
            ${esc(p.label)} – maggioranza delle teste e ${p.fractionText} dei millesimi (${fmtMillesimi(p.millesimi)})
          </option>`).join('')}
        <option value="custom" ${selected === 'custom' ? 'selected' : ''}>Personalizzata…</option>
      </select>
      <div class="cols" data-custom ${selected === 'custom' ? '' : 'hidden'}>
        <label>Teste
          <select name="majority_heads">
            <option value="">non richieste</option>
            <option value="votanti" ${poll.majority_heads === 'votanti' ? 'selected' : ''}>più della metà di chi risponde</option>
            <option value="tutti" ${poll.majority_heads === 'tutti' ? 'selected' : ''}>più della metà di tutte le teste</option>
          </select>
        </label>
        <label>Millesimi minimi (facoltativo)
          <input type="number" name="majority_millesimi" min="0" step="0.001" value="${selected === 'custom' ? esc(poll.majority_millesimi) : ''}">
        </label>
      </div>
      <p class="muted small">Le frazioni sono calcolate sul totale delle tabelle millesimali (${fmtMillesimi(TOTALE_MILLESIMI)}).
        Per le teste contano i condomini che hanno risposto al sondaggio.</p>
    </fieldset>`;
}

// Mostra i campi personalizzati solo quando servono
export function bindMajorityFields(form) {
  const select = form.querySelector('[name=majority]');
  const custom = form.querySelector('[data-custom]');
  select.addEventListener('change', () => { custom.hidden = select.value !== 'custom'; });
}

// Valori da salvare nella tabella polls
export function readMajority(form) {
  const choice = form.querySelector('[name=majority]').value;
  if (!choice) return { majority_heads: null, majority_millesimi: null, majority_label: null };
  const preset = PRESETS.find((p) => p.id === choice);
  if (preset) return { majority_heads: preset.heads, majority_millesimi: preset.millesimi, majority_label: preset.label };
  const heads = form.querySelector('[name=majority_heads]').value || null;
  const raw = form.querySelector('[name=majority_millesimi]').value;
  const millesimi = raw === '' ? null : Number(raw);
  if (!heads && millesimi == null) throw new Error('Per la maggioranza personalizzata indica le teste, i millesimi o entrambi');
  return { majority_heads: heads, majority_millesimi: millesimi, majority_label: 'Maggioranza personalizzata' };
}
