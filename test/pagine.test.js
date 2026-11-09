const test = require('node:test');
const assert = require('node:assert/strict');
const { pagina } = require('./aiuti');
const MB = 1048576, iso = (g) => new Date(Date.now() - g * 86400000).toISOString();
const esc = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function ambiente(w, sb) {
  w.Lemmi = { state: { sb }, $: (s, r) => (r || w.document).querySelector(s), $$: (s, r) => Array.from((r || w.document).querySelectorAll(s)), esc,
    chk: (r) => { if (r && r.error) throw r.error; return r && r.data !== undefined && !Array.isArray(r) ? r.data : r; }, toast(m) { (w.__toast = w.__toast || []).push(m); },
    messaggioErrore: (e) => e.message, isAdmin: () => true, libreria: async () => {}, oggi: () => '2026-11-05', viste: {}, route() {} };
}

test('Dati da completare: segnala codici, luoghi, CAP, date, telefoni e doppioni', async () => {
  const fratelli = [
    { id: 1, cognome: 'Rossi', nome: 'Mario', stato: 'attivo', codice_fiscale: 'RSSMRA80A01H501U', data_nascita: '1980-01-01', luogo_nascita: 'Roma', citta: 'Roma', provincia: 'RM', cap: '00100', cellulare: '333 1234567', data_iniziazione: '2010-05-05' },
    { id: 2, cognome: 'Bianchi', nome: 'Luca', stato: 'attivo', codice_fiscale: 'BNCLCU70A01H501X', data_nascita: '1970-01-01', luogo_nascita: 'Pincopallinia', citta: 'Sacrofano', provincia: 'MI', cap: '00060', cellulare: '12345', data_iniziazione: '1960-01-01' },
    { id: 3, cognome: 'Verdi', nome: 'Gino', stato: 'attivo', codice_fiscale: 'RSSMRA80A01H501U', data_nascita: '1980-01-01', luogo_nascita: 'Roma', citta: 'Sacrofano', provincia: 'RM', cap: '00060', cellulare: '+39 06 1234567', data_iniziazione: '2012-01-01' },
  ];
  const bussanti = [{ id: 9, cognome: 'Neri', nome: 'Paolo', tipo_domanda: 'iniziazione', data_domanda: '2026-03-10', data_nascita: '2012-01-01', codice_fiscale: 'NREPLA12A01H501X', cellulare: 'abc' }];
  const sb = { from: (t) => { const q = { select: () => q, order: () => q, range: () => Promise.resolve(t === 'fratelli' ? fratelli : bussanti) }; return q; } };
  const w = pagina('<div id="v"></div>', ['js/luoghi.js', 'js/codice-fiscale.js', 'js/controllo_date.js', 'js/controlli.js', 'js/completa.js'], { prima: (x) => ambiente(x, sb) });
  const v = w.document.getElementById('v');
  await w.Lemmi.viste.completa(v);
  const testo = Array.from(v.querySelectorAll('#dc-sosp tbody tr')).map((tr) => tr.children[0].textContent + ' => ' + tr.children[2].textContent).join('\n');
  assert.match(testo, /Rossi Mario => Codice fiscale uguale a: Fratello Verdi Gino/);
  assert.ok(!/Rossi Mario.*CAP/.test(testo), 'il CAP generico di Roma è accettato');
  assert.match(testo, /Bianchi Luca.*Pincopallinia/);
  assert.match(testo, /Bianchi Luca.*non risulta nella provincia MI/);
  assert.match(testo, /Bianchi Luca.*Telefono/);
  assert.match(testo, /Bianchi Luca.*non può precedere la nascita/);
  assert.match(testo, /Bianchi Luca.*lettera di controllo errata/);
  assert.match(testo, /Neri Paolo.*maggiore età/);
  assert.match(testo, /Neri Paolo.*lettere/);
  assert.ok(!/Verdi Gino.*Telefono/.test(testo));
});

