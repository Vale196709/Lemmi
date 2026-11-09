// Funzioni di servizio per le prove: nessuna di queste fa parte dell'app.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const radice = path.resolve(__dirname, '..');
const leggi = (p) => fs.readFileSync(path.join(radice, p), 'utf8');

// Libreria zip.js come la carica il browser (script semplice che definisce "zip")
function caricaZip() {
  const ctx = vm.createContext({ console, TextEncoder, TextDecoder, crypto: globalThis.crypto, Blob, Response, URL, setTimeout, clearTimeout,
    ReadableStream, WritableStream, TransformStream, CompressionStream, DecompressionStream, Promise, Uint8Array, ArrayBuffer, DataView, Date, Map, Set });
  ctx.globalThis = ctx;
  vm.runInContext(leggi('vendor/zip-no-worker.min.js'), ctx);
  ctx.zip.configure({ useWebWorkers: false });
  return ctx.zip;
}

// Pagina finta con gli script indicati caricati, e i dati dei luoghi disponibili come se arrivassero dal sito
function pagina(html, script, opzioni) {
  const dom = new JSDOM(html || '<div id="v"></div>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;           // nei browser veri esistono già
  if (!w.crypto || !w.crypto.subtle) w.crypto = globalThis.crypto;
  w.fetch = async (u) => {
    if (/luoghi\.json/.test(String(u))) return { ok: true, json: async () => JSON.parse(leggi('data/luoghi.json')) };
    throw new Error('rete non disponibile nelle prove: ' + u);
  };
  if (opzioni && opzioni.prima) opzioni.prima(w);
  (script || []).forEach((s) => w.eval(leggi(s)));
  return w;
}

const evento = (w, el, tipo) => el.dispatchEvent(new w.Event(tipo, { bubbles: true }));
module.exports = { radice, leggi, caricaZip, pagina, evento };
