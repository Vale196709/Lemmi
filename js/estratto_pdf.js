/* Lemmi - lettura dell'estratto conto BancoPosta in PDF.
 * Ricostruisce i movimenti dalla posizione del testo sulla pagina (colonne Addebiti / Accrediti) e li confronta
 * con i totali stampati dalla banca: se non quadrano, l'importazione si ferma. Il file resta sul computer. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LemmiEstrattoPdf = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const RE_DATA = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/;
  const RE_IMPORTO = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;
  const iso = (t) => { const m = RE_DATA.exec(t); if (!m) return null; const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return y + '-' + m[2] + '-' + m[1]; };
  const num = (t) => { const neg = t.startsWith('-'); const n = Number(t.replace(/^-/, '').replace(/\./g, '').replace(',', '.')); return Math.round((neg ? -n : n) * 100) / 100; };
  const cent = (x) => Math.round(x * 100);

  /* Estrae il codice di riferimento (TRN) dalla descrizione */
  function riferimento(descr) {
    const m = /\bTRN\s+(\S+)(?:\s+(\S+))?/i.exec(descr);
    if (!m) return null;
    const cifre = (t) => (t || '').replace(/\D/g, '').length;
    return cifre(m[2]) > cifre(m[1]) ? m[2] : m[1];
  }

  /* pagine: [{ larghezza, items: [{ s, x, y, w }] }]  (coordinate PDF: y cresce verso l'alto) */
  function analizzaPagine(pagine) {
    const movimenti = [];
    const banca = { saldoIniziale: null, saldoFinale: null, totaleEntrate: null, totaleUscite: null };
    let corrente = null;           // movimento in costruzione (per le righe di continuazione)
    let yPrec = null;

    pagine.forEach((pg) => {
      const W = pg.larghezza || 595;
      const xSplit = W * 0.45;     // oltre questa soglia l'importo è un accredito
      const xDesc = W * 0.54;      // la descrizione inizia a destra di questa soglia
      const righe = [];
      pg.items.filter((i) => String(i.s).trim() && i.y > 100).forEach((i) => {
        const k = Math.round(i.y * 2) / 2;
        let r = righe.find((q) => Math.abs(q.y - k) < 1.2);
        if (!r) { r = { y: k, items: [] }; righe.push(r); }
        r.items.push(i);
      });
      righe.sort((a, b) => b.y - a.y);
      corrente = null; yPrec = null;

      righe.forEach((r) => {
        const it = r.items.sort((a, b) => a.x - b.x);
        const date = it.filter((i) => i.x < xDesc && RE_DATA.test(i.s.trim()));
        const importi = it.filter((i) => i.x + i.w < xDesc + 2 && RE_IMPORTO.test(i.s.trim()));
        const desc = it.filter((i) => i.x >= xDesc - 1).map((i) => i.s.trim()).join(' ').replace(/\s+/g, ' ').trim();
        if (date.length && (importi.length || /^(totale|saldo)/i.test(desc))) {
          const imp = importi[0];
          const valore = imp ? num(imp.s.trim()) : null;
          const credito = imp ? imp.x + imp.w > xSplit : false;
          const d = norm(desc);
          if (/^saldo iniziale/.test(d)) { banca.saldoIniziale = valore; corrente = null; return; }
          if (/^saldo finale/.test(d)) { banca.saldoFinale = valore; corrente = null; return; }
          if (/^totale uscite/.test(d)) { banca.totaleUscite = valore; corrente = null; return; }
          if (/^totale entrate/.test(d)) { banca.totaleEntrate = valore; corrente = null; return; }
          if (valore === null || valore === 0) { corrente = null; return; }
          corrente = {
            data_operazione: iso(date[0].s.trim()), data_valuta: date[1] ? iso(date[1].s.trim()) : null,
            descrizione: desc, importo: credito ? Math.abs(valore) : -Math.abs(valore), saldo: null,
          };
          movimenti.push(corrente);
          yPrec = r.y;
        } else if (corrente && desc && !date.length && it.every((i) => i.x >= xDesc - 1) && Math.abs(it[0].x - xDesc) < 12 && yPrec !== null && yPrec - r.y < 14) {
          corrente.descrizione += ' ' + desc;
          yPrec = r.y;
        } else {
          corrente = null;
        }
      });
    });

    const occ = {};
    movimenti.forEach((m) => {
      m.descrizione = m.descrizione.replace(/\s+/g, ' ').trim();
      m.riferimento_banca = riferimento(m.descrizione);
      const base = [m.data_operazione, m.importo.toFixed(2), norm(m.descrizione), ''].join('|');
      occ[base] = (occ[base] || 0) + 1;
      m.impronta = base + '|' + occ[base];
    });
    return { movimenti, banca, verifica: verifica(movimenti, banca) };
  }

  /* Confronto con i totali stampati dalla banca */
  function verifica(movimenti, b) {
    const cred = movimenti.filter((m) => m.importo > 0).reduce((a, m) => a + cent(m.importo), 0);
    const deb = movimenti.filter((m) => m.importo < 0).reduce((a, m) => a + cent(-m.importo), 0);
    const prove = [], errori = [];
    if (b.totaleEntrate !== null) (cent(b.totaleEntrate) === cred ? prove : errori).push('totale entrate');
    if (b.totaleUscite !== null) (cent(b.totaleUscite) === deb ? prove : errori).push('totale uscite');
    if (b.saldoIniziale !== null && b.saldoFinale !== null) (cent(b.saldoIniziale) + cred - deb === cent(b.saldoFinale) ? prove : errori).push('saldo finale');
    return {
      ok: movimenti.length > 0 && errori.length === 0 && prove.length > 0,
      verificati: prove, falliti: errori, entrate: cred / 100, uscite: deb / 100,
      senzaTotali: prove.length + errori.length === 0,
    };
  }

  /* Lettura del file con pdf.js (lib = window.pdfjsLib nel browser) */
  async function leggi(buffer, lib) {
    const doc = await lib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
    const pagine = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.getPage(p);
      const tc = await pg.getTextContent();
      pagine.push({ larghezza: pg.view[2] - pg.view[0], items: tc.items.map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width })) });
    }
    if (!pagine.some((p) => p.items.length)) throw new Error('Il PDF non contiene testo leggibile (è una scansione?). Usa il file Excel o CSV della banca.');
    return analizzaPagine(pagine);
  }

  return { leggi, analizzaPagine, verifica, riferimento };
});
