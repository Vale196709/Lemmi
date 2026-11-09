const test = require('node:test');
const assert = require('node:assert/strict');
const { pagina, evento } = require('./aiuti');

async function modulo() {
  const w = pagina('<form id="f"><div class="f"><input name="luogo_nascita"></div><div class="f"><input name="provincia_nascita"></div><div class="f"><input name="citta"></div><div class="f"><input name="provincia"></div><div class="f"><input name="cap"></div></form>', ['js/luoghi.js']);
  const f = w.document.getElementById('f');
  await w.LemmiLuoghi.collega(f, [{ comune: 'luogo_nascita', prov: 'provincia_nascita', estero: true }, { comune: 'citta', prov: 'provincia', cap: 'cap' }]);
  return { w, f, L: w.LemmiLuoghi, E: f.elements, ev: (el, t) => evento(w, el, t) };
}

test('scelta del comune: nome uniforme, provincia compilata, codice catastale', async () => {
  const { L, f, E, ev } = await modulo();
  E.luogo_nascita.value = 'roma'; ev(E.luogo_nascita, 'change');
  assert.equal(E.luogo_nascita.value, 'Roma'); assert.equal(E.provincia_nascita.value, 'RM');
  assert.equal(L.verifica(f), null); assert.equal(L.catastale(f, 'luogo_nascita'), 'H501');
});
test('errori: provincia sbagliata, comune inesistente, omonimi', async () => {
  const { L, f, E, ev } = await modulo();
  E.luogo_nascita.value = 'Roma'; E.provincia_nascita.value = 'MI'; assert.match(L.verifica(f).msg, /non risulta in provincia di Milano/);
  E.luogo_nascita.value = 'Pincopallinia'; E.provincia_nascita.value = ''; assert.match(L.verifica(f).msg, /non è nell’elenco/);
  E.luogo_nascita.value = 'Castro'; assert.match(L.verifica(f).msg, /più province/);
  E.provincia_nascita.value = 'LE'; assert.equal(L.verifica(f), null);
});
test('nati all’estero: Stati suggeriti, avviso se scritto male', async () => {
  const { L, f, E, ev } = await modulo();
  const chk = f.querySelector('input[type=checkbox]'); chk.checked = true; ev(chk, 'change');
  assert.equal(E.provincia_nascita.value, 'EE'); assert.equal(E.luogo_nascita.getAttribute('list'), 'dl-stati-lemmi');
  E.luogo_nascita.value = 'Argentina'; assert.equal(L.avvisi(f).length, 0); assert.equal(L.catastale(f, 'luogo_nascita'), null);
  E.luogo_nascita.value = 'Argentinaa'; assert.equal(L.avvisi(f).length, 1);
  E.luogo_nascita.value = 'Jugoslavia (ex)'; assert.equal(L.avvisi(f).length, 0);
});
test('CAP coerente con la città, compreso il CAP generico delle grandi città', async () => {
  const { L, f, E, ev } = await modulo();
  E.citta.value = 'Sacrofano'; ev(E.citta, 'change');
  E.cap.value = '00060'; assert.equal(L.avvisi(f).length, 0);
  E.cap.value = '00118'; assert.equal(L.avvisi(f).length, 1);
  E.citta.value = 'Roma'; E.provincia.value = ''; ev(E.citta, 'change');
  E.cap.value = '00100'; assert.equal(L.avvisi(f).length, 0);
  E.cap.value = '20100'; assert.equal(L.avvisi(f).length, 1);
});
test('dato già salvato fuori elenco: la casella estero parte spuntata', async () => {
  const w = pagina('<form id="g"><div class="f"><input name="luogo_nascita" value="Argentina"></div><div class="f"><input name="provincia_nascita" value="EE"></div></form>', ['js/luoghi.js']);
  await w.LemmiLuoghi.collega(w.document.getElementById('g'), [{ comune: 'luogo_nascita', prov: 'provincia_nascita', estero: true }]);
  assert.equal(w.document.querySelector('#g input[type=checkbox]').checked, true);
});
