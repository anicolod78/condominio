import { supabase } from '../supabase.js';
import { esc, bindForm, guarded } from '../ui.js';

const redirectTo = () => location.origin + location.pathname;

// Gli errori di accesso (link scaduto, account Google non invitato...)
// tornano nell'URL come "#error_description=..." o "?error_description=..."
function readAuthError() {
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const description = params.get('error_description');
  if (!description) return null;
  history.replaceState(null, '', location.pathname);
  if (/signups? not allowed|not allowed for this instance/i.test(description)) {
    return 'Questo account non corrisponde a nessun condomino registrato. Usa l\'indirizzo email registrato nel portale.';
  }
  return `Accesso non riuscito: il link potrebbe essere scaduto o già usato (${description}). Riprova.`;
}

export function render(app) {
  const authError = readAuthError();

  app.innerHTML = `
    <section class="card narrow">
      <h1>Accesso riservato</h1>
      <p>Il portale è riservato ai condomini registrati.</p>
      ${authError ? `<p class="error">${esc(authError)}</p>` : ''}

      <button type="button" id="google" class="google">
        <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
        </svg>
        Accedi con Google
      </button>

      <p class="divider"><span>oppure con la tua email</span></p>

      <form id="email-form" class="stack">
        <label>Email <input type="email" name="email" required autocomplete="email"></label>
        <button type="submit">Inviami link e codice di accesso</button>
      </form>

      <form id="code-form" class="stack" hidden>
        <p class="ok" id="sent-msg"></p>
        <label>Codice ricevuto via email
          <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required>
        </label>
        <button type="submit">Accedi</button>
        <button type="button" class="link" id="change-email">Usa un altro indirizzo</button>
      </form>

      <p id="login-msg" class="error"></p>
    </section>`;

  const emailForm = app.querySelector('#email-form');
  const codeForm = app.querySelector('#code-form');
  const message = app.querySelector('#login-msg');
  let email = '';

  app.querySelector('#google').addEventListener('click', guarded(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo(), queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
  }));

  bindForm(emailForm, async (form) => {
    message.textContent = '';
    email = form.email.value.trim();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false, // accesso solo per gli utenti invitati
        emailRedirectTo: redirectTo(),
      },
    });
    if (error) {
      message.textContent = `Invio non riuscito: verifica che l'indirizzo sia quello registrato presso il portale. (${error.message})`;
      return;
    }
    app.querySelector('#sent-msg').textContent =
      `Ti abbiamo inviato un'email a ${email}: apri il link oppure inserisci qui il codice.`;
    emailForm.hidden = true;
    codeForm.hidden = false;
    codeForm.code.focus();
  });

  bindForm(codeForm, async (form) => {
    message.textContent = '';
    const { error } = await supabase.auth.verifyOtp({ email, token: form.code.value.trim(), type: 'email' });
    if (error) message.textContent = 'Codice non valido o scaduto. Controlla l\'ultima email ricevuta o richiedi un nuovo codice.';
    // se il codice è corretto l'app passa da sola alla bacheca
  });

  app.querySelector('#change-email').addEventListener('click', () => {
    codeForm.hidden = true;
    emailForm.hidden = false;
    message.textContent = '';
  });
}
