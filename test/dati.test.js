const test = require('node:test');
const assert = require('node:assert/strict');
const { leggi } = require('./aiuti');
const L = JSON.parse(leggi('data/luoghi.json'));

test('luoghi.json: province, comuni, Stati nella forma attesa', () => {
  assert.ok(Object.keys(L.province).length >= 107, 'province');
  assert.ok(L.comuni.length > 7800, 'comuni');
  assert.ok(L.stati.length >= 200, 'stati');
  L.comuni.forEach((c) => {
    assert.ok(L.province[c[1]], 'provincia sconosciuta per ' + c[0]);
    assert.match(c[2], /^[A-Z]\d{3}$/, 'codice catastale di ' + c[0]);
    if (c[3]) assert.match(c[3], /^(\d{5}(-\d{5})?)(,\d{5}(-\d{5})?)*$/, 'CAP di ' + c[0]);
  });
});
test('luoghi.json: città di riferimento', () => {
  const trova = (n, s) => L.comuni.find((c) => c[0] === n && c[1] === s);
  assert.equal(trova('Roma', 'RM')[2], 'H501');
  assert.equal(trova('Sacrofano', 'RM')[3], '00060');
  assert.ok(L.stati.includes('Argentina'));
});
