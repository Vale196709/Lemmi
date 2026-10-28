/* Lemmi - Procedure: i passi da fare nelle diverse situazioni, in forma di flusso.
 * Fonti: Regolamento dell'Ordine, Corso Segretari 2024, Regolamento della segreteria della Loggia.
 * Ogni passo dice chi agisce, quali moduli servono, le scadenze e dove, nell'app, si fa.
 * Pagina di consultazione: non scrive nulla sul database. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { esc, $, $$ } = L;

  const ATTORI = { L: 'Loggia', C: 'Collegio', G: 'GOI', F: 'Interessato' };
  // Moduli GOI che si compilano da Template (A/1 e C/1 si generano dalla scheda del bussante).
  const MODULO = { 'A/2': 'A2', 'A/R': 'AR', 'C/2': 'C2', 'C/3': 'C3', 'C/3 bis': 'C3BIS', 'N/1': 'N1', 'N/2-3': 'N23', 'N/4': 'N4', 'E/1': 'E1', 'E/2': 'E2', 'D/1': 'D1', 'D/2': 'D2', 'V/1': 'V1' };
  const APP = {
    bus: { t: 'Bussanti', h: '#/bussanti' }, cal: { t: 'Calendario', h: '#/calendario' }, pag: { t: 'Pagamenti', h: '#/pagamenti' },
    fra: { t: 'Fratelli', h: '#/fratelli' }, ele: { t: 'Elezioni cariche', h: '#/elezioni' }, pie: { t: 'Piè di lista', h: '#/piedilista' },
    tpl: { t: 'Template', h: '#/template' }, sto: { t: 'Storia', h: '#/storia' },
  };

  const P = {
    bussante: { t: 'Bussante e iniziazione', fonte: 'Regolamento artt. 2-12; Corso Segretari 2024', s: [
      { a: 'F', t: 'Il presentatore consegna la domanda al Venerabile', d: 'Domanda con allegati: certificato penale e carichi pendenti, curriculum, foto.', f: ['A/1'], app: ['bus'] },
      { a: 'L', t: 'Venerabile e Oratore controllano la regolarità formale', d: 'Il Venerabile riferisce alla Loggia e dichiara la presa in considerazione.', f: ['C/1'], w: 'Date delle votazioni con 60 giorni di preavviso', app: ['bus'] },
      { a: 'C', t: 'Il Collegio affigge il modulo e informa le Logge', d: 'Affissione nelle Case Massoniche e nel Bollettino mensile; poi 3 copie alla Gran Segreteria.', w: 'Almeno 30 giorni di affissione' },
      { a: 'L', t: 'Il Venerabile nomina almeno 3 commissari (tegolatori)', d: 'Verificano il curriculum, raccolgono informazioni e scrivono le tavole.', w: 'Entro 30 giorni' },
      { a: 'G', t: 'La Gran Segreteria restituisce C/1 e Nulla Osta', d: 'Eventuali segnalazioni negative arrivano a Loggia e Collegio. Senza Nulla Osta le votazioni sono annullate.', f: ['Nulla Osta'] },
      { a: 'L', t: 'Prima votazione in grado di Apprendista', d: 'Lettura della documentazione, discussione, conclusioni dell’Oratore, voto con palle bianche e nere. Votano anche i visitatori; l’astensione non è ammessa.', app: ['bus', 'cal'] },
      { a: 'L', dec: 1, t: 'Ci sono voti contrari?', d: 'Ogni palla nera va motivata per iscritto al Venerabile prima della tornata successiva; le palle nere non motivate si ritengono date per errore.', br: [['Nessuno', 'Seconda votazione in una tornata distinta'], ['1 o 2', 'Seconda votazione dopo 3 mesi'], ['3', 'Dopo 6 mesi'], ['Più di 3', 'Dopo 12 mesi']], w: 'Data della seconda votazione comunicata almeno 30 giorni prima' },
      { a: 'L', dec: 1, t: 'Seconda votazione: serve l’unanimità', d: 'Se resta anche un solo contrario la domanda è respinta.', br: [['Respinta', 'Modulo C/2 a Collegio e Anagrafe; riproponibile dopo 3 anni'], ['Approvata', 'Si procede con il versamento e la richiesta del brevetto']], f: ['C/2'] },
      { a: 'L', t: 'Versamento della quota e richiesta del brevetto', d: 'Bonifico alla Gran Tesoreria con causale «Quota di ammissione/prima rata Bussante (nome e cognome)».', f: ['N/1'], w: 'Copia al Collegio', app: ['pag'] },
      { a: 'G', t: 'Nulla Osta e Brevetto, poi iniziazione', d: 'Il Venerabile fissa data e ora; l’iniziato firma testamento e promessa solenne.' },
      { a: 'L', t: 'Arricchimento del piè di lista', d: 'Si inviano C/3 e promessa solenne ad Anagrafe e Collegio.', f: ['C/3'], app: ['fra'] },
    ] },
    grado: { t: 'Passaggio di grado', fonte: 'Regolamento art. 13; Corso Segretari 2024', s: [
      { a: 'L', t: 'Proposta di promozione o elevazione', d: 'La fa il Consiglio delle Luci o un Maestro con il sacco delle proposizioni tacite. Serve almeno un anno nel grado.', app: ['fra'] },
      { a: 'L', dec: 1, t: 'Votazione palese in loggia del grado superiore', d: 'Maggioranza semplice dei presenti, su proposta motivata.', br: [['Esito positivo', 'Si procede con quota e brevetto'], ['Esito negativo', 'Nessun adempimento verso il GOI']] },
      { a: 'L', t: 'Versamento e richiesta del brevetto', d: 'Causale «seconda rata Compagno» o «terza rata Maestro», con nome e cognome.', f: ['N/2-3'], w: 'Copia al Collegio', app: ['pag'] },
      { a: 'G', t: 'Nulla Osta e Brevetto del Gran Maestro', d: 'Per abbreviare i termini la Loggia chiede il Nulla Osta con domanda motivata al Gran Maestro.' },
      { a: 'L', t: 'Cerimonia di passaggio o elevazione', d: 'La data della cerimonia fa decorrere l’anzianità nel nuovo grado.', app: ['cal'] },
      { a: 'L', t: 'Comunicazione ad Anagrafe e Collegio', d: 'Con la promessa solenne, per e-mail.', f: ['C/3 bis'], app: ['sto'] },
    ] },
    exeat: { t: 'Trasferimento (Exeat)', fonte: 'Regolamento artt. 14-15', s: [
      { a: 'F', t: 'Il Fratello chiede l’affiliazione alla Loggia di destinazione', d: 'Informa nello stesso tempo la Loggia di appartenenza. Deve essere dell’Oriente di residenza, dimora, domicilio o lavoro.' },
      { a: 'L', dec: 1, t: 'Stesso Oriente o altro Oriente?', d: 'Cambia il modo di decidere (è la Loggia che accoglie).', br: [['Stesso Oriente', 'La Loggia decide in terzo grado a maggioranza dei presenti'], ['Altro Oriente', 'L’affiliazione spetta di diritto']] },
      { a: 'L', t: 'La Loggia che accoglie chiede Exeat e fascicolo personale', d: 'Raccomandata A/R o PEC alla Loggia di provenienza, in copia a Gran Segreteria e Collegio.', f: ['E/2'] },
      { a: 'L', dec: 1, t: 'La Loggia di provenienza rilascia l’Exeat', d: 'È un atto dovuto e si considera concesso dopo 30 giorni di silenzio. Con la concessione trasmette E/1 a Collegio e Anagrafe.', br: [['Negato se', 'Capitazioni dell’anno non pagate'], ['Negato se', 'Processo pendente (altra Circoscrizione)'], ['Negato se', 'La Loggia scende sotto il minimo di Fratelli']], f: ['E/1'], w: '30 giorni', app: ['pag'] },
      { a: 'L', t: 'Il trasferimento vale dalla data dell’Exeat', d: 'Prima tornata utile: promessa solenne al Venerabile, ai Dignitari e agli Ufficiali della Loggia che riceve.', app: ['fra'] },
    ] },
    sonno: { t: 'Assonnamento (sonno)', fonte: 'Regolamento art. 16', s: [
      { a: 'F', t: 'Domanda scritta alla Loggia', d: 'Serve essere in regola con il Tesoro per tutto l’anno massonico e non essere sotto giudizio.', app: ['pag'] },
      { a: 'L', t: 'Il Venerabile ne dà comunicazione alla Loggia', d: 'Nella tornata successiva, se il Fratello non ha receduto, la Loggia prende atto.' },
      { a: 'L', t: 'Comunicazione a Collegio e Anagrafe', d: 'Si compila la parte relativa al sonno.', f: ['D/1'], app: ['fra'] },
      { a: 'F', t: 'Effetti', d: 'Non si frequentano i lavori e si perdono i diritti massonici, ma restano i doveri dell’iniziazione. Per tornare serve la riammissione (A/2).' },
    ] },
    depennamento: { t: 'Depennamento per assenza o morosità', fonte: 'Costituzione artt. 12-13; Regolamento art. 17', s: [
      { a: 'L', dec: 1, t: 'Presupposti (art. 12 Cost.)', br: [['Assenza', 'Oltre 6 mesi senza giustificato motivo'], ['Morosità', 'Oltre 12 mesi di capitazioni o tributi']], app: ['pag'] },
      { a: 'L', t: 'Il Consiglio di disciplina diffida il Fratello', d: 'Raccomandata A/R: mettersi in regola con il Tesoro e riprendere la frequenza.', w: '30 giorni dalla ricezione' },
      { a: 'L', dec: 1, t: 'Il Fratello si è giustificato e ha sanato?', br: [['Sì', 'La procedura si chiude'], ['No', 'Il Consiglio riferisce alla Loggia in grado di Maestro']] },
      { a: 'L', t: 'Declaratoria di decadenza e depennamento', d: 'Intervenuta la decadenza, il Consiglio dispone il depennamento dal piè di lista.' },
      { a: 'C', t: 'Comunicazioni obbligatorie', d: 'All’interessato, al Collegio e alla Gran Segreteria; il D/2 va allegato al D/1.', f: ['D/1', 'D/2'], app: ['fra'] },
      { a: 'F', t: 'Reclamo e restituzione', d: 'Reclamo al Tribunale Circoscrizionale solo per violazioni procedurali, entro 30 giorni (non sospende il provvedimento). Restituire tessera e beni della Loggia.' },
    ] },
    riammissione: { t: 'Riammissione e regolarizzazione', fonte: 'Regolamento artt. 12/bis e 19; Corso Segretari 2024', s: [
      { a: 'F', dec: 1, t: 'Quale domanda?', br: [['Riammissione', 'Dal sonno o dal depennamento: A/2 alla Loggia di appartenenza'], ['Regolarizzazione', 'Da altra Obbedienza: A/R alla Gran Segreteria']], f: ['A/2', 'A/R'], app: ['bus'] },
      { a: 'F', t: 'Documenti', d: 'Certificato penale e carichi pendenti, foto; per la regolarizzazione anche curriculum, copia dei brevetti e dichiarazione di iniziazione secondo gli Antichi Doveri.' },
      { a: 'C', t: 'Regolarizzazione: assegnazione a una Loggia', d: 'La Gran Segreteria verifica la domanda e il Presidente del Collegio assegna il Fratello a una Loggia.' },
      { a: 'L', t: 'C/1 al Collegio con le date di votazione', d: 'Per la riammissione con 30 giorni di preavviso; affissione e Nulla Osta come per il bussante.', f: ['C/1'], w: '30 giorni', app: ['bus'] },
      { a: 'L', t: 'Voto unico nel grado già acquisito', d: 'Votano anche i visitatori. Valgono le regole sulle palle nere.', app: ['cal'] },
      { a: 'L', t: 'Richiesta del brevetto e promessa solenne', d: 'Bonifico con causale «Riammissione (nome e cognome)» o «Regolarizzazione (nome e cognome)».', f: ['N/4'], app: ['pag'] },
    ] },
    elezioni: { t: 'Elezione e insediamento delle cariche', fonte: 'Costituzione artt. 17-21; Regolamento artt. 30-33 e 49', s: [
      { a: 'L', t: 'Preparazione e convocazione', d: 'Tornata di Famiglia in terzo grado, nel periodo dal 15 novembre al 15 dicembre. Convocazione per raccomandata, a mano o e-mail con conferma, anche al Presidente del Collegio.', w: 'Almeno 15 giorni prima', app: ['ele', 'cal'] },
      { a: 'L', t: 'Verifica di chi si può eleggere', d: 'Venerabile: almeno 3 anni da Maestro e 1 anno da Dignitario. Dignitari: almeno 1 anno da Maestro. Tutti in piè di lista e in regola con il Tesoro.', app: ['ele', 'sto'] },
      { a: 'L', t: 'Votazione a scheda segreta', d: 'Prima il Venerabile, poi i Dignitari (il Segretario lo nomina il Venerabile). L’Oratore con due scrutatori fa lo scrutinio; serve la maggioranza assoluta, altrimenti si ripete.', app: ['ele'] },
      { a: 'L', t: 'Verbale in originale e copia', d: 'Sui moduli della Gran Segreteria, firmati da tutti i Maestri presenti. L’originale va alla Gran Segreteria; la copia resta agli atti.', app: ['ele'] },
      { a: 'G', t: 'Nulla Osta del Gran Maestro', d: 'Senza piè di lista inviato al 30 giugno e al 31 dicembre il Nulla Osta non viene rilasciato.', f: ['Nulla Osta'] },
      { a: 'L', t: 'Comunicazione a Compagni e Apprendisti', d: 'Nella tornata di primo grado successiva alle elezioni.' },
      { a: 'L', t: 'Insediamento con promessa solenne', d: 'Dopo il Nulla Osta, con cerimonia. Il Venerabile presta promessa, nomina Segretario e Ufficiali e riceve le promesse; poi consegne di Bolla, bandiera, labaro, sigillo, archivio e tesoro con verbale.', w: 'Entro il 31 gennaio', app: ['ele'] },
      { a: 'G', t: 'Comunicazioni dopo l’insediamento', d: 'Ad Anagrafe: promessa solenne e nomina del Segretario. Alla Gran Segreteria: nomina degli Ufficiali, trapasso dei poteri, relazione e conto gestione.', app: ['ele'] },
      { a: 'L', t: 'Adempimenti di segreteria', d: 'Cambio password PEO e PEC, verifica del legale rappresentante dell’associazione e consegne tra segretari entro 20 giorni.', w: '20 giorni per le consegne' },
    ] },
    piedilista: { t: 'Piè di lista semestrale', fonte: 'Corso Segretari 2024', s: [
      { a: 'L', t: 'Aggiornare l’anagrafica dei Fratelli', d: 'Grado, nome, data di nascita, indirizzo, professione, cellulare, e-mail e percentuale di esonero dalla capitazione.', w: 'Alla data del 30 giugno e del 31 dicembre', app: ['pie', 'fra'] },
      { a: 'L', t: 'Preparare Excel e PDF', d: 'L’app propone anche i firmatari dalle cariche dell’anno.', app: ['pie'] },
      { a: 'L', t: 'Firme di Oratore, Venerabile e Segretario', d: 'Il PDF si firma; l’Excel si invia così com’è.' },
      { a: 'C', t: 'Invio a Anagrafe, Gran Segreteria e Collegio', d: 'Dalla casella istituzionale della Loggia, mai da indirizzi personali.' },
      { a: 'G', t: 'Conseguenza se manca', d: 'Senza piè di lista la Gran Segreteria non rilascia il Nulla Osta per il rinnovo delle cariche.' },
    ] },
  };
  const ORDINE = ['bussante', 'grado', 'exeat', 'sonno', 'depennamento', 'riammissione', 'elezioni', 'piedilista'];

  // Promemoria personale: i passi spuntati restano solo su questo browser, non nel database.
  const chiave = (k) => 'lemmi.procedure.' + k;
  const leggi = (k) => { try { return JSON.parse(localStorage.getItem(chiave(k))) || []; } catch (e) { return []; } };
  const salva = (k, a) => { try { localStorage.setItem(chiave(k), JSON.stringify(a)); } catch (e) { /* ignora */ } };

  L.viste.procedure = async function (v, parti) {
    const k = P[parti[1]] ? parti[1] : 'bussante';
    const p = P[k];
    const chip = (x) => (MODULO[x]
      ? `<a class="pchip form" href="#/template/modulo/${MODULO[x]}" title="Apri la compilazione del modulo">${esc(x)}</a>`
      : (x === 'A/1' || x === 'C/1') ? `<a class="pchip form" href="#/bussanti" title="Si genera dalla scheda del bussante">${esc(x)}</a>`
        : `<span class="pchip form">${esc(x)}</span>`);
    const fatti = leggi(k).filter((i) => i < p.s.length);
    const moduli = [...new Set(p.s.flatMap((s) => s.f || []))];
    const scad = p.s.filter((s) => s.w).length;
    const passi = p.s.map((s, i) => {
      const tags = [`<span class="pchip att-${s.a}">${ATTORI[s.a]}</span>`]
        .concat((s.f || []).map(chip))
        .concat(s.w ? [`<span class="pchip tempo">${esc(s.w)}</span>`] : [])
        .concat((s.app || []).map((a) => `<a class="pchip app" href="${APP[a].h}">Nell’app: ${esc(APP[a].t)}</a>`))
        .join('');
      const br = s.br ? `<div class="pbr">${s.br.map((b) => `<div><b>${esc(b[0])}</b>${esc(b[1])}</div>`).join('')}</div>` : '';
      return `<div class="pstep${fatti.includes(i) ? ' fatto' : ''}" data-i="${i}"><div class="pnum"><button type="button" class="pcheck" aria-pressed="${fatti.includes(i)}" title="Segna il passo come fatto">${fatti.includes(i) ? '✓' : i + 1}</button>${i < p.s.length - 1 ? '<u></u>' : ''}</div>
        <div class="pcard${s.dec ? ' dec' : ''}"><h3>${esc(s.t)}</h3>${s.d ? `<p>${esc(s.d)}</p>` : ''}${br}<div class="ptags">${tags}</div></div></div>`;
    }).join('');
    v.innerHTML = `
      <div class="page-head"><div><h1>Procedure</h1><p>I passi da fare nelle diverse situazioni, con moduli, scadenze e collegamenti all’app</p></div></div>
      <div class="ppills">${ORDINE.map((x) => `<a href="#/procedure/${x}" class="ppill${x === k ? ' on' : ''}">${esc(P[x].t)}</a>`).join('')}</div>
      <div class="pbar"><div class="pbar-txt"><b id="p-conta">${fatti.length} di ${p.s.length}</b> passi fatti · ${moduli.length ? 'Moduli: ' + esc(moduli.join(', ')) + ' · ' : ''}${scad} ${scad === 1 ? 'scadenza' : 'scadenze'}</div>
        <div class="pbar-track"><div id="p-barra" style="width:${Math.round(100 * fatti.length / p.s.length)}%"></div></div>
        <div class="actions"><button class="btn ghost small" id="p-reset" type="button">Azzera spunte</button><button class="btn ghost small" id="p-stampa" type="button">Stampa o salva PDF</button></div></div>
      <div class="pleg"><span><i class="att-L"></i>Loggia</span><span><i class="att-C"></i>Collegio</span><span><i class="att-G"></i>GOI</span><span><i class="att-F"></i>Interessato</span><span><i class="dec"></i>Decisione o condizione</span></div>
      <h2 class="ptit">${esc(p.t)}</h2>
      <div class="pflow">${passi}</div>
      <div class="hint" style="margin-top:12px">Fonte: ${esc(p.fonte)}. È una guida di consultazione: in caso di dubbio valgono Costituzione, Regolamento dell’Ordine e circolari GOI dell’anno.</div>`;
    const aggiorna = () => {
      const n = $$('.pstep.fatto', v).length;
      $('#p-conta', v).textContent = `${n} di ${p.s.length}`;
      $('#p-barra', v).style.width = Math.round(100 * n / p.s.length) + '%';
      salva(k, $$('.pstep.fatto', v).map((e) => +e.dataset.i));
    };
    $$('.pcheck', v).forEach((b) => b.addEventListener('click', () => {
      const st = b.closest('.pstep'); const f = st.classList.toggle('fatto');
      b.textContent = f ? '✓' : (+st.dataset.i + 1); b.setAttribute('aria-pressed', f ? 'true' : 'false'); aggiorna();
    }));
    $('#p-reset', v).onclick = () => { $$('.pstep.fatto', v).forEach((st) => { st.classList.remove('fatto'); const b = $('.pcheck', st); b.textContent = +st.dataset.i + 1; b.setAttribute('aria-pressed', 'false'); }); aggiorna(); };
    $('#p-stampa', v).onclick = () => window.print();
  };
})();
