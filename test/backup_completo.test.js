const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { caricaZip } = require('./aiuti');
const BC = require('../js/backup_completo.js');
const zip = caricaZip();

const DATI = {
  fratelli: [{ id: 'f1', cognome: 'D\'Angelo', nome: 'Giù "Gino"', stato: 'attivo' }],
  scadenze: [{ id: 's1', fratello_id: 'f1', importo_base: 100, sconto: 10, importo_dovuto: 90 }],   // importo_dovuto è calcolato dal database
  cronologia_modifiche: [{ id: 7, tabella: 'fratelli', operazione: 'INSERT' }],
  profili: [{ user_id: 'u1', ruolo: 'amministratore', nome_visualizzato: 'Admin', fratello_id: 'f1' }],
  lavori: [{ id: 'l1', titolo: 'Tavola', file_path: 'lavori/tavola1.pdf' }],
};
const sb = {
  from: (t) => { const q = { select: () => q, order: () => q, range: async (a, b) => ({ data: (DATI[t] || []).slice(a, b + 1), error: null }) }; return q; },
  rpc: async (n) => n === 'info_utenti_sistema' ? { data: [{ user_id: 'u1', email: 'admin@esempio.it' }] } : { error: { message: 'sconosciuta' } },
  storage: { from: (b) => ({ download: async (p) => ({ data: new Blob([Buffer.from('CONTENUTO ' + b + '/' + p + ' àèì')]), error: null }) }) },
};

async function creaArchivio(opzioni) {
  const password = 'Password-di-prova-123!';
  const bw = new zip.BlobWriter('application/zip');
  const writer = new zip.ZipWriter(bw, { password, encryptionStrength: 3, zipCrypto: false });
  const ris = await BC.creaArchivio({
    sb, writer, zip, opzioni, progresso() {}, creato: '07/11/2026', versione: '0.52.0',
    leggiTesto: async () => '-- struttura finta',
    leggiBinario: async (p) => new Uint8Array(Buffer.from(p === '.nojekyll' ? '' : 'codice ' + p)),
    elencoCodice: async () => ({ percorsi: ['index.html', '.nojekyll'], completo: true }),
  });
  return { ris, blob: await writer.close(), password };
}
const leggiTutto = async (blob, password) => {
  const rd = new zip.ZipReader(new zip.BlobReader(blob), { password });
  const voci = await rd.getEntries(), out = {};
  for (const e of voci) out[e.filename] = await e.getData(new zip.Uint8ArrayWriter());
  return out;
};

test('archivio: contenuto, impronte SHA-256 e file vuoti', async () => {
  const { ris, blob, password } = await creaArchivio({ file: true });
  assert.deepEqual(ris.anomalie, []);
  const e = await leggiTutto(blob, password);
  ['manifest.json', 'LEGGIMI-RIPRISTINO.txt', 'FILE-VUOTI.txt', 'utenti/utenti.json', 'ripristino/1_dati.sql', 'ripristino/2_profili.sql', 'struttura/schema_completo.sql',
    'dati/fratelli.json', 'codice/index.html', 'file/tavole/lavori/tavola1.pdf'].forEach((n) => assert.ok(e[n], 'manca ' + n));
  assert.equal(e['codice/.nojekyll'], undefined, 'i file vuoti non si cifrano: si elencano a parte');
  assert.match(Buffer.from(e['FILE-VUOTI.txt']).toString(), /\.nojekyll/);
  const m = JSON.parse(Buffer.from(e['manifest.json']).toString());
  m.voci.filter((v) => !v.vuoto).forEach((v) => {
    assert.equal(crypto.createHash('sha256').update(e[v.nome]).digest('hex'), v.sha256, 'impronta diversa per ' + v.nome);
    assert.equal(e[v.nome].length, v.byte);
  });
  assert.equal(m.file.scaricati, 1);
});
test('archivio: con password sbagliata non si apre', async () => {
  const { blob } = await creaArchivio({ file: false });
  await assert.rejects(() => leggiTutto(blob, 'password-sbagliata-1'));
});
test('senza i file caricati l’archivio non li contiene', async () => {
  const { blob, password } = await creaArchivio({ file: false });
  const e = await leggiTutto(blob, password);
  assert.equal(Object.keys(e).some((n) => n.startsWith('file/')), false);
});
test('script SQL: colonne calcolate escluse, identità, apici e virgolette protetti', () => {
  const sql = BC.sqlDati(DATI);
  const scadenze = sql.slice(sql.indexOf('insert into public.scadenze'), sql.indexOf('alter table public.scadenze enable'));
  assert.ok(!/importo_dovuto/.test(scadenze.split('from jsonb_populate_recordset')[0]), 'importo_dovuto non va inserito');
  assert.match(sql, /insert into public\.cronologia_modifiche \([^)]*\) overriding system value/);
  assert.match(sql, /setval\(pg_get_serial_sequence\('public\.cronologia_modifiche', 'id'\)/);
  assert.match(sql, /D'Angelo/);                          // dentro il testo tra dollari non serve alcuna protezione
  assert.match(sql, /disable trigger user[\s\S]*enable trigger user/);
  assert.match(sql, /with attese\(tabella, attese\)/);
});
test('script profili: gli utenti si ritrovano dall’e-mail', () => {
  const sql = BC.sqlProfili(DATI.profili, [{ user_id: 'u1', email: 'admin@esempio.it' }]);
  assert.match(sql, /admin@esempio\.it/);
  assert.match(sql, /join auth\.users u on lower\(u\.email\) = lower\(p\.email\)/);
});
