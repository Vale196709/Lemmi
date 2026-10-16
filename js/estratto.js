/* Lemmi - lettura degli estratti conto bancari (xls, xlsx, csv).
 * Riconosce da solo la riga delle intestazioni e le colonne; l'utente può correggere l'abbinamento. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('xlsx'));
  else root.LemmiEstratto = factory(root.XLSX);
})(typeof self !== 'undefined' ? self : this, function (XLSX) {
  'use strict';

  const norm = (s) => String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const lettera = (i) => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

  /* ---------- lettura del file ---------- */
  function decodificaTesto(buffer) {
    let t = new TextDecoder('utf-8').decode(buffer);
    if (t.includes('\uFFFD')) t = new TextDecoder('windows-1252').decode(buffer);
    return t.replace(/^\uFEFF/, '');
  }

  function leggiCsv(testo) {
    const righe = testo.split(/\r\n|\n|\r/).filter((r) => r.trim() !== '');
    const campione = righe.slice(0, 8).join('\n');
    const conta = (c) => (campione.match(new RegExp(c === '\t' ? '\\t' : '\\' + c, 'g')) || []).length;
    const sep = [';', '\t', ','].sort((a, b) => conta(b) - conta(a))[0];
    return righe.map((r) => {
      const out = []; let cur = ''; let q = false;
      for (let i = 0; i < r.length; i++) {
        const ch = r[i];
        if (q) { if (ch === '"') { if (r[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true;
        else if (ch === sep) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out.map((c) => c.trim());
    });
  }

  /* buffer: ArrayBuffer ; nome: nome del file. Restituisce la griglia (array di righe). */
  function leggiFile(buffer, nome) {
    if (/\.(csv|txt)$/i.test(nome || '')) return leggiCsv(decodificaTesto(buffer));
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false });
    if (!wb.SheetNames.length) throw new Error('Il file non contiene fogli.');
    let migliore = null;
    wb.SheetNames.forEach((n) => {
      const g = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '', blankrows: false });
      if (!migliore || g.length > migliore.length) migliore = g;
    });
    return migliore;
  }

  /* ---------- conversione dei valori ---------- */
  function parseData(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
    let y, m, d;
    if (typeof v === 'number') {
      if (v < 20000 || v > 80000) return null;
      const p = XLSX.SSF.parse_date_code(v);
      if (!p) return null;
      y = p.y; m = p.m; d = p.d;
    } else {
      const t = String(v).trim();
      let r = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)/.exec(t);
      if (r) { d = +r[1]; m = +r[2]; y = +r[3]; if (y < 100) y += 2000; }
      else if ((r = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) { y = +r[1]; m = +r[2]; d = +r[3]; }
      else return null;
    }
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1990 || y > 2100) return null;
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function parseImporto(v) {
    if (typeof v === 'number') return isFinite(v) ? Math.round(v * 100) / 100 : null;
    let t = String(v === null || v === undefined ? '' : v).trim();
    if (!t) return null;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    t = t.replace(/eur|€|\s/gi, '').replace(/[\u2212\u2013]/g, '-');
    if (t.startsWith('-')) { neg = true; t = t.slice(1); }
    if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
    if (t.startsWith('+')) t = t.slice(1);
    const c = t.lastIndexOf(','), p = t.lastIndexOf('.');
    if (c >= 0 && p >= 0) t = c > p ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (c >= 0) t = t.replace(',', '.');
    else if (p >= 0 && !/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    const n = Math.round(Number(t) * 100) / 100;
    return neg ? -n : n;
  }

  /* ---------- riconoscimento delle colonne ---------- */
  function tipoColonna(h) {
    const t = norm(h);
    if (!t) return null;
    if (/valuta/.test(t)) return 'valuta';
    if (/^data/.test(t)) return 'data';
    if (/saldo/.test(t)) return 'saldo';
    if (/^importo|^importi/.test(t)) return 'importo';
    if (/^dare|addebit|^uscit|^debit/.test(t)) return 'dare';
    if (/^avere|accredit|^entrat|^credit/.test(t)) return 'avere';
    if (/descrizion|causale|dettagl|operazione|movimento|motivo|beneficiar|ordinante/.test(t)) return 'descrizione';
    if (/^cro|^trn|riferiment/.test(t)) return 'riferimento';
    return null;
  }

  function cercaIntestazione(griglia) {
    let migliore = -1, punti = 0;
    griglia.slice(0, 80).forEach((riga, i) => {
      const tipi = new Set(riga.map(tipoColonna).filter(Boolean));
      if (!tipi.has('data')) return;
      if (!(tipi.has('importo') || tipi.has('dare') || tipi.has('avere'))) return;
      const p = tipi.size;
      if (p > punti) { punti = p; migliore = i; }
    });
    return migliore;
  }

  function mappaAutomatica(intestazione) {
    const m = { data: null, valuta: null, descrizione: [], importo: null, dare: null, avere: null, saldo: null, riferimento: null };
    intestazione.forEach((h, i) => {
      const t = tipoColonna(h);
      if (!t) return;
      if (t === 'descrizione') m.descrizione.push(i);
      else if (m[t] === null) m[t] = i;
    });
    return m;
  }

  /* ---------- estrazione dei movimenti ---------- */
  function estrai(griglia, rigaIntestazione, mappa) {
    const movimenti = [];
    let scartate = 0;
    const occorrenze = {};
    for (let i = rigaIntestazione + 1; i < griglia.length; i++) {
      const r = griglia[i];
      const data = mappa.data === null ? null : parseData(r[mappa.data]);
      let importo = null;
      if (mappa.importo !== null && mappa.importo !== undefined) importo = parseImporto(r[mappa.importo]);
      else {
        const dare = mappa.dare !== null && mappa.dare !== undefined ? parseImporto(r[mappa.dare]) : null;
        const avere = mappa.avere !== null && mappa.avere !== undefined ? parseImporto(r[mappa.avere]) : null;
        if (dare) importo = -Math.abs(dare);
        else if (avere) importo = Math.abs(avere);
      }
      if (!data || importo === null || importo === 0) { if (r.some((c) => String(c).trim() !== '')) scartate++; continue; }
      const parti = [];
      (mappa.descrizione || []).forEach((c) => { const t = String(r[c] === undefined ? '' : r[c]).replace(/\s+/g, ' ').trim(); if (t && !parti.includes(t)) parti.push(t); });
      const descrizione = parti.join(' - ');
      const saldo = mappa.saldo !== null && mappa.saldo !== undefined ? parseImporto(r[mappa.saldo]) : null;
      const valuta = mappa.valuta !== null && mappa.valuta !== undefined ? parseData(r[mappa.valuta]) : null;
      const rif = mappa.riferimento !== null && mappa.riferimento !== undefined ? String(r[mappa.riferimento] === undefined ? '' : r[mappa.riferimento]).trim() : '';
      const base = [data, importo.toFixed(2), norm(descrizione), saldo === null ? '' : saldo.toFixed(2)].join('|');
      occorrenze[base] = (occorrenze[base] || 0) + 1;
      movimenti.push({ data_operazione: data, data_valuta: valuta, descrizione: descrizione || '(senza descrizione)', importo, saldo, riferimento_banca: rif || null, impronta: base + '|' + occorrenze[base] });
    }
    return { movimenti, scartate };
  }

  function riepilogo(movimenti) {
    const date = movimenti.map((x) => x.data_operazione).sort();
    return {
      righe: movimenti.length, dal: date[0] || null, al: date[date.length - 1] || null,
      entrate: movimenti.filter((x) => x.importo > 0).reduce((a, x) => a + x.importo, 0),
      uscite: movimenti.filter((x) => x.importo < 0).reduce((a, x) => a + Math.abs(x.importo), 0),
    };
  }

  /* Analisi completa: trova da sola intestazione e colonne */
  function analizza(griglia) {
    const riga = cercaIntestazione(griglia);
    if (riga < 0) return { riconosciuto: false, griglia, rigaIntestazione: 0, mappa: mappaAutomatica([]), etichette: (griglia[0] || []).map((c, i) => String(c || 'Colonna ' + lettera(i))), movimenti: [], scartate: 0 };
    const mappa = mappaAutomatica(griglia[riga]);
    const etichette = griglia[riga].map((c, i) => (String(c).trim() ? String(c).trim() : 'Colonna ' + lettera(i)));
    const { movimenti, scartate } = estrai(griglia, riga, mappa);
    return { riconosciuto: true, griglia, rigaIntestazione: riga, mappa, etichette, movimenti, scartate };
  }

  return { leggiFile, analizza, estrai, riepilogo, parseData, parseImporto, lettera, norm };
});
