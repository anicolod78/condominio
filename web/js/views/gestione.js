import { supabase, BUCKET } from '../supabase.js';
import { CATEGORIE_DOCUMENTI } from '../../config.js';
import { esc, ensure, flash, bindForm, onEach, todayISO } from '../ui.js';

export async function render(app, ctx) {
  const profiles = ensure(await supabase.from('profiles').select('*').order('unit').order('email'));

  app.innerHTML = `
    <h1>Gestione</h1>

    <section class="card">
      <h2>Nuovo avviso</h2>
      <form id="f-avviso" class="stack">
        <label>Titolo <input name="title" required maxlength="200"></label>
        <label>Testo <textarea name="body" rows="5"></textarea></label>
        <label class="choice"><input type="checkbox" name="pinned"> Fissa in cima alla bacheca</label>
        <button type="submit">Pubblica avviso</button>
      </form>
    </section>

    <section class="card">
      <h2>Carica documento</h2>
      <form id="f-documento" class="stack">
        <label>Titolo <input name="title" required maxlength="200"></label>
        <label>Categoria
          <select name="category">${CATEGORIE_DOCUMENTI.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
        </label>
        <label>Data di riferimento <input type="date" name="document_date" value="${todayISO()}" required></label>
        <label>File (max 25 MB) <input type="file" name="file" required></label>
        <button type="submit">Carica</button>
      </form>
    </section>

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
      <h2>Invita un condomino</h2>
      <form id="f-invito" class="stack">
        <label>Email <input type="email" name="email" required autocomplete="off"></label>
        <label>Nome e cognome (facoltativo) <input name="full_name" maxlength="120"></label>
        <label>Unità (facoltativa) <input name="unit" placeholder="es. Scala A int. 3"></label>
        <button type="submit">Invia invito</button>
      </form>
    </section>

    <section class="card">
      <h2>Condomini (${profiles.length})</h2>
      <table class="people">
        <tr><th>Email</th><th>Nome</th><th>Unità</th><th>Ruolo</th><th></th></tr>
        ${profiles.map((p) => `
          <tr data-id="${p.id}">
            <td class="small">${esc(p.email)}</td>
            <td><input name="full_name" value="${esc(p.full_name)}"></td>
            <td><input name="unit" value="${esc(p.unit)}" placeholder="es. Scala A int. 3"></td>
            <td>
              <select name="role" ${p.id === ctx.profile.id ? 'disabled title="Non puoi cambiare il tuo ruolo"' : ''}>
                <option value="condomino" ${p.role === 'condomino' ? 'selected' : ''}>Condomino</option>
                <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Admin</option>
              </select>
            </td>
            <td class="actions">
              <button class="link" data-save="${p.id}">Salva</button>
              ${p.id === ctx.profile.id ? '' : `<button class="link danger" data-remove="${p.id}">Rimuovi</button>`}
            </td>
          </tr>`).join('')}
      </table>
    </section>`;

  bindForm(app.querySelector('#f-avviso'), async (form) => {
    ensure(await supabase.from('announcements').insert({
      title: form.title.value.trim(),
      body: form.body.value.trim(),
      pinned: form.pinned.checked,
    }));
    form.reset();
    flash('Avviso pubblicato');
  });

  bindForm(app.querySelector('#f-documento'), async (form) => {
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

  bindForm(app.querySelector('#f-sondaggio'), async (form) => {
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
    form.reset();
    flash('Sondaggio creato');
  });

  bindForm(app.querySelector('#f-invito'), async (form) => {
    await manageUsers({
      action: 'invite',
      email: form.email.value,
      full_name: form.full_name.value,
      unit: form.unit.value,
      redirectTo: location.origin + location.pathname,
    });
    flash(`Invito inviato a ${form.email.value.trim()}`);
    await render(app, ctx);
  });

  onEach(app, '[data-remove]', async (btn) => {
    const person = profiles.find((p) => p.id === btn.dataset.remove);
    if (!confirm(`Rimuovere ${person.full_name || person.email} dal portale? Perderà l'accesso e i suoi voti saranno cancellati.`)) return;
    await manageUsers({ action: 'delete', user_id: person.id });
    flash('Condomino rimosso');
    await render(app, ctx);
  });

  onEach(app, '[data-save]', async (btn) => {
    const row = btn.closest('tr');
    const changes = {
      full_name: row.querySelector('[name=full_name]').value.trim() || null,
      unit: row.querySelector('[name=unit]').value.trim() || null,
    };
    const role = row.querySelector('[name=role]');
    if (!role.disabled) changes.role = role.value;
    ensure(await supabase.from('profiles').update(changes).eq('id', btn.dataset.save));
    flash('Dati salvati');
  });
}

// Inviti e rimozioni passano dalla Edge Function, che custodisce la chiave secret
async function manageUsers(body) {
  const { data, error } = await supabase.functions.invoke('gestione-utenti', { body });
  if (error) {
    const details = await error.context?.json?.().catch(() => null);
    throw new Error(details?.error ?? error.message);
  }
  return data;
}
