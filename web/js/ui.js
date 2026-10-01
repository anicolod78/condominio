const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Da usare per OGNI valore inserito in innerHTML
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function nl2br(text) {
  return esc(text).replace(/\n/g, '<br>');
}

export function fmtDate(value) {
  return new Date(value).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
}

// Date senza orario ("2026-10-01"): lette come data locale, senza fuso orario
export function fmtDay(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', { dateStyle: 'medium' });
}

export function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function fmtMillesimi(value) {
  return Number(value ?? 0).toLocaleString('it-IT', { maximumFractionDigits: 3 });
}

export function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`;
}

// Restituisce i dati di una risposta Supabase o lancia l'errore
export function ensure({ data, error }) {
  if (error) throw error;
  return data;
}

let flashTimer;
export function flash(message, type = 'ok') {
  const box = document.getElementById('flash');
  box.textContent = message;
  box.className = `show ${type}`;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { box.className = ''; }, 4000);
}

// Esegue un gestore asincrono mostrando gli eventuali errori
export function guarded(handler) {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (err) {
      console.error(err);
      flash(err.message ?? String(err), 'error');
    }
  };
}

export function bindForm(form, handler) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    await guarded(handler)(form);
    button.disabled = false;
  });
}

export function onEach(root, selector, handler) {
  root.querySelectorAll(selector).forEach((el) => {
    el.addEventListener('click', guarded(() => handler(el)));
  });
}
