/* Lemmi - Bozze di e-mail e PEC per i passi delle Procedure.
 * Destinatari e allegati derivano dal Corso Segretari 2024 (modulistica e tabella contatti)
 * e dal Regolamento dell'Ordine. Gli indirizzi possono cambiare: verificare con la circolare dell'anno.
 * Non scrive nulla sul database: la bozza si copia o si apre nel programma di posta. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, toast } = L;

  const IND = {
    COL: 'lazio.collegio@grandeoriente.org',
    ANA: 'anagrafe@grandeoriente.it',
    GSEG: 'gran.segreteria@grandeoriente.it',
    GTES: 'gran.tesoreria@grandeoriente.it',
    SPED: 'ufficio.spedizioni@grandeoriente.it',
    GM: 'ufficio.gm@grandeoriente.it',
  };

  const loggia = () => state.loggia || {};
  const numero = () => String(loggia().numero || '').trim();
  const lungo = () => {
    const l = loggia(); const n = String(l.nome || '').trim();
    return 'R∴L∴ ' + (n || '[nome Loggia]') + ' n. ' + (numero() || '[n.]') + (l.oriente ? ' all’Oriente di ' + l.oriente : '');
  };
  const corto = () => 'R∴L∴ ' + (String(loggia().nome || '').trim() || '[nome Loggia]') + ' n. ' + (numero() || '[n.]');
  const segretario = () => (state.profilo && state.profilo.ruolo === 'segretario' && state.profilo.nome_visualizzato) || '[Nome e cognome del Segretario]';
  const mittente = () => (numero() ? 'lazio.' + numero() + '@grandeoriente.org' : 'lazio.numero-loggia@grandeoriente.org');

  const NOME = { k: 'nome', l: 'Nome e cognome' };
  const DATA = (l) => ({ k: 'data', l });

  const M = {
    c1: {
      t: 'C/1 al Collegio', a: [IND.COL], cc: [],
      campi: [{ k: 'nome', l: 'Nome e cognome della persona' }, DATA('Data della presa in considerazione'), { k: 'vot', l: 'Date delle votazioni' }],
      tipi: [
        { k: 'ini', l: 'Iniziazione (date con 60 giorni di preavviso)', nome: 'iniziazione', mod: 'A/1' },
        { k: 'rea', l: 'Riammissione (date con 30 giorni di preavviso)', nome: 'riammissione', mod: 'A/2' },
        { k: 'reg', l: 'Regolarizzazione', nome: 'regolarizzazione', mod: '' },
      ],
      hint: 'Allega in PDF: C/1, A/1 o A/2, certificato penale, carichi pendenti, curriculum e fotografie. Il Corso consiglia di anticipare i documenti per e-mail al Collegio e di consegnare poi gli originali a mano alla Segreteria del Collegio.',
      b: (c) => ({
        o: `${c.Ls} – Mod. C/1 – domanda di ${c.tipo.nome} di ${c.x('nome')}`,
        t: `Carissimi Fratelli,\n\ntrasmetto in allegato ${c.tipo.mod ? 'i modelli C/1 e ' + c.tipo.mod + ' relativi' : 'il modello C/1 relativo'} alla domanda di ${c.tipo.nome} di ${c.x('nome')}, presa in considerazione dalla Loggia in data ${c.x('data')}, con gli allegati richiesti.\n\nLe date previste per le votazioni sono: ${c.x('vot')}.\n\nGli originali dei documenti saranno consegnati a mano alla Segreteria del Collegio.\n\n${c.firma}`,
      }),
    },
    c2: {
      t: 'C/2 – rinuncia o reiezione', a: [IND.COL, IND.ANA], cc: [],
      campi: [{ k: 'nome', l: 'Nome e cognome del bussante' }, DATA('Data della votazione o della rinuncia')],
      tipi: [{ k: 'rei', l: 'Domanda respinta alla seconda votazione', nome: 'reiezione' }, { k: 'rin', l: 'Rinuncia alla domanda', nome: 'rinuncia' }],
      hint: 'Allega il modello C/2 in PDF. La domanda respinta potrà essere ripresentata alla stessa Loggia dopo almeno 3 anni (art. 9 Reg.).',
      b: (c) => ({
        o: `${c.Ls} – Mod. C/2 – ${c.tipo.nome} della domanda di ammissione di ${c.x('nome')}`,
        t: `Carissimi Fratelli,\n\ntrasmetto in allegato il modello C/2 relativo alla ${c.tipo.nome} della domanda di ammissione di ${c.x('nome')}, in data ${c.x('data')}.\n\n${c.firma}`,
      }),
    },
    n_tes: {
      t: 'Richiesta brevetto alla Gran Tesoreria', a: [IND.GTES], cc: [IND.COL],
      campi: [{ k: 'nome', l: 'Nome e cognome' }, DATA('Data del bonifico')],
      tipi: [
        { k: 'n1', l: 'N/1 – brevetto di Apprendista', mod: 'N/1', brev: 'Apprendista', cau: 'Quota di ammissione/prima rata Bussante' },
        { k: 'n2', l: 'N/2-3 – brevetto di Compagno', mod: 'N/2-3', brev: 'Compagno', cau: 'Quota di ammissione/seconda rata Compagno' },
        { k: 'n3', l: 'N/2-3 – brevetto di Maestro', mod: 'N/2-3', brev: 'Maestro', cau: 'Quota di ammissione/terza rata Maestro' },
        { k: 'n4r', l: 'N/4 – riammissione', mod: 'N/4', brev: 'riammissione', cau: 'Riammissione' },
        { k: 'n4g', l: 'N/4 – regolarizzazione', mod: 'N/4', brev: 'regolarizzazione', cau: 'Regolarizzazione' },
      ],
      hint: 'Allega il modello in PDF e la copia del bonifico alla Gran Tesoreria. La causale del bonifico deve essere esattamente quella indicata, con nome e cognome. Il Collegio riceve la copia per conoscenza.',
      b: (c) => ({
        o: `${c.Ls} – Mod. ${c.tipo.mod} – richiesta brevetto (${c.tipo.brev}) – ${c.x('nome')}`,
        t: `Carissimi Fratelli,\n\ntrasmetto in allegato il modello ${c.tipo.mod} per la richiesta del brevetto (${c.tipo.brev}) di ${c.x('nome')}, unitamente alla copia del bonifico effettuato in data ${c.x('data')} con causale «${c.tipo.cau} (${c.x('nome')})».\n\n${c.firma}`,
      }),
    },
    c3: {
      t: 'C/3 e promessa solenne', a: [IND.ANA, IND.COL], cc: [],
      campi: [{ k: 'nome', l: 'Nome e cognome dell’iniziato' }, DATA('Data dell’iniziazione')],
      hint: 'Allega in PDF il modello C/3 e la Promessa Solenne firmata.',
      b: (c) => ({
        o: `${c.Ls} – Mod. C/3 – arricchimento del piè di lista – ${c.x('nome')}`,
        t: `Carissimi Fratelli,\n\ntrasmetto in allegato il modello C/3 per l’arricchimento del piè di lista e la Promessa Solenne di ${c.x('nome')}, iniziato in data ${c.x('data')}.\n\n${c.firma}`,
      }),
    },
    c3bis: {
      t: 'C/3 bis – passaggio di grado', a: [IND.ANA, IND.COL], cc: [],
      campi: [{ k: 'nome', l: 'Nome e cognome del Fratello' }, DATA('Data della cerimonia')],
      tipi: [{ k: 'comp', l: 'Passaggio a Compagno d’Arte', g: 'passaggio al grado di Compagno d’Arte' }, { k: 'mae', l: 'Elevazione a Maestro', g: 'elevazione al grado di Maestro' }],
      hint: 'Allega in PDF il modello C/3 bis e la Promessa Solenne. La data della cerimonia determina l’anzianità nel nuovo grado.',
      b: (c) => ({
        o: `${c.Ls} – Mod. C/3 bis – ${c.tipo.g} – ${c.x('nome')}`,
        t: `Carissimi Fratelli,\n\ntrasmetto in allegato il modello C/3 bis relativo al ${c.tipo.g} del Fr∴ ${c.x('nome')}, avvenuto in data ${c.x('data')}, con la copia della Promessa Solenne.\n\n${c.firma}`,
      }),
    },
    exeat_rich: {
      t: 'Richiesta di Exeat', a: [], cc: [IND.GSEG, IND.COL],
      campi: [{ k: 'nome', l: 'Nome e cognome del Fratello' }, DATA('Data della delibera di affiliazione'), { k: 'prov', l: 'Loggia di provenienza' }],
      hint: 'Va inviata alla Loggia di provenienza (indirizzo da inserire) per raccomandata A/R o PEC, con copia a Gran Segreteria e Collegio. Se la Loggia non risponde entro 30 giorni, l’Exeat si considera concesso.',
      b: (c) => ({
        o: `${c.Ls} – richiesta di Exeat e fascicolo personale del Fr∴ ${c.x('nome')}`,
        t: `Carissimi Fratelli della ${c.x('prov')},\n\nin seguito all’accoglimento, deliberato in data ${c.x('data')}, della domanda di affiliazione del Fr∴ ${c.x('nome')} alla nostra Loggia, chiediamo, ai sensi dell’art. 15 del Regolamento dell’Ordine, il rilascio dell’Exeat e l’invio del suo fascicolo personale.\n\nSi ricorda che l’Exeat si ritiene concesso decorsi trenta giorni dal ricevimento della richiesta senza risposta.\n\n${c.firma}`,
      }),
    },
    exeat_mod: {
      t: 'E/1 o E/2 – Exeat', a: [IND.COL, IND.ANA], cc: [],
      campi: [{ k: 'nome', l: 'Nome e cognome del Fratello' }, { k: 'altra', l: 'Altra Loggia (nome e numero)' }, DATA('Data dell’Exeat')],
      tipi: [
        { k: 'e1', l: 'E/1 – la nostra Loggia rilascia l’Exeat', mod: 'E/1', txt: (c) => `rilascio dell’Exeat al Fr∴ ${c.x('nome')}, che si trasferisce alla ${c.x('altra')}` },
        { k: 'e2', l: 'E/2 – la nostra Loggia accoglie il trasferimento', mod: 'E/2', txt: (c) => `accoglimento del trasferimento del Fr∴ ${c.x('nome')} dalla ${c.x('altra')}` },
      ],
      hint: 'Allega in PDF il modello. Il trasferimento ha effetto dalla data dell’Exeat.',
      b: (c) => ({
        o: `${c.Ls} – Mod. ${c.tipo.mod} – Exeat del Fr∴ ${c.x('nome')}`,
        t: `Carissimi Fratelli,\n\ntrasmetto in allegato il modello ${c.tipo.mod} relativo al ${c.tipo.txt(c)}, con Exeat del ${c.x('data')}.\n\n${c.firma}`,
      }),
    },
    d1: {
      t: 'D/1 – variazione di posizione', a: [IND.COL, IND.ANA], cc: [],
      campi: [{ k: 'nome', l: 'Nome e cognome del Fratello' }, DATA('Data del provvedimento o dell’evento')],
      tipi: [
        { k: 'son', l: 'Assonnamento', txt: (c) => `l’assonnamento del Fr∴ ${c.x('nome')}, di cui la Loggia ha preso atto in data ${c.x('data')}`, all: '' },
        { k: 'dep', l: 'Depennamento (con D/2)', txt: (c) => `il depennamento dal piè di lista del Fr∴ ${c.x('nome')}, disposto in data ${c.x('data')}`, all: ' e il modello D/2 del Consiglio di Disciplina' },
        { k: 'oe', l: 'Passaggio all’Oriente Eterno', txt: (c) => `il passaggio all’Oriente Eterno del Fr∴ ${c.x('nome')}, avvenuto in data ${c.x('data')}`, all: '' },
        { k: 'tra', l: 'Trasferimento ad altra Loggia o all’estero', txt: (c) => `il trasferimento del Fr∴ ${c.x('nome')}, con efficacia dal ${c.x('data')}`, all: '' },
      ],
      hint: 'Allega in PDF il modello D/1 (e il D/2 per il depennamento). Comunicazione obbligatoria subito dopo il provvedimento (art. 75 Reg.).',
      b: (c) => ({
        o: `${c.Ls} – Mod. D/1 – ${c.tipo.l.toLowerCase()} – ${c.x('nome')}`,
        t: `Carissimi Fratelli,\n\ntrasmetto in allegato il modello D/1${c.tipo.all} per comunicare ${c.tipo.txt(c)}.\n\n${c.firma}`,
      }),
    },
    diffida: {
      t: 'Diffida (art. 17)', a: [], cc: [], solo: true, firmaMV: true,
      campi: [{ k: 'nome', l: 'Nome e cognome del Fratello' }],
      tipi: [{ k: 'ass', l: 'Assenza oltre 6 mesi', m: 'l’assenza dai Lavori di Loggia protratta oltre sei mesi senza giustificato motivo' }, { k: 'mor', l: 'Morosità oltre 12 mesi', m: 'la morosità nel pagamento delle capitazioni o dei tributi, protratta oltre dodici mesi' }],
      hint: 'È una lettera: va inviata per raccomandata A/R (o PEC) al domicilio risultante dal piè di lista. Il Consiglio di Disciplina è il Consiglio delle Luci.',
      b: (c) => ({
        o: `${c.Ls} – diffida ai sensi dell’art. 17 del Regolamento dell’Ordine – ${c.x('nome')}`,
        t: `Caro Fratello ${c.x('nome')},\n\nil Consiglio di Disciplina della ${c.L} constata ${c.tipo.m} (art. 12 della Costituzione) e ti diffida, ai sensi dell’art. 17 del Regolamento dell’Ordine, a porti in regola con il Tesoro e a riprendere la frequenza dei Lavori entro trenta giorni dal ricevimento della presente.\n\nDecorso inutilmente il termine, senza giustificazione e senza sanatoria, il Consiglio di Disciplina riferirà alla Loggia in grado di Maestro per la declaratoria di decadenza e il conseguente depennamento dal piè di lista.\n\nCon fraterni saluti,\nIl Maestro Venerabile\n[Nome e cognome del Maestro Venerabile]`,
      }),
    },
    ar: {
      t: 'A/R alla Gran Segreteria', a: [IND.GSEG], cc: [IND.COL],
      campi: [{ k: 'nome', l: 'Nome e cognome del Fratello' }],
      hint: 'Il modello A/R (regolarizzazione) va alla Gran Segreteria. Allega in PDF A/R, certificati, curriculum, copia dei brevetti e foto.',
      b: (c) => ({
        o: `${c.Ls} – Mod. A/R – domanda di regolarizzazione – ${c.x('nome')}`,
        t: `Carissimi Fratelli,\n\ntrasmetto in allegato la domanda di regolarizzazione (modello A/R) di ${c.x('nome')}, con gli allegati richiesti.\n\n${c.firma}`,
      }),
    },
    el_verbale: {
      t: 'Verbale delle elezioni', a: [IND.GSEG], cc: [IND.COL],
      campi: [DATA('Data delle elezioni')],
      hint: 'Allega il processo verbale completo delle 5 pagine, in PDF. Va inviato subito dopo le votazioni: senza Nulla Osta non si può insediare. L’insediamento deve avvenire entro il 31 gennaio (art. 49 Reg.).',
      b: (c) => ({
        o: `${c.Ls} – verbale delle elezioni delle cariche del ${c.x('data')} – richiesta Nulla Osta all’insediamento`,
        t: `Carissimi Fratelli,\n\ntrasmetto in allegato il processo verbale, completo delle cinque pagine, delle elezioni delle cariche di Loggia svoltesi in data ${c.x('data')}, e chiedo il Nulla Osta del Gran Maestro all’insediamento.\n\n${c.firma}`,
      }),
    },
    ins: {
      t: 'Invii dopo l’insediamento', a: [IND.ANA], cc: [],
      campi: [DATA('Data dell’insediamento')],
      tipi: [
        { k: 'ana', l: 'Anagrafe: Promessa Solenne e nomina del Segretario', a: [IND.ANA], oo: 'Promessa Solenne e nomina del Segretario', txt: 'il modulo di Promessa Solenne e il modulo di Nomina del Segretario di Loggia' },
        { k: 'gseg', l: 'Gran Segreteria: Ufficiali, Trapasso dei Poteri, Conto gestione e Relazione', a: [IND.GSEG], oo: 'Ufficiali, Trapasso dei Poteri, Conto gestione e Relazione', txt: 'il modulo di Nomina degli Ufficiali di Loggia, il Verbale di Trapasso dei Poteri e il modulo Conto Gestione con la Relazione sui Lavori svolti nell’anno' },
        { k: 'sped', l: 'Ufficio Spedizioni: Aggiornamenti', a: [IND.SPED], oo: 'modulo Aggiornamenti', txt: 'il modulo Aggiornamenti' },
      ],
      hint: 'Indirizzi dalla circolare del Corso Segretari 2024. Nella circolare di quell’anno la Promessa Solenne andava inviata entro il 10 febbraio: verifica le scadenze nella circolare dell’anno in corso.',
      b: (c) => ({
        o: `${c.Ls} – insediamento del ${c.x('data')} – ${c.tipo.oo}`,
        t: `Carissimi Fratelli,\n\nin seguito all’insediamento delle cariche di Loggia, avvenuto in data ${c.x('data')}, trasmetto in allegato ${c.tipo.txt}.\n\n${c.firma}`,
      }),
    },
    pdl: {
      t: 'Piè di lista semestrale', a: [IND.ANA, IND.GSEG, IND.COL], cc: [],
      campi: [DATA('Alla data del (30 giugno o 31 dicembre)')],
      hint: 'Allega il piè di lista in Excel e in PDF firmato (Oratore, Venerabile, Segretario). Senza il piè di lista al 30 giugno e al 31 dicembre non viene rilasciato il Nulla Osta per il rinnovo cariche. Invia dalla casella istituzionale.',
      b: (c) => ({
        o: `${c.Ls} – piè di lista alla data del ${c.x('data')}`,
        t: `Carissimi Fratelli,\n\ntrasmetto in allegato il piè di lista della Loggia aggiornato alla data del ${c.x('data')}, in formato Excel e in PDF firmato.\n\n${c.firma}`,
      }),
    },
    onorario: {
      t: 'Richiesta Fratello Onorario', a: [IND.GM], cc: [IND.COL],
      campi: [{ k: 'nome', l: 'Nome e cognome del Fratello' }, { k: 'prov', l: 'Loggia o Obbedienza di appartenenza' }, DATA('Data della votazione')],
      hint: 'Art. 14 Reg.: serve il voto unanime della Loggia e il Nulla Osta del Gran Maestro. L’indirizzo è quello che il Corso Segretari indica per la nomina dei Fratelli Onorari: verificalo prima dell’invio.',
      b: (c) => ({
        o: `${c.Ls} – richiesta di Nulla Osta per l’iscrizione come Fratello Onorario – ${c.x('nome')}`,
        t: `Carissimi Fratelli,\n\nla nostra Loggia, in data ${c.x('data')}, ha deliberato a voti unanimi l’iscrizione, con la qualifica di Fratello Onorario, del Fr∴ ${c.x('nome')}, Maestro attivo nella ${c.x('prov')}, ai sensi dell’art. 14 del Regolamento dell’Ordine.\n\nChiediamo il Nulla Osta del Gran Maestro.\n\n${c.firma}`,
      }),
    },
    titolo_sede: {
      t: 'Cambio di titolo o sede', a: [IND.GSEG], cc: [IND.COL],
      campi: [{ k: 'nuovo', l: 'Nuovo titolo o nuova sede' }, DATA('Data della seduta di Terzo Grado')],
      tipi: [{ k: 'tit', l: 'Modifica del titolo distintivo', g: 'la modifica del titolo distintivo' }, { k: 'sed', l: 'Trasferimento della sede', g: 'il trasferimento della sede' }],
      hint: 'Art. 72/bis Reg.: la richiesta è per la Giunta e va con copia dell’avviso di convocazione e copia del verbale della seduta di Terzo Grado firmato da tutti i Maestri in piè di lista. L’indirizzo di invio va verificato con la Gran Segreteria.',
      b: (c) => ({
        o: `${c.Ls} – richiesta di ${c.tipo.g.replace('la ', '')}`,
        t: `Carissimi Fratelli,\n\nla Loggia, nella seduta di Terzo Grado del ${c.x('data')}, ha deliberato ${c.tipo.g}: ${c.x('nuovo')}.\n\nAi sensi dell’art. 72/bis del Regolamento dell’Ordine chiediamo l’approvazione della Giunta e alleghiamo copia dell’avviso di convocazione e copia del verbale firmato da tutti i Fratelli Maestri iscritti nel piè di lista.\n\n${c.firma}`,
      }),
    },
    delega: {
      t: 'Delega per Gran Loggia o Assemblea', a: [IND.GSEG], cc: [],
      campi: [{ k: 'delegato', l: 'Nome e cognome del delegato' }, DATA('Data della seduta di Terzo Grado'), { k: 'evento', l: 'Data della Gran Loggia o dell’Assemblea' }],
      tipi: [{ k: 'gl', l: 'Gran Loggia (art. 64 Reg.)', ev: 'Gran Loggia' }, { k: 'am', l: 'Assemblea dei Maestri Venerabili (art. 28/bis Cost.)', ev: 'Assemblea dei Maestri Venerabili' }],
      hint: 'Il sostituto va scelto tra i Maestri che sono stati Venerabili della Loggia o, in mancanza, tra i Dignitari. La delega deve risultare dall’estratto del verbale di Loggia in grado di Maestro. L’invio alla Gran Segreteria è previsto per la Gran Loggia; per l’Assemblea verifica le istruzioni della convocazione.',
      b: (c) => ({
        o: `${c.Ls} – delega per ${c.tipo.ev} del ${c.x('evento')}`,
        t: `Carissimi Fratelli,\n\nil Maestro Venerabile è impossibilitato a partecipare alla ${c.tipo.ev} del ${c.x('evento')}. La Loggia, nella seduta in grado di Maestro del ${c.x('data')}, ha designato come suo sostituto il Fr∴ ${c.x('delegato')}.\n\nTrasmetto in allegato l’estratto del verbale.\n\n${c.firma}`,
      }),
    },
    verbale_consegna: {
      t: 'Verbale di consegna tra segretari', a: [], cc: [], solo: true,
      campi: [{ k: 'uscente', l: 'Segretario uscente' }, { k: 'entrante', l: 'Segretario subentrante' }, { k: 'efficacia', l: 'Data di efficacia della nomina' }, { k: 'dal', l: 'Periodo: dal' }, { k: 'al', l: 'Periodo: al' }, { k: 'usb', l: 'Identificativo della chiavetta USB' }, DATA('Data della consegna')],
      hint: 'Traccia dal Regolamento della segreteria (art. 10). Il verbale non deve contenere password né codici di recupero; le chiavi si consegnano per un canale separato. Va firmato dai due segretari, mostrato al Venerabile e conservato nella cartella 08.',
      b: (c) => ({
        o: `Verbale di consegna dell’archivio – ${c.Ls}`,
        t: `In data ${c.x('data')}, il segretario uscente ${c.x('uscente')} consegna al segretario subentrante ${c.x('entrante')}, nominato con efficacia dal ${c.x('efficacia')}, il supporto USB identificato come ${c.x('usb')}, contenente l’archivio digitale della ${c.L} e il lavoro svolto nel periodo dal ${c.x('dal')} al ${c.x('al')}, organizzato secondo il Regolamento della segreteria.\n\nSono allegati l’inventario dei documenti e il prospetto delle pratiche pendenti. Le verifiche congiunte effettuate hanno avuto il seguente esito: [esito].\nLe eventuali carenze, riserve e integrazioni da eseguire, con responsabile e termine, sono le seguenti: [carenze].\nLa disponibilità degli accessi istituzionali e la consegna separata delle chiavi di apertura sono state verificate nei seguenti termini: [chiavi].\n\nCopia del presente verbale viene trasmessa al Maestro Venerabile.\n\nIl segretario uscente ____________________\nIl segretario subentrante ____________________\nIl Maestro Venerabile per presa visione ____________________`,
      }),
    },
  };

  const lista = (a) => (a || []).join(', ');

  function apri(id) {
    const m = M[id];
    if (!m) return;
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    const tipi = m.tipi || null;
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(m.t)}">
      <div class="modal-h"><h2>${esc(m.t)}</h2><button class="btn ghost small" type="button" data-x>Chiudi</button></div>
      <div class="modal-b">
        <div class="form-grid">
          ${tipi ? `<div class="f s12"><label for="bz-tipo">Variante</label><select id="bz-tipo">${tipi.map((t) => `<option value="${esc(t.k)}">${esc(t.l)}</option>`).join('')}</select></div>` : ''}
          ${m.campi.map((c, i) => `<div class="f s6"><label for="bz-c${i}">${esc(c.l)}</label><input id="bz-c${i}" data-k="${esc(c.k)}" autocomplete="off"></div>`).join('')}
        </div>
        <div class="hint" style="margin:8px 0">I campi lasciati vuoti restano tra parentesi quadre nel testo: completali prima di inviare.</div>
        <div class="form-grid">
          ${m.solo ? '' : `<div class="f s12"><label for="bz-a">A</label><input id="bz-a" value=""></div><div class="f s12"><label for="bz-cc">Cc</label><input id="bz-cc" value=""></div>`}
          <div class="f s12"><label for="bz-o">Oggetto</label><input id="bz-o"></div>
          <div class="f s12"><label for="bz-t">Testo</label><textarea id="bz-t" rows="14" style="width:100%"></textarea></div>
        </div>
        <div class="hint" id="bz-hint" style="margin-top:8px"></div>
        <div class="actions" style="margin-top:14px">
          <button class="btn gold" type="button" id="bz-copia">Copia testo</button>
          ${m.solo ? '' : '<button class="btn" type="button" id="bz-mail">Apri nel programma di posta</button>'}
          <button class="btn ghost" type="button" data-x>Chiudi</button>
        </div>
      </div></div>`;
    document.body.appendChild(ov);
    const chiudi = () => ov.remove();
    $$('[data-x]', ov).forEach((b) => { b.onclick = chiudi; });
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) chiudi(); });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') chiudi(); });

    let sporco = false;
    const tipoCorrente = () => (tipi ? tipi.find((t) => t.k === $('#bz-tipo', ov).value) : null);
    const ctx = () => {
      const v = {};
      $$('[data-k]', ov).forEach((i) => { v[i.dataset.k] = i.value.trim(); });
      const tipo = tipoCorrente();
      return {
        v, tipo, L: lungo(), Ls: corto(), firma: `Con fraterni saluti,\n${segretario()}\nSegretario della ${lungo()}`,
        x: (k) => v[k] || '[' + ((m.campi.find((c) => c.k === k) || {}).l || k).toLowerCase() + ']',
      };
    };
    const rigenera = () => {
      const c = ctx();
      const r = m.b(c);
      $('#bz-o', ov).value = r.o;
      if (!sporco) $('#bz-t', ov).value = r.t;
      if (!m.solo) {
        const t = c.tipo;
        $('#bz-a', ov).value = lista((t && t.a) || m.a);
        $('#bz-cc', ov).value = lista((t && t.cc) || m.cc);
      }
      $('#bz-hint', ov).innerHTML = `${esc(m.hint || '')}${m.solo ? '' : `<br>Invia dalla casella istituzionale della Loggia (di norma ${esc(mittente())}), mai da indirizzi personali.`}`;
    };
    $$('input[data-k], #bz-tipo', ov).forEach((e) => e.addEventListener('input', () => { if ($('#bz-tipo', ov) === e) sporco = false; rigenera(); }));
    $('#bz-t', ov).addEventListener('input', () => { sporco = true; });
    rigenera();

    const testoCompleto = () => {
      const a = m.solo ? '' : `A: ${$('#bz-a', ov).value}\nCc: ${$('#bz-cc', ov).value}\n`;
      return `${a}Oggetto: ${$('#bz-o', ov).value}\n\n${$('#bz-t', ov).value}`;
    };
    $('#bz-copia', ov).onclick = async () => {
      const txt = m.solo ? `${$('#bz-o', ov).value}\n\n${$('#bz-t', ov).value}` : testoCompleto();
      try { await navigator.clipboard.writeText(txt); toast('Bozza copiata negli appunti.'); } catch (e) {
        const ta = $('#bz-t', ov); ta.select(); document.execCommand('copy'); toast('Testo copiato.');
      }
    };
    const bm = $('#bz-mail', ov);
    if (bm) bm.onclick = () => {
      const a = $('#bz-a', ov).value.split(',').map((s) => s.trim()).filter(Boolean).join(',');
      const cc = $('#bz-cc', ov).value.split(',').map((s) => s.trim()).filter(Boolean).join(',');
      const q = [];
      if (cc) q.push('cc=' + encodeURIComponent(cc));
      q.push('subject=' + encodeURIComponent($('#bz-o', ov).value));
      q.push('body=' + encodeURIComponent($('#bz-t', ov).value.replace(/\n/g, '\r\n')));
      const url = 'mailto:' + a + '?' + q.join('&');
      if (url.length > 1900) toast('Il testo è lungo: se il programma di posta non lo accetta, usa “Copia testo”.', 'bad');
      window.location.href = url;
    };
    const primo = $('input, select', ov); if (primo) primo.focus();
  }

  window.LemmiBozze = { apri, modelli: M };
})();
