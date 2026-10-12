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

// ---------------------------------------------------------------------------
// Ordinamento degli elenchi di condomini (per unità o per nome), lato pagina.
// La scelta è ricordata nel browser: è solo una comodità, se non si può
// salvare si usa l'ordinamento per unità.
// ---------------------------------------------------------------------------
const SORT_KEY = 'ordine-condomini';
const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });

function readSortPref() {
  try {
    return localStorage.getItem(SORT_KEY) === 'nome' ? 'nome' : 'unita';
  } catch {
    return 'unita';
  }
}

function writeSortPref(value) {
  try {
    localStorage.setItem(SORT_KEY, value);
  } catch {
    // preferenza non salvabile (es. navigazione privata): si ignora
  }
}

// Attributi da mettere sulla riga <tr> di un condomino
export function sortAttrs(person, code = '') {
  return `data-sort-name="${esc(person.full_name ?? '')}" data-sort-unit="${esc(person.unit ?? '')}" data-sort-code="${esc(code ?? '')}"`;
}

export function sortControl() {
  const mode = readSortPref();
  return `
    <label class="sort-control">Ordina per
      <select data-sort>
        <option value="unita" ${mode === 'unita' ? 'selected' : ''}>Unità</option>
        <option value="nome" ${mode === 'nome' ? 'selected' : ''}>Nome</option>
      </select>
    </label>`;
}

// Riordina le righe con data-sort-*; una riga con data-companion="id" si porta
// dietro la riga indicata (es. il modulo di modifica). Le righe .total restano in fondo.
export function sortRows(table, mode) {
  const body = table.tBodies[0];
  const rows = [...body.querySelectorAll('tr[data-sort-name]')];
  const byName = (a, b) => collator.compare(a.dataset.sortName, b.dataset.sortName);
  const byUnit = (a, b) => (!a.dataset.sortUnit) - (!b.dataset.sortUnit)
    || collator.compare(a.dataset.sortUnit, b.dataset.sortUnit)
    || collator.compare(a.dataset.sortCode, b.dataset.sortCode)
    || byName(a, b);
  rows.sort(mode === 'nome' ? byName : byUnit);
  for (const row of rows) {
    body.appendChild(row);
    const companion = row.dataset.companion && body.querySelector(`#${row.dataset.companion}`);
    if (companion) body.appendChild(companion);
  }
  body.querySelectorAll('tr.total').forEach((row) => body.appendChild(row));
}

export function bindSort(root, table) {
  const select = root.querySelector('select[data-sort]');
  select.addEventListener('change', () => {
    writeSortPref(select.value);
    sortRows(table, select.value);
  });
  sortRows(table, select.value);
}
