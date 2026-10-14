/* Lemmi - compilazione dei modelli GOI (A/1 e C/1) sopra i PDF originali.
 * Funziona nel browser (usa PDFLib globale) e in Node (per i test). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('pdf-lib'));
  else root.LemmiPDF = factory(root.PDFLib);
})(typeof self !== 'undefined' ? self : this, function (PDFLib) {
  'use strict';
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const COLORE = rgb(0.04, 0.1, 0.38);

  /* ---------- utilità ---------- */
  function fmtData(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso);
  }

  // "Via Roma, 12" -> ["Via Roma", "12"]
  function dividiVia(ind) {
    if (!ind) return ['', ''];
    const i = ind.lastIndexOf(', ');
    return i < 0 ? [ind.trim(), ''] : [ind.slice(0, i).trim(), ind.slice(i + 2).trim()];
  }

  function pulisci(font, testo) {
    if (testo === null || testo === undefined) return '';
    let t = String(testo).normalize('NFC')
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
      .replace(/\s+/g, ' ').trim();
    let out = '';
    for (const ch of t) {
      try { font.encodeText(ch); out += ch; } catch (e) { out += '?'; }
    }
    return out;
  }

  /* Scrive 'testo' appoggiato alla riga di coordinata 'yb' (misurata dall'alto,
   * come in pdfplumber), riducendo il corpo se non entra in 'larghezza'. */
  function scrivi(ctx, pagina, testo, x, yb, larghezza, size) {
    let t = pulisci(ctx.font, testo);
    if (!t) return;
    let s = size || 10;
    while (s > 6.5 && ctx.font.widthOfTextAtSize(t, s) > larghezza) s -= 0.5;
    while (t.length > 1 && ctx.font.widthOfTextAtSize(t, s) > larghezza) t = t.slice(0, -1);
    pagina.drawText(t, { x, y: pagina.getHeight() - yb + 2.5, size: s, font: ctx.font, color: COLORE });
  }

  function croce(ctx, pagina, xCentro, ybCentro) {
    const s = 12, w = ctx.bold.widthOfTextAtSize('X', s);
    pagina.drawText('X', { x: xCentro - w / 2, y: pagina.getHeight() - ybCentro - s * 0.35, size: s, font: ctx.bold, color: COLORE });
  }

  /* Prepara i dati comuni ai due modelli */
  function preparaDati(b, loggia, presentatore) {
    const [via, civ] = dividiVia(b.indirizzo);
    const domVuoto = !b.domicilio_citta && !b.domicilio_indirizzo;
    const [dvia, dciv] = domVuoto ? [via, civ] : dividiVia(b.domicilio_indirizzo);
    const conProv = (c, p) => (c ? c + (p ? ' (' + p + ')' : '') : '');
    return {
      nomeCompleto: [b.cognome, b.nome].filter(Boolean).join(' '),
      nato: b.luogo_nascita || '',
      provNato: b.provincia_nascita || '',
      dataNato: fmtData(b.data_nascita),
      citta: conProv(b.citta, b.provincia), cap: b.cap || '', via, civ,
      domCitta: domVuoto ? conProv(b.citta, b.provincia) : conProv(b.domicilio_citta, b.domicilio_provincia),
      domCap: domVuoto ? (b.cap || '') : (b.domicilio_cap || ''),
      domVia: dvia, domCiv: dciv,
      cf: b.codice_fiscale || '', tel: b.cellulare || '', email: b.email || '',
      studio: b.titolo_studio || '', professione: b.professione || '',
      rlNome: (loggia && loggia.nome) || '', rlNum: (loggia && loggia.numero) || '',
      oriente: (loggia && loggia.oriente) || '',
      presentatore: presentatore || '',
      prov: b.provenienza || {},
    };
  }

  /* ---------- A/1 (5 pagine: compilo la 2 e la 3) ---------- */
  function compilaA1(ctx, doc, b, d) {
    const p2 = doc.getPage(1);
    scrivi(ctx, p2, d.rlNome, 108, 76.5, 360);
    scrivi(ctx, p2, d.rlNum, 494, 76.5, 52);
    scrivi(ctx, p2, d.oriente, 112, 93.5, 430);
    scrivi(ctx, p2, d.nomeCompleto, 190, 111, 355);
    scrivi(ctx, p2, d.nato, 82, 126.5, 218);
    scrivi(ctx, p2, d.provNato, 343, 126.5, 40);
    scrivi(ctx, p2, d.dataNato, 420, 126.5, 128);
    scrivi(ctx, p2, d.citta, 105, 143.5, 303);
    scrivi(ctx, p2, d.cap, 443, 143.5, 105);
    scrivi(ctx, p2, d.via, 70, 160.5, 378);
    scrivi(ctx, p2, d.civ, 468, 160.5, 80);
    scrivi(ctx, p2, d.domCitta, 110, 177.5, 298);
    scrivi(ctx, p2, d.domCap, 443, 177.5, 105);
    scrivi(ctx, p2, d.domVia, 70, 195, 378);
    scrivi(ctx, p2, d.domCiv, 468, 195, 80);
    scrivi(ctx, p2, d.cf, 115, 212, 432);
    scrivi(ctx, p2, d.tel, 129, 229.5, 180);
    scrivi(ctx, p2, d.email, 341, 229.5, 205);
    scrivi(ctx, p2, d.studio, 117, 246.5, 430);
    scrivi(ctx, p2, d.professione, 105, 271.5, 440);
    scrivi(ctx, p2, b.note_dichiarazioni, 92, 489, 445, 9);
    const rif = Array.isArray(b.referenti) ? b.referenti : [];
    [520, 535, 550].forEach((yb, i) => {
      const r = rif[i];
      if (r && (r.nome || r.indirizzo)) scrivi(ctx, p2, [r.nome, r.indirizzo].filter(Boolean).join(' - '), 66, yb, 415, 9);
    });
    scrivi(ctx, p2, d.presentatore, 130, 591, 355);

    const p3 = doc.getPage(2);
    scrivi(ctx, p3, d.nomeCompleto, 190, 100, 355);
    scrivi(ctx, p3, d.nato, 82, 117.5, 218);
    scrivi(ctx, p3, d.provNato, 343, 117.5, 40);
    scrivi(ctx, p3, d.dataNato, 420, 117.5, 128);
    scrivi(ctx, p3, d.citta, 105, 134.5, 303);
    scrivi(ctx, p3, d.cap, 443, 134.5, 105);
    scrivi(ctx, p3, d.via, 70, 151.5, 378);
    scrivi(ctx, p3, d.civ, 468, 151.5, 80);
    scrivi(ctx, p3, d.cf, 115, 168.5, 432);
    scrivi(ctx, p3, d.rlNome, 231, 194.5, 255);
    scrivi(ctx, p3, d.rlNum, 506, 194.5, 45);
    scrivi(ctx, p3, d.oriente, 109, 218.5, 438);
  }

  /* ---------- C/1 (2 pagine) ---------- */
  function compilaC1(ctx, doc, b, d) {
    const p1 = doc.getPage(0);
    scrivi(ctx, p1, fmtData(b.data_domanda), 440, 175, 88);
    scrivi(ctx, p1, d.rlNome, 90, 196.5, 365);
    scrivi(ctx, p1, d.rlNum, 476, 196.5, 44);
    scrivi(ctx, p1, d.oriente, 98, 218, 425);
    scrivi(ctx, p1, d.nomeCompleto, 180, 238, 345);
    scrivi(ctx, p1, d.nato, 90, 254.5, 218);
    scrivi(ctx, p1, d.provNato, 351, 254.5, 40);
    scrivi(ctx, p1, d.dataNato, 428, 254.5, 100);
    scrivi(ctx, p1, d.citta, 115, 271.5, 322);
    scrivi(ctx, p1, d.cap, 472, 271.5, 55);
    scrivi(ctx, p1, d.via, 80, 288.5, 392);
    scrivi(ctx, p1, d.civ, 492, 288.5, 35);
    scrivi(ctx, p1, d.domCitta, 120, 306.5, 318);
    scrivi(ctx, p1, d.domCap, 472, 306.5, 55);
    scrivi(ctx, p1, d.domVia, 80, 323.5, 392);
    scrivi(ctx, p1, d.domCiv, 492, 323.5, 35);
    scrivi(ctx, p1, d.cf, 125, 340.5, 400);
    scrivi(ctx, p1, d.tel, 138, 357.5, 198);
    scrivi(ctx, p1, d.email, 369, 357.5, 158);
    scrivi(ctx, p1, d.studio, 126, 375.5, 400);
    scrivi(ctx, p1, d.professione, 115, 392.5, 410);

    // tipo di domanda (croce nella colonna di sinistra della tabella)
    const righe = {
      iniziazione: 423.5, riammissione: 437, regolarizzazione: 460,
      cancellazione_pena: 493, affiliazione_estero: 532.5,
    };
    if (righe[b.tipo_domanda]) croce(ctx, p1, 63, righe[b.tipo_domanda]);

    const pv = d.prov;
    if (b.tipo_domanda === 'regolarizzazione') {
      scrivi(ctx, p1, pv.obbedienza, 310, 456, 210, 9);
      scrivi(ctx, p1, pv.grado, 252, 471, 268, 9);
    } else if (b.tipo_domanda === 'cancellazione_pena' || b.tipo_domanda === 'riammissione') {
      if (b.tipo_domanda === 'cancellazione_pena') {
        scrivi(ctx, p1, fmtData(pv.espulso_sentenza_del), 290, 491, 64, 9);
        scrivi(ctx, p1, fmtData(pv.espulso_definitiva_il), 414, 491, 108, 9);
        scrivi(ctx, p1, pv.grado_ricoperto, 252, 505, 268, 9);
      }
    } else if (b.tipo_domanda === 'affiliazione_estero') {
      scrivi(ctx, p1, [pv.rl_nome, pv.rl_oriente].filter(Boolean).join(' - '), 296, 522, 232, 9);
      scrivi(ctx, p1, pv.gran_loggia, 322, 536, 205, 9);
      scrivi(ctx, p1, pv.grado_estero, 252, 550, 106, 9);
    }

    scrivi(ctx, p1, fmtData(b.data_prima_votazione), 142, 580, 100);
    if (b.tipo_domanda === 'iniziazione') scrivi(ctx, p1, fmtData(b.data_seconda_votazione), 142, 597, 92);

    // pagina 2: dichiarazione di residenza / sede di lavoro
    const p2 = doc.getPage(1);
    scrivi(ctx, p2, d.nomeCompleto, 146, 83, 385, 11);
    scrivi(ctx, p2, d.nato, 96, 97, 245, 11);
    scrivi(ctx, p2, d.dataNato, 372, 97, 75, 11);
    if (b.competenza_territoriale === 'residenza') scrivi(ctx, p2, b.competenza_luogo, 62, 386, 470, 10);
    if (b.competenza_territoriale === 'sede_lavoro') scrivi(ctx, p2, b.competenza_luogo, 62, 443, 470, 10);
  }

  /* ---------- API ---------- */
  async function carica(templateBytes) {
    const doc = await PDFDocument.load(templateBytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    return { doc, ctx: { font, bold } };
  }

  /* opzioni: { modello:'A1'|'C1', bussante, loggia, presentatore, templateBytes, copiaCollegio } */
  async function genera(o) {
    const { doc, ctx } = await carica(o.templateBytes);
    const d = preparaDati(o.bussante, o.loggia, o.presentatore);
    if (o.modello === 'A1') {
      compilaA1(ctx, doc, o.bussante, d);
      if (o.copiaCollegio && doc.getPageCount() >= 5) doc.removePage(4); // il Collegio non riceve la pag. 5
    } else if (o.modello === 'C1') {
      compilaC1(ctx, doc, o.bussante, d);
    } else throw new Error('Modello sconosciuto: ' + o.modello);
    return await doc.save();
  }

  async function unisci(listaBytes) {
    const out = await PDFDocument.create();
    for (const bytes of listaBytes) {
      const src = await PDFDocument.load(bytes);
      const pagine = await out.copyPages(src, src.getPageIndices());
      pagine.forEach((p) => out.addPage(p));
    }
    return await out.save();
  }

  return { genera, unisci, fmtData, dividiVia };
});
