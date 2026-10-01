import { supabase, BUCKET } from '../../supabase.js';
import { CATEGORIE_DOCUMENTI } from '../../../config.js';
import { esc, ensure, flash, bindForm, todayISO } from '../../ui.js';

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
        <label>File (max 25 MB) <input type="file" name="file" required></label>
        <button type="submit">Carica</button>
      </form>
    </section>
    <p class="muted small">Titolo, categoria e data dei documenti già caricati si modificano dalla pagina
      <a href="#/documenti">Documenti</a>, con il pulsante <em>Modifica</em>.</p>`;

  bindForm(panel.querySelector('#f-documento'), async (form) => {
    const file = form.file.files[0];
    const safeName = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}-${safeName}`;

    ensure(await supabase.storage.from(BUCKET).upload(path, file));
    const { error } = await supabase.from('documents').insert({
      title: form.title.value.trim(),
      category: form.category.value,
      document_date: form.document_date.value,
      file_path: path,
      file_name: file.name,
      size_bytes: file.size,
    });
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw error;
    }
    form.reset();
    flash('Documento caricato');
  });
}
