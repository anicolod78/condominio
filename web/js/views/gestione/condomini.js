import { supabase } from '../../supabase.js';
import { esc, ensure, flash, bindForm, onEach, fmtMillesimi } from '../../ui.js';

const redirectTo = () => location.origin + location.pathname;

export async function render(panel, ctx) {
  const residents = ensure(await supabase
    .from('residents')
    .select('*, profile:profiles(role)')
    .order('unit', { nullsFirst: false })
    .order('full_name'));

  const total = residents.reduce((sum, r) => sum + Number(r.millesimi), 0);
  const withAccess = residents.filter((r) => r.user_id).length;

  panel.innerHTML = `
    <section class="card">
      <h2>Aggiungi condomino</h2>
      <form id="f-nuovo" class="stack">
        <div class="cols">
          <label>Nome e cognome <input name="full_name" required maxlength="120"></label>
          <label>Unità <input name="unit" placeholder="es. Scala A int. 3"></label>
        </div>
        <div class="cols">
          <label>Email (facoltativa) <input type="email" name="email" autocomplete="off"></label>
          <label>Telefono (facoltativo) <input type="tel" name="phone"></label>
        </div>
        <label>Millesimi <input type="number" name="millesimi" min="0" step="0.001" value="0" required></label>
        <label class="choice"><input type="checkbox" name="invite"> Invia subito l'invito al portale (serve l'email)</label>
        <button type="submit">Aggiungi</button>
      </form>
    </section>

    <section class="card">
      <h2>Anagrafica (${residents.length})</h2>
      <p class="small">
        Totale millesimi: <strong>${fmtMillesimi(total)}</strong>
        ${Math.abs(total - 1000) > 0.0005 ? '<span class="error">· la somma non è 1000, controlla i valori</span>' : '<span class="ok">✔</span>'}
        · <span class="muted">${withAccess} con accesso al portale</span>
      </p>
      <table class="registry">
        <tr><th>Unità</th><th>Nome</th><th class="num">Millesimi</th><th>Accesso</th><th></th></tr>
        ${residents.map((r) => viewRow(r, ctx) + editRow(r, ctx)).join('')}
      </table>
    </section>`;

  const findResident = (id) => residents.find((r) => r.id === Number(id));
  const refresh = () => render(panel, ctx);

  bindForm(panel.querySelector('#f-nuovo'), async (form) => {
    const email = form.email.value.trim() || null;
    if (form.invite.checked && !email) throw new Error('Per inviare l\'invito serve l\'email');

    const created = ensure(await supabase.from('residents').insert({
      full_name: form.full_name.value.trim(),
      unit: form.unit.value.trim() || null,
      email,
      phone: form.phone.value.trim() || null,
      millesimi: Number(form.millesimi.value || 0),
    }).select().single().then(friendlyErrors));

    if (form.invite.checked) {
      await manageUsers({ action: 'invite', resident_id: created.id, redirectTo: redirectTo() });
      flash(`Scheda di ${created.full_name} creata, invito inviato`);
    } else {
      flash(`Scheda di ${created.full_name} creata`);
    }
    await refresh();
  });

  onEach(panel, '[data-edit]', async (btn) => {
    panel.querySelector(`#edit-${btn.dataset.edit}`).hidden = false;
    btn.closest('tr').hidden = true;
  });

  onEach(panel, '[data-cancel]', async (btn) => {
    panel.querySelector(`#edit-${btn.dataset.cancel}`).hidden = true;
    panel.querySelector(`#view-${btn.dataset.cancel}`).hidden = false;
  });

  panel.querySelectorAll('form[data-resident]').forEach((form) => bindForm(form, async () => {
    const resident = findResident(form.dataset.resident);
    const changes = {
      full_name: form.full_name.value.trim(),
      unit: form.unit.value.trim() || null,
      phone: form.phone.value.trim() || null,
      millesimi: Number(form.millesimi.value || 0),
    };
    if (!form.email.disabled) changes.email = form.email.value.trim() || null;

    ensure(await supabase.from('residents').update(changes).eq('id', resident.id).then(friendlyErrors));
    if (form.role && !form.role.disabled && form.role.value !== resident.profile?.role) {
      ensure(await supabase.from('profiles').update({ role: form.role.value }).eq('id', resident.user_id));
    }
    flash('Dati salvati');
    await refresh();
  }));

  onEach(panel, '[data-invite]', async (btn) => {
    const resident = findResident(btn.dataset.invite);
    await manageUsers({ action: 'invite', resident_id: resident.id, redirectTo: redirectTo() });
    flash(`Invito inviato a ${resident.email}`);
    await refresh();
  });

  onEach(panel, '[data-revoke]', async (btn) => {
    const resident = findResident(btn.dataset.revoke);
    if (!confirm(`Revocare l'accesso al portale a ${resident.full_name}? La scheda resta in anagrafica, ma i suoi voti ai sondaggi saranno cancellati.`)) return;
    await manageUsers({ action: 'delete', user_id: resident.user_id });
    flash('Accesso revocato');
    await refresh();
  });

  onEach(panel, '[data-delete]', async (btn) => {
    const resident = findResident(btn.dataset.delete);
    const extra = resident.user_id ? ' Verrà revocato anche l\'accesso al portale e cancellati i suoi voti.' : '';
    if (!confirm(`Eliminare ${resident.full_name} dall'anagrafica?${extra}`)) return;
    if (resident.user_id) await manageUsers({ action: 'delete', user_id: resident.user_id });
    ensure(await supabase.from('residents').delete().eq('id', resident.id));
    flash('Condomino eliminato');
    await refresh();
  });
}

