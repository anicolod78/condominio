import { supabase } from '../../supabase.js';
import { esc, ensure, flash, bindForm, fmtDate } from '../../ui.js';
import * as simulazione from './simulazione.js';

export async function render(panel, ctx) {
  // "#/gestione/sondaggi/<id>" apre la simulazione di quel sondaggio
  const pollId = Number(ctx.args?.[0]);
  if (pollId) {
    await simulazione.render(panel, pollId);
    return;
  }

  const [polls, simulations] = await Promise.all([
    supabase.from('polls').select('id, question, closes_at, created_at').order('created_at', { ascending: false }).then(ensure),
    supabase.from('poll_simulations').select('poll_id').then(ensure),
  ]);
  const simulated = simulations.reduce((m, s) => m.set(s.poll_id, (m.get(s.poll_id) ?? 0) + 1), new Map());
  const isOpen = (p) => !p.closes_at || new Date(p.closes_at) > new Date();

  panel.innerHTML = `
    <section class="card">
      <h2>Nuovo sondaggio</h2>
      <form id="f-sondaggio" class="stack">
        <label>Domanda <input name="question" required maxlength="300"></label>
        <label>Descrizione (facoltativa) <textarea name="description" rows="3"></textarea></label>
        <label>Opzioni, una per riga <textarea name="options" rows="4" required placeholder="Favorevole&#10;Contrario&#10;Astenuto"></textarea></label>
        <label>Chiusura (facoltativa) <input type="datetime-local" name="closes_at"></label>
        <button type="submit">Crea sondaggio</button>
      </form>
    </section>

    <section class="card">
      <h2>Sondaggi e simulazioni</h2>
      ${polls.length ? `
        <p class="muted small">Con la simulazione indichi una risposta per ogni condomino in anagrafica,
          anche se non è ancora iscritto al portale, e vedi i risultati in millesimi.</p>
        <table class="poll-list">
          ${polls.map((p) => `
            <tr>
              <td><strong>${esc(p.question)}</strong><br>
                <span class="muted small">${isOpen(p) ? 'Aperto' : `Chiuso il ${esc(fmtDate(p.closes_at))}`}
                  ${simulated.get(p.id) ? ` · simulazione: ${simulated.get(p.id)} rispost${simulated.get(p.id) === 1 ? 'a' : 'e'}` : ''}</span></td>
              <td class="actions"><a class="button-link" href="#/gestione/sondaggi/${p.id}">Simulazione</a></td>
            </tr>`).join('')}
        </table>` : '<p class="muted">Nessun sondaggio creato.</p>'}
      <p class="muted small">I sondaggi si chiudono o si eliminano dalla pagina <a href="#/sondaggi">Sondaggi</a>.</p>
    </section>`;

  bindForm(panel.querySelector('#f-sondaggio'), async (form) => {
    const labels = form.options.value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (labels.length < 2) throw new Error('Servono almeno due opzioni');
    const closesAt = form.closes_at.value ? new Date(form.closes_at.value).toISOString() : null;

    const poll = ensure(await supabase.from('polls').insert({
      question: form.question.value.trim(),
      description: form.description.value.trim(),
      closes_at: closesAt,
    }).select().single());

    const { error } = await supabase.from('poll_options')
      .insert(labels.map((label, position) => ({ poll_id: poll.id, label, position })));
    if (error) {
      await supabase.from('polls').delete().eq('id', poll.id);
      throw error;
    }
    flash('Sondaggio creato');
    await render(panel, ctx);
  });
}
