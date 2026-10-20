/* Lemmi - compilazione del pacchetto elettorale GOI (ed. 2024): verbale di elezione (pagg. 1-3) e autocertificazioni (pagg. 4-5).
 * Scrive sopra le pagine del modello ufficiale (templates/ELEZIONI.pdf). Firme e date restano in bianco. */
(function (root) {
  'use strict';
  const H = 842;

  // sostituisce i caratteri che i caratteri standard del PDF non sanno disegnare
  const pulisci = (s) => String(s == null ? '' : s).normalize('NFC').replace(/[^\x20-\x7E\u00A0-\u00FF\u2019\u2018\u201C\u201D\u2013\u2014\u2026\u20AC\u2022]/g, '?');

  async function compila(bytes, d) {
    const { PDFDocument, StandardFonts, rgb } = root.PDFLib;
    const doc = await PDFDocument.load(bytes);
    const pg = doc.getPages();
    const fh = await doc.embedFont(StandardFonts.Helvetica);
    const ft = await doc.embedFont(StandardFonts.TimesRoman);
    const ftb = await doc.embedFont(StandardFonts.TimesRomanBold);
    const nero = rgb(0.05, 0.05, 0.35);   // inchiostro blu scuro: si distingue dal modello stampato

    // scrive su una riga puntinata: p = pagina (1..5), x = inizio, y = bordo alto della riga (come nel modello), w = larghezza utile
    const scrivi = (p, x, y, testo, w, size) => {
      const s = pulisci(testo).trim();
      if (!s) return;
      let sz = size || 9.5;
      while (sz > 6 && fh.widthOfTextAtSize(s, sz) > w) sz -= 0.25;
      pg[p - 1].drawText(s, { x, y: H - y - 10.4, size: sz, font: fh, color: nero });
    };
    const rifai = (p, x0, y0, x1, y1, testo, bold) => {   // copre un testo stampato (anno) e lo riscrive
      const page = pg[p - 1], h = y1 - y0;
      page.drawRectangle({ x: x0 - 0.6, y: H - y1 + 0.4, width: x1 - x0 + 1.4, height: h - 0.4, color: rgb(1, 1, 1) });
      page.drawText(pulisci(testo), { x: x0, y: H - y0 - h * 0.8, size: h / 1.17, font: bold ? ftb : ft, color: rgb(0, 0, 0) });
    };

    const am = String(d.annoMassonico);
    rifai(1, 334.1, 219.9, 357.5, 233.2, am, true);
    rifai(1, 470.0, 347.1, 494.4, 359.3, am + '.', false);
    rifai(1, 370.8, 730.6, 392.3, 742.8, am, false);

    /* ---- pagina 1: intestazione, cariche, presenze, elezione del Venerabile ---- */
    const l = d.loggia || {};
    scrivi(1, 116, 289, l.nome, 312); scrivi(1, 456, 289, l.numero, 40);
    scrivi(1, 127, 302, l.oriente, 210);
    scrivi(1, 140, 333, d.giorno, 68); scrivi(1, 272, 333, d.mese, 97); scrivi(1, 437, 333, d.anno2, 20);
    const c = d.cariche || {};
    scrivi(1, 183, 377, c.mv, 270); scrivi(1, 164, 391, c.s1, 290); scrivi(1, 164, 405, c.s2, 290);
    scrivi(1, 131, 419, c.oratore, 322); scrivi(1, 143, 433, c.segretario, 310); scrivi(1, 139, 447, c.tesoriere, 313);
    scrivi(1, 217, 462, d.presenti, 110); scrivi(1, 224, 476, d.giustificati, 75);
    scrivi(1, 225, 594, d.votanti, 30); scrivi(1, 374, 594, d.maggioranza, 28);
    const yMv = [610, 625, 640, 655, 670];
    ((d.mv && d.mv.righe) || []).slice(0, 5).forEach((r, i) => { scrivi(1, 129, yMv[i], r.nome, 205); scrivi(1, 448, yMv[i] + (i >= 2 ? 1 : 0), r.voti, 54); });
    scrivi(1, 183, 701, d.mv && d.mv.nulli, 58);
    scrivi(1, 100, 770, d.proclamati && d.proclamati.mv, 385);

    /* ---- pagina 2: elezione dei Dignitari ---- */
    scrivi(2, 107, 93, d.votanti, 30); scrivi(2, 256, 93, d.maggioranza, 28);
    const blocchi = { s1: [141, 153, 165, 178, 188, 200], s2: [236, 248, 260, 273, 283, 295], oratore: [330, 342, 354, 367, 378, 390], tesoriere: [414, 426, 438, 450.5, 461, 473] };
    Object.keys(blocchi).forEach((k) => {
      const ys = blocchi[k], b = (d.dign && d.dign[k]) || {};
      (b.righe || []).slice(0, 5).forEach((r, i) => { scrivi(2, 164, ys[i], r.nome, 152); scrivi(2, 413, ys[i], r.voti, 54); });
      scrivi(2, 365, ys[5], b.nulli, 57);
    });
    const pr = d.proclamati || {};
    scrivi(2, 222, 544, pr.s1, 276); scrivi(2, 222, 559, pr.s2, 276); scrivi(2, 222, 574, pr.oratore, 276); scrivi(2, 222, 589, pr.tesoriere, 276);

    /* ---- pagina 3: firme dei Maestri presenti (a mano) ---- */

    /* ---- pagina 4: autocertificazione del Maestro Venerabile ---- */
    const a = d.autocert || {};
    const m = a.mv || {};
    scrivi(4, 140, 498, m.nome, 370, 10.5);
    scrivi(4, 91, 525, m.luogo, 258); scrivi(4, 368, 525, m.nascita, 140);
    scrivi(4, 110, 550, m.citta, 395);
    scrivi(4, 92, 575, m.via, 252); scrivi(4, 368, 575, m.tel, 133);
    scrivi(4, 93, 600, m.email, 395);
    scrivi(4, 80, 625, m.cf, 245);
    scrivi(4, 155, 650, m.attivita, 350);

    /* ---- pagina 5: autocertificazione dei Dignitari ---- */
    const ys5 = { s1: [330, 347, 364, 379, 396], s2: [437, 454, 471, 487, 504], oratore: [545, 562, 579, 594, 612], tesoriere: [653, 670, 686, 703, 720] };
    Object.keys(ys5).forEach((k) => {
      const y = ys5[k], x = a[k] || {};
      scrivi(5, 138, y[0], x.nome, 366, 10);
      scrivi(5, 86, y[1], x.luogo, 120); scrivi(5, 222, y[1], x.nascita, 70); scrivi(5, 347, y[1], x.citta, 158);
      scrivi(5, 91, y[2], x.via, 285); scrivi(5, 404, y[2], x.tel, 106);
      scrivi(5, 87, y[3], x.email, 205); scrivi(5, 322, y[3], x.cf, 183);
      scrivi(5, 147, y[4], x.attivita, 145);
    });

    return doc.save();
  }

  root.LemmiElezioniPdf = { compila };
})(typeof window !== 'undefined' ? window : globalThis);
