import { supabase } from '../supabase.js';
import { esc, nl2br, fmtDate, ensure, flash, bindForm, onEach } from '../ui.js';

const isOpen = (poll) => !poll.closes_at || new Date(poll.closes_at) > new Date();

export async function render(app, ctx) {
  const [polls, myVotes] = await Promise.all([
    supabase.from('polls').select('*, poll_options(*)').order('created_at', { ascending: false }).then(ensure),
    supabase.from('votes').select('poll_id, option_id').eq('user_id', ctx.profile.id).then(ensure),
  ]);
  const voted = new Map(myVotes.map((v) => [v.poll_id, v.option_id]));

  // I risultati si vedono dopo aver votato o a sondaggio chiuso
  const results = new Map(await Promise.all(
    polls
      .filter((p) => voted.has(p.id) || !isOpen(p))
      .map(async (p) => [p.id, ensure(await supabase.rpc('poll_results', { p_poll_id: p.id }))]),
  ));

  app.innerHTML = `
    <h1>Sondaggi</h1>
    <p class="muted small">I sondaggi sono consultivi e non sostituiscono le delibere dell'assemblea condominiale.</p>
    ${polls.length ? polls.map((p) => card(p, voted.get(p.id), results.get(p.id), ctx.isAdmin)).join('') : '<p class="muted">Nessun sondaggio.</p>'}`;

  app.querySelectorAll('form[data-poll]').forEach((form) => bindForm(form, async () => {
    const choice = form.querySelector('input[name=option]:checked');
    if (!choice) throw new Error('Seleziona un\'opzione');
    ensure(await supabase.from('votes').upsert(
      { poll_id: Number(form.dataset.poll), option_id: Number(choice.value), user_id: ctx.profile.id },
      { onConflict: 'poll_id,user_id' },
    ));
    flash('Voto registrato');
    await render(app, ctx);
  }));

  onEach(app, '[data-close]', async (btn) => {
    if (!confirm('Chiudere il sondaggio adesso?')) return;
    ensure(await supabase.from('polls').update({ closes_at: new Date().toISOString() }).eq('id', btn.dataset.close));
    flash('Sondaggio chiuso');
    await render(app, ctx);
  });

  onEach(app, '[data-delete]', async (btn) => {
    if (!confirm('Eliminare il sondaggio e tutti i voti?')) return;
    ensure(await supabase.from('polls').delete().eq('id', btn.dataset.delete));
    flash('Sondaggio eliminato');
    await render(app, ctx);
  });
}

function card(poll, myOption, results, isAdmin) {
  const open = isOpen(poll);
  const options = [...poll.poll_options].sort((a, b) => a.position - b.position);
  const status = open
    ? (poll.closes_at ? `Aperto fino al ${fmtDate(poll.closes_at)}` : 'Aperto')
    : `Chiuso il ${fmtDate(poll.closes_at)}`;

  return `
    <article class="card">
      <header class="card-head">
        <h2>${esc(poll.question)}</h2>
        <span class="badge ${open ? 'open' : 'closed'}">${esc(status)}</span>
      </header>
      ${poll.description ? `<p>${nl2br(poll.description)}</p>` : ''}
      ${open ? voteForm(poll, options, myOption) : ''}
      ${results ? resultsView(options, results, myOption) : ''}
      ${isAdmin ? `<div class="row">
        ${open ? `<button class="link" data-close="${poll.id}">Chiudi ora</button>` : ''}
        <button class="link danger" data-delete="${poll.id}">Elimina</button>
      </div>` : ''}
    </article>`;
}

function voteForm(poll, options, myOption) {
  return `
    <form data-poll="${poll.id}" class="stack">
      ${options.map((o) => `
        <label class="choice">
          <input type="radio" name="option" value="${o.id}" ${o.id === myOption ? 'checked' : ''}>
          ${esc(o.label)}
        </label>`).join('')}
      <button type="submit">${myOption ? 'Cambia voto' : 'Vota'}</button>
    </form>`;
}

function resultsView(options, results, myOption) {
  const counts = new Map(results.map((r) => [r.option_id, Number(r.votes)]));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return `
    <div class="results">
      <h3>Risultati <span class="muted small">(${total} vot${total === 1 ? 'o' : 'i'})</span></h3>
      ${options.map((o) => {
        const n = counts.get(o.id) ?? 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        return `
          <div class="bar-row">
            <span>${esc(o.label)}${o.id === myOption ? ' <em class="muted small">(tuo voto)</em>' : ''}</span>
            <span class="muted small">${n} · ${pct}%</span>
            <div class="bar"><div style="width:${pct}%"></div></div>
          </div>`;
      }).join('')}
    </div>`;
}
