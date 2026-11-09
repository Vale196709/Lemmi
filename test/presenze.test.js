const test = require('node:test');
const assert = require('node:assert/strict');
const { pagina, leggi } = require('./aiuti');

// Si prova il codice vero di js/template.js: il blocco che collega i menu delle presenze, trasformati in tre pulsanti P, G, A
const src = leggi('js/template.js');
const inizio = src.indexOf("$$('select[data-pres]', v).forEach((sel) => sel.addEventListener('change'");
const marcatore = src.indexOf("if (tp) tp.addEventListener('click'", inizio);
const blocco = src.slice(inizio, src.indexOf('\n', marcatore));

function scena() {
  const righe = ['f1', 'f2', 'f3'].map((id) => `<tr><td>Fratello ${id}</td><td>Maestro</td><td><select data-pres="${id}" aria-label="Presenza di ${id}"><option value="presente">Presente</option><option value="giustificato">Assente giustificato</option><option value="assente">Assente</option></select></td></tr>`).join('');
  const w = pagina(`<div id="v"><div class="actions"><button id="v-tuttip" type="button">Tutti presenti</button></div><div class="table-wrap"><table class="pres-tab"><tbody>${righe}</tbody></table></div></div>`);
  const v = w.document.getElementById('v');
  const x = {}; let chiamate = 0;
  const $ = (s, r) => (r || w.document).querySelector(s), $$ = (s, r) => Array.from((r || w.document).querySelectorAll(s));
  w.eval('(function (v, $, $$, x, sincronizza) {' + blocco + '})')(v, $, $$, x, () => { chiamate++; });
  return { w, v, x, $, $$, chiamate: () => chiamate };
}

test('presenze: ogni menu diventa tre pulsanti e il menu originale resta come dato', () => {
  const { v, $$, $ } = scena();
  assert.equal($$('.pres-seg', v).length, 3);
  assert.equal($$('.pres-seg button', v).length, 9);
  assert.ok($$('select[data-pres]', v).every((s) => s.classList.contains('pres-nascosta')));
  assert.equal($$('.pres-seg', v)[0].querySelector('[aria-pressed="true"]').textContent, 'P', 'all’inizio tutti presenti');
  assert.match(v.querySelector('.hint').textContent, /P presente · G assente giustificato · A assente/);
});
test('presenze: un tocco cambia lo stato, lo registra e aggiorna il riepilogo', () => {
  const { v, x, $$, chiamate } = scena();
  const gruppo = $$('.pres-seg', v)[1];
  gruppo.querySelector('button.a').click();
  assert.equal(v.querySelectorAll('select[data-pres]')[1].value, 'assente');
  assert.equal(x.pres.f2, 'assente');
  assert.equal(gruppo.querySelector('[aria-pressed="true"]').textContent, 'A');
  assert.ok(chiamate() >= 1, 'il riepilogo viene ricalcolato');
  gruppo.querySelector('button.g').click();
  assert.equal(x.pres.f2, 'giustificato');
  assert.equal(gruppo.querySelectorAll('[aria-pressed="true"]').length, 1);
});
test('presenze: «Tutti presenti» riporta tutti i pulsanti su P', () => {
  const { v, $$, $ } = scena();
  $$('.pres-seg', v)[0].querySelector('button.a').click();
  $$('.pres-seg', v)[2].querySelector('button.g').click();
  $('#v-tuttip', v).click();
  assert.ok($$('.pres-seg', v).every((g) => g.querySelector('[aria-pressed="true"]').textContent === 'P'));
  assert.ok($$('select[data-pres]', v).every((s) => s.value === 'presente'));
});
