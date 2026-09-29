import { supabase, BUCKET } from '../supabase.js';
import { CATEGORIE_DOCUMENTI } from '../../config.js';
import { esc, fmtDate, fmtSize, ensure, flash, onEach } from '../ui.js';

export async function render(app, ctx) {
  const docs = ensure(await supabase.from('documents').select('*').order('created_at', { ascending: false }));

  const categories = [...CATEGORIE_DOCUMENTI, ...new Set(docs.map((d) => d.category))]
    .filter((c, i, all) => all.indexOf(c) === i)
    .filter((c) => docs.some((d) => d.category === c));

  app.innerHTML = `
    <h1>Documenti</h1>
    ${docs.length ? '<input type="search" id="doc-search" placeholder="Cerca un documento…">' : '<p class="muted">Nessun documento caricato.</p>'}
    ${categories.map((c) => section(c, docs.filter((d) => d.category === c), ctx.isAdmin)).join('')}`;

  app.querySelector('#doc-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    app.querySelectorAll('tr[data-text]').forEach((tr) => { tr.hidden = !tr.dataset.text.includes(q); });
  });

  onEach(app, '[data-download]', async (btn) => {
    const doc = docs.find((d) => d.id === Number(btn.dataset.download));
    const data = ensure(await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 60, { download: doc.file_name }));
    location.href = data.signedUrl;
  });

  onEach(app, '[data-delete]', async (btn) => {
    const doc = docs.find((d) => d.id === Number(btn.dataset.delete));
    if (!confirm(`Eliminare definitivamente "${doc.title}"?`)) return;
    ensure(await supabase.from('documents').delete().eq('id', doc.id));
    ensure(await supabase.storage.from(BUCKET).remove([doc.file_path]));
    flash('Documento eliminato');
    await render(app, ctx);
  });
}

function section(category, docs, isAdmin) {
  return `
    <section class="card">
      <h2>${esc(category)}</h2>
      <table class="docs">
        ${docs.map((d) => `
          <tr data-text="${esc(`${d.title} ${d.file_name}`.toLowerCase())}">
            <td><strong>${esc(d.title)}</strong><br><span class="muted small">${esc(d.file_name)} · ${fmtSize(d.size_bytes)}</span></td>
            <td class="muted small nowrap">${fmtDate(d.created_at)}</td>
            <td class="actions">
              <button data-download="${d.id}">Scarica</button>
              ${isAdmin ? `<button class="link danger" data-delete="${d.id}">Elimina</button>` : ''}
            </td>
          </tr>`).join('')}
      </table>
    </section>`;
}
