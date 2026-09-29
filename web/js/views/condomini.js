import { supabase } from '../supabase.js';
import { esc, ensure, flash, bindForm } from '../ui.js';

export async function render(app, ctx) {
  const people = ensure(await supabase.rpc('directory'));
  const me = ctx.profile;

  app.innerHTML = `
    <h1>Condomini</h1>

    <section class="card">
      <h2>Il mio profilo</h2>
      <form id="f-profilo" class="stack">
        <label>Nome e cognome <input name="full_name" value="${esc(me.full_name)}" maxlength="120"></label>
        <label>Telefono <input name="phone" type="tel" value="${esc(me.phone)}" maxlength="40"></label>
        <label class="choice">
          <input type="checkbox" name="share_contacts" ${me.share_contacts ? 'checked' : ''}>
          Mostra email e telefono agli altri condomini
        </label>
        <p class="muted small">Unità: <strong>${esc(me.unit ?? 'non indicata')}</strong>. Per correggerla contatta l'amministratore del portale.</p>
        <button type="submit">Salva</button>
      </form>
    </section>

    <section class="card">
      <h2>Elenco (${people.length})</h2>
      <input type="search" id="people-search" placeholder="Cerca per nome o unità…">
      <table class="directory">
        <tr><th>Unità</th><th>Nome</th><th>Contatti</th></tr>
        ${people.map((p) => `
          <tr data-text="${esc(`${p.full_name ?? ''} ${p.unit ?? ''}`.toLowerCase())}">
            <td class="nowrap">${esc(p.unit ?? '—')}</td>
            <td>${esc(p.full_name ?? '(nome non indicato)')}${p.is_admin ? ' <span class="badge">admin</span>' : ''}</td>
            <td class="small">${contacts(p)}</td>
          </tr>`).join('')}
      </table>
    </section>`;

  app.querySelector('#people-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    app.querySelectorAll('tr[data-text]').forEach((tr) => { tr.hidden = !tr.dataset.text.includes(q); });
  });

  bindForm(app.querySelector('#f-profilo'), async (form) => {
    const changes = {
      p_full_name: form.full_name.value,
      p_phone: form.phone.value,
      p_share_contacts: form.share_contacts.checked,
    };
    ensure(await supabase.rpc('update_my_profile', changes));
    Object.assign(me, {
      full_name: changes.p_full_name.trim() || null,
      phone: changes.p_phone.trim() || null,
      share_contacts: changes.p_share_contacts,
    });
    flash('Profilo aggiornato');
    await render(app, ctx);
  });
}

function contacts(p) {
  const parts = [];
  if (p.email) parts.push(`<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`);
  if (p.phone) parts.push(`<a href="tel:${esc(p.phone.replace(/\s+/g, ''))}">${esc(p.phone)}</a>`);
  return parts.join('<br>') || '<span class="muted">riservati</span>';
}
