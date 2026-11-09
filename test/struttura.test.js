const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { radice, leggi } = require('./aiuti');

const html = leggi('index.html');
const scriptCitati = Array.from(html.matchAll(/<script src="([^"]+)"/g)).map((m) => m[1]);

test('ogni script citato in index.html esiste', () => {
  scriptCitati.forEach((s) => assert.ok(fs.existsSync(path.join(radice, s)), 'manca ' + s));
});
test('ogni file di js/ è caricato da index.html (nessun file dimenticato)', () => {
  fs.readdirSync(path.join(radice, 'js')).filter((f) => f.endsWith('.js')).forEach((f) => assert.ok(scriptCitati.includes('js/' + f), f + ' non è citato in index.html'));
});
test('ogni file di js/ è sintatticamente corretto', () => {
  fs.readdirSync(path.join(radice, 'js')).filter((f) => f.endsWith('.js')).forEach((f) => {
    assert.doesNotThrow(() => new vm.Script(leggi('js/' + f), { filename: f }), f);
  });
});
test('versione: numero, data e storia coerenti (ricordati di aggiornarla a ogni rilascio)', () => {
  const w = {}; new vm.Script(leggi('js/versione.js')).runInNewContext({ window: w });
  const v = w.LEMMI_VERSIONE;
  assert.match(v.numero, /^\d+\.\d+\.\d+$/);
  assert.match(v.data, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(v.storia[0].n, v.numero, 'la prima voce della storia deve essere la versione attuale');
  assert.equal(v.storia[0].data, v.data, 'data della versione e della prima voce della storia');
  const num = (s) => s.split('.').map(Number);
  for (let i = 1; i < v.storia.length; i++) {
    const a = num(v.storia[i - 1].n), b = num(v.storia[i].n);
    assert.ok(a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2]))), 'storia non in ordine alla voce ' + v.storia[i].n);
  }
});
test('struttura del database: schema_completo.sql esiste ed è ripetibile', () => {
  const sql = leggi('sql/schema_completo.sql');
  assert.ok((sql.match(/create table if not exists public\./gi) || []).length >= 41, 'tabelle');
  assert.ok(/enable row level security/i.test(sql), 'sicurezza a livello di riga');
  assert.equal((sql.match(/^create policy/gim) || []).length, (sql.match(/^drop policy if exists/gim) || []).length, 'ogni regola è preceduta dalla sua cancellazione');
});
test('nessuna chiave segreta nel codice pubblico', () => {
  const cartelle = ['js', 'sql', 'supabase', 'docs'];
  const vietati = [/service_role['"]?\s*[:=]\s*['"]eyJ/i, /sb_secret_[A-Za-z0-9_-]{10,}/, /-----BEGIN (RSA |EC )?PRIVATE KEY-----/];
  const visita = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return visita(p);
    if (!/\.(js|sql|ts|md|json|html)$/.test(e.name)) return;
    const t = fs.readFileSync(p, 'utf8');
    vietati.forEach((re) => assert.ok(!re.test(t), 'possibile chiave segreta in ' + path.relative(radice, p)));
  });
  cartelle.forEach((c) => fs.existsSync(path.join(radice, c)) && visita(path.join(radice, c)));
});
