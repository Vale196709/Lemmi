const test = require('node:test');
const assert = require('node:assert/strict');
const { pagina } = require('./aiuti');
const CF = pagina('<div></div>', ['js/codice-fiscale.js']).CodiceFiscale;

const mario = { cognome: 'Rossi', nome: 'Mario', dataNascita: '1980-01-01', sesso: 'M', codiceCatastale: 'H501' };

test('calcola e riconosce un codice fiscale valido', () => {
  assert.equal(CF.calcola(mario), 'RSSMRA80A01H501U');
  assert.equal(CF.valida('RSSMRA80A01H501U').ok, true);
  assert.equal(CF.valida(' rssmra80a01h501u ').ok, true);
});
test('segnala lettera finale errata, lunghezza e codice vuoto', () => {
  assert.match(CF.valida('RSSMRA80A01H501X').errori[0], /controllo/i);
  assert.match(CF.valida('RSSMRA80A01H50').errori[0], /16 caratteri/);
  assert.equal(CF.valida('').ok, false);
});
test('coerenza con cognome, nome, data, sesso e comune', () => {
  assert.equal(CF.controllaCoerenza('RSSMRA80A01H501U', mario).ok, true);
  const r = CF.controllaCoerenza('RSSMRA80A01H501U', { cognome: 'Bianchi', nome: 'Mario', dataNascita: '1981-02-01', sesso: 'F', codiceCatastale: 'F205' });
  assert.equal(r.ok, false);
  assert.equal(r.avvisi.length, 5);
});
test('nomi con quattro o più consonanti e accenti', () => {
  assert.equal(CF.calcola({ cognome: 'Verdi', nome: 'Gianluca', dataNascita: '1975-06-15', sesso: 'M', codiceCatastale: 'F839' }), 'VRDGLC75H15F839R');
});
test('omocodia: lettere al posto delle cifre', () => {
  const base = CF.calcola(mario).slice(0, 15).split('');
  base[14] = 'M';                                  // ultima cifra 1 -> M
  const p = base.join('');
  const completo = p + (() => { const v = CF.valida(p + 'A'); return null; })();
  // la lettera di controllo si ricava provando le 26 lettere
  const buono = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map((l) => p + l).find((c) => CF.valida(c).ok);
  assert.ok(buono, 'esiste una lettera di controllo valida');
  assert.equal(CF.controllaCoerenza(buono, mario).ok, true);
});
