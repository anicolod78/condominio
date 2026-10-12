import { supabase } from '../../supabase.js';
import { TOTALE_MILLESIMI } from '../../../config.js';
import { esc, ensure, flash, bindForm, onEach, fmtMillesimi } from '../../ui.js';

const redirectTo = () => location.origin + location.pathname;

// Anagrafica: ogni condomino (la "testa" che vota) possiede una o più unità;
// i suoi millesimi sono la somma delle unità, calcolata dal database
export async function render(panel, ctx) {
  const residents = ensure(await supabase
    .from('residents')
    .select('*, profile:profiles(role), units(id, unit_code, scala, millesimi)')
    .order('unit', { nullsFirst: false })
    .order('full_name'));
  for (const r of residents) r.units.sort((a, b) => (a.unit_code ?? '').localeCompare(b.unit_code ?? ''));

  const total = residents.reduce((sum, r) => sum + Number(r.millesimi), 0);
  const unitCount = residents.reduce((sum, r) => sum + r.units.length, 0);
  const withAccess = residents.filter((r) => r.user_id).length;
  const scale = [...new Set(residents.flatMap((r) => r.units.map((u) => u.scala)).filter(Boolean))].sort();

  panel.innerHTML = `
    <datalist id="scale-list">${scale.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>

    <section class="card">
      <h2>Aggiungi condomino</h2>
      <form id="f-nuovo" class="stack">
        <label>Nome e cognome o ragione sociale <input name="full_name" required maxlength="120"></label>
        <div class="cols">
          <label>Email (facoltativa) <input type="email" name="email" autocomplete="off"></label>
          <label>Telefono (facoltativo) <input type="tel" name="phone"></label>
        </div>
        <fieldset class="attachments">
          <legend>Prima unità (facoltativa)</legend>
          <div class="unit-fields">
            <label>Codice <input name="unit_code" placeholder="es. 002.3.076D"></label>
            <label>Scala <input name="scala" list="scale-list"></label>
            <label>Millesimi <input type="number" name="millesimi" min="0" step="0.001"></label>
          </div>
          <p class="muted small">Altre unità si aggiungono poi da <em>Modifica</em>.</p>
        </fieldset>
        <label class="choice"><input type="checkbox" name="invite"> Invia subito l'invito al portale (serve l'email)</label>
        <button type="submit">Aggiungi</button>
      </form>
    </section>

    <section class="card">
      <h2>Anagrafica (${residents.length} condomini, ${unitCount} unità)</h2>
      <p class="small">
        Totale millesimi: <strong>${fmtMillesimi(total)}</strong>
        ${Math.abs(total - TOTALE_MILLESIMI) > 0.0005
          ? `<span class="error">· la somma non corrisponde al totale delle tabelle (${fmtMillesimi(TOTALE_MILLESIMI)}), controlla i valori</span>`
          : '<span class="ok">✔ corrisponde alle tabelle millesimali</span>'}
        · <span class="muted">${withAccess} con accesso al portale</span>
      </p>
      <p class="muted small">Un condomino con più proprietà vota una volta sola, con la somma dei millesimi delle sue unità.
        Per unire due schede, sposta le unità dall'una all'altra con <em>Modifica</em> e poi elimina quella rimasta vuota.</p>
      <input type="search" id="registry-search" placeholder="Cerca per nome, scala o codice…">
      <table class="registry">
        <tr><th>Unità</th><th>Condomino</th><th class="num">Millesimi</th><th>Accesso</th><th></th></tr>
        ${residents.map((r) => viewRow(r, ctx) + editRow(r, ctx, residents)).join('')}
      </table>
    </section>`;

  const findResident = (id) => residents.find((r) => r.id === Number(id));
  const refresh = () => render(panel, ctx);

  panel.querySelector('#registry-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    panel.querySelectorAll('tr[data-text]').forEach((tr) => { tr.hidden = !tr.dataset.text.includes(q); });
  });

  bindForm(panel.querySelector('#f-nuovo'), async (form) => {
    const email = form.email.value.trim() || null;
    if (form.invite.checked && !email) throw new Error('Per inviare l\'invito serve l\'email');

    const created = ensure(await supabase.from('residents').insert({
      full_name: form.full_name.value.trim(),
      email,
      phone: form.phone.value.trim() || null,
    }).select().single().then(friendlyErrors));

    const unit = unitValues(form);
    if (unit.unit_code || unit.millesimi > 0) {
      const { error } = await supabase.from('units').insert({ ...unit, resident_id: created.id }).then(friendlyErrors);
      if (error) {
        await supabase.from('residents').delete().eq('id', created.id);
        throw error;
      }
    }

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

  // "Aggiungi unità" nel modulo di modifica: nuova riga vuota
  onEach(panel, '[data-add-unit]', async (btn) => {
    const list = panel.querySelector(`#units-${btn.dataset.addUnit}`);
    list.insertAdjacentHTML('beforeend', unitRow(null, findResident(btn.dataset.addUnit), residents));
    list.lastElementChild.querySelector('input').focus();
  });

  panel.querySelectorAll('form[data-resident]').forEach((form) => bindForm(form, async () => {
    const resident = findResident(form.dataset.resident);
    const changes = {
      full_name: form.full_name.value.trim(),
      phone: form.phone.value.trim() || null,
    };
    if (!form.email.disabled) changes.email = form.email.value.trim() || null;
    ensure(await supabase.from('residents').update(changes).eq('id', resident.id).then(friendlyErrors));

    let moved = 0;
    for (const row of form.querySelectorAll('.unit-row')) {
      const id = Number(row.dataset.unitId) || null;
      const values = unitValues(row);
      const target = Number(row.querySelector('[name=move]').value) || resident.id;
      if (row.querySelector('[name=remove]')?.checked) {
        if (id) ensure(await supabase.from('units').delete().eq('id', id));
      } else if (id) {
        const original = resident.units.find((u) => u.id === id);
        const changed = target !== resident.id || values.unit_code !== original.unit_code
          || values.scala !== original.scala || values.millesimi !== Number(original.millesimi);
        if (changed) ensure(await supabase.from('units').update({ ...values, resident_id: target }).eq('id', id).then(friendlyErrors));
        if (target !== resident.id) moved += 1;
      } else if (values.unit_code || values.millesimi > 0) {
        ensure(await supabase.from('units').insert({ ...values, resident_id: target }).then(friendlyErrors));
      }
    }

    if (form.role && !form.role.disabled && form.role.value !== resident.profile?.role) {
      ensure(await supabase.from('profiles').update({ role: form.role.value }).eq('id', resident.user_id));
    }
    flash(moved ? `Dati salvati, ${moved} unità spostat${moved === 1 ? 'a' : 'e'}` : 'Dati salvati');
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
    const notes = [];
    if (resident.units.length) {
      notes.push(`Verranno eliminate anche le sue ${resident.units.length} unità (${fmtMillesimi(resident.millesimi)} millesimi): se sono passate a un altro condomino, spostale prima con Modifica.`);
    }
    if (resident.user_id) notes.push('Verrà revocato anche l\'accesso al portale e cancellati i suoi voti.');
    if (!confirm(`Eliminare ${resident.full_name} dall'anagrafica?\n\n${notes.join('\n')}`.trim())) return;
    if (resident.user_id) await manageUsers({ action: 'delete', user_id: resident.user_id });
    ensure(await supabase.from('residents').delete().eq('id', resident.id));
    flash('Condomino eliminato');
    await refresh();
  });
}

function unitValues(scope) {
  return {
    unit_code: scope.querySelector('[name=unit_code]').value.trim() || null,
    scala: scope.querySelector('[name=scala]').value.trim() || null,
    millesimi: Number(scope.querySelector('[name=millesimi]').value || 0),
  };
}

function accessBadge(r) {
  if (!r.user_id) return '<span class="badge closed">Senza accesso</span>';
  if (r.profile?.role === 'admin') return '<span class="badge open">Admin</span>';
  return '<span class="badge open">Con accesso</span>';
}

function viewRow(r, ctx) {
  const isMe = r.user_id === ctx.profile.id;
  const codes = r.units.map((u) => u.unit_code).filter(Boolean);
  const text = `${r.full_name} ${r.unit ?? ''} ${codes.join(' ')} ${r.email ?? ''}`.toLowerCase();
  return `
    <tr id="view-${r.id}" data-text="${esc(text)}">
      <td>${esc(r.unit ?? '—')}
        ${r.units.length ? `<br><span class="muted small">${r.units.map((u) => esc(u.unit_code ?? 'senza codice')).join('<br>')}</span>` : ''}</td>
      <td>${esc(r.full_name)}${isMe ? ' <em class="muted small">(tu)</em>' : ''}<br>
        <span class="muted small">${esc(r.email ?? 'nessuna email')}${r.units.length > 1 ? ` · ${r.units.length} unità` : ''}</span></td>
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

// Riga di un'unità nel modulo di modifica (unit = null per una nuova unità)
function unitRow(unit, owner, residents) {
  const others = residents.filter((x) => x.id !== owner.id);
  return `
    <div class="unit-row" data-unit-id="${unit ? unit.id : ''}">
      <div class="unit-fields">
        <label>Codice <input name="unit_code" value="${esc(unit?.unit_code)}" placeholder="es. 002.3.076D"></label>
        <label>Scala <input name="scala" value="${esc(unit?.scala)}" list="scale-list"></label>
        <label>Millesimi <input type="number" name="millesimi" min="0" step="0.001" value="${esc(unit?.millesimi)}"></label>
      </div>
      <div class="unit-actions">
        <label>Appartiene a
          <select name="move">
            <option value="">${esc(owner.full_name)} (questa scheda)</option>
            ${others.map((x) => `<option value="${x.id}">→ sposta a ${esc(x.full_name)}${x.unit ? ` · ${esc(x.unit)}` : ''}</option>`).join('')}
          </select>
        </label>
        ${unit ? '<label class="choice"><input type="checkbox" name="remove"> Elimina unità</label>' : ''}
      </div>
    </div>`;
}

function editRow(r, ctx, residents) {
  const isMe = r.user_id === ctx.profile.id;
  const role = r.profile?.role;
  return `
    <tr id="edit-${r.id}" hidden>
      <td colspan="5">
        <form data-resident="${r.id}" class="stack edit-doc">
          <label>Nome e cognome o ragione sociale <input name="full_name" value="${esc(r.full_name)}" required maxlength="120"></label>
          <div class="cols">
            <label>Email
              <input type="email" name="email" value="${esc(r.email)}"
                ${r.user_id ? 'disabled title="L\'email di un account attivo non si può cambiare da qui"' : ''}>
            </label>
            <label>Telefono <input type="tel" name="phone" value="${esc(r.phone)}"></label>
          </div>
          ${r.user_id ? `
            <label>Ruolo nel portale
              <select name="role" ${isMe ? 'disabled title="Non puoi cambiare il tuo ruolo"' : ''}>
                <option value="condomino" ${role === 'condomino' ? 'selected' : ''}>Condomino</option>
                <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
              </select>
            </label>` : ''}
          <fieldset class="attachments">
            <legend>Unità e millesimi (totale ${fmtMillesimi(r.millesimi)})</legend>
            <div id="units-${r.id}" class="unit-list">
              ${r.units.map((u) => unitRow(u, r, residents)).join('') || '<p class="muted small">Nessuna unità.</p>'}
            </div>
            <button type="button" class="link" data-add-unit="${r.id}">+ Aggiungi unità</button>
          </fieldset>
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
    const message = /unit_code/.test(response.error.message)
      ? 'Questo codice unità è già assegnato a un\'altra unità'
      : 'Questa email è già presente in un\'altra scheda';
    return { ...response, error: new Error(message) };
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
