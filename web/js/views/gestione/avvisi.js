import { supabase } from '../../supabase.js';
import { ensure, flash, bindForm } from '../../ui.js';

export async function render(panel) {
  panel.innerHTML = `
    <section class="card">
      <h2>Nuovo avviso</h2>
      <form id="f-avviso" class="stack">
        <label>Titolo <input name="title" required maxlength="200"></label>
        <label>Testo <textarea name="body" rows="6"></textarea></label>
        <label class="choice"><input type="checkbox" name="pinned"> Fissa in cima alla bacheca</label>
        <button type="submit">Pubblica avviso</button>
      </form>
    </section>
    <p class="muted small">Gli avvisi pubblicati si eliminano direttamente dalla <a href="#/">Bacheca</a>.</p>`;

  bindForm(panel.querySelector('#f-avviso'), async (form) => {
    ensure(await supabase.from('announcements').insert({
      title: form.title.value.trim(),
      body: form.body.value.trim(),
      pinned: form.pinned.checked,
    }));
    form.reset();
    flash('Avviso pubblicato');
  });
}
