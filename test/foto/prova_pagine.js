// Prova delle pagine in un browser vero (Chromium), con dati finti al posto di Supabase.
// Per ogni profilo e ogni pagina controlla che:
//   - non ci siano errori JavaScript e non compaia «Si è verificato un errore»;
//   - la pagina non scorra di lato (su telefono) e le tabelle non escano dal riquadro (su computer);
// e salva una foto di ogni pagina in test/foto/risultati (su GitHub: scaricabili da «Artifacts» della prova).
// Uso: npm run test:pagine   (la prima volta: npx playwright install chromium)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const radice = path.resolve(__dirname, '..', '..');
const cartellaFoto = path.join(__dirname, 'risultati');
const FINTO = 'https://finto.supabase.co';

/* ---------- dati finti ---------- */
const oggi = new Date();
const isoTra = (g) => new Date(oggi.getTime() + g * 86400000).toISOString().slice(0, 10);
const anno = oggi.getFullYear();
const NOMI = [['Rossi', 'Mario', 'maestro'], ['Bianchi', 'Luca', 'compagno'], ['Verdi', 'Paolo', 'apprendista'], ['Neri', 'Giorgio', 'maestro'],
  ['Gallo', 'Andrea', 'maestro'], ['Conti', 'Marco', 'apprendista'], ['Russo', 'Stefano', 'maestro'], ['Ferri', 'Davide', 'compagno']];
const fratelli = NOMI.map(([cognome, nome, grado], i) => ({
  id: '00000000-0000-0000-0000-00000000000' + i, cognome, nome, stato: 'attivo', grado_attuale: grado, carica_attuale: i === 0 ? 'Segretario' : null,
  matricola: String(1000 + i), data_nascita: (1960 + i) + '-0' + ((i % 9) + 1) + '-1' + i, cellulare: '333123456' + i,
  email: nome.toLowerCase() + '@esempio.it', email_2: null, citta: 'Roma', provincia: 'RM', cap: '00100', indirizzo: 'Via Roma ' + (i + 1),
  anno_iniziazione: 2000 + i, data_iniziazione: (2000 + i) + '-03-15', professione: 'Impiegato',
}));
const tornate = [
  { id: 't0', data: isoTra(0), tipo: 'ordinaria', grado: 'apprendista', ora: '20:30:00', stato: 'programmata', luogo: 'Casa massonica', relatore: 'Fr. Mario Rossi', ordine_del_giorno: '1. Lettura del verbale\n2. Tavola del Fr. Rossi\n3. Varie' },
  { id: 't1', data: isoTra(7), tipo: 'ordinaria', grado: 'apprendista', ora: '20:30:00', stato: 'programmata', luogo: 'Casa massonica' },
  { id: 't2', data: isoTra(14), tipo: 'informale', grado: null, ora: '21:00:00', stato: 'programmata', link_online: 'https://meet.example/abc' },
];
const bussanti = [{ id: 'b1', cognome: 'Bruni', nome: 'Alberto', tipo_domanda: 'iniziazione', data_domanda: isoTra(-40), data_prima_votazione: isoTra(20), data_seconda_votazione: isoTra(50) }];
const scadenze = fratelli.slice(0, 5).map((f, i) => ({ id: 's' + i, anno, rata_n: 1, rate_totali: 1, fratello_id: f.id, fratello: f.cognome + ' ' + f.nome, voce: 'Capitazione', voce_codice: 'capitazione',
  importo_base: 600, sconto: 0, importo_dovuto: 600, versato: i % 2 ? 600 : 0, residuo: i % 2 ? 0 : 600, data_scadenza: anno + '-01-25', stato: i % 2 ? 'Pagato' : 'Scaduto' }));
