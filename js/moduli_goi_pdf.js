/* Lemmi - compilazione dei moduli GOI dell'iter successivo alla votazione e alla cerimonia:
 *   N/1 (brevetto Apprendista), C/3 (arricchimento del piè di lista), N/2-3 (brevetto Compagno/Maestro), C/3 bis (cerimonia di promozione/elevazione).
 * I modelli sono le pagine ufficiali (ed. 2024) del Corso Segretari, nella cartella templates/. Il testo si scrive sopra le righe vuote;
 * firme, visti e date di trasmissione restano in bianco. Le coordinate (x, yb) sono in punti, con yb misurato dall'alto della pagina fino alla riga.
 * Funziona nel browser (PDFLib globale) e in Node (per i test). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('pdf-lib'));
  else root.LemmiModuli = factory(root.PDFLib);
})(typeof self !== 'undefined' ? self : this, function (PDFLib) {
  'use strict';
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const COLORE = rgb(0.04, 0.1, 0.38);

  // intestazione comune: R∴L∴ nome e numero, Oriente
  const testata = (nome, num, or) => [
    { k: '_nome', ...nome }, { k: '_num', ...num }, { k: '_oriente', ...or },
  ];

  /* Ogni campo: k (chiave del valore), label/tipo (per il modulo a schermo), x, yb, w (posizione nel PDF),
   * se: { scelta: 'valore' } per scriverlo solo con quella scelta, pos: {valore: {x,yb,w}} se la posizione cambia con la scelta. */
  const MODULI = {
    N1: {
      cod: 'N/1', file: 'N1', soggetto: 'bussante',
      titolo: 'N/1 · Richiesta brevetto di Iniziazione',
      invio: 'Da trasmettere a gran.tesoreria@grandeoriente.it insieme alla copia del bonifico (causale: «Quota di ammissione/prima rata Bussante» + nome e cognome) e, per conoscenza, al Collegio Circoscrizionale.',
      quando: 'Dopo la seconda votazione favorevole, prima dell’iniziazione.',
      testata: testata({ x: 99, yb: 242.6, w: 345 }, { x: 466, yb: 244.2, w: 68 }, { x: 108, yb: 271.4, w: 425 }),
      campi: [
        { k: 'cognome', label: 'Cognome', x: 97, yb: 418.6, w: 182, gruppo: 'Generalità' },
        { k: 'nome', label: 'Nome', x: 86, yb: 441.6, w: 192, gruppo: 'Generalità' },
        { k: 'nato', label: 'Nato a', x: 86, yb: 464.5, w: 195, gruppo: 'Generalità' },
        { k: 'il', label: 'Nato il', tipo: 'data', x: 67, yb: 487.4, w: 212, gruppo: 'Generalità' },
        { k: 'residente', label: 'Residente in', x: 108, yb: 510.4, w: 111, gruppo: 'Generalità' },
        { k: 'cap', label: 'CAP', x: 254, yb: 510.4, w: 28, gruppo: 'Generalità', corto: 1 },
        { k: 'via', label: 'Via', x: 73, yb: 530, w: 207, gruppo: 'Generalità' },
        { k: 'tel', label: 'Telefono', x: 94, yb: 553, w: 186, gruppo: 'Generalità' },
        { k: 'studio', label: 'Titolo di studio', x: 123, yb: 576, w: 157, gruppo: 'Generalità' },
        { k: 'professione', label: 'Professione', x: 108, yb: 599, w: 172, gruppo: 'Generalità' },
        { k: 'data_domanda', label: 'Domanda presentata il', tipo: 'data', x: 409, yb: 371, w: 104, gruppo: 'Votazioni' },
        { k: 'data_seduta', label: 'Seduta in Camera di Apprendista del giorno (ultima votazione)', tipo: 'data', x: 314, yb: 433.1, w: 108, gruppo: 'Votazioni' },
        { k: 'v1_data', label: '1° scrutinio: data', tipo: 'data', x: 359.5, yb: 555.6, w: 36, gruppo: 'Votazioni', corto: 1 },
        { k: 'v1_votanti', label: 'Votanti', x: 406, yb: 555.6, w: 36, gruppo: 'Votazioni', corto: 1 },
        { k: 'v1_bianche', label: 'Palle bianche', x: 452.8, yb: 555.6, w: 36, gruppo: 'Votazioni', corto: 1 },
        { k: 'v1_nere', label: 'Palle nere', x: 499.5, yb: 555.6, w: 36, gruppo: 'Votazioni', corto: 1 },
        { k: 'v2_data', label: '2° scrutinio: data', tipo: 'data', x: 359.5, yb: 593, w: 36, gruppo: 'Votazioni', corto: 1 },
        { k: 'v2_votanti', label: 'Votanti', x: 406, yb: 593, w: 36, gruppo: 'Votazioni', corto: 1 },
        { k: 'v2_bianche', label: 'Palle bianche', x: 452.8, yb: 593, w: 36, gruppo: 'Votazioni', corto: 1 },
        { k: 'v2_nere', label: 'Palle nere', x: 499.5, yb: 593, w: 36, gruppo: 'Votazioni', corto: 1 },
      ],
    },

    C3: {
      cod: 'C/3', file: 'C3', soggetto: 'fratello',
      titolo: 'C/3 · Arricchimento del piè di lista',
      invio: 'Da trasmettere, insieme alla Promessa Solenne, al Collegio Circoscrizionale e a anagrafe@grandeoriente.it.',
      quando: 'Dopo l’iniziazione, la riammissione, la regolarizzazione o l’affiliazione di un Fratello.',
      testata: testata({ x: 128, yb: 207.7, w: 306 }, { x: 456, yb: 207.7, w: 41 }, { x: 140, yb: 236.2, w: 360 }),
      scelta: {
        k: 'tipo', label: 'Il piè di lista si arricchisce per', opzioni: [
          { v: 'iniziato', t: 'Nuovo iniziato', box: [[62, 430]] },
          { v: 'trasferito', t: 'Fratello trasferito da altra Loggia', box: [[64.5, 462.9]] },
          { v: 'sonno', t: 'Riammesso dalla posizione di sonno e/o dal depennamento', box: [[62, 522.4], [69, 551.2]] },
          { v: 'regolarizzato', t: 'Riammesso dalla regolarizzazione', box: [[62, 522.4], [69, 580]] },
          { v: 'pena', t: 'Riammesso dalla cancellazione della pena', box: [[62, 522.4], [69, 608.9]] },
        ],
      },
      campi: [
        { k: 'nominativo', label: 'Fratello arricchito', x: 59, yb: 400.5, w: 410, soloNome: 1 },
        { k: 'data', label: 'Data della cerimonia', tipo: 'data', pos: { iniziato: { x: 251, yb: 435.1, w: 136 }, sonno: { x: 409, yb: 556.3, w: 80 }, regolarizzato: { x: 291, yb: 585, w: 195 }, pena: { x: 329, yb: 614, w: 157 } }, se: { scelta: ['iniziato', 'sonno', 'regolarizzato', 'pena'] } },
        { k: 'da_loggia', label: 'Trasferito dalla R∴L∴', x: 182, yb: 469.2, w: 228, se: { scelta: ['trasferito'] } },
        { k: 'da_num', label: 'N°', x: 433, yb: 469.2, w: 58, corto: 1, se: { scelta: ['trasferito'] } },
        { k: 'da_oriente', label: 'all’Oriente di', x: 142, yb: 506.1, w: 338, se: { scelta: ['trasferito'] } },
      ],
    },

    N23: {
      cod: 'N/2-3', file: 'N23', soggetto: 'fratello',
      titolo: 'N/2-3 · Richiesta brevetto di Compagno / Maestro',
      invio: 'Da trasmettere a gran.tesoreria@grandeoriente.it insieme alla copia del bonifico (causale: «Quota di ammissione/seconda rata Compagno» o «…/terza rata Maestro» + nome e cognome) e, per conoscenza, al Collegio Circoscrizionale.',
      quando: 'Dopo le votazioni favorevoli in Camera di Compagno o di Maestro.',
      testata: testata({ x: 120, yb: 232.4, w: 347 }, { x: 491, yb: 232.4, w: 34 }, { x: 128, yb: 261, w: 372 }),
      scelta: {
        k: 'grado', label: 'Richiesta per', opzioni: [
          { v: 'compagno', t: 'Passaggio a Compagno', box: [[248, 518.5]] },
          { v: 'maestro', t: 'Elevazione a Maestro', box: [[250.8, 591.5]] },
        ],
      },
      campi: [
        { k: 'cognome', label: 'Cognome', x: 185, yb: 379.3, w: 276, gruppo: 'Generalità' },
        { k: 'nome', label: 'Nome', x: 171, yb: 396.5, w: 290, gruppo: 'Generalità' },
        { k: 'nato', label: 'Nato a', x: 171, yb: 413.8, w: 290, gruppo: 'Generalità' },
        { k: 'il', label: 'Nato il', tipo: 'data', x: 152, yb: 431, w: 312, gruppo: 'Generalità' },
        { k: 'residente', label: 'Residente in', x: 193, yb: 448.3, w: 175, gruppo: 'Generalità' },
        { k: 'cap', label: 'CAP', x: 412, yb: 448.3, w: 48, gruppo: 'Generalità', corto: 1 },
        { k: 'via', label: 'Via', x: 161, yb: 465.5, w: 300, gruppo: 'Generalità' },
        { k: 'tel', label: 'Telefono', x: 183, yb: 482.8, w: 280, gruppo: 'Generalità' },
        { k: 'cert_prec', label: 'N° certificato precedente', pos: { compagno: { x: 242, yb: 549.7, w: 219 }, maestro: { x: 236, yb: 618.6, w: 225 } }, se: { scelta: ['compagno', 'maestro'] }, etichettaPer: { compagno: 'N° certificato di Apprendista', maestro: 'N° certificato di Compagno' } },
        { k: 'rilascio', label: 'Data del rilascio', tipo: 'data', pos: { compagno: { x: 212, yb: 564.7, w: 252 }, maestro: { x: 212, yb: 633.6, w: 252 } }, se: { scelta: ['compagno', 'maestro'] } },
        { k: 'data_seduta', label: 'Seduta in cui è stato deliberato l’aumento', tipo: 'data', x: 194, yb: 695, w: 146 },
      ],
    },

    C3BIS: {
      cod: 'C/3 bis', file: 'C3BIS', soggetto: 'fratello',
      titolo: 'C/3 bis · Cerimonia di promozione a Compagno / elevazione a Maestro',
      invio: 'Da trasmettere, insieme alla Promessa Solenne, al Collegio Circoscrizionale e a anagrafe@grandeoriente.it. La data della cerimonia determina l’anzianità nel grado acquisito.',
      quando: 'Dopo la cerimonia di passaggio di grado.',
      testata: testata({ x: 96, yb: 232.9, w: 321 }, { x: 443, yb: 232.9, w: 59 }, { x: 108, yb: 261.5, w: 390 }),
      scelta: {
        k: 'grado', label: 'Cerimonia di', opzioni: [
          { v: 'compagno', t: 'Promozione al grado di Compagno', box: [[43, 496.5]] },
          { v: 'maestro', t: 'Elevazione al grado di Maestro', box: [[43, 548.5]] },
        ],
      },
      campi: [
        { k: 'nominativo', label: 'Fratello', x: 194, yb: 431.2, w: 342, soloNome: 1 },
        { k: 'data_tornata', label: 'Tornata del', tipo: 'data', x: 180, yb: 459.3, w: 168 },
      ],
    },
  };

  /* ---------- utilità ---------- */
  function fmtData(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso);
  }
  function pulisci(font, testo) {
    if (testo === null || testo === undefined) return '';
    const t = String(testo).normalize('NFC').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
    let out = '';
    for (const ch of t) { try { font.encodeText(ch); out += ch; } catch (e) { out += '?'; } }
    return out;
  }
  function scrivi(ctx, pagina, testo, x, yb, larghezza, size) {
    let t = pulisci(ctx.font, testo);
    if (!t) return;
    let s = size || 10;
    while (s > 6 && ctx.font.widthOfTextAtSize(t, s) > larghezza) s -= 0.5;
    while (t.length > 1 && ctx.font.widthOfTextAtSize(t, s) > larghezza) t = t.slice(0, -1);
    pagina.drawText(t, { x, y: pagina.getHeight() - yb + 2.5, size: s, font: ctx.font, color: COLORE });
  }
  function croce(ctx, pagina, xc, yc) {
    const s = 12, w = ctx.bold.widthOfTextAtSize('X', s);
    pagina.drawText('X', { x: xc - w / 2, y: pagina.getHeight() - yc - s * 0.35, size: s, font: ctx.bold, color: COLORE });
  }

  /* ---------- compilazione ---------- */
  // v: valori per chiave (le date in AAAA-MM-GG); loggia: {nome, numero, oriente}
  async function compila(codice, v, loggia, templateBytes) {
    const M = MODULI[codice];
    if (!M) throw new Error('Modulo sconosciuto: ' + codice);
    const doc = await PDFDocument.load(templateBytes);
    const ctx = { font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
    const p = doc.getPage(0);
    const [t0, t1, t2] = M.testata;
    scrivi(ctx, p, loggia.nome, t0.x, t0.yb, t0.w, 10);
    scrivi(ctx, p, loggia.numero, t1.x, t1.yb, t1.w, 10);
    scrivi(ctx, p, loggia.oriente, t2.x, t2.yb, t2.w, 10);
    const sc = M.scelta ? v[M.scelta.k] : null;
    if (M.scelta && sc) {
      const o = M.scelta.opzioni.find((x) => x.v === sc);
      if (o) o.box.forEach(([x, y]) => croce(ctx, p, x, y));
    }
    M.campi.forEach((c) => {
      if (c.se && c.se.scelta && !c.se.scelta.includes(sc)) return;
      const pos = c.pos ? c.pos[sc] : c;
      if (!pos) return;
      let val = v[c.k];
      if (c.tipo === 'data') val = fmtData(val);
      scrivi(ctx, p, val, pos.x, pos.yb, pos.w, c.corto ? 8 : 10);
    });
    return await doc.save();
  }

  return { MODULI, compila, fmtData };
});
