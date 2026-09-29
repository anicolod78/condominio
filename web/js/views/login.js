import { supabase } from '../supabase.js';
import { esc, bindForm } from '../ui.js';

export function render(app) {
  const authError = new URLSearchParams(location.hash.slice(1)).get('error_description');

  app.innerHTML = `
    <section class="card narrow">
      <h1>Accesso riservato</h1>
      <p>Il portale è riservato ai condomini. Inserisci l'indirizzo email registrato:
        riceverai un link per entrare, senza bisogno di password.</p>
      ${authError ? `<p class="error">Il link non è valido o è scaduto (${esc(authError)}). Richiedine uno nuovo.</p>` : ''}
      <form id="login-form" class="stack">
        <label>Email <input type="email" name="email" required autocomplete="email"></label>
        <button type="submit">Inviami il link di accesso</button>
      </form>
      <p id="login-msg"></p>
    </section>`;

  const message = app.querySelector('#login-msg');

  bindForm(app.querySelector('#login-form'), async (form) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: form.email.value.trim(),
      options: {
        shouldCreateUser: false, // accesso solo per gli utenti invitati
        emailRedirectTo: location.origin + location.pathname,
      },
    });
    if (error) {
      message.className = 'error';
      message.textContent = `Invio non riuscito: verifica che l'indirizzo sia quello registrato presso il portale. (${error.message})`;
    } else {
      message.className = 'ok';
      message.textContent = 'Controlla la tua casella email e apri il link ricevuto da questo dispositivo.';
    }
  });
}
