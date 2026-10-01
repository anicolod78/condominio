import { supabase, BUCKET, MAX_FILE_MB, uploadToBucket, checkZip } from '../supabase.js';
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
    const [path, name] = btn.dataset.kind === 'attachment'
      ? [doc.attachment_path, doc.attachment_name]
      : [doc.file_path, doc.file_name];
    const data = ensure(await supabase.storage.from(BUCKET).createSignedUrl(path, 60, { download: name }));
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
    const doc = findDoc(form.dataset.doc);
    const changes = {
      title: form.title.value.trim(),
      category: form.category.value,
      document_date: form.document_date.value,
    };

    // Allegati: un nuovo zip sostituisce quello attuale; la spunta lo rimuove
    const attachment = form.attachment.files[0];
    const removeAttachment = form.remove_attachment?.checked;
    let newPath = null;
    if (attachment) {
      checkZip(attachment);
      newPath = await uploadToBucket(attachment);
      Object.assign(changes, { attachment_path: newPath, attachment_name: attachment.name, attachment_size: attachment.size });
    } else if (removeAttachment) {
      Object.assign(changes, { attachment_path: null, attachment_name: null, attachment_size: null });
    }

    const { error } = await supabase.from('documents').update(changes).eq('id', doc.id);
    if (error) {
      if (newPath) await supabase.storage.from(BUCKET).remove([newPath]);
      throw error;
    }
    if (doc.attachment_path && (attachment || removeAttachment)) {
      await supabase.storage.from(BUCKET).remove([doc.attachment_path]);
    }
    flash('Documento aggiornato');
    await render(app, ctx);
  }));

  onEach(app, '[data-delete]', async (btn) => {
    const doc = findDoc(btn.dataset.delete);
    const extra = doc.attachment_path ? ' Verranno eliminati anche i suoi allegati.' : '';
    if (!confirm(`Eliminare definitivamente "${doc.title}"?${extra}`)) return;
    ensure(await supabase.from('documents').delete().eq('id', doc.id));
    ensure(await supabase.storage.from(BUCKET).remove([doc.file_path, doc.attachment_path].filter(Boolean)));
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
    <tr id="view-${d.id}" data-text="${esc(`${d.title} ${d.file_name} ${d.attachment_name ?? ''}`.toLowerCase())}">
      <td>
        <strong>${esc(d.title)}</strong><br>
        <span class="muted small">${esc(d.file_name)} · ${fmtSize(d.size_bytes)}</span>
        ${d.attachment_path ? `<br><span class="muted small">📎 Allegati: ${esc(d.attachment_name)} · ${fmtSize(d.attachment_size)}</span>` : ''}
      </td>
      <td class="nowrap" title="Caricato il ${esc(fmtDate(d.created_at))}">${fmtDay(d.document_date)}</td>
      <td class="actions">
        <button data-download="${d.id}">Scarica</button>
        ${d.attachment_path ? `<button class="secondary" data-download="${d.id}" data-kind="attachment">Allegati</button>` : ''}
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
          <fieldset class="attachments">
            <legend>Allegati (file .zip)</legend>
            ${d.attachment_path ? `
              <p class="small">Attuali: <strong>${esc(d.attachment_name)}</strong> · ${fmtSize(d.attachment_size)}</p>
              <label class="choice"><input type="checkbox" name="remove_attachment"> Rimuovi gli allegati attuali</label>` : ''}
            <label>${d.attachment_path ? 'Sostituisci con un nuovo zip' : 'Aggiungi uno zip con gli allegati'} (max ${MAX_FILE_MB} MB)
              <input type="file" name="attachment" accept=".zip,application/zip">
            </label>
          </fieldset>
          <div class="row">
            <button type="submit">Salva</button>
            <button type="button" class="link" data-cancel="${d.id}">Annulla</button>
          </div>
        </form>
      </td>
    </tr>`;
}