function accessBadge(r) {
  if (!r.user_id) return '<span class="badge closed">Senza accesso</span>';
  if (r.profile?.role === 'admin') return '<span class="badge open">Admin</span>';
  return '<span class="badge open">Con accesso</span>';
}

function viewRow(r, ctx) {
  const isMe = r.user_id === ctx.profile.id;
  return `
    <tr id="view-${r.id}">
      <td class="nowrap">${esc(r.unit ?? '—')}</td>
      <td>${esc(r.full_name)}${isMe ? ' <em class="muted small">(tu)</em>' : ''}<br>
        <span class="muted small">${esc(r.email ?? 'nessuna email')}</span></td>
      <td class="num">${fmtMillesimi(r.millesimi)}</td>
      <td>${accessBadge(r)}</td>
      <td class="actions">
        <button class="link" data-edit="${r.id}">Modifica</button>
        ${!r.user_id && r.email ? `<button class="link" data-invite="${r.id}">Invita</button>` : ''}
        ${r.user_id && !isMe ? `<button class="link danger" data-revoke="${r.id}">Revoca accesso</button>` : ''}
        ${isMe ? '' : `<button class="link danger" data-delete="${r.id}">Elimina</button>`}
      </td>
    </tr>`;
}

function editRow(r, ctx) {
  const isMe = r.user_id === ctx.profile.id;
  const role = r.profile?.role;
  return `
    <tr id="edit-${r.id}" hidden>
      <td colspan="5">
        <form data-resident="${r.id}" class="stack edit-doc">
          <div class="cols">
            <label>Nome e cognome <input name="full_name" value="${esc(r.full_name)}" required maxlength="120"></label>
            <label>Unità <input name="unit" value="${esc(r.unit)}"></label>
          </div>
          <div class="cols">
            <label>Email
              <input type="email" name="email" value="${esc(r.email)}"
                ${r.user_id ? 'disabled title="L\'email di un account attivo non si può cambiare da qui"' : ''}>
            </label>
            <label>Telefono <input type="tel" name="phone" value="${esc(r.phone)}"></label>
          </div>
          <div class="cols">
            <label>Millesimi <input type="number" name="millesimi" min="0" step="0.001" value="${esc(r.millesimi)}" required></label>
            ${r.user_id ? `
              <label>Ruolo nel portale
                <select name="role" ${isMe ? 'disabled title="Non puoi cambiare il tuo ruolo"' : ''}>
                  <option value="condomino" ${role === 'condomino' ? 'selected' : ''}>Condomino</option>
                  <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
              </label>` : '<span></span>'}
          </div>
          <div class="row">
            <button type="submit">Salva</button>
            <button type="button" class="link" data-cancel="${r.id}">Annulla</button>
          </div>
        </form>
      </td>
    </tr>`;
}

function friendlyErrors(response) {
  if (response.error?.code === '23505') {
    return { ...response, error: new Error('Questa email è già presente in un\'altra scheda') };
  }
  return response;
}

// Inviti e revoche passano dalla Edge Function, che custodisce la chiave secret
async function manageUsers(body) {
  const { data, error } = await supabase.functions.invoke('gestione-utenti', { body });
  if (error) {
    const details = await error.context?.json?.().catch(() => null);
    throw new Error(details?.error ?? error.message);
  }
  return data;
}