async function sistema(cfg) {
  const err = (m) => new Error(m);
  const sb = {
    rpc: async (n) => {
      if (n === 'info_spazio') { if (cfg.noSpazio) throw err('funzione assente'); return { data: { db_totale: cfg.db * MB, dati: 10 * MB, backup: 5 * MB, file: [{ bucket: 'tavole', byte: cfg.file * MB, file: 3 }], tabelle: [] } }; }
      if (n === 'stato_backup') { if (cfg.noBk) throw err('funzione assente'); return { data: { pianificazione: cfg.prog } }; }
    },
    from: () => { const q = { select: () => q, order: () => q, limit: () => cfg.noBk ? Promise.reject(err('tabella assente')) : Promise.resolve(cfg.elenco) }; return q; },
  };
  const w = pagina('<div id="v"></div>', [], { prima: (x) => ambiente(x, sb) });
  if (cfg.scarico !== undefined) w.localStorage.setItem('lemmi_ultimo_scarico_backup', iso(cfg.scarico));
  if (cfg.completo !== undefined) w.localStorage.setItem('lemmi_ultimo_backup_completo', iso(cfg.completo));
  ['js/versione.js', 'js/backup_completo.js', 'js/sistema.js'].forEach((s) => w.eval(require('./aiuti').leggi(s)));
  const v = w.document.getElementById('v');
  await w.Lemmi.viste.sistema(v);
  return { w, v, titolo: v.querySelector('#sys-sintesi h2 .badge').textContent,
    righe: Array.from(v.querySelectorAll('#sys-sintesi > div > div')).map((d) => d.querySelector('.badge').textContent + ' | ' + d.querySelector('b').textContent) };
}
const el = (g, tipo) => ({ id: 1, tipo, esito: 'riuscito', avviato_il: iso(g), concluso_il: iso(g), origine: 'automatico', byte: 1000, righe_nuove: 1, righe_eliminate: 0 });

test('Stato del sistema: tutto in ordine', async () => {
  const r = await sistema({ db: 100, file: 10, prog: true, scarico: 2, completo: 3, elenco: [el(0, 'incrementale'), el(3, 'completo')] });
  assert.equal(r.titolo, 'Tutto in ordine');
  assert.ok(r.righe.every((x) => x.startsWith('In ordine')), r.righe.join('\n'));
  assert.ok(r.v.querySelector('#bkc-card'), 'scheda del backup completo');
});
test('Stato del sistema: spazio quasi pieno e backup vecchi danno urgenze in cima', async () => {
  const r = await sistema({ db: 460, file: 800, prog: false, elenco: [el(5, 'incrementale'), el(12, 'completo')] });
  assert.match(r.titolo, /punti richiedono attenzione/);
  assert.ok(r.righe[0].startsWith('Urgente'));
  assert.ok(r.righe.some((x) => /Copia fuori/.test(x) && x.startsWith('Da controllare')));
  assert.ok(r.righe.some((x) => /Backup completo dell/.test(x) && x.startsWith('Da controllare')));
});
test('Stato del sistema: funzioni mancanti su Supabase non rompono la pagina', async () => {
  const r = await sistema({ noSpazio: true, noBk: true, scarico: 1, completo: 1, elenco: [] });
  assert.equal(r.righe.filter((x) => /Spazio|Backup \|/.test(x)).length >= 1, true);
  assert.match(r.titolo, /richiedono attenzione|richiede attenzione/);
});
test('Stato del sistema: la password del backup completo si controlla prima di partire', async () => {
  const r = await sistema({ db: 50, file: 5, prog: true, scarico: 1, completo: 1, elenco: [el(0, 'incrementale'), el(2, 'completo')] });
  const q = (s) => r.v.querySelector(s);
  q('#bkc-pw').value = 'corta'; q('#bkc-vai').click();
  q('#bkc-pw').value = 'una-password-lunga-1'; q('#bkc-pw2').value = 'diversa-password-1'; q('#bkc-vai').click();
  q('#bkc-pw2').value = 'una-password-lunga-1'; q('#bkc-vai').click();
  assert.deepEqual(r.w.__toast, ['La password deve avere almeno 12 caratteri.', 'Le due password non coincidono.', 'Conferma di aver salvato la password.']);
});
