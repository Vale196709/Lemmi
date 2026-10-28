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
    E1: {
      cod: 'E/1', file: 'E1', soggetto: 'fratello',
      titolo: 'E/1 · Rilascio dell’Exeat (trasferimento ad altra Loggia)',
      invio: 'La Loggia che concede il trasferimento lo trasmette al Collegio Circoscrizionale e a anagrafe@grandeoriente.it, con il fascicolo personale del Fratello. Il trasferimento ha effetto dalla data dell’Exeat.',
      quando: 'Quando la Loggia concede l’Exeat a un Fratello che passa ad altra Loggia (entro 30 giorni dalla richiesta).',
      testata: testata({ x: 102, yb: 236.9, w: 355 }, { x: 480, yb: 236.9, w: 60 }, { x: 113, yb: 265.5, w: 398 }),
      campi: [
        { k: 'nominativo', label: 'Fratello a cui si concede l’Exeat', x: 413, yb: 385.4, w: 147 },
        { k: 'nuova_loggia', label: 'Trasferimento alla R∴L∴', x: 253, yb: 454.1, w: 308 },
        { k: 'nuova_num', label: 'N°', x: 59, yb: 487.1, w: 50, corto: 1 },
        { k: 'nuovo_oriente', label: 'all’Oriente di', x: 179, yb: 487.1, w: 381 },
        { k: 'motivazioni', label: 'Motivazioni (facoltative)', area: 1, righe: [{ x: 177, yb: 541.1, w: 384 }, { x: 43, yb: 569.5, w: 517 }, { x: 43, yb: 597.1, w: 517 }] },
      ],
    },

    E2: {
      cod: 'E/2', file: 'E2', soggetto: 'fratello',
      titolo: 'E/2 · Accoglimento del trasferimento da altra Loggia',
      invio: 'La Loggia che accoglie il trasferimento lo trasmette al Collegio Circoscrizionale e a anagrafe@grandeoriente.it. La richiesta dell’Exeat alla Loggia di provenienza va fatta con raccomandata A/R o PEC, in copia a Gran Segreteria e Collegio.',
      quando: 'Quando la Loggia accoglie la richiesta di affiliazione di un Fratello proveniente da altra Loggia.',
      testata: testata({ x: 117, yb: 265.1, w: 269 }, { x: 407, yb: 265.1, w: 60 }, { x: 123, yb: 292.7, w: 340 }),
      campi: [
        { k: 'nominativo', label: 'Fratello che chiede il trasferimento', x: 88, yb: 427.8, w: 430 },
        { k: 'da_loggia', label: 'Proveniente dalla R∴L∴', x: 192, yb: 465.4, w: 229 },
        { k: 'da_num', label: 'N°', x: 438, yb: 465.4, w: 80, corto: 1 },
        { k: 'da_oriente', label: 'all’Oriente di', x: 126, yb: 493, w: 392 },
      ],
    },

    D1: {
      cod: 'D/1', file: 'D1', soggetto: 'fratello',
      titolo: 'D/1 · Depennamento, assonnamento, trasferimento, Oriente Eterno',
      invio: 'Da trasmettere al Collegio Circoscrizionale e a anagrafe@grandeoriente.it. Per il depennamento ex art. 12 va allegato il modulo D/2 con il verbale del Consiglio di disciplina.',
      quando: 'Quando un Fratello esce dal piè di lista: assonnamento, depennamento, trasferimento all’estero o ad altra Loggia, passaggio all’Oriente Eterno.',
      testata: testata({ x: 118, yb: 195, w: 312 }, { x: 453, yb: 195, w: 38 }, { x: 125, yb: 223.6, w: 370 }),
      scelta: {
        k: 'motivo', label: 'Motivo', opzioni: [
          { v: 'sonno', t: 'Assonnamento', box: [[62, 433.9]] },
          { v: 'art12', t: 'Depennamento dal piè di lista (Consiglio di disciplina, art. 12 della Costituzione)', box: [[62, 462.9]] },
          { v: 'estero', t: 'Depennamento per trasferimento all’estero', box: [[62, 505.2]] },
          { v: 'oe', t: 'Passaggio all’Oriente Eterno', box: [[62, 534]] },
          { v: 'trasferimento', t: 'Trasferimento ad altra Loggia', box: [[62, 559.6]] },
        ],
      },
      campi: [
        { k: 'nominativo', label: 'Fratello', x: 224, yb: 357, w: 269 },
        { k: 'decorrenza', label: 'Decorrenza dal giorno', tipo: 'data', x: 111, yb: 411.1, w: 277 },
        { k: 'motivo_sonno', label: 'Motivo dell’assonnamento', x: 308, yb: 440, w: 194, se: { scelta: ['sonno'] } },
        { k: 'nuova_loggia', label: 'Trasferimento alla R∴L∴', x: 257, yb: 565.6, w: 164, se: { scelta: ['trasferimento'] } },
        { k: 'nuova_num', label: 'N°', x: 443, yb: 565.6, w: 65, corto: 1, se: { scelta: ['trasferimento'] } },
        { k: 'nuovo_oriente', label: 'all’Oriente di', x: 163, yb: 586.7, w: 337, se: { scelta: ['trasferimento'] } },
      ],
    },

    D2: {
      cod: 'D/2', file: 'D2', soggetto: 'nessuno',
      titolo: 'D/2 · Verbale del Consiglio di disciplina',
      invio: 'Allegato al modulo D/1 di depennamento: da trasmettere al Collegio Circoscrizionale e a anagrafe@grandeoriente.it. Le firme dei tre Consiglieri e il timbro della Loggia restano da apporre.',
      quando: 'Dopo la diffida inviata con raccomandata, trascorsi 30 giorni, e la declaratoria di decadenza della Loggia in grado di Maestro (artt. 12 Cost. e 17 Reg.).',
      testata: testata({ x: 118, yb: 222.5, w: 304 }, { x: 446, yb: 222.5, w: 39 }, { x: 125, yb: 250.1, w: 359 }),
      campi: [
        { k: 'consiglio', label: 'Consiglio di disciplina composto dai Fratelli (uno per riga, o separati da punto e virgola)', area: 1, perRiga: 1, righe: [{ x: 59, yb: 336.5, w: 291 }, { x: 59, yb: 355.6, w: 389 }, { x: 59, yb: 374.5, w: 383 }, { x: 59, yb: 393.5, w: 384 }] },
        { k: 'depennati', label: 'Fratelli esaminati (uno per riga, o separati da punto e virgola)', area: 1, perRiga: 1, righe: [{ x: 59, yb: 436, w: 365 }, { x: 59, yb: 457.8, w: 365 }, { x: 59, yb: 478.5, w: 401 }, { x: 73, yb: 499.3, w: 176 }] },
      ],
    },

    V1: {
      cod: 'V/1', file: 'V1', soggetto: 'fratello',
      titolo: 'V/1 · Variazioni anagrafiche',
      invio: 'Da trasmettere al Collegio Circoscrizionale e a anagrafe@grandeoriente.it, firmato dal Segretario.',
      quando: 'Quando un Fratello cambia indirizzo, telefono o e-mail: si chiede l’aggiornamento della scheda anagrafica.',
      testata: testata({ x: 117, yb: 238, w: 306 }, { x: 447, yb: 238, w: 60 }, { x: 127, yb: 274.7, w: 354 }),
      campi: [
        { k: 'nominativo', label: 'Fratello', x: 211, yb: 409.4, w: 304 },
        { k: 'v_via', label: 'Nuovo indirizzo: via e numero', x: 80, yb: 479.3, w: 426 },
        { k: 'v_citta', label: 'Città', x: 85, yb: 510.9, w: 330 },
        { k: 'v_cap', label: 'CAP', x: 449, yb: 510.5, w: 62, corto: 1 },
        { k: 'v_tel', label: 'Telefono', x: 98, yb: 543.1, w: 155 },
        { k: 'v_email', label: 'E-mail', x: 292, yb: 542.6, w: 218 },
      ],
    },

    C2: {
      cod: 'C/2', file: 'C2', soggetto: 'bussante',
      titolo: 'C/2 · Rinuncia / rigetto della domanda di ammissione',
      invio: 'Da trasmettere al Collegio Circoscrizionale e a anagrafe@grandeoriente.it, firmato da Segretario e Maestro Venerabile.',
      quando: 'Quando la domanda del profano è respinta dalla Loggia o archiviata per sua rinuncia.',
      testata: testata({ x: 118, yb: 207.7, w: 321 }, { x: 464, yb: 207.7, w: 59 }, { x: 129, yb: 236.2, w: 391 }),
      scelta: {
        k: 'esito', label: 'Esito', opzioni: [
          { v: 'respinta', t: 'Domanda respinta dalla Loggia', box: [[62, 457.5]] },
          { v: 'rinuncia', t: 'Domanda archiviata per rinuncia del profano', box: [[62, 492.7]] },
        ],
      },
      campi: [
        { k: 'nominativo', label: 'Signor', x: 101, yb: 428.7, w: 419 },
        { k: 'data_esito', label: 'Data', tipo: 'data', pos: { respinta: { x: 216, yb: 463.5, w: 298 }, rinuncia: { x: 325, yb: 498.7, w: 193 } }, se: { scelta: ['respinta', 'rinuncia'] }, etichettaPer: { respinta: 'Respinta dalla Loggia il', rinuncia: 'Archiviata per rinuncia dal giorno' } },
        { k: 'motivazioni', label: 'Motivazioni', area: 1, righe: [{ x: 59, yb: 549.3, w: 453 }, { x: 59, yb: 567.9, w: 453 }, { x: 59, yb: 586.5, w: 453 }, { x: 59, yb: 605.1, w: 453 }, { x: 59, yb: 623.6, w: 453 }] },
      ],
    },

    N4: {
      cod: 'N/4', file: 'N4', soggetto: 'bussante',
      titolo: 'N/4 · Richiesta brevetto di Riammissione / Regolarizzazione / Cancellazione pena',
      invio: 'Da trasmettere a gran.tesoreria@grandeoriente.it insieme alla copia del bonifico (causale: «Riammissione» o «Regolarizzazione» + nome e cognome) e, per conoscenza, a Gran Segreteria e Collegio Circoscrizionale.',
      quando: 'Dopo la votazione favorevole (una sola) sulla riammissione, regolarizzazione o cancellazione della pena.',
      testata: testata({ x: 102, yb: 246.6, w: 344 }, { x: 467, yb: 246.6, w: 68 }, { x: 107, yb: 276.5, w: 428 }),
      scelta: {
        k: 'tipo', label: 'La Loggia chiede il brevetto per', opzioni: [
          { v: 'riammissione', t: 'Riammissione', box: [], testo: 'riammissione' },
          { v: 'regolarizzazione', t: 'Regolarizzazione', box: [], testo: 'regolarizzazione' },
          { v: 'pena', t: 'Cancellazione della pena', box: [], testo: 'cancellazione della pena' },
        ],
      },
      campi: [
        { k: '_oggetto', daScelta: 1, x: 392, yb: 440.6, w: 144 },
        { k: 'cognome', label: 'Cognome', x: 96, yb: 430.7, w: 185, gruppo: 'Generalità' },
        { k: 'nome', label: 'Nome', x: 83, yb: 451.6, w: 197, gruppo: 'Generalità' },
        { k: 'nato', label: 'Nato a', x: 84, yb: 472.6, w: 195, gruppo: 'Generalità' },
        { k: 'il', label: 'Nato il', tipo: 'data', x: 66, yb: 493.6, w: 212, gruppo: 'Generalità' },
        { k: 'residente', label: 'Residente in', x: 103, yb: 514.6, w: 112, gruppo: 'Generalità' },
        { k: 'cap', label: 'CAP', x: 250, yb: 514.6, w: 31, gruppo: 'Generalità', corto: 1 },
        { k: 'via', label: 'Via', x: 74, yb: 536.3, w: 205, gruppo: 'Generalità' },
        { k: 'tel', label: 'Telefono', x: 94, yb: 553.9, w: 186, gruppo: 'Generalità' },
        { k: 'studio', label: 'Titolo di studio', x: 116, yb: 574.4, w: 164, gruppo: 'Generalità' },
        { k: 'professione', label: 'Professione', x: 103, yb: 595, w: 177, gruppo: 'Generalità' },
        { k: 'data_domanda', label: 'Domanda presentata il', tipo: 'data', x: 418, yb: 417.7, w: 116, gruppo: 'Votazione' },
        { k: 'grado_seduta', label: 'Seduta in camera di (grado)', x: 458, yb: 461.6, w: 78, gruppo: 'Votazione' },
        { k: 'data_seduta', label: 'Seduta del giorno', tipo: 'data', x: 356, yb: 482.6, w: 175, gruppo: 'Votazione' },
        { k: 'v_data', label: 'Scrutinio: data', tipo: 'data', x: 313, yb: 603.5, w: 43, gruppo: 'Votazione', corto: 1 },
        { k: 'v_votanti', label: 'Votanti', x: 366, yb: 603.5, w: 44, gruppo: 'Votazione', corto: 1 },
        { k: 'v_bianche', label: 'Palle bianche', x: 421, yb: 603.5, w: 48, gruppo: 'Votazione', corto: 1 },
        { k: 'v_nere', label: 'Palle nere', x: 483, yb: 603.5, w: 47, gruppo: 'Votazione', corto: 1 },
      ],
    },

    A2: {
      cod: 'A/2', file: 'A2', soggetto: 'bussante',
      titolo: 'A/2 · Domanda di riammissione / cancellazione della pena / affiliazione dall’estero',
      invio: 'Da compilare in 2 copie: una per l’archivio di Loggia, una da trasmettere al Collegio Circoscrizionale (senza la pag. 5) insieme al modello C/1 e agli allegati richiesti. Firma e data le appone il richiedente.',
      quando: 'Quando un Fratello dimesso, depennato o espulso chiede di essere riammesso (o un Fratello estero chiede l’affiliazione).',
      testate: [
        { p: 1, v: [{ x: 80, yb: 67.9, w: 164 }, { x: 262, yb: 67.9, w: 28 }, { x: 346, yb: 67.9, w: 140 }] },
        { p: 2, v: [{ x: 208, yb: 162.6, w: 288 }, { x: 516, yb: 162.6, w: 45 }, { x: 86, yb: 186, w: 475 }] },
      ],
      campi: [
        { p: 1, k: 'nome_completo', label: 'Cognome e Nome', x: 166, yb: 83.4, w: 323, gruppo: 'Generalità' },
        { p: 1, k: 'nato', label: 'Nato a', x: 71, yb: 98.5, w: 198, gruppo: 'Generalità' },
        { p: 1, k: 'prov_nato', label: 'Prov.', x: 306, yb: 98.5, w: 36, gruppo: 'Generalità', corto: 1 },
        { p: 1, k: 'il', label: 'Nato il', tipo: 'data', x: 376, yb: 98.5, w: 115, gruppo: 'Generalità' },
        { p: 1, k: 'residente', label: 'Residente in', x: 92, yb: 114, w: 274, gruppo: 'Generalità' },
        { p: 1, k: 'cap', label: 'CAP', x: 396, yb: 114, w: 95, gruppo: 'Generalità', corto: 1 },
        { p: 1, k: 'via', label: 'Via', x: 60, yb: 129.5, w: 342, gruppo: 'Generalità' },
        { p: 1, k: 'civ', label: 'N°', x: 418, yb: 129.5, w: 71, gruppo: 'Generalità', corto: 1 },
        { p: 1, k: 'dom_citta', label: 'Domiciliato a', x: 96, yb: 145.1, w: 270, gruppo: 'Generalità' },
        { p: 1, k: 'dom_cap', label: 'CAP domicilio', x: 396, yb: 145.1, w: 95, gruppo: 'Generalità', corto: 1 },
        { p: 1, k: 'dom_via', label: 'Via (domicilio)', x: 60, yb: 160.6, w: 342, gruppo: 'Generalità' },
        { p: 1, k: 'dom_civ', label: 'N° (domicilio)', x: 418, yb: 160.6, w: 71, gruppo: 'Generalità', corto: 1 },
        { p: 1, k: 'cf', label: 'Codice fiscale', x: 100, yb: 176.1, w: 391, gruppo: 'Generalità' },
        { p: 1, k: 'tel', label: 'Telefono', x: 113, yb: 191.6, w: 163, gruppo: 'Generalità' },
        { p: 1, k: 'email', label: 'E-mail', x: 305, yb: 191.6, w: 184, gruppo: 'Generalità' },
        { p: 1, k: 'studio', label: 'Titolo di studio', x: 102, yb: 207.2, w: 387, gruppo: 'Generalità' },
        { p: 1, k: 'professione', label: 'Professione', x: 91, yb: 222.7, w: 400, gruppo: 'Generalità' },
        { p: 1, k: 'iniziato_il', label: 'Iniziato il', tipo: 'data', x: 82, yb: 238.2, w: 189, gruppo: 'Iniziazione e uscita dalla Loggia' },
        { p: 1, k: 'iniz_rl', label: 'presso la R∴L∴', x: 114, yb: 255.8, w: 158, gruppo: 'Iniziazione e uscita dalla Loggia' },
        { p: 1, k: 'iniz_num', label: 'N°', x: 290, yb: 255.8, w: 28, gruppo: 'Iniziazione e uscita dalla Loggia', corto: 1 },
        { p: 1, k: 'iniz_or', label: 'all’Oriente di', x: 371, yb: 255.8, w: 113, gruppo: 'Iniziazione e uscita dalla Loggia' },
        { p: 1, k: 'sonno_il', label: 'Collocato in posizione di sonno il', tipo: 'data', x: 203, yb: 271.5, w: 109, gruppo: 'Iniziazione e uscita dalla Loggia' },
        { p: 1, k: 'depennato_il', label: 'Depennato dal piè di lista il', tipo: 'data', x: 181, yb: 287.3, w: 132, gruppo: 'Iniziazione e uscita dalla Loggia' },
        { p: 1, k: 'esp_sent', label: 'Espulso con sentenza del', tipo: 'data', x: 173, yb: 303.1, w: 144, gruppo: 'Iniziazione e uscita dalla Loggia' },
        { p: 1, k: 'esp_def', label: 'Definitiva il', tipo: 'data', x: 140, yb: 318.8, w: 176, gruppo: 'Iniziazione e uscita dalla Loggia' },
        { p: 1, k: 'grado_ricoperto', label: 'All’atto dell’uscita ricopriva il grado di', x: 386, yb: 375.7, w: 98, gruppo: 'Iniziazione e uscita dalla Loggia' },
        { p: 1, k: 'ult_rl', label: 'Attivo e quotizzante nella R∴L∴', x: 130, yb: 391.7, w: 198, gruppo: 'Iniziazione e uscita dalla Loggia' },
        { p: 1, k: 'ult_num', label: 'N°', x: 341, yb: 391.7, w: 45, gruppo: 'Iniziazione e uscita dalla Loggia', corto: 1 },
        { p: 1, k: 'ult_or', label: 'all’Oriente di', x: 443, yb: 391.7, w: 94, gruppo: 'Iniziazione e uscita dalla Loggia' },
        { p: 1, k: 'note', label: 'Note sulle dichiarazioni', x: 45, yb: 582.4, w: 470, gruppo: 'Altro' },
        { p: 1, k: 'rif1', label: 'Possono riferire: 1° Fratello', x: 56, yb: 617.7, w: 458, gruppo: 'Altro' },
        { p: 1, k: 'rif2', label: '2° Fratello', x: 56, yb: 633.4, w: 458, gruppo: 'Altro' },
        // pagina 3: clausola compromissoria (stessi dati)
        { p: 2, k: 'nome_completo', x: 86, yb: 92.5, w: 475 },
        { p: 2, k: 'nato', x: 58, yb: 115.9, w: 185 },
        { p: 2, k: 'il', tipo: 'data', x: 255, yb: 115.9, w: 96 },
        { p: 2, k: 'cf', x: 373, yb: 115.9, w: 186 },
        { p: 2, k: 'residente', x: 86, yb: 139.3, w: 131 },
        { p: 2, k: 'via', x: 238, yb: 139.3, w: 261 },
        { p: 2, k: 'civ', x: 519, yb: 139.3, w: 42 },
      ],
    },

    AR: {
      cod: 'A/R', file: 'AR', soggetto: 'bussante',
      titolo: 'A/R · Domanda di regolarizzazione',
      invio: 'Da trasmettere a gran.segreteria@grandeoriente.it, con la dichiarazione di compatibilità, i certificati richiesti e le copie dei brevetti conseguiti presso l’altra Obbedienza. Firma e data le appone il richiedente.',
      quando: 'Quando un Libero Muratore proveniente da altra Obbedienza chiede di essere regolarizzato.',
      testate: [{ p: 3, v: [{ x: 236, yb: 180, w: 258, unisci: 1 }, null, { x: 114, yb: 203.4, w: 421 }] }],
      campi: [
        { k: 'nome_completo', label: 'Cognome e Nome', x: 132, yb: 214.5, w: 402, gruppo: 'Generalità' },
        { k: 'nato', label: 'Nato a', x: 109, yb: 231.8, w: 196, gruppo: 'Generalità' },
        { k: 'prov_nato', label: 'Prov.', x: 343, yb: 231.8, w: 31, gruppo: 'Generalità', corto: 1 },
        { k: 'il', label: 'Nato il', tipo: 'data', x: 386, yb: 231.8, w: 149, gruppo: 'Generalità' },
        { k: 'studio', label: 'Titolo di studio', x: 144, yb: 249, w: 390, gruppo: 'Generalità' },
        { k: 'professione', label: 'Professione', x: 129, yb: 266.3, w: 405, gruppo: 'Generalità' },
        { k: 'residente', label: 'Residente in', x: 129, yb: 283.5, w: 305, gruppo: 'Generalità' },
        { k: 'cap', label: 'CAP', x: 465, yb: 283.5, w: 70, gruppo: 'Generalità', corto: 1 },
        { k: 'via', label: 'Via', x: 97, yb: 300.8, w: 321, gruppo: 'Generalità' },
        { k: 'civ', label: 'N°', x: 435, yb: 300.8, w: 36, gruppo: 'Generalità', corto: 1 },
        { k: 'tel', label: 'Telefono', x: 119, yb: 319.7, w: 140, gruppo: 'Generalità' },
        { k: 'email', label: 'E-mail', x: 288, yb: 319.7, w: 247, gruppo: 'Generalità' },
        { k: 'gran_loggia', label: 'Proveniente dalla Gran Loggia', x: 205, yb: 335, w: 331, gruppo: 'Provenienza' },
        { k: 'app_data', label: 'Apprendista (data)', tipo: 'data', x: 132, yb: 352.3, w: 75, gruppo: 'Brevetti e Logge di provenienza', corto: 1 },
        { k: 'app_brev', label: 'Apprendista: brevetto N°', x: 269, yb: 352.3, w: 69, gruppo: 'Brevetti e Logge di provenienza', corto: 1 },
        { k: 'app_rl', label: 'Apprendista: R∴L∴', x: 115, yb: 369.8, w: 191, gruppo: 'Brevetti e Logge di provenienza' },
        { k: 'app_num', label: 'N°', x: 324, yb: 369.8, w: 41, gruppo: 'Brevetti e Logge di provenienza', corto: 1 },
        { k: 'app_or', label: 'all’Oriente di', x: 426, yb: 369.8, w: 108, gruppo: 'Brevetti e Logge di provenienza' },
        { k: 'comp_data', label: 'Compagno (data)', tipo: 'data', x: 127, yb: 387.4, w: 80, gruppo: 'Brevetti e Logge di provenienza', corto: 1 },
        { k: 'comp_brev', label: 'Compagno: brevetto N°', x: 270, yb: 387.4, w: 73, gruppo: 'Brevetti e Logge di provenienza', corto: 1 },
        { k: 'comp_rl', label: 'Compagno: R∴L∴', x: 115, yb: 405.1, w: 191, gruppo: 'Brevetti e Logge di provenienza' },
        { k: 'comp_num', label: 'N°', x: 324, yb: 405.1, w: 41, gruppo: 'Brevetti e Logge di provenienza', corto: 1 },
        { k: 'comp_or', label: 'all’Oriente di', x: 426, yb: 405.1, w: 108, gruppo: 'Brevetti e Logge di provenienza' },
        { k: 'mae_data', label: 'Maestro (data)', tipo: 'data', x: 116, yb: 422.8, w: 90, gruppo: 'Brevetti e Logge di provenienza', corto: 1 },
        { k: 'mae_brev', label: 'Maestro: brevetto N°', x: 265, yb: 422.8, w: 79, gruppo: 'Brevetti e Logge di provenienza', corto: 1 },
        { k: 'mae_rl', label: 'Maestro: R∴L∴', x: 115, yb: 440.5, w: 191, gruppo: 'Brevetti e Logge di provenienza' },
        { k: 'mae_num', label: 'N°', x: 324, yb: 440.5, w: 41, gruppo: 'Brevetti e Logge di provenienza', corto: 1 },
        { k: 'mae_or', label: 'all’Oriente di', x: 426, yb: 440.5, w: 108, gruppo: 'Brevetti e Logge di provenienza' },
        { k: 'cariche', label: 'Cariche ricoperte', area: 1, gruppo: 'Cariche e dimissioni', righe: [{ x: 80, yb: 478.3, w: 456 }, { x: 80, yb: 495.5, w: 456 }] },
        { k: 'dimesso_il', label: 'Dimessosi il', tipo: 'data', x: 132, yb: 510.1, w: 176, gruppo: 'Cariche e dimissioni' },
        { k: 'altre', label: 'Altre notizie', area: 1, gruppo: 'Cariche e dimissioni', righe: [{ x: 80, yb: 547.3, w: 456 }, { x: 80, yb: 564.4, w: 456 }] },
        { k: 'grado_ricoperto', label: 'All’atto delle dimissioni ricopriva il grado di', x: 315, yb: 631.5, w: 115, gruppo: 'Cariche e dimissioni' },
        { k: 'ult_rl', label: 'Attivo e quotizzante nella R∴L∴', x: 131, yb: 648.5, w: 177, gruppo: 'Cariche e dimissioni' },
        { k: 'ult_num', label: 'N°', x: 321, yb: 648.5, w: 41, gruppo: 'Cariche e dimissioni', corto: 1 },
        { k: 'ult_or', label: 'all’Oriente di', x: 424, yb: 648.5, w: 107, gruppo: 'Cariche e dimissioni' },
        { k: 'rif1', label: 'Possono riferire: 1° Fratello (con R∴L∴ di appartenenza)', x: 92, yb: 699.5, w: 425, gruppo: 'Altro' },
        { k: 'rif2', label: '2° Fratello', x: 92, yb: 718.4, w: 425, gruppo: 'Altro' },
        { k: 'rif3', label: '3° Fratello', x: 92, yb: 735.4, w: 425, gruppo: 'Altro' },
        // pagina 4: clausola compromissoria
        { p: 3, k: 'nome_completo', x: 110, yb: 109.9, w: 422 },
        { p: 3, k: 'nato', x: 86, yb: 133.3, w: 185 },
        { p: 3, k: 'il', tipo: 'data', x: 283, yb: 133.3, w: 81 },
        { p: 3, k: 'cf', x: 383, yb: 133.3, w: 146 },
        { p: 3, k: 'residente', x: 115, yb: 156.7, w: 131 },
        { p: 3, k: 'via', x: 267, yb: 156.7, w: 225 },
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

  // testo su più righe: una voce per riga (perRiga) oppure a capo automatico secondo la larghezza di ogni riga
  function scriviRighe(ctx, pagina, testo, c) {
    const t = pulisci(ctx.font, String(testo || '').replace(/\r/g, '').replace(/\n/g, ' \u0001 '));
    if (!t) return;
    let righe;
    if (c.perRiga) righe = String(testo).split(/[\n;]+/).map((x) => pulisci(ctx.font, x)).filter(Boolean);
    else {
      righe = []; let i = 0, riga = '';
      const parole = t.split(/\s+/).filter((w) => w && w !== '\u0001');
      parole.forEach((w) => {
        const slot = c.righe[Math.min(i, c.righe.length - 1)];
        const prova = riga ? riga + ' ' + w : w;
        if (riga && ctx.font.widthOfTextAtSize(prova, 10) > slot.w) { righe.push(riga); riga = w; i++; } else riga = prova;
      });
      if (riga) righe.push(riga);
    }
    righe.slice(0, c.righe.length).forEach((r, i) => scrivi(ctx, pagina, r, c.righe[i].x, c.righe[i].yb, c.righe[i].w, 10));
  }

  /* ---------- compilazione ---------- */
  // v: valori per chiave (le date in AAAA-MM-GG); loggia: {nome, numero, oriente}
  async function compila(codice, v, loggia, templateBytes) {
    const M = MODULI[codice];
    if (!M) throw new Error('Modulo sconosciuto: ' + codice);
    const doc = await PDFDocument.load(templateBytes);
    const ctx = { font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
    const p = doc.getPage(0);
    const TESTE = M.testate || (M.testata ? [{ p: 0, v: M.testata }] : []);
    TESTE.forEach((t) => {
      const pg = doc.getPage(t.p || 0), [t0, t1, t2] = t.v;
      if (t0) scrivi(ctx, pg, t0.unisci ? [loggia.nome, loggia.numero ? 'n. ' + loggia.numero : ''].filter(Boolean).join(' ') : loggia.nome, t0.x, t0.yb, t0.w, 10);
      if (t1) scrivi(ctx, pg, loggia.numero, t1.x, t1.yb, t1.w, 10);
      if (t2) scrivi(ctx, pg, loggia.oriente, t2.x, t2.yb, t2.w, 10);
    });
    const sc = M.scelta ? v[M.scelta.k] : null;
    if (M.scelta && sc) {
      const o = M.scelta.opzioni.find((x) => x.v === sc);
      if (o) o.box.forEach(([x, y]) => croce(ctx, p, x, y));
    }
    M.campi.forEach((c) => {
      if (c.se && c.se.scelta && !c.se.scelta.includes(sc)) return;
      const pc = doc.getPage(c.p || 0);
      if (c.righe) { scriviRighe(ctx, pc, v[c.k], c); return; }
      if (c.daScelta) {
        const o = M.scelta && M.scelta.opzioni.find((x) => x.v === sc);
        if (o && o.testo) scrivi(ctx, pc, o.testo, c.x, c.yb, c.w, 10);
        return;
      }
      const pos = c.pos ? c.pos[sc] : c;
      if (!pos) return;
      let val = v[c.k];
      if (c.tipo === 'data') val = fmtData(val);
      scrivi(ctx, pc, val, pos.x, pos.yb, pos.w, c.corto ? 8 : 10);
    });
    return await doc.save();
  }

  return { MODULI, compila, fmtData };
});