const movimenti = [
  { id: 'm1', conto_id: 'c1', conto: 'BancoPosta', data_operazione: anno + '-02-03', descrizione: 'BONIFICO DA ROSSI MARIO QUOTA', importo: 600, categoria: 'Quote', stato: 'riconciliato' },
  { id: 'm2', conto_id: 'c1', conto: 'BancoPosta', data_operazione: anno + '-03-10', descrizione: 'SPESE TENUTA CONTO', importo: -12.5, categoria: 'Spese bancarie', stato: 'da_riconciliare' },
];
const TABELLE = {
  fratelli, v_fratelli_completi: fratelli, v_fratelli_tesoreria: fratelli, tornate, bussanti,
  loggia: [{ id: 1, nome: 'Adriano Lemmi', numero: '812', oriente: 'Roma', indirizzo: 'Via di prova 1' }],
  v_scadenze_stato: scadenze, v_conto_movimenti: movimenti, conto_movimenti: movimenti,
  conti: [{ id: 'c1', nome: 'BancoPosta', attivo: true }], voci_quota: [{ id: 'v1', codice: 'capitazione', nome: 'Capitazione', personale: true }],
};
const lavori = [
  { id: 'l1', titolo: 'I Quattro Triangoli Elementali', tema: 'Terra - Acqua - Aria - Fuoco', tipo: 'tavola', fratello_id: fratelli[0].id, stato: 'presentato', grado_autore: 'apprendista', grado_tornata: 'apprendista', data_presentazione: isoTra(0), file_path: 'fratelli/' + fratelli[0].id + '/u1/1_quattro.pdf.zip', file_nome: 'quattro.pdf' },
  { id: 'l2', titolo: 'Il silenzio dell’Apprendista', tipo: 'tavola', fratello_id: fratelli[3].id, stato: 'presentato', grado_autore: 'maestro', grado_tornata: 'apprendista', data_presentazione: isoTra(-30), file_path: 'fratelli/x/u2/2_silenzio.pdf', file_nome: 'silenzio.pdf' },
];
TABELLE.lavori = lavori;
TABELLE.caselle_rinnovi = [
  { id: 'r1', tipo: 'pec', nome: 'PEC della Loggia', indirizzo: 'loggia812@pec.esempio.it', gestore: 'Aruba', scadenza: isoTra(20), preavviso_giorni: 30, rinnovo_automatico: false, recapiti_recupero: 'segretario@esempio.it', due_passaggi: true, ultimo_cambio_password: isoTra(-400), custodia_credenziali: 'Busta chiusa, cartella 04', chi_accede: 'Venerabile e Segretario', attivo: true },
  { id: 'r2', tipo: 'dominio', nome: 'Dominio del sito', indirizzo: 'lemmi812.esempio.it', gestore: 'Aruba', scadenza: isoTra(200), preavviso_giorni: 30, rinnovo_automatico: true, recapiti_recupero: null, due_passaggi: false, ultimo_cambio_password: isoTra(-30), custodia_credenziali: null, attivo: true },
  { id: 'r3', tipo: 'peo', nome: 'Vecchia casella', indirizzo: 'vecchia@esempio.it', gestore: 'Libero', scadenza: isoTra(-10), preavviso_giorni: 30, rinnovo_automatico: false, due_passaggi: false, attivo: false },
];
TABELLE.elezioni = [{ id: 'e1', anno_massonico: 2027, data_elezione: isoTra(-60) }];
const RPC = {
  tavole_per_grado: lavori.map((l) => ({ id: l.id, titolo: l.titolo, tema: l.tema || null, tipo: 'tavola', autore: l.fratello_id === fratelli[0].id ? 'Rossi Mario' : 'Neri Giorgio', grado_tornata: l.grado_tornata, stato: l.stato, data_presentazione: l.data_presentazione, file_path: l.file_path, file_nome: l.file_nome, mia: l.fratello_id === fratelli[0].id })),
};
const ruoloDi = { fratello: { ruolo: 'fratello', nome_visualizzato: 'Rossi Mario', fratello_id: fratelli[0].id } };

