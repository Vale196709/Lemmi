const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/controlli.js');
const esito = (n) => { const r = C.telefono(n); return r.errore ? 'errore' : r.avviso ? 'avviso' : 'ok'; };

test('telefono: formati italiani ed esteri validi', () => {
  ['333 1234567', '+39 333 1234567', '0039 333 1234567', '06 1234567', '06/1234567', '+44 7911 123456', '800 123456', ''].forEach((n) => assert.equal(esito(n), 'ok', n));
});
test('telefono: numeri troncati danno un avviso, lettere e simboli un errore', () => {
  ['12345', '3331234'].forEach((n) => assert.equal(esito(n), 'avviso', n));
  ['abc', '333-123-4567x', '33+3123456'].forEach((n) => assert.equal(esito(n), 'errore', n));
});
test('doppioni: trova chi ha lo stesso codice fiscale ed esclude se stesso', async () => {
  const righe = { fratelli: [{ id: 'f1', cognome: 'Rossi', nome: 'Mario' }], bussanti: [{ id: 'b1', cognome: 'Neri', nome: 'Paolo' }] };
  const sb = { from: (t) => ({ select: () => ({ eq: async () => ({ data: righe[t] }) }) }) };
  assert.deepEqual(await C.doppioni(sb, 'RSSMRA80A01H501U', null), ['Fratello Rossi Mario', 'Bussante Neri Paolo']);
  assert.deepEqual(await C.doppioni(sb, 'RSSMRA80A01H501U', { tabella: 'fratelli', id: 'f1' }), ['Bussante Neri Paolo']);
  assert.deepEqual(await C.doppioni(sb, 'corto', null), []);
});
