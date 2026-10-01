import { esc } from '../../ui.js';
import * as avvisi from './avvisi.js';
import * as documenti from './documenti.js';
import * as sondaggi from './sondaggi.js';
import * as condomini from './condomini.js';

const tabs = [
  { id: 'avvisi', label: 'Avvisi', view: avvisi },
  { id: 'documenti', label: 'Documenti', view: documenti },
  { id: 'sondaggi', label: 'Sondaggi', view: sondaggi },
  { id: 'condomini', label: 'Condomini', view: condomini },
];

export async function render(app, ctx) {
  const tab = tabs.find((t) => t.id === ctx.sub) ?? tabs[0];

  app.innerHTML = `
    <h1>Gestione</h1>
    <div class="tabs" role="tablist">
      ${tabs.map((t) => `
        <a href="#/gestione/${t.id}" role="tab" aria-selected="${t === tab}" class="${t === tab ? 'active' : ''}">${esc(t.label)}</a>`).join('')}
    </div>
    <div id="tab-panel" role="tabpanel"><p class="muted">Caricamento…</p></div>`;

  await tab.view.render(app.querySelector('#tab-panel'), ctx);
}
