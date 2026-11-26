/* Lemmi - Consegne tra segretari: prospetto delle pratiche pendenti, inventario dell'archivio e verifica congiunta.
 * Riferimento: Regolamento della segreteria della Loggia, artt. 7-9 (prospetto, inventario, verbale).
 * Produce un file Excel con tre fogli: Pendenze, Inventario, Verifica congiunta.
 * I conteggi riguardano solo ciò che è registrato nell'app; le parti fuori dall'app sono indicate come "da verificare a mano". */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L || !L.pratiche) return;
  const { state, $, esc, chk, toast, fmtData, oggi } = L;
  const sb = () => state.sb;
  const ruolo = () => (state.profilo && state.profilo.ruolo) || '';
  const puo = () => ['segretario', 'amministratore'].includes(ruolo());

  const ATTORE = { L: 'Loggia', C: 'Collegio', G: 'GOI', F: 'Interessato' };
  const valida = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || '');
  const nelPeriodo = (iso, dal, al) => valida(iso) && iso >= dal && iso <= al;
  const giorno = (ts) => String(ts || '').slice(0, 10);
  const conta = (arr) => arr.reduce((m, k) => { m[k] = (m[k] || 0) + 1; return m; }, {});
  const GRADI = { apprendista: ['Apprendista', 'Apprendisti'], compagno: ['Compagno', 'Compagni'], maestro: ['Maestro', 'Maestri'] };
  const pl = (n, sg, pi) => `${n} ${n === 1 ? sg : pi}`;
  // nomi[k] = [singolare, plurale]; senza nome si usa la chiave così com'è
  const elenco = (m, nomi) => Object.keys(m).sort().map((k) => { const nm = nomi && nomi[k]; return nm ? pl(m[k], nm[0], nm[1]) : `${m[k]} ${k}`; }).join(', ');
  const TIPI_DOMANDA = { iniziazione: ['iniziazione', 'iniziazioni'], riammissione: ['riammissione', 'riammissioni'], cancellazione_pena: ['cancellazione della pena', 'cancellazioni della pena'], regolarizzazione: ['regolarizzazione', 'regolarizzazioni'], affiliazione_estero: ['affiliazione dall’estero', 'affiliazioni dall’estero'] };
  const TIPI_TORNATA = { ordinaria: ['ordinaria', 'ordinarie'], informale: ['informale', 'informali'], straordinaria: ['straordinaria', 'straordinarie'], agape: ['agape', 'agapi'] };
  const STATI_APERTI = ['assegnato', 'in_preparazione', 'consegnato'];

  /* ---------- raccolta dati ---------- */
  async function leggi(tab, cols) {
    try { return chk(await sb().from(tab).select(cols)); } catch (e) { return null; }   // null = non leggibile con questo profilo
  }

  async function raccogli(dal, al) {
    const proc = L.PROCEDURE || {};
    const pratiche = await L.pratiche.elenco(false);
    const aperte = pratiche.filter((x) => x.p.stato === 'in_corso');

    // ultima attività di ogni pratica = data dell'ultimo passo spuntato
    const ultimo = {};
    if (aperte.length) {
      const passi = await leggi('pratiche_passi', 'pratica_id,data_fatto');
      (passi || []).forEach((r) => { if (!ultimo[r.pratica_id] || r.data_fatto > ultimo[r.pratica_id]) ultimo[r.pratica_id] = r.data_fatto; });
    }
    const righe = aperte.map((x) => {
      const def = proc[x.p.procedura];
      const passi = def ? def.s : [];
      let prossimo = -1; for (let i = 0; i < passi.length; i++) { if (!x.fatti.has(i)) { prossimo = i; break; } }
      const scad = x.calc.it.filter((s) => !x.fatti.has(s.passo)).sort((a, b) => a.data.localeCompare(b.data))[0];
      return [
        'Pratica in corso', x.p.titolo, def ? def.t : x.p.procedura, x.p.rif_nome || '',
        fmtData(giorno(x.p.creata_il)), `${x.fatti.size} di ${passi.length}`,
        fmtData(ultimo[x.p.id] || giorno(x.p.creata_il)),
        prossimo >= 0 ? (ATTORE[passi[prossimo].a] || '') : '—',
        prossimo >= 0 ? passi[prossimo].t : 'Tutti i passi fatti: chiudere la pratica',
        scad ? `${scad.l} ${fmtData(scad.data)}` : '',
        x.calc.av.join(' '),
      ];
    });

    // tavole e lavori ancora da chiudere
    const fr = (await leggi('fratelli', 'id,cognome,nome,stato,data_uscita')) || [];
    const nomeFr = (id) => { const f = fr.find((y) => y.id === id); return f ? f.cognome + ' ' + f.nome : ''; };
    const lavori = await leggi('lavori', 'titolo,tipo,fratello_id,autore_esterno,stato,data_assegnazione,data_consegna_prevista,data_presentazione');
    (lavori || []).filter((l) => STATI_APERTI.includes(l.stato)).forEach((l) => {
      righe.push([
        'Tavola o lavoro da chiudere', l.titolo, 'Lavori e tavole', (l.fratello_id ? nomeFr(l.fratello_id) : l.autore_esterno) || '',
        fmtData(l.data_assegnazione), l.stato.replace('_', ' '), '', 'Fratello autore', 'Consegna / presentazione della tavola',
        l.data_consegna_prevista ? 'entro il ' + fmtData(l.data_consegna_prevista) : '', '',
      ]);
    });

    // attività del diario della segreteria ancora aperte (cartella 08): prossimo adempimento e da chi si attende riscontro
    const attivita = await leggi('segreteria_attivita', 'data,oggetto,destinatario,stato,prossimo_adempimento,attesa_da,scadenza,rif_archivio');
    (attivita || []).filter((a) => a.stato !== 'chiusa').forEach((a) => {
      righe.push([
        'Attività della segreteria in corso', a.oggetto, 'Diario della segreteria (cartella 08)', a.destinatario || '', fmtData(a.data),
        a.stato === 'attesa' ? 'in attesa di riscontro' : 'in corso', '', a.attesa_da || a.destinatario || '', a.prossimo_adempimento || '',
        a.scadenza ? 'entro il ' + fmtData(a.scadenza) : '', a.rif_archivio ? 'cartella ' + a.rif_archivio : '',
      ]);
    });

    // caselle e servizi (cartella 04): al passaggio di consegne vanno cambiate le password e verificati recupero e due passaggi
    const caselle = await leggi('caselle_rinnovi', 'nome,tipo,indirizzo,gestore,scadenza,rinnovo_automatico,ultimo_cambio_password,due_passaggi,recapiti_recupero,custodia_credenziali,attivo');
    (caselle || []).filter((c) => c.attivo).forEach((c) => {
      const avv = [!c.recapiti_recupero ? 'recapiti di recupero da indicare' : '', !c.due_passaggi ? 'verifica in due passaggi non attiva' : '', c.custodia_credenziali ? 'credenziali: ' + c.custodia_credenziali : 'indicare dove sono custodite le credenziali'].filter(Boolean).join('; ');
      righe.push([
        'Casella o servizio da passare', c.nome, 'Caselle e rinnovi', c.indirizzo || '', '', c.gestore ? 'gestore ' + c.gestore : '',
        c.ultimo_cambio_password ? 'password cambiata il ' + fmtData(c.ultimo_cambio_password) : 'nessun cambio password registrato', 'Nuovo Venerabile e nuovo Segretario',
        'Cambiare la password, verificare recapiti di recupero e verifica in due passaggi, togliere gli accessi non più autorizzati',
        c.scadenza ? (c.rinnovo_automatico ? 'rinnovo automatico il ' : 'rinnovo entro il ') + fmtData(c.scadenza) : '', avv,
      ]);
    });

    // originali cartacei fuori dall'archivio (prelevati o trasmessi senza copia in cartellina)
    const originali = await leggi('originali_cartacei', 'cartellina,descrizione,riferimento,stato,destinatario,data_uscita,rientro_previsto,copia_in_cartellina');
    (originali || []).filter((o) => o.stato === 'prelevato' || (o.stato === 'trasmesso' && !o.copia_in_cartellina)).forEach((o) => {
      righe.push([
        'Originale cartaceo fuori sede', o.descrizione, 'Archivio cartaceo', o.riferimento || '', '', o.stato === 'prelevato' ? 'prelevato' : 'trasmesso',
        fmtData(o.data_uscita), o.destinatario || '', o.stato === 'prelevato' ? 'Rientro dell’originale in archivio' : 'Lasciare in cartellina la copia con data e destinatario',
        o.rientro_previsto ? 'entro il ' + fmtData(o.rientro_previsto) : '', '',
      ]);
    });

    // conteggi per l'inventario
    const [verbali, bussanti, passaggi, tornate] = await Promise.all([
      leggi('verbali', 'data,grado'), leggi('bussanti', 'tipo_domanda,data_domanda,creato_il'),
      leggi('passaggi_grado', 'grado,data'), leggi('tornate', 'data,tipo,stato'),
    ]);
    const dati = {
      verbali: verbali && verbali.filter((v) => nelPeriodo(v.data, dal, al)),
      bussanti: bussanti && bussanti.filter((b) => nelPeriodo(b.data_domanda || giorno(b.creato_il), dal, al)),
      passaggi: passaggi && passaggi.filter((p) => p.grado !== 'apprendista' && nelPeriodo(p.data, dal, al)),
      tornate: tornate && tornate.filter((t) => t.stato !== 'annullata' && nelPeriodo(t.data, dal, al)),
      lavori: lavori && lavori.filter((l) => nelPeriodo(l.data_presentazione || l.data_assegnazione, dal, al)),
      pratiche: pratiche.filter((x) => nelPeriodo(giorno(x.p.creata_il), dal, al) && x.p.stato !== 'annullata'),
      usciti: fr.filter((f) => ['oriente_eterno', 'trasferito'].includes(f.stato) && nelPeriodo(f.data_uscita, dal, al)),
      originali,
      attivi: fr.filter((f) => f.stato === 'attivo').length,
      sonno: fr.filter((f) => f.stato === 'in_sonno').length,
    };
    return { righe, dati, aperte: aperte.length };
  }

  /* ---------- fogli ---------- */
  const non = (v) => (v === null ? 'non leggibile con questo profilo' : null);
  const CARTELLINE = [['bussanti', 'Bussanti e iniziazioni'], ['regolarizzazioni', 'Regolarizzazioni ed exeat in entrata e in uscita'],
    ['assemblee_goi', 'Deleghe e inviti alle assemblee del GOI'], ['elezioni', 'Tornata elettorale e insediamento delle cariche'],
    ['associazione', 'Associazione Lemmi 812'], ['passaggi_grado', 'Passaggi di grado']];
  // riga di riepilogo dal registro dell'Archivio cartaceo
  function registro(orig, k) {
    if (orig === null || orig === undefined) return 'Registro non leggibile con questo profilo';
    const a = orig.filter((o) => o.cartellina === k);
    if (!a.length) return 'Nel registro non risultano originali';
    const f = a.filter((o) => o.stato !== 'in_archivio');
    return pl(a.length, 'originale registrato', 'originali registrati') + (f.length ? `; fuori sede: ${f.map((o) => o.descrizione + ' (' + (o.destinatario || '') + ')').join(', ')}` : '; tutti in archivio');
  }
  function inventario(dati, dal, al) {
    const c = (arr, f) => (arr === null ? non(null) : f(arr));
    const FUORI = 'Non gestita nell’app';
    return [
      ['Cartella', 'Contenuto previsto dal regolamento', 'Dove si trova', 'Elementi nel periodo', 'Da verificare a mano'],
      ['01', 'Associazione giuridica: statuto, assemblee dei soci, rappresentanza legale, rapporti bancari', FUORI + ' (il conto è seguito in Tesoreria)', '', 'Sì'],
      ['02', 'Documenti ricevuti dai precedenti segretari (residuale)', FUORI, '', 'Sì'],
      ['03', 'Format Word ed Excel', 'Template (modelli GOI); i modelli propri sono fuori dall’app', '', 'Sì'],
      ['04', 'Caselle PEO e PEC, istruzioni di accesso e rinnovi (senza password nel verbale)', FUORI + ': l’app non conserva password', '', 'Sì'],
      ['05', 'Verbali di Loggia per grado', 'Verbali e presenze', c(dati.verbali, (a) => pl(a.length, 'verbale', 'verbali') + (a.length ? ` (${elenco(conta(a.map((v) => v.grado)), GRADI)})` : '')), 'Sì: file Word dei verbali'],
      ['06', 'Bussanti e regolarizzandi', 'Bussanti', c(dati.bussanti, (a) => pl(a.length, 'domanda', 'domande') + (a.length ? ` (${elenco(conta(a.map((b) => b.tipo_domanda)), TIPI_DOMANDA)})` : '')), 'Sì: originali cartacei'],
      ['07', 'Passaggi di grado interni alla Loggia', 'Scheda del Fratello', c(dati.passaggi, (a) => pl(a.length, 'passaggio', 'passaggi')), 'Sì: moduli originali'],
      ['08', 'Attività del segretario, calendari, piè di lista, prospetto e verbale di consegna', 'Procedure (Pratiche), Calendario, Piè di lista', pl(dati.pratiche.length, 'pratica avviata', 'pratiche avviate') + ' nel periodo', 'Sì'],
      ['09', 'Exeat in entrata e in uscita, Oriente Eterno', 'Fratelli (stato e data di uscita)', pl(dati.usciti.length, 'Fratello uscito', 'Fratelli usciti') + ' nel periodo', 'Sì: lettere di Exeat'],
      ['10', 'Documenti generali del GOI (bollettini, IBAN, circolari, causali)', FUORI, '', 'Sì'],
      ['11', 'Inviti e agapi della Loggia, rituale, modelli', 'Calendario (agapi e adesioni)', c(dati.tornate, (a) => pl(a.length, 'tornata', 'tornate') + ` (${elenco(conta(a.map((t) => t.tipo)), TIPI_TORNATA) || 'nessuna'})`), 'Sì: modelli e inviti'],
      ['12', 'Logo e timbro (file vettoriali), medaglie e cravatte', FUORI, '', 'Sì'],
      ['13', 'Tavole redatte dal segretario e raccolta tavole (facoltativa)', 'Lavori e tavole', c(dati.lavori, (a) => pl(a.length, 'tavola o lavoro', 'tavole o lavori')), 'No'],
      ['14', 'Tegolature effettuate (facoltativa)', FUORI + ' (per riservatezza)', '', 'Sì'],
      [],
      ['Piè di lista alla data di oggi', '', '', `${dati.attivi} attivi, ${dati.sonno} in sonno`, ''],
      [],
      ['Archivio cartaceo (Parte II)', 'Da elencare nel verbale di consegna', 'Cartellina', 'Consegnata (sì/no)', 'Dal registro dell’Archivio cartaceo / note'],
    ].concat(CARTELLINE.map(([k, nome], i) => ['', nome, 'Cartellina ' + (i + 1), '', registro(dati.originali, k)]));
  }

  const VERIFICA = [
    ['Controllo (art. 8)', 'Esito', 'Note, motivo noto, responsabile e termine di recupero'],
    ['La chiavetta USB e gli archivi protetti si aprono', '', ''],
    ['Sono presenti le quattordici cartelle', '', ''],
    ['I documenti fuori cartella sono consultabili (Costituzione e Regolamento GOI, Regolamento del segretario GOI, regolamento interno)', '', ''],
    ['L’archivio corrisponde all’inventario', '', ''],
    ['Le pratiche pendenti sono individuate e il prospetto è allegato', '', ''],
    ['Esiste almeno una copia di sicurezza su un supporto distinto', '', ''],
    ['La chiave di apertura è stata consegnata con un canale separato', '', ''],
    ['Password PEO e PEC cambiate; accessi non più autorizzati rimossi (data o operazioni da completare)', '', ''],
    ['L’archivio cartaceo è stato consegnato e elencato nel verbale', '', ''],
    ['Il verbale non contiene password né codici di recupero', '', ''],
    [],
    ['Termine: la consegna va completata entro 20 giorni dalla data di efficacia della nomina del nuovo Segretario.'],
  ];

  /* ---------- Excel ---------- */
  const scarica = (bytes, nome) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = nome; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  async function genera(dal, al) {
    await L.libreria('xlsx');
    const X = window.XLSX;
    const { righe, dati } = await raccogli(dal, al);
    const nomeLoggia = (state.loggia && (state.loggia.nome || '')) || 'Loggia';
    const num = state.loggia && state.loggia.numero ? ' n. ' + state.loggia.numero : '';
    const intest = [
      [`Prospetto delle pratiche pendenti — ${nomeLoggia}${num}`],
      [`Periodo di gestione: dal ${fmtData(dal)} al ${fmtData(al)} · Generato il ${fmtData(oggi())}`],
      ['Dall’app: pratiche aperte, tavole non ancora presentate e originali cartacei fuori sede. Il “soggetto di riferimento” è chi deve compiere il prossimo passo.'],
      [],
    ];
    const colP = ['Tipo', 'Oggetto', 'Procedura', 'Persona di riferimento', 'Avviata il', 'Avanzamento', 'Ultima attività', 'Soggetto di riferimento', 'Prossimo adempimento', 'Scadenza', 'Avvertenze'];
    const ws1 = X.utils.aoa_to_sheet(intest.concat([colP], righe.length ? righe : [['Nessuna pendenza registrata nell’app.']]));
    ws1['!cols'] = [26, 34, 26, 24, 12, 13, 14, 20, 44, 50, 44].map((w) => ({ wch: w }));
    const inv = [[`Inventario dell'archivio — periodo dal ${fmtData(dal)} al ${fmtData(al)}`], ['I conteggi riguardano solo ciò che è registrato nell’app; le cartelle “Non gestita nell’app” vanno controllate a mano.'], []].concat(inventario(dati, dal, al));
    const ws2 = X.utils.aoa_to_sheet(inv);
    ws2['!cols'] = [30, 62, 46, 40, 36].map((w) => ({ wch: w }));
    const ws3 = X.utils.aoa_to_sheet([['Verifica congiunta tra segretario uscente e subentrante'], []].concat(VERIFICA));
    ws3['!cols'] = [90, 16, 60].map((w) => ({ wch: w }));
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws1, 'Pendenze'); X.utils.book_append_sheet(wb, ws2, 'Inventario'); X.utils.book_append_sheet(wb, ws3, 'Verifica congiunta');
    scarica(X.write(wb, { bookType: 'xlsx', type: 'array' }), `Consegne_prospetto_inventario_${oggi()}.xlsx`);
    return righe.length;
  }

  /* ---------- finestra del periodo ---------- */
  function apri() {
    if (!puo()) { toast('Il prospetto è riservato a Segretario e amministratore.', 'bad'); return; }
    const anno = oggi().slice(0, 4);
    const ov = document.createElement('div'); ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="cs-t" style="width:min(520px,100%)">
      <div class="modal-h"><h2 id="cs-t">Prospetto pendenze e inventario</h2></div>
      <div class="modal-b">
        <p style="margin:0 0 10px">Indica il periodo di gestione a cui si riferisce la consegna. Verrà creato un file Excel con pendenze, inventario e verifica congiunta, da conservare nella cartella 08.</p>
        <div class="form-grid">
          <div class="f s6"><label for="cs-dal">Dal</label><input id="cs-dal" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off" value="${esc(L.isoToIt(anno + '-01-01'))}"></div>
          <div class="f s6"><label for="cs-al">Al</label><input id="cs-al" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off" value="${esc(L.isoToIt(oggi()))}"></div>
        </div>
        <div class="dlg-az" style="margin-top:14px"><button type="button" class="btn ghost" data-r="no">Annulla</button><button type="button" class="btn gold" data-r="si">Crea il file Excel</button></div>
      </div></div>`;
    document.body.appendChild(ov);
    L.mascheraDate(ov);
    const chiudi = () => { document.removeEventListener('keydown', tasti, true); ov.remove(); };
    const tasti = (e) => { if (e.key === 'Escape') chiudi(); };
    document.addEventListener('keydown', tasti, true);
    ov.querySelector('[data-r="no"]').onclick = chiudi;
    ov.addEventListener('click', (e) => { if (e.target === ov) chiudi(); });
    const si = ov.querySelector('[data-r="si"]');
    si.onclick = async () => {
      const dal = L.itToIso($('#cs-dal', ov).value.trim()), al = L.itToIso($('#cs-al', ov).value.trim());
      if (!valida(dal) || !valida(al)) { toast('Scrivi le due date nel formato gg/mm/aaaa.', 'bad'); return; }
      if (dal > al) { toast('La data iniziale è dopo quella finale.', 'bad'); return; }
      si.disabled = true; si.textContent = 'Creo il file…';
      try {
        const n = await genera(dal, al);
        toast(`File creato: ${n} ${n === 1 ? 'pendenza' : 'pendenze'}. Conservalo nella cartella 08.`, 'ok');
        chiudi();
      } catch (e) { toast('Errore nella creazione: ' + L.messaggioErrore(e), 'bad'); si.disabled = false; si.textContent = 'Crea il file Excel'; }
    };
    const primo = $('#cs-dal', ov); if (primo) primo.focus();
  }

  L.consegne = { apri, genera };
})();
