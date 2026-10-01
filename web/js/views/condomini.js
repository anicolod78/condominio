import { supabase } from '../supabase.js';
import { esc, ensure, flash, bindForm, fmtMillesimi } from '../ui.js';

export async function render(app, ctx) {
  const [people, mine] = await Promise.all([
    supabase.rpc('directory').then(ensure),
    supabase.from('residents').select('*').eq('user_id', ctx.profile.id).maybeSingle().then(ensure),
  ]);
  const total = people.reduce((sum, p) => sum + Number(p.millesimi), 0);

  app.innerHTML = `
    <h1>Condomini</h1>

    ${mine ? `
    <section class="card">
      <h2>Il mio profilo</h2>
      <p>${esc(mine.full_name)} · Unità <strong>${esc(mine.unit ?? 'non indicata')}</strong> · ${fmtMillesimi(mine.millesimi)} millesimi</p>
      <form id="f-profilo" class="stack">
        <label>Telefono <input name="phone" type="tel" value="${esc(mine.phone)}" maxlength="40"></label>
        <label class="choice">
          <input type="checkbox" name="share_contacts" ${mine.share_contacts ? 'checked' : ''}>
          Mostra email e telefono agli altri condomini
        </label>
        <p class="muted small">Nome, unità e millesimi sono gestiti dall'amministratore del portale: contattalo per eventuali correzioni.</p>
        <button type="submit">Salva</button>
      </form>
    </section>` : ''}

    <section class="card">
      <h2>Elenco (${people.length})</h2>
      <input type="search" id="people-search" placeholder="Cerca per nome o unità…">
      <table class="directory">
        <tr><th>Unità</th><th>Nome</th><th class="num">Millesimi</th><th>Contatti</th></tr>
        ${people.map((p) => `
          <tr data-text="${esc(`${p.full_name ?? ''} ${p.unit ?? ''}`.toLowerCase())}">
            <td class="nowrap">${esc(p.unit ?? '—')}</td>
            <td>${esc(p.full_name)}${p.is_admin ? ' <span class="badge">admin</span>' : ''}</td>
            <td class="num">${fmtMillesimi(p.millesimi)}</td>
            <td class="small">${contacts(p)}</td>
          </tr>`).join('')}
        <tr class="total"><td></td><td>Totale</td><td class="num">${fmtMillesimi(total)}</td><td></td></tr>
      </table>
    </section>`;

  app.querySelector('#people-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    app.querySelectorAll('tr[data-text]').forEach((tr) => { tr.hidden = !tr.dataset.text.includes(q); });
  });

  const form = app.querySelector('#f-profilo');
  if (form) {
    bindForm(form, async () => {
      ensure(await supabase.rpc('update_my_profile', {
        p_phone: form.phone.value,
        p_share_contacts: form.share_contacts.checked,
      }));
      flash('Profilo aggiornato');
      await render(app, ctx);
    });
  }
}

function contacts(p) {
  const parts = [];
  if (p.email) parts.push(`<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`);
  if (p.phone) parts.push(`<a href="tel:${esc(p.phone.replace(/\s+/g, ''))}">${esc(p.phone)}</a>`);
  return parts.join('<br>') || '<span class="muted">riservati</span>';
}
