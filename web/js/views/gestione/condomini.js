import { supabase } from '../../supabase.js';
import { esc, ensure, flash, bindForm, onEach } from '../../ui.js';

export async function render(panel, ctx) {
  const profiles = ensure(await supabase.from('profiles').select('*').order('unit').order('email'));

  panel.innerHTML = `
    <section class="card">
      <h2>Invita un condomino</h2>
      <form id="f-invito" class="stack">
        <label>Email <input type="email" name="email" required autocomplete="off"></label>
        <div class="cols">
          <label>Nome e cognome (facoltativo) <input name="full_name" maxlength="120"></label>
          <label>Unità (facoltativa) <input name="unit" placeholder="es. Scala A int. 3"></label>
        </div>
        <button type="submit">Invia invito</button>
      </form>
    </section>

    <section class="card">
      <h2>Condomini registrati (${profiles.length})</h2>
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

  bindForm(panel.querySelector('#f-invito'), async (form) => {
    await manageUsers({
      action: 'invite',
      email: form.email.value,
      full_name: form.full_name.value,
      unit: form.unit.value,
      redirectTo: location.origin + location.pathname,
    });
    flash(`Invito inviato a ${form.email.value.trim()}`);
    await render(panel, ctx);
  });

  onEach(panel, '[data-remove]', async (btn) => {
    const person = profiles.find((p) => p.id === btn.dataset.remove);
    if (!confirm(`Rimuovere ${person.full_name || person.email} dal portale? Perderà l'accesso e i suoi voti saranno cancellati.`)) return;
    await manageUsers({ action: 'delete', user_id: person.id });
    flash('Condomino rimosso');
    await render(panel, ctx);
  });

  onEach(panel, '[data-save]', async (btn) => {
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
