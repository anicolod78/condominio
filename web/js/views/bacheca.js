import { supabase } from '../supabase.js';
import { esc, nl2br, fmtDate, ensure, flash, onEach } from '../ui.js';

export async function render(app, ctx) {
  const rows = ensure(await supabase
    .from('announcements')
    .select('*')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false }));

  app.innerHTML = `
    <h1>Bacheca</h1>
    ${rows.length ? rows.map((a) => card(a, ctx.isAdmin)).join('') : '<p class="muted">Nessun avviso pubblicato.</p>'}`;

  onEach(app, '[data-delete]', async (btn) => {
    if (!confirm('Eliminare questo avviso?')) return;
    ensure(await supabase.from('announcements').delete().eq('id', btn.dataset.delete));
    flash('Avviso eliminato');
    await render(app, ctx);
  });
}

function card(a, isAdmin) {
  return `
    <article class="card${a.pinned ? ' pinned' : ''}">
      <header class="card-head">
        <h2>${a.pinned ? '📌 ' : ''}${esc(a.title)}</h2>
        <span class="muted">${fmtDate(a.created_at)}</span>
      </header>
      <p>${nl2br(a.body)}</p>
      ${isAdmin ? `<button class="link danger" data-delete="${a.id}">Elimina</button>` : ''}
    </article>`;
}
