import { supabase, BUCKET } from '../supabase.js';
import { CATEGORIE_DOCUMENTI } from '../../config.js';
import { esc, fmtDate, fmtDay, fmtSize, ensure, flash, bindForm, onEach } from '../ui.js';

export async function render(app, ctx) {
  const docs = ensure(await supabase
    .from('documents')
    .select('*')
    .order('document_date', { ascending: false })
    .order('created_at', { ascending: false }));

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

  const findDoc = (id) => docs.find((d) => d.id === Number(id));

  onEach(app, '[data-download]', async (btn) => {
    const doc = findDoc(btn.dataset.download);
    const data = ensure(await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 60, { download: doc.file_name }));
    location.href = data.signedUrl;
  });

  if (!ctx.isAdmin) return;

  onEach(app, '[data-edit]', async (btn) => {
    app.querySelector(`#edit-${btn.dataset.edit}`).hidden = false;
    btn.closest('tr').hidden = true;
  });

  onEach(app, '[data-cancel]', async (btn) => {
    app.querySelector(`#edit-${btn.dataset.cancel}`).hidden = true;
    app.querySelector(`#view-${btn.dataset.cancel}`).hidden = false;
  });

  app.querySelectorAll('form[data-doc]').forEach((form) => bindForm(form, async () => {
    ensure(await supabase.from('documents').update({
      title: form.title.value.trim(),
      category: form.category.value,
      document_date: form.document_date.value,
    }).eq('id', form.dataset.doc));
    flash('Documento aggiornato');
    await render(app, ctx);
  }));

  onEach(app, '[data-delete]', async (btn) => {
    const doc = findDoc(btn.dataset.delete);
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
        ${docs.map((d) => viewRow(d, isAdmin) + (isAdmin ? editRow(d) : '')).join('')}
      </table>
    </section>`;
}

function viewRow(d, isAdmin) {
  return `
    <tr id="view-${d.id}" data-text="${esc(`${d.title} ${d.file_name}`.toLowerCase())}">
      <td>
        <strong>${esc(d.title)}</strong><br>
        <span class="muted small">${esc(d.file_name)} · ${fmtSize(d.size_bytes)}</span>
      </td>
      <td class="nowrap" title="Caricato il ${esc(fmtDate(d.created_at))}">${fmtDay(d.document_date)}</td>
      <td class="actions">
        <button data-download="${d.id}">Scarica</button>
        ${isAdmin ? `
          <button class="link" data-edit="${d.id}">Modifica</button>
          <button class="link danger" data-delete="${d.id}">Elimina</button>` : ''}
      </td>
    </tr>`;
}

function editRow(d) {
  const categories = CATEGORIE_DOCUMENTI.includes(d.category) ? CATEGORIE_DOCUMENTI : [...CATEGORIE_DOCUMENTI, d.category];
  return `
    <tr id="edit-${d.id}" hidden>
      <td colspan="3">
        <form data-doc="${d.id}" class="stack edit-doc">
          <label>Titolo <input name="title" value="${esc(d.title)}" required maxlength="200"></label>
          <div class="cols">
            <label>Categoria
              <select name="category">
                ${categories.map((c) => `<option ${c === d.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}
              </select>
            </label>
            <label>Data di riferimento <input type="date" name="document_date" value="${esc(d.document_date)}" required></label>
          </div>
          <p class="muted small">File: ${esc(d.file_name)} · caricato il ${esc(fmtDate(d.created_at))}</p>
          <div class="row">
            <button type="submit">Salva</button>
            <button type="button" class="link" data-cancel="${d.id}">Annulla</button>
          </div>
        </form>
      </td>
    </tr>`;
}
