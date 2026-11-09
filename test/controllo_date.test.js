const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/controllo_date.js');
const O = '2026-11-05';
const nessuno = (r) => !r.errori.length && !r.avvisi.length;

test('bussante: pratica regolare', () => {
  assert.ok(nessuno(D.bussante({ tipo_domanda: 'iniziazione', data_domanda: '2026-03-10', data_nascita: '1985-06-01', data_presa_in_considerazione: '2026-03-12', data_comunicazione_collegio: '2026-03-15', data_prima_votazione: '2026-06-01', data_seconda_votazione: '2026-07-01' }, O)));
});
test('bussante: maggiore età al giorno esatto', () => {
  assert.equal(D.bussante({ data_domanda: '2026-03-10', data_nascita: '2008-03-11' }, O).errori.length, 1);
  assert.equal(D.bussante({ data_domanda: '2026-03-10', data_nascita: '2008-03-10' }, O).errori.length, 0);
});
test('bussante: ordine delle date e domanda nel futuro', () => {
  assert.equal(D.bussante({ data_domanda: '2027-01-01' }, O).errori[0].campo, 'data_domanda');
  assert.equal(D.bussante({ data_domanda: '2026-03-10', data_presa_in_considerazione: '2026-03-01' }, O).errori.length, 1);
  assert.equal(D.bussante({ data_presa_in_considerazione: '2026-03-10', data_comunicazione_collegio: '2026-03-05' }, O).errori.length, 1);
  assert.equal(D.bussante({ data_prima_votazione: '2026-06-01', data_seconda_votazione: '2026-06-01' }, O).errori[0].campo, 'data_seconda_votazione');
});
test('bussante: preavviso di 60 giorni (iniziazione) e 30 (riammissione)', () => {
  const v = (tipo, com, v1) => D.bussante({ tipo_domanda: tipo, data_comunicazione_collegio: com, data_prima_votazione: v1 }, O);
  assert.equal(v('iniziazione', '2026-03-15', '2026-05-13').avvisi.length, 1);
  assert.equal(v('iniziazione', '2026-03-15', '2026-05-14').avvisi.length, 0);
  assert.equal(v('riammissione', '2026-03-15', '2026-04-14').avvisi.length, 0);
  assert.equal(v('riammissione', '2026-03-15', '2026-04-10').avvisi.length, 1);
});
test('Fratello: iniziazione e nascita', () => {
  assert.ok(nessuno(D.fratello({ data_nascita: '1970-05-05', data_iniziazione: '2005-01-10' }, O)));
  assert.equal(D.fratello({ data_nascita: '1970-05-05', data_iniziazione: '1960-01-01' }, O).errori.length, 1);
  assert.equal(D.fratello({ data_iniziazione: '2030-01-01' }, O).errori.length, 1);
  assert.equal(D.fratello({ data_nascita: '1970-05-05', data_iniziazione: '1980-01-10' }, O).avvisi.length, 1);
});
test('passaggi di grado: ordine, anno nel grado, anno solo', () => {
  const ctx = { iniziazione: '2020-03-10', passaggi: [{ grado: 'compagno', data: '2021-04-20' }] };
  assert.ok(nessuno(D.passaggio({ grado: 'maestro', data: '2022-05-01' }, ctx, O)));
  assert.equal(D.passaggio({ grado: 'maestro', data: '2021-10-01' }, ctx, O).avvisi.length, 1);
  assert.equal(D.passaggio({ grado: 'maestro', data: '2021-01-01' }, ctx, O).errori.length, 1);
  assert.equal(D.passaggio({ grado: 'compagno', anno: 1998 }, { annoIniziazione: 2000, passaggi: [] }, O).errori.length, 1);
  assert.equal(D.passaggio({ grado: 'compagno', data: '2030-01-01' }, { passaggi: [] }, O).errori.length, 1);
});
