const test = require('node:test');
const assert = require('node:assert/strict');
const { pagina, evento } = require('./aiuti');

test('conferma: Salva comunque = vero, Correggi, Esc e clic fuori = falso', async () => {
  const w = pagina('<div></div>', ['js/dialogo.js']);
  const D = w.LemmiDialogo, q = (s) => w.document.querySelector(s);
  let p = D.punti(['Primo punto', 'Secondo punto']);
  assert.equal(w.document.querySelectorAll('.dlg-punti li').length, 2);
  assert.equal(w.document.activeElement.dataset.r, 'no', 'il fuoco parte dal pulsante prudente');
  q('[data-r="si"]').click(); assert.equal(await p, true);
  p = D.punti(['x']); q('[data-r="no"]').click(); assert.equal(await p, false);
  p = D.conferma({ titolo: 'Prova' }); w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); assert.equal(await p, false);
  p = D.conferma({ titolo: 'Prova' }); q('.modal-ov').click(); assert.equal(await p, false);
  assert.equal(w.document.querySelectorAll('.modal-ov').length, 0, 'la finestra si rimuove sempre');
});

async function conRuolo(ruolo) {
  const w = pagina('<div id="app"></div>', [], { prima: (x) => { x.Lemmi = { state: { profilo: { ruolo } } }; x.requestAnimationFrame = (f) => setTimeout(f, 0); x.MutationObserver = x.MutationObserver; } });
  w.eval(require('./aiuti').leggi('js/azioni_rapide.js'));
  return w;
}
const attendi = () => new Promise((r) => setTimeout(r, 15));

test('azioni rapide: compaiono solo dopo l’accesso e secondo il ruolo', async () => {
  const w = await conRuolo('segretario'); await attendi();
  assert.equal(w.document.querySelector('.fab'), null, 'prima dell’accesso non c’è');
  w.document.getElementById('app').innerHTML = '<aside class="side"></aside>'; await attendi();
  assert.ok(w.document.querySelector('.fab'));
  const voci = Array.from(w.document.querySelectorAll('.fab-menu a')).map((a) => a.textContent);
  assert.deepEqual(voci, ['Cerca', 'Nuovo bussante', 'Verbale e presenze']);
  w.document.querySelector('.fab').click(); assert.equal(w.document.querySelector('.fab-menu').hidden, false);
  w.document.querySelector('.fab').click(); assert.equal(w.document.querySelector('.fab-menu').hidden, true);
  w.document.getElementById('app').innerHTML = ''; await attendi();
  assert.equal(w.document.querySelector('.fab'), null, 'dopo l’uscita sparisce');
});
test('azioni rapide: tesoriere vede i pagamenti, il Fratello semplice niente', async () => {
  const t = await conRuolo('tesoriere'); t.document.getElementById('app').innerHTML = '<aside class="side"></aside>'; await attendi();
  assert.deepEqual(Array.from(t.document.querySelectorAll('.fab-menu a')).map((a) => a.textContent), ['Pagamenti', 'Calendario']);
  const f = await conRuolo('fratello'); f.document.getElementById('app').innerHTML = '<aside class="side"></aside>'; await attendi();
  assert.equal(f.document.querySelector('.fab'), null);
});