/* ---------- server del sito ---------- */
const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json' };
function avviaSito() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(radice, p);
      if (!file.startsWith(radice) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      let corpo = fs.readFileSync(file);
      if (p === '/js/config.js') corpo = Buffer.from(`window.LEMMI_CONFIG = { SUPABASE_URL: '${FINTO}', SUPABASE_ANON_KEY: 'sb_publishable_prova' };`);
      res.writeHead(200, { 'Content-Type': TIPI[path.extname(file)] || 'application/octet-stream' });
      res.end(corpo);
    });
    s.listen(0, '127.0.0.1', () => ok(s));
  });
}

/* ---------- Supabase finto ---------- */
function rispostaSupabase(route, ruolo) {
  const req = route.request(), url = new URL(req.url());
  const json = (dati, extra) => route.fulfill({ status: 200, contentType: 'application/json', headers: Object.assign({ 'access-control-allow-origin': '*' }, extra || {}), body: JSON.stringify(dati) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (url.pathname.startsWith('/auth/v1/')) return json(utente);
  if (url.pathname.startsWith('/functions/v1/')) return json({});
  if (url.pathname.startsWith('/storage/v1/')) return json([]);
  const m = /^\/rest\/v1\/(rpc\/)?([a-z_0-9]+)/.exec(url.pathname);
  if (!m) return json([]);
  if (m[1]) return json(ruolo === 'fratello' ? (RPC[m[2]] || []) : []);
  let dati = m[2] === 'profili' ? [ruoloDi[ruolo] || { ruolo, nome_visualizzato: 'Utente di prova' }] : (TABELLE[m[2]] || []);
  const id = url.searchParams.get('id');
  if (id && /^eq\./.test(id)) dati = dati.filter((x) => String(x.id) === id.slice(3));
  if (/vnd\.pgrst\.object/.test(req.headers().accept || '')) {
    if (!dati.length) return route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: '0 righe' }) });
    return json(dati[0]);
  }
  return json(dati, { 'content-range': `0-${Math.max(dati.length - 1, 0)}/${dati.length}` });
}
const ora = Math.floor(Date.now() / 1000);
const utente = { id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'prova@esempio.it', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const sessione = { access_token: 'a.b.c', token_type: 'bearer', expires_in: 3600, expires_at: ora + 3600, refresh_token: 'r', user: utente };

/* ---------- pagine da provare ---------- */
const TUTTE = ['', 'cerca', 'calendario', 'pagamenti', 'fratelli', 'fratelli/' + fratelli[0].id, 'bussanti', 'bussanti/nuovo', 'storia', 'verbali', 'lavori',
  'elezioni', 'piedilista', 'libromatricola', 'procedure', 'archivio', 'template', 'biblioteca', 'relazione', 'completa', 'loggia', 'utenti', 'sistema', 'registro', 'tornata', 'tornata/t2', 'rinnovi'];
const PROVE = [
  { ruolo: 'amministratore', pagine: TUTTE },
  { ruolo: 'venerabile', pagine: ['tornata/t0', 'rinnovi'] },
  { ruolo: 'segretario', pagine: ['', 'fratelli', 'procedure', 'tornata/t0'] },
  { ruolo: 'tesoriere', pagine: ['', 'pagamenti'] },
  { ruolo: 'fratello', pagine: ['', 'calendario', 'biblioteca', 'loggia'] },
];
const SCHERMI = [{ nome: 'computer', viewport: { width: 1366, height: 860 } }, { nome: 'telefono', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }];

(async () => {
  fs.rmSync(cartellaFoto, { recursive: true, force: true });
  fs.mkdirSync(cartellaFoto, { recursive: true });
  const sito = await avviaSito();
  const base = `http://127.0.0.1:${sito.address().port}/`;
  const browser = await chromium.launch();
  const problemi = [];
  let pagineProvate = 0;
  for (const schermo of SCHERMI) {
    for (const prova of PROVE) {
      const ctx = await browser.newContext({ viewport: schermo.viewport, isMobile: !!schermo.isMobile, hasTouch: !!schermo.hasTouch, serviceWorkers: 'block', locale: 'it-IT', timezoneId: 'Europe/Rome' });
      await ctx.route(FINTO + '/**', (r) => rispostaSupabase(r, prova.ruolo));
      await ctx.addInitScript((s) => { localStorage.setItem('sb-finto-auth-token', s); }, JSON.stringify(sessione));
      const pg = await ctx.newPage();
      let errori = [];
      pg.on('pageerror', (e) => errori.push(String(e.message || e)));
      pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errori.push(m.text()); });
      for (const h of prova.pagine) {
        errori = [];
        const nome = `${schermo.nome}_${prova.ruolo}_${(h || 'cruscotto').replace(/\//g, '-').replace(/-0{8}.*$/, '-scheda')}`;
        await pg.goto(base + '#/' + h);
        try { await pg.waitForFunction(() => { const v = document.querySelector('#view'); return v && !v.querySelector('.sk-wrap, .spin') && v.textContent.trim().length > 0; }, null, { timeout: 8000 }); } catch (e) { /* si controlla sotto */ }
        await pg.waitForTimeout(400);
        const esito = await pg.evaluate((telefono) => {
          const v = document.querySelector('#view');
          const fuori = [];
          if (document.documentElement.scrollWidth > window.innerWidth + 1) fuori.push('la pagina scorre di lato (' + document.documentElement.scrollWidth + ' px su ' + window.innerWidth + ')');
          if (!telefono) document.querySelectorAll('#view .table-wrap').forEach((t, i) => { if (t.scrollWidth > t.clientWidth + 2) fuori.push('tabella ' + (i + 1) + ' esce dal riquadro di ' + (t.scrollWidth - t.clientWidth) + ' px'); });
          return { vuota: !v || !v.textContent.trim(), errore: !!(v && /Si è verificato un errore|Pagina non trovata|non ha accesso/.test(v.textContent)), testo: v ? v.textContent.trim().slice(0, 140) : '', fuori };
        }, !!schermo.isMobile);
        await pg.screenshot({ path: path.join(cartellaFoto, nome + '.png'), fullPage: true });
        // ogni campo per scegliere un file deve essere visibile, oppure avere un pulsante (label) che lo apre
        const fileNascosti = async () => pg.evaluate(() => [...document.querySelectorAll('input[type=file]')]
          .filter((i) => i.offsetParent === null && !(i.id && document.querySelector('label.btn[for="' + i.id + '"]')))
          .map((i) => i.id || i.name || 'senza nome'));
        if (prova.ruolo === 'fratello' && h === '' && await pg.$('#tv-carica')) {
          await pg.click('#tv-carica'); await pg.waitForTimeout(200);
          await pg.screenshot({ path: path.join(cartellaFoto, nome + '_carica-tavola.png') });
          (await fileNascosti()).forEach((x) => esito.fuori.push('campo file nascosto senza pulsante: ' + x));
          await pg.click('.modal [data-x]');
        } else (await fileNascosti()).forEach((x) => esito.fuori.push('campo file nascosto senza pulsante: ' + x));
        pagineProvate++;
        const elenco = [];
        if (esito.vuota) elenco.push('pagina vuota');
        if (esito.errore) elenco.push('messaggio di errore: ' + esito.testo);
        errori.forEach((e) => elenco.push('errore JavaScript: ' + e.slice(0, 200)));
        esito.fuori.forEach((f) => elenco.push(f));
        if (elenco.length) problemi.push(nome + '\n   - ' + elenco.join('\n   - '));
        console.log((elenco.length ? 'KO  ' : 'OK  ') + nome);
      }
      await ctx.close();
    }
  }
  await browser.close();
  sito.close();
  console.log(`\n${pagineProvate} pagine provate, foto in test/foto/risultati`);
  if (problemi.length) { console.error('\nProblemi trovati:\n' + problemi.join('\n')); process.exit(1); }
  console.log('Nessun problema trovato');
})().catch((e) => { console.error(e); process.exit(1); });
