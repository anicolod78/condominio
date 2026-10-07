import { supabase, isConfigured } from './supabase.js';
import { NOME_CONDOMINIO } from '../config.js';
import { esc, ensure, guarded } from './ui.js';
import * as login from './views/login.js';
import * as bacheca from './views/bacheca.js';
import * as documenti from './views/documenti.js';
import * as sondaggi from './views/sondaggi.js';
import * as condomini from './views/condomini.js';
import * as gestione from './views/gestione/index.js';

const routes = { '': bacheca, documenti, sondaggi, condomini, gestione };

const app = document.getElementById('app');
const nav = document.getElementById('nav');
let profile = null;

document.title = NOME_CONDOMINIO;
document.getElementById('brand').textContent = NOME_CONDOMINIO;

// Le pagine usano "#/nome", "#/nome/sezione" o "#/nome/sezione/id". Il link ricevuto
// via email arriva invece con "#access_token=..." o "#error=...": si mostra la bacheca.
function currentRoute() {
  const path = location.hash.startsWith('#/') ? location.hash.slice(2) : '';
  const [route = '', sub = '', ...args] = path.split('/');
  return { route, sub, args };
}

async function render() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    profile = null;
    nav.hidden = true;
    login.render(app);
    return;
  }

  if (profile?.id !== session.user.id) {
    profile = ensure(await supabase.from('profiles').select('*').eq('id', session.user.id).single());
  }
  const isAdmin = profile.role === 'admin';

  const { route, sub, args } = currentRoute();
  let view = routes[route] ?? bacheca;
  if (view === gestione && !isAdmin) view = bacheca;

  nav.hidden = false;
  document.getElementById('nav-admin').hidden = !isAdmin;
  for (const link of nav.querySelectorAll('a')) {
    link.classList.toggle('active', link.getAttribute('href') === `#/${route}`);
  }

  app.innerHTML = '<p class="muted">Caricamento…</p>';
  await view.render(app, { profile, isAdmin, sub, args });
}

async function safeRender() {
  try {
    await render();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="card error">Si è verificato un errore: ${esc(err.message)}</div>`;
  }
}

if (!isConfigured) {
  app.innerHTML = `<div class="card error">
    Portale non configurato: inserisci URL e chiave di Supabase in <code>web/config.js</code>.
  </div>`;
} else {
  window.addEventListener('hashchange', safeRender);

  document.getElementById('logout').addEventListener('click', guarded(async () => {
    ensure(await supabase.auth.signOut());
    location.hash = '#/';
  }));

  // Scatta anche all'avvio (INITIAL_SESSION); si ridisegna solo al cambio utente.
  let lastUserId;
  supabase.auth.onAuthStateChange((_event, session) => {
    const userId = session?.user.id ?? null;
    if (userId === lastUserId) return;
    lastUserId = userId;
    setTimeout(safeRender, 0); // mai chiamare Supabase dentro questo callback
  });
}
