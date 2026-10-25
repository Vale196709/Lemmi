/* Lemmi - compilazione del pacchetto di insediamento GOI (ed. 2024): promessa solenne, nomina del Segretario e degli Ufficiali,
 * verbale di trapasso dei poteri, relazione sui lavori, conto gestione, aggiornamenti. Firme e date restano in bianco.
 * Pagine del modello: 1 promessa, 2 nomina Segretario, 3 nomina Ufficiali, 4 trapasso, 5 relazione, 6 conto gestione, 7 aggiornamenti. */
(function (root) {
  'use strict';
  const H = 842;
  const pulisci = (s) => String(s == null ? '' : s).normalize('NFC').replace(/[^\x20-\x7E\u00A0-\u00FF\u2019\u2018\u201C\u201D\u2013\u2014\u2026\u20AC\u2022]/g, '?');

  async function compila(bytes, d) {
    const { PDFDocument, StandardFonts, rgb } = root.PDFLib;
    const doc = await PDFDocument.load(bytes);
    const pg = doc.getPages();
    const fh = await doc.embedFont(StandardFonts.Helvetica);
    const ft = await doc.embedFont(StandardFonts.TimesRoman);
    const ftb = await doc.embedFont(StandardFonts.TimesRomanBold);
    const nero = rgb(0.05, 0.05, 0.35), bianco = rgb(1, 1, 1);

    const scrivi = (p, x, y, testo, w, size) => {
      const s = pulisci(testo).trim(); if (!s) return;
      let sz = size || 9.5;
      while (sz > 6 && fh.widthOfTextAtSize(s, sz) > w) sz -= 0.25;
      pg[p - 1].drawText(s, { x, y: H - y - 10.4, size: sz, font: fh, color: nero });
    };
    // riscrive un anno stampato nel modello
    const rifai = (p, x0, y0, x1, y1, testo, bold) => {
      const h = y1 - y0;
      pg[p - 1].drawRectangle({ x: x0 - 0.6, y: H - y1 + 0.4, width: x1 - x0 + 1.4, height: h - 0.4, color: bianco });
      pg[p - 1].drawText(pulisci(testo), { x: x0, y: H - y0 - h * 0.8, size: h / 1.17, font: bold ? ftb : ft, color: rgb(0, 0, 0) });
    };
    // paragrafo a capo automatico (si restringe finché sta nello spazio)
    const paragrafo = (p, font, x, yTop, larg, altezzaMax, testo, size, passo, colore) => {
      const parole = pulisci(testo).split(/\s+/).filter(Boolean);
      let sz = size, righe;
      for (;;) {
        righe = []; let riga = '';
        parole.forEach((w) => { const t = riga ? riga + ' ' + w : w; if (font.widthOfTextAtSize(t, sz) > larg && riga) { righe.push(riga); riga = w; } else riga = t; });
        if (riga) righe.push(riga);
        if (righe.length * (passo * sz / size) <= altezzaMax || sz <= 7) break;
        sz -= 0.5;
      }
      const pas = passo * sz / size;
      righe.forEach((r, i) => pg[p - 1].drawText(r, { x, y: H - yTop - sz - i * pas, size: sz, font, color: colore || rgb(0, 0, 0) }));
      return righe.length * pas;
    };
    const l = d.loggia || {};
    const intestaz = (p, yNome, yOr, xNome) => { scrivi(p, xNome || 101, yNome, l.nome, 330); scrivi(p, 454, yNome, l.numero, 62); scrivi(p, 114, yOr, l.oriente, 395); };

    /* 1 - Promessa solenne */
    scrivi(1, 96, 310, l.nome, 326); scrivi(1, 463, 310, l.numero, 36); scrivi(1, 165, 336, l.oriente, 262);

    /* 2 - Nomina del Segretario + autocertificazione */
    intestaz(2, 185, 206);
    scrivi(2, 292, 268, d.dataInsediamento, 128); scrivi(2, 212, 289, d.dataTornata, 117);
    const s = d.segretario || {};
    scrivi(2, 82, 310, s.nome, 448, 10);
    scrivi(2, 151, 385, s.nome, 358, 10);
    scrivi(2, 91, 405, s.luogo, 152); scrivi(2, 259, 405, s.nascita, 86); scrivi(2, 406, 405, s.citta, 112);
    scrivi(2, 99, 426, s.via, 197); scrivi(2, 369, 426, s.tel, 147);
    scrivi(2, 93, 446, s.email, 222); scrivi(2, 346, 446, s.cf, 163);
    scrivi(2, 164, 466, s.attivita, 343);

    /* 3 - Nomina degli Ufficiali */
    intestaz(3, 228, 249);
    scrivi(3, 292, 325, d.dataInsediamento, 128); scrivi(3, 238, 344, d.dataTornata, 116);
    const yUff = [401, 423, 446, 468, 491, 513, 535, 558, 580, 602, 625, 647, 669];
    const chiavi = ['segretarioAgg', 'oratoreAgg', 'tesoriereAgg', 'esperto', 'maestroCerimonie', 'primoDiacono', 'secondoDiacono', 'portastendardo', 'ospedaliere', 'elemosiniere', 'copritoreInterno', 'copritoreEsterno', 'architettoRevisore'];
    chiavi.forEach((k, i) => scrivi(3, 260, yUff[i], (d.ufficiali || {})[k], 163));

    /* 4 - Verbale di trapasso dei poteri (parte alta: Venerabile nuovo; parte bassa: Venerabile confermato) */
    const t = d.trapasso || {};
    const annoNuovo = String(d.annoMassonico), annoPrec = String(d.annoMassonico - 1);
    const bassa = t.tipo === 'confermato';
    const dy = bassa ? 415 : 0;   // la parte bassa è la stessa riga spostata di 415 punti
    scrivi(4, 94, 109 + dy, t.anno, 29); scrivi(4, 152, 109 + dy, t.giorno, 30); scrivi(4, 241, 109 + dy, t.mese, 198);
    scrivi(4, 109, 124 + dy, l.nome, 172); scrivi(4, 301, 124 + dy, l.numero, 33); scrivi(4, 401, 124 + dy, l.oriente, 76);
    scrivi(4, bassa ? 159 : 160, bassa ? 566 : 152, t.dataNullaOsta, 100);
    // anni stampati nel modello (2025 / 2024): si riscrivono
    if (bassa) rifai(4, 384.5, 553.7, 409.2, 565.9, annoNuovo + ',');
    else { rifai(4, 384.7, 137.6, 409.3, 149.8, annoNuovo + ','); rifai(4, 293.8, 235.1, 318.5, 247.2, annoPrec + ';'); rifai(4, 305.5, 248.1, 329.9, 260.2, annoPrec + '.'); }
    // riferimento alla circolare GOI: se indicato, si riscrive il paragrafo che la cita
    if (t.circolare && t.circolare.trim()) {
      const frase = bassa
        ? "Il Maestro Venerabile dà atto con il presente verbale di aver preso visione della Circolare GOI " + t.circolare.trim() + ", per l'osservanza precisa delle disposizioni in essa contenute."
        : "Il Maestro Venerabile subentrante dà atto - con il presente verbale - di aver preso visione della Circolare GOI " + t.circolare.trim() + ", per l'osservanza precisa delle disposizioni in essa contenute.";
      const y0 = bassa ? 629.5 : 299.5, y1 = bassa ? 656 : 326;
      pg[3].drawRectangle({ x: 56, y: H - y1, width: 486, height: y1 - y0, color: bianco });
      paragrafo(4, ft, 57, y0 + 0.5, 482, y1 - y0 + 1.5, frase, 11, 13.4);
    }

    /* 5 - Relazione sui lavori */
    scrivi(5, 99, 240, l.nome, 166); scrivi(5, 284, 240, l.numero, 38); scrivi(5, 368, 240, l.oriente, 141);
    rifai(5, 353.5, 305.1, 377.0, 318.4, annoPrec, true);
    if (d.relazione) paragrafo(5, ft, 60, 350, 476, 400, d.relazione, 11, 14.2);

    /* 6 - Conto gestione */
    rifai(6, 400, 113.0, 424, 126.3, annoPrec);
    const c = d.conto || {};
    const L1 = 218, R1 = 463, wv = 62;
    const v = (k) => c[k];
    scrivi(6, L1, 301, v('capitazioni'), wv); scrivi(6, L1, 316, v('quoteIniz'), wv); scrivi(6, L1, 349, v('oblazioni'), wv); scrivi(6, L1, 365, v('residuoPrec'), wv); scrivi(6, L1, 397, v('totEntrate'), wv, 10);
    scrivi(6, R1, 300, v('capGoi'), wv); scrivi(6, R1, 315, v('quoteNo'), wv); scrivi(6, R1, 330, v('capCollegio'), wv); scrivi(6, R1, 347, v('speseLocali'), wv); scrivi(6, R1, 362, v('speseGestione'), wv);
    scrivi(6, R1, 395, v('totUscite'), wv, 10); scrivi(6, R1, 411, v('accLoggia'), wv);
    scrivi(6, L1, 501, v('troncoEntrate'), wv);
    scrivi(6, R1, 495, v('beneficenza'), wv); scrivi(6, R1, 512, v('accTronco'), wv); scrivi(6, R1, 527, v('pareggio'), wv, 10);

    /* 7 - Aggiornamenti */
    rifai(7, 354.5, 79.7, 385.9, 97.3, annoNuovo, true);
    const a = d.aggiornamenti || {};
    scrivi(7, 101, 160, l.nome, 330); scrivi(7, 454, 160, l.numero, 62); scrivi(7, 114, 193, l.oriente, 395);
    scrivi(7, 192, 226, a.cf, 330);
    scrivi(7, 65, 325, a.indirizzo1, 458); scrivi(7, 65, 360, a.indirizzo2, 455);
    scrivi(7, 163, 404, a.giorni, 360);
    const co = a.corrispondenza || {};
    scrivi(7, 155, 572, co.nome, 370); scrivi(7, 86, 603, co.via, 440); scrivi(7, 122, 634, co.capCitta, 400);

    return doc.save();
  }

  /* Estrae alcune pagine in un nuovo PDF (es. per le diverse destinazioni di invio) */
  async function estrai(bytes, indici) {
    const { PDFDocument } = root.PDFLib;
    const src = await PDFDocument.load(bytes), out = await PDFDocument.create();
    const pagine = await out.copyPages(src, indici);
    pagine.forEach((p) => out.addPage(p));
    return out.save();
  }

  root.LemmiInsediamentoPdf = { compila, estrai };
})(typeof window !== 'undefined' ? window : globalThis);
