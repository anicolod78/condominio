import { supabase } from '../../supabase.js';
import { ensure, flash, bindForm } from '../../ui.js';

export async function render(panel) {
  panel.innerHTML = `
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
    <p class="muted small">I sondaggi si chiudono o si eliminano dalla pagina <a href="#/sondaggi">Sondaggi</a>.</p>`;

  bindForm(panel.querySelector('#f-sondaggio'), async (form) => {
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
}
