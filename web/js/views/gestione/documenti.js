import { supabase, BUCKET, MAX_FILE_MB, uploadToBucket, checkZip } from '../../supabase.js';
import { CATEGORIE_DOCUMENTI } from '../../../config.js';
import { esc, flash, bindForm, todayISO } from '../../ui.js';

export async function render(panel) {
  panel.innerHTML = `
    <section class="card">
      <h2>Carica documento</h2>
      <form id="f-documento" class="stack">
        <label>Titolo <input name="title" required maxlength="200"></label>
        <div class="cols">
          <label>Categoria
            <select name="category">${CATEGORIE_DOCUMENTI.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
          </label>
          <label>Data di riferimento <input type="date" name="document_date" value="${todayISO()}" required></label>
        </div>
        <label>Documento (max ${MAX_FILE_MB} MB) <input type="file" name="file" required></label>
        <label>Allegati in un file .zip (facoltativo, max ${MAX_FILE_MB} MB)
          <input type="file" name="attachment" accept=".zip,application/zip">
        </label>
        <button type="submit">Carica</button>
      </form>
    </section>
    <p class="muted small">Titolo, categoria, data e allegati dei documenti già caricati si modificano dalla pagina
      <a href="#/documenti">Documenti</a>, con il pulsante <em>Modifica</em>.</p>`;

  bindForm(panel.querySelector('#f-documento'), async (form) => {
    const file = form.file.files[0];
    const attachment = form.attachment.files[0];
    if (attachment) checkZip(attachment);

    const uploaded = [];
    try {
      const path = await uploadToBucket(file);
      uploaded.push(path);
      const attachmentPath = attachment ? await uploadToBucket(attachment) : null;
      if (attachmentPath) uploaded.push(attachmentPath);

      const { error } = await supabase.from('documents').insert({
        title: form.title.value.trim(),
        category: form.category.value,
        document_date: form.document_date.value,
        file_path: path,
        file_name: file.name,
        size_bytes: file.size,
        attachment_path: attachmentPath,
        attachment_name: attachment?.name ?? null,
        attachment_size: attachment?.size ?? null,
      });
      if (error) throw error;
    } catch (err) {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
      throw err;
    }
    form.reset();
    flash(attachment ? 'Documento e allegati caricati' : 'Documento caricato');
  });
}
