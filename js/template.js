/* Lemmi - voce di menu "Template": tutti i modelli in un unico posto.
 * 1) Verbali di tornata nei tre gradi: si compilano pochi dati, il testo si prepara da solo, si rivede e si scarica in Word (.docx).
 * 2) Moduli GOI: scorciatoie verso le schede che li compilano e download dei modelli vuoti.
 * 3) Modelli della Loggia: archivio di file caricati (Word, Excel, PDF, loghi...) per categoria, come le cartelle 03, 11 e 12 del Regolamento della segreteria. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L || !window.LemmiDocx) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, isoToIt, itToIso, oggi, IC, mascheraDate, canEdit, isAdmin } = L;

  const BUCKET = 'modelli';
  const MAX_FILE = 10 * 1024 * 1024;
  const ESTENSIONI = ['pdf', 'doc', 'docx', 'dotx', 'odt', 'xls', 'xlsx', 'ods', 'csv', 'txt', 'rtf', 'png', 'jpg', 'jpeg', 'svg', 'ai', 'eps', 'eml', 'msg'];
  const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const nomeFile = (n) => String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

  const GRADI = {
    apprendista: { n: 'Apprendista', num: '1°', desc: 'Tornata rituale in grado di Apprendista' },
    compagno: { n: 'Compagno', num: '2°', desc: 'Tornata rituale in grado di Compagno d’Arte' },
    maestro: { n: 'Maestro', num: '3°', desc: 'Tornata rituale in grado di Maestro' },
  };

  const CATEGORIE = {
    verbali: { t: 'Verbali di tornata', h: 'Cartella 03 · formati Word' },
    tegolatura: { t: 'Tegolature', h: 'Cartella 03 · modelli vuoti' },
    presenze: { t: 'Fogli presenze e piè di lista', h: 'Cartella 03 · formati Excel' },
    calendario: { t: 'Calendario dei lavori', h: 'Cartella 03' },
    inviti: { t: 'Inviti, agapi e rituali', h: 'Cartella 11' },
    logo: { t: 'Logo, timbro, medaglie e cravatte', h: 'Cartella 12 · file vettoriali' },
    tavole: { t: 'Modelli di tavole', h: 'Cartella 13 (facoltativa)' },
    altro: { t: 'Altro', h: '' },
  };

  /* ====================================================================
   *  Indice dei Template
   * ==================================================================== */
  const MODULI_GOI = [
    { t: 'Modelli A/1 e C/1', d: 'Domanda di ammissione del bussante e comunicazione al Collegio (iniziazione, riammissione, regolarizzazione).', vai: '#/bussanti', vaiT: 'Bussanti › scheda del bussante', file: [['A1', 'A/1'], ['C1', 'C/1']] },
    { t: 'N/1 · Brevetto di Iniziazione', d: 'Richiesta del brevetto alla Gran Tesoreria dopo la seconda votazione favorevole, con l’esito degli scrutini.', compila: 'N1', file: [['N1', 'N/1']] },
    { t: 'C/3 · Arricchimento del piè di lista', d: 'Comunicazione ad Anagrafe e Collegio dopo iniziazione, affiliazione o riammissione di un Fratello.', compila: 'C3', file: [['C3', 'C/3']] },
    { t: 'N/2-3 · Brevetto di Compagno / Maestro', d: 'Richiesta del brevetto alla Gran Tesoreria dopo le votazioni in Camera di Compagno o di Maestro.', compila: 'N23', file: [['N23', 'N/2-3']] },
    { t: 'C/3 bis · Promozione / elevazione', d: 'Comunicazione della cerimonia di passaggio di grado: la data fissa l’anzianità nel grado.', compila: 'C3BIS', file: [['C3BIS', 'C/3 bis']] },
    { t: 'E/1 · Rilascio dell’Exeat', d: 'La Loggia comunica a Collegio e Anagrafe l’Exeat concesso a un Fratello che passa ad altra Loggia.', compila: 'E1', file: [['E1', 'E/1']] },
    { t: 'E/2 · Accoglimento del trasferimento', d: 'La Loggia comunica di aver accolto un Fratello proveniente da altra Loggia.', compila: 'E2', file: [['E2', 'E/2']] },
    { t: 'D/1 · Depennamento, assonnamento, O.E.', d: 'Uscita di un Fratello dal piè di lista: assonnamento, depennamento, trasferimento, passaggio all’Oriente Eterno.', compila: 'D1', file: [['D1', 'D/1']] },
    { t: 'D/2 · Consiglio di disciplina', d: 'Verbale da allegare al D/1 per il depennamento ex art. 12 (assenza o morosità).', compila: 'D2', file: [['D2', 'D/2']] },
    { t: 'V/1 · Variazioni anagrafiche', d: 'Nuovo indirizzo, telefono o e-mail di un Fratello, da comunicare ad Anagrafe e Collegio.', compila: 'V1', file: [['V1', 'V/1']] },
    { t: 'C/2 · Rinuncia / rigetto della domanda', d: 'Domanda del profano respinta o archiviata per rinuncia, con le motivazioni.', compila: 'C2', file: [['C2', 'C/2']] },
    { t: 'N/4 · Brevetto di riammissione / regolarizzazione', d: 'Richiesta del brevetto alla Gran Tesoreria dopo la votazione su riammissione, regolarizzazione o cancellazione della pena.', compila: 'N4', file: [['N4', 'N/4']] },
    { t: 'A/2 · Domanda di riammissione / cancellazione pena', d: 'Domanda di chi è stato dimesso, depennato o espulso (o chiede l’affiliazione dall’estero), con la clausola compromissoria.', compila: 'A2', file: [['A2', 'A/2']] },
    { t: 'A/R · Domanda di regolarizzazione', d: 'Domanda di chi proviene da altra Obbedienza: brevetti, Logge di provenienza, cariche e dimissioni, con la clausola compromissoria.', compila: 'AR', file: [['AR', 'A/R']] },
    { t: 'Elezioni delle cariche', d: 'Processo verbale delle elezioni e autocertificazioni dei candidati.', vai: '#/elezioni', vaiT: 'Fratelli › Elezioni cariche', file: [['ELEZIONI', 'Elezioni']] },
    { t: 'Insediamento delle cariche', d: 'Promessa solenne, nomina del Segretario e degli Ufficiali, trapasso dei poteri, relazione e conto gestione.', vai: '#/elezioni', vaiT: 'Fratelli › Elezioni cariche (riquadro 5)', file: [['INSEDIAMENTO', 'Insediamento']] },
    { t: 'Piè di lista semestrale', d: 'Elenco dei Fratelli al 30 giugno e al 31 dicembre, in Excel e in PDF da firmare.', vai: '#/piedilista', vaiT: 'Fratelli › Piè di lista', file: [] },
  ];

  async function elencoModelli() {
    try { return { righe: chk(await state.sb.from('modelli_loggia').select('*').order('nome')), ok: true }; }
    catch (e) { return { righe: [], ok: false, errore: e }; }
  }

  async function vistaIndice(v) {
    const lib = await elencoModelli();
    const puoCaricare = canEdit();
    v.innerHTML = `
      <div class="page-head"><div><h1>Template</h1><p>Tutti i modelli della Loggia in un unico posto</p></div></div>

      <div class="card"><h2>${IC.lavori} Verbali di tornata</h2>
        <p class="muted" style="margin:0 0 14px">Inserisci data, presenze e firmatari: il testo del verbale si prepara da solo secondo i vostri modelli, lo puoi correggere e scaricare in Word.</p>
        <div class="grid cols-3">${Object.keys(GRADI).map((g) => `<a class="tpl-card" href="#/template/verbale/${g}">
          <span class="tpl-ic">${GRADI[g].num}</span><b>${esc(GRADI[g].n)}</b><span class="muted">${esc(GRADI[g].desc)}</span>
          <span class="btn gold small">Crea il verbale</span></a>`).join('')}</div></div>

      <div class="card" style="margin-top:18px"><h2>${IC.pdf} Moduli GOI</h2>
        <p class="muted" style="margin:0 0 12px">I moduli si compilano dall’app con i dati già inseriti (firme, visti e data di trasmissione restano in bianco). Qui trovi la compilazione guidata o la scorciatoia alla scheda giusta, e i modelli vuoti ufficiali (ed. 2024 del Corso Segretari).</p>
        <div class="table-wrap"><table data-no-sort><thead><tr><th>Modello</th><th>A cosa serve</th><th>Si compila da</th><th>Modello vuoto</th></tr></thead><tbody>
          ${MODULI_GOI.map((m) => `<tr><td><b>${esc(m.t)}</b></td><td>${esc(m.d)}</td><td>${m.compila ? `<a class="btn gold small" href="#/template/modulo/${m.compila}">Compila il modulo</a>` : `<a href="${m.vai}">${esc(m.vaiT)}</a>`}</td>
            <td>${m.file.length ? m.file.map((f) => `<a class="btn ghost small" href="templates/${esc(f[0])}.pdf" download>${IC.pdf} ${esc(f[1])}</a>`).join(' ') : '<span class="muted">generato dall’app</span>'}</td></tr>`).join('')}
        </tbody></table></div></div>

      <div class="card" style="margin-top:18px" id="lib"><h2>${IC.template || ''} Modelli della Loggia</h2>
        <p class="muted" style="margin:0 0 12px">L’archivio dei vostri modelli: tegolature, fogli presenze, inviti e agapi, logo e timbro, medaglie e cravatte. Conservali qui invece che sul computer del Segretario: restano al passaggio di consegne.</p>
        ${lib.ok ? '' : `<div class="notice bad"><b>Archivio non ancora attivo.</b> Esegui su Supabase lo script <code>lemmi_aggiornamento_18.sql</code>, poi ricarica la pagina.<br><span class="hint">${esc(messaggioErrore(lib.errore))}</span></div>`}
        <div id="lib-body"></div></div>`;
    if (lib.ok) disegnaLibreria($('#lib-body', v), lib.righe, puoCaricare);
  }

  function disegnaLibreria(box, righe, puoCaricare) {
    let filtro = '';
    const disegna = () => {
      const conta = {};
      righe.forEach((r) => { conta[r.categoria] = (conta[r.categoria] || 0) + 1; });
      const f = righe.filter((r) => !filtro || r.categoria === filtro);
      box.innerHTML = `
        ${puoCaricare ? `<details class="up-box" ${righe.length ? '' : 'open'}><summary><b>${IC.up} Carica un nuovo modello</b></summary>
          <form id="f-mod" class="form-grid" style="margin-top:12px" novalidate>
            <div class="f s4"><label for="m-cat">Categoria</label><select id="m-cat" name="categoria">${Object.keys(CATEGORIE).map((k) => `<option value="${k}" ${filtro === k ? 'selected' : ''}>${esc(CATEGORIE[k].t)}</option>`).join('')}</select></div>
            <div class="f s8"><label for="m-nome">Nome del modello <span class="req">*</span></label><input id="m-nome" name="nome" maxlength="120" placeholder="es. Modello di tegolatura"></div>
            <div class="f s12"><label for="m-desc">Descrizione (facoltativa)</label><input id="m-desc" name="descrizione" maxlength="240" placeholder="a cosa serve, versione, note"></div>
            <div class="f s12"><label for="m-file">File <span class="req">*</span> <span class="hint">Word, Excel, PDF, immagini, SVG… fino a 10 MB</span></label><input id="m-file" name="file" type="file" class="vis" accept=".${ESTENSIONI.join(',.')}"></div>
            <div class="f s12 actions"><button class="btn gold" type="submit">${IC.up} Carica</button><span class="err" id="m-err"></span></div>
          </form></details>` : ''}
        <div class="chips" style="margin-top:14px"><span class="chips-l">Categoria</span><button type="button" class="chip ${filtro ? '' : 'on'}" data-c="">Tutte (${righe.length})</button>
          ${Object.keys(CATEGORIE).filter((k) => conta[k]).map((k) => `<button type="button" class="chip ${filtro === k ? 'on' : ''}" data-c="${k}">${esc(CATEGORIE[k].t)} (${conta[k]})</button>`).join('')}</div>
        <div class="table-wrap"><table><thead><tr><th>Modello</th><th>Categoria</th><th>Caricato il</th><th>Dimensione</th><th></th></tr></thead><tbody>
          ${f.length ? f.map((r) => `<tr><td><b>${esc(r.nome)}</b>${r.descrizione ? `<div class="hint">${esc(r.descrizione)}</div>` : ''}<div class="hint">${esc(r.file_nome || '')}</div></td>
            <td><span class="badge gold">${esc((CATEGORIE[r.categoria] || CATEGORIE.altro).t)}</span></td>
            <td>${fmtData(r.creato_il)}</td><td>${r.dimensione ? Math.max(1, Math.round(r.dimensione / 1024)) + ' KB' : '—'}</td>
            <td class="actions" style="white-space:nowrap"><button class="btn ghost small" data-sc="${esc(r.id)}">Scarica</button>
              ${puoCaricare ? `<button class="btn danger small" data-del="${esc(r.id)}">Elimina</button>` : ''}</td></tr>`).join('')
            : `<tr><td colspan="5"><div class="empty">${IC.inbox}<div>${righe.length ? 'Nessun modello in questa categoria.' : 'Ancora nessun modello caricato.'}</div></div></td></tr>`}
        </tbody></table></div>`;
      $$('.chip', box).forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.c; disegna(); }));
      $$('[data-sc]', box).forEach((b) => b.addEventListener('click', () => scarica(righe.find((r) => String(r.id) === b.dataset.sc))));
      $$('[data-del]', box).forEach((b) => b.addEventListener('click', () => elimina(righe.find((r) => String(r.id) === b.dataset.del))));
      const form = $('#f-mod', box);
      if (form) form.addEventListener('submit', (ev) => { ev.preventDefault(); carica(form); });
    };
    disegna();
  }

  async function scarica(r) {
    if (!r) return;
    try {
      const d = chk(await state.sb.storage.from(BUCKET).createSignedUrl(r.file_path, 60, { download: r.file_nome || true }));
      const a = document.createElement('a'); a.href = d.signedUrl; a.download = r.file_nome || ''; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast(messaggioErrore(e), 'bad'); }
  }

  async function elimina(r) {
    if (!r || !confirm('Eliminare il modello «' + r.nome + '»? L’operazione non si può annullare.')) return;
    try {
      const rm = await state.sb.storage.from(BUCKET).remove([r.file_path]);
      if (rm.error) throw rm.error;
      chk(await state.sb.from('modelli_loggia').delete().eq('id', r.id));
      toast('Modello eliminato', 'ok');
      L.route();
    } catch (e) { toast(messaggioErrore(e), 'bad'); }
  }

  async function carica(form) {
    const err = $('#m-err', form); err.textContent = '';
    const nome = form.elements.nome.value.trim(), file = form.elements.file.files[0];
    if (!nome) { err.textContent = 'Scrivi il nome del modello.'; form.elements.nome.focus(); return; }
    if (!file) { err.textContent = 'Scegli il file da caricare.'; return; }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ESTENSIONI.includes(ext)) { err.textContent = 'Formato non consentito (.' + ext + ').'; return; }
    if (file.size > MAX_FILE) { err.textContent = 'Il file supera i 10 MB.'; return; }
    const btn = $('button[type=submit]', form); btn.disabled = true;
    const categoria = form.elements.categoria.value;
    const path = categoria + '/' + Date.now() + '-' + nomeFile(file.name);
    try {
      const up = await state.sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (up.error) throw up.error;
      const ins = await state.sb.from('modelli_loggia').insert({ categoria, nome, descrizione: form.elements.descrizione.value.trim() || null, file_path: path, file_nome: file.name, mime: file.type || null, dimensione: file.size });
      if (ins.error) { await state.sb.storage.from(BUCKET).remove([path]); throw ins.error; }
      toast('Modello caricato', 'ok');
      L.route();
    } catch (e) { err.textContent = messaggioErrore(e); btn.disabled = false; }
  }

  /* ====================================================================
   *  Verbali di tornata
   * ==================================================================== */
  const vb = { init: false, c: null, g: {}, attivi: [], cariche: [] };

  const unisci = (a) => (a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]);
  const nomi = (t) => String(t || '').split(/[,;\n]/).map((x) => x.trim().replace(/^(fr\.?|fratelli|fratello)\s+/i, '')).filter(Boolean);
  const pl = (arr, sing, plur) => (arr.length > 1 ? plur : sing);

  function infoData(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    const mese = Number(m[2]);
    const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    return {
      g: Number(m[3]), mm: ((mese - 3 + 12) % 12) + 1,                    // marzo = 1° mese massonico
      vl: Number(m[1]) + 4000,                                          // anno di Vera Luce
      estesa: Number(m[3]) + ' ' + MESI[mese - 1] + ' ' + m[1],
      punti: m[3] + '.' + m[2] + '.' + m[1],
    };
  }

  const loggiaNome = () => (state.loggia && state.loggia.nome) || '[nome della Loggia]';
  const loggiaNum = () => (state.loggia && state.loggia.numero) || '[n.]';
  const loggiaOr = () => (state.loggia && state.loggia.oriente) || '[Oriente]';

  function parIntro(g, di) {
    return `Alla gloria del Grande Architetto dell’Universo – in nome della Libera Muratoria Universale – sotto gli auspici del Grande Oriente d’Italia – Palazzo Giustiniani, oggi ${di.g}° giorno del ${di.mm}° mese dell’anno ${di.vl} di Vera Luce, ${di.estesa} e.v., la Rispettabile Loggia “${loggiaNome()}” n. ${loggiaNum()} all’Oriente di ${loggiaOr()}, si è riunita in Tornata Rituale in Grado di ${g === 'compagno' ? 'Compagno d’Arte' : GRADI[g].n}, nel Punto Geometrico noto ai soli Figli della Vedova.`;
  }

  function parPresenze(c) {
    const gem = String(c.gemellata || '').trim();
    let t = 'Sono presenti i Fratelli risultanti dal Libro delle Firme. In particolare, sono presenti un totale di ' + (String(c.presenti).trim() || '[numero]') + ' Fratelli'
      + (gem ? ', oltre che, spiritualmente, i Fratelli della ' + gem + ' con noi gemellata' : '') + '.';
    const as = nomi(c.assenti);
    if (as.length) t += ' ' + pl(as, 'Il Fratello ', 'I Fratelli ') + unisci(as) + pl(as, ' risulta assente giustificato presente', ' risultano assenti giustificati presenti') + ' al tronco.';
    const os = nomi(c.ospiti);
    if (os.length) t += os.length === 1 ? ' È presente quale ospite il Fr. ' + os[0] + ' che viene fatto accomodare all’Oriente.' : ' Sono presenti quali ospiti i Fratelli ' + unisci(os) + ' che vengono fatti accomodare all’Oriente.';
    const sost = [['Oratore', c.sostOratore], ['Primo Sorvegliante', c.sost1], ['Secondo Sorvegliante', c.sost2]].filter((x) => nomi(x[1]).length);
    t += sost.length
      ? ' Le cariche sono ricoperte dai rispettivi titolari ad eccezione di ' + unisci(sost.map(([k, n]) => 'quella di ' + k + ', ricoperta dal Fr. ' + nomi(n)[0])) + '.'
      : ' Le cariche sono ricoperte dai rispettivi titolari.';
    return t;
  }

  const LIBERO = '[Inserire qui lo svolgimento dei lavori della tornata]';

  function costruisciTesto(g) {
    const c = vb.c, x = vb.g[g], di = infoData(itToIso(c.data));
    if (!di) return '';
    const tav = String(x.tav || '').trim() || '[data]';
    const ex = nomi(x.extra);
    const p = [parIntro(g, di), parPresenze(c)];
    if (g === 'apprendista') {
      p.push(`Il Maestro Venerabile apre i Lavori Rituali di Loggia e viene data lettura della tavola scolpita nella tornata precedente del ${tav}. La tavola viene approvata all’unanimità dei presenti.`);
      if (ex.length) p.push(`Il Maestro Venerabile chiede al M.d.C. di far allontanare dal Tempio ${pl(ex, 'il Fratello Apprendista', 'i Fratelli Apprendisti')} ${unisci(ex)} per il passaggio al Secondo Grado e di predisporre il Tempio in grado di Compagno.`);
      p.push(LIBERO);
      p.push('La parola passa al Fr. Oratore che, verificato il buon esito del lavoro svolto, propone di passare alla chiusura dei lavori ponendo le sue conclusioni.');
      p.push(`Viene fatto quindi circolare il sacco delle proposte tacite ed il tronco della vedova: il primo torna all’Ara ${String(c.sacco || '').trim() || 'senza proposte'}, il secondo frutta ${String(c.tronco || '').trim() || '[importo]'} per la costruzione del Tempio.`);
      const pr = String(c.prossima || '').trim();
      p.push(`Terminati i lavori, il Primo Sorvegliante provvede alla chiusura della Loggia su ordine del M.V. fino alla ${c.prossimaTipo === 'ordinaria' ? 'tornata ordinaria' : 'prossima tornata'} del ${pr || '[data]'}.`);
    } else if (g === 'compagno') {
      p.push(`Il Maestro Venerabile apre i Lavori Rituali di Loggia, invita il M.d.C. a decorare il Tempio in 2° Grado e chiede al Fr. Oratore di dare lettura ${String(x.tav || '').trim() ? 'della tavola scolpita nella tornata precedente del ' + tav : 'delle tavole scolpite nelle tornate precedenti'}. ${String(x.tav || '').trim() ? 'La tavola viene letta ed approvata' : 'Le tavole vengono lette ed approvate'} all’unanimità.`);
      p.push(LIBERO);
      if (ex.length) {
        p.push(`Il Maestro Venerabile chiede al M.d.C. di allestire il Tempio per l’Elevazione al grado di Maestro ed invita ${pl(ex, 'il Fr. ', 'i Fratelli ')}${unisci(ex)} ad uscire dal Tempio.`);
        p.push('I Lavori in grado di Compagno vengono quindi sospesi. Le colonne tacciono.');
      }
      p.push('La parola passa al Fr. Oratore che propone di procedere alla chiusura dei lavori. Il Maestro Venerabile, non essendovi proposte per il bene dell’Ordine in generale e per questa Loggia in particolare e non essendovi doveri da compiere oltre a quanto già espletato, ordina al M.d.C. di arredare il Tempio in maniera consona e procede alla chiusura dei lavori in questo grado, per condurli in Camera di Mezzo.');
    } else {
      p.push('Il Venerabilissimo Maestro chiede al Rispettabile M.d.C. di elevare il Tempio in 3° Grado.');
      p.push(`Il Venerabilissimo Maestro chiede al Rispettabile Fr. Segretario di leggere le tavole in grado di Maestro della tornata precedente del ${tav}. La tavola viene approvata.`);
      if (ex.length) p.push(`${pl(ex, 'Il Rispettabile Fr. ', 'I Rispettabili Fratelli ')}${unisci(ex)} ${pl(ex, 'effettua', 'effettuano')} la promessa all’Ara quale${pl(ex, '', 'i')} nuov${pl(ex, 'o membro effettivo', 'i membri effettivi')} della Loggia “${loggiaNome()}” dopo la procedura di exeat dalla ${pl(ex, 'sua precedente Loggia', 'loro precedente Loggia')}.`);
      p.push(LIBERO);
      p.push('La parola passa al Rispettabile Fr. Oratore, il quale, constatato l’ottimo lavoro svolto, chiede di passare alla sospensione dei Lavori.');
      p.push('Essendo mezzanotte ed il sole al Nadir, il Venerabilissimo Maestro sospende i lavori di questa Rispettabile Camera di Mezzo, dopo che i Rispettabili Fratelli hanno promesso il segreto sul lavoro compiuto, e ordina di passare al grado di Compagno.');
    }
    return p.join('\n\n');
  }

  async function tornateAttorno(iso) {
    try {
      const d = new Date(iso + 'T00:00:00Z');
      const dal = new Date(d.getTime() - 400 * 864e5).toISOString().slice(0, 10), al = new Date(d.getTime() + 120 * 864e5).toISOString().slice(0, 10);
      return chk(await state.sb.from('tornate').select('data,tipo,grado,stato').gte('data', dal).lte('data', al).order('data'));
    } catch (e) { return []; }
  }

  // propone data della tavola precedente (per grado) e della prossima tornata, se il Calendario le conosce
  function suggerimenti(arr, iso) {
    const attive = arr.filter((t) => t.stato !== 'annullata');
    const prima = (g) => attive.filter((t) => t.data < iso && t.grado === g).pop();
    const dopo = attive.filter((t) => t.data > iso);
    const prox = dopo.find((t) => t.tipo === 'ordinaria') || dopo[0];
    return { prima, prox };
  }

  async function inizializza() {
    const fr = await L.caricaFratelli();
    try {
      const vc = chk(await state.sb.from('v_fratelli_completi').select('id,cognome,nome,stato,grado_attuale'));
      const att = vc.filter((x) => String(x.stato || '').toLowerCase() === 'attivo');
      vb.attivi = (att.length ? att : vc).sort((a, b) => a.cognome.localeCompare(b.cognome, 'it'));
    } catch (e) { vb.attivi = fr.slice().sort((a, b) => a.cognome.localeCompare(b.cognome, 'it')); }
    try { vb.cariche = chk(await state.sb.from('cariche_storico').select('fratello_id,carica,anno_dal,anno_al')); } catch (e) { vb.cariche = []; }
    vb.nomi = {}; fr.forEach((f) => { vb.nomi[f.id] = f; });

    let gem = 'R.·. L.·. Adriano Lemmi n° 704 all’Oriente di Livorno';
    try { gem = localStorage.getItem('lemmi.gemellata') !== null ? localStorage.getItem('lemmi.gemellata') : gem; } catch (e) { /* facoltativo */ }

    // data proposta: la tornata più recente non annullata (oggi compresa); altrimenti oggi
    const oggiIso = oggi();
    const att = (await tornateAttorno(oggiIso)).filter((t) => t.stato !== 'annullata' && t.data <= oggiIso);
    const ultima = att.length ? att[att.length - 1].data : oggiIso;
    vb.c = { data: isoToIt(ultima), presenti: '', assenti: '', ospiti: '', gemellata: gem, sostOratore: '', sost1: '', sost2: '', sacco: 'senza proposte', tronco: '', prossima: '', prossimaTipo: '', mv: '', oratore: '', segretario: '', tocco: {} };
    await applicaData(true);
    vb.init = true;
  }

  const firmatario = (re, no, anno) => {
    const c = vb.cariche.find((x) => re.test(norm(x.carica)) && !(no && no.test(norm(x.carica))) && x.anno_dal <= anno && (x.anno_al || x.anno_dal) >= anno);
    const f = c && vb.nomi[c.fratello_id];
    return f ? 'Fr. ' + f.nome + ' ' + f.cognome : '';
  };

  // ricalcola i dati che dipendono dalla data (firmatari, tavola precedente, prossima tornata) senza toccare quelli scritti a mano
  async function applicaData(tutto) {
    const iso = itToIso(vb.c.data);
    if (!iso || iso === 'ERR') return;
    const anno = Number(iso.slice(0, 4)), c = vb.c;
    if (tutto || !c.tocco.mv) c.mv = firmatario(/venerabile/, /gran|aggiunt|ex/, anno) || c.mv;
    if (tutto || !c.tocco.oratore) c.oratore = firmatario(/oratore/, /gran|aggiunt/, anno) || c.oratore;
    if (tutto || !c.tocco.segretario) c.segretario = firmatario(/segretari/, /gran|aggiunt/, anno) || c.segretario;
    const arr = await tornateAttorno(iso), s = suggerimenti(arr, iso);
    Object.keys(GRADI).forEach((g) => {
      const x = vb.g[g] || (vb.g[g] = { tav: '', extra: '', testo: '', modificato: false, tocco: false });
      if (!x.tocco) x.tav = s.prima(g) ? isoToIt(s.prima(g).data) : x.tav;
    });
    if (!c.tocco.prossima && s.prox) { c.prossima = isoToIt(s.prox.data); c.prossimaTipo = s.prox.tipo; }
    c.calendario = arr.filter((t) => t.stato !== 'annullata' && Math.abs((new Date(t.data) - new Date(iso)) / 864e5) <= 45);
  }

  async function vistaVerbale(v, gradoReq) {
    const g = GRADI[gradoReq] ? gradoReq : 'apprendista';
    if (!['amministratore', 'venerabile', 'segretario'].includes(state.profilo.ruolo)) { v.innerHTML = '<div class="notice bad">Il tuo ruolo non ha accesso a questa sezione.</div>'; return; }
    if (!vb.init) await inizializza();
    const c = vb.c, x = vb.g[g] || (vb.g[g] = { tav: '', extra: '', testo: '', modificato: false, tocco: false });
    if (!x.testo && !x.modificato) x.testo = costruisciTesto(g);

    const campoT = (n, l, val, o) => { o = o || {}; return `<div class="f ${o.cls || 's4'}"><label for="v-${n}">${l}${o.req ? ' <span class="req">*</span>' : ''}</label><input id="v-${n}" data-k="${n}" ${o.g ? 'data-g="1"' : ''} ${o.data ? 'data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"' : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} value="${esc(val)}">${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</div>`; };
    const extraEt = { apprendista: 'Passaggio a Compagno: Fratelli interessati', compagno: 'Elevazione a Maestro: Fratelli interessati', maestro: 'Promessa all’Ara (affiliazione): Fratelli' }[g];

    v.innerHTML = `
      <div class="crumb"><a href="#/template">Template</a> › Verbale di tornata</div>
      <div class="page-head"><div><h1>Verbale · ${esc(GRADI[g].n)}</h1><p>Compila i dati, rivedi il testo e scarica il file Word</p></div></div>
      <div class="tabs">${Object.keys(GRADI).map((k) => `<a class="tab ${k === g ? 'on' : ''}" href="#/template/verbale/${k}">${esc(GRADI[k].n)}</a>`).join('')}</div>

      <div class="card"><h2>Dati della tornata</h2><div class="form-grid">
        ${campoT('data', 'Data della tornata', c.data, { cls: 's4', req: 1, data: 1 })}
        <div class="f s8"><label for="v-cal">Oppure scegli dal Calendario</label><select id="v-cal"><option value="">— scegli una tornata —</option>
          ${(c.calendario || []).map((t) => `<option value="${esc(t.data)}" ${isoToIt(t.data) === c.data ? 'selected' : ''}>${fmtData(t.data)} · ${esc(cap(t.tipo || ''))}${t.grado ? ' · ' + esc(cap(t.grado)) : ''}</option>`).join('')}</select></div>
        ${campoT('presenti', 'Fratelli presenti (numero)', c.presenti, { cls: 's4', ph: 'es. 16', hint: 'Calcolato dalle presenze qui sotto' })}
        ${campoT('gemellata', 'Loggia gemellata (facoltativa)', c.gemellata, { cls: 's8', hint: 'Lascia vuoto se non serve. Il testo inserito viene ricordato.' })}
        <div class="f s12"><label for="v-assenti">Assenti giustificati (cognomi separati da virgola)</label><input id="v-assenti" data-k="assenti" value="${esc(c.assenti)}">
          <div class="hint" style="margin-top:6px">Si compila dalle presenze qui sotto.</div></div>
        ${campoT('ospiti', 'Ospiti (nome e cognome, separati da virgola)', c.ospiti, { cls: 's12', ph: 'es. Mario Rossi' })}
        ${campoT('sostOratore', 'Oratore sostituito da', c.sostOratore, { cls: 's4', ph: 'cognome (vuoto = titolare)' })}
        ${campoT('sost1', '1° Sorvegliante sostituito da', c.sost1, { cls: 's4', ph: 'cognome' })}
        ${campoT('sost2', '2° Sorvegliante sostituito da', c.sost2, { cls: 's4', ph: 'cognome' })}
        ${campoT('tav', 'Tornata precedente (data della tavola)', x.tav, { cls: 's4', data: 1, g: 1, hint: 'Proposta dal Calendario, se la conosce' })}
        ${campoT('extra', extraEt, x.extra, { cls: 's8', g: 1, ph: 'cognomi, separati da virgola (facoltativo)' })}
        ${g === 'apprendista' ? `
          ${campoT('sacco', 'Sacco delle proposte tacite: il primo torna all’Ara', c.sacco, { cls: 's4' })}
          ${campoT('tronco', 'Tronco della Vedova: il secondo frutta', c.tronco, { cls: 's4', ph: 'es. 25 euro, oppure tre e più mattoni' })}
          ${campoT('prossima', 'Chiusura fino alla tornata del', c.prossima, { cls: 's4', data: 1, hint: 'Proposta dal Calendario (prossima ordinaria)' })}` : ''}
      </div></div>

      <div class="card" style="margin-top:18px"><h2>Presenze</h2>
        <p class="muted" style="margin:0 0 10px">Compaiono i Fratelli attivi che possono partecipare a questa tornata (in grado di ${esc(GRADI[g].n)}${g === 'apprendista' ? '' : ' o superiore'}). Tutti partono come presenti: segna solo chi manca.</p>
        <div class="actions" style="margin:0 0 10px"><span class="muted" id="v-pres-riep"></span>
          <button class="btn ghost small" id="v-tuttip" type="button">Tutti presenti</button></div>
        <div class="table-wrap"><table class="pres-tab"><thead><tr><th>Fratello</th><th>Grado</th><th>Presenza</th></tr></thead><tbody>
          ${eleggibili(g).map((f) => `<tr><td>${esc(f.cognome)} ${esc(f.nome)}</td><td>${esc(f.grado_attuale || '—')}</td>
            <td><select data-pres="${esc(f.id)}" aria-label="Presenza di ${esc(f.cognome)} ${esc(f.nome)}">
              ${[['presente', 'Presente'], ['giustificato', 'Assente giustificato'], ['assente', 'Assente']].map((o) => `<option value="${o[0]}" ${statoPres(x, f.id) === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></td></tr>`).join('')}
        </tbody></table></div></div>

      <div class="card" style="margin-top:18px"><h2>Firmatari</h2><div class="form-grid">
        ${campoT('mv', 'Maestro Venerabile', c.mv, { cls: 's4' })}
        ${campoT('segretario', 'Segretario', c.segretario, { cls: 's4' })}
        ${campoT('oratore', 'Oratore', c.oratore, { cls: 's4' })}
        <div class="f s12 hint">Proposti dalle cariche dell’anno nella Storia dei Fratelli: correggili se la tornata ha firmatari diversi.</div>
      </div></div>

      <div class="card" style="margin-top:18px"><h2>Testo del verbale</h2>
        <p class="muted" style="margin:0 0 10px">Si compila da solo mentre inserisci i dati. Puoi correggerlo a mano: da quel momento non viene più riscritto, finché non premi «Ricrea il testo».
          Le parti tra parentesi quadre vanno completate (per esempio lo svolgimento dei lavori). Un paragrafo per riga vuota.</p>
        <textarea id="v-testo" rows="22" style="width:100%;font-family:Georgia,'Times New Roman',serif;font-size:1rem;line-height:1.55">${esc(x.testo)}</textarea>
        <div class="actions" style="margin-top:12px"><button class="btn gold" id="v-dl" type="button">${IC.pdf} Scarica il verbale (.docx)</button>
          ${canEdit() ? '<button class="btn" id="v-salva" type="button">Salva nel registro</button>' : ''}<button class="btn ghost" id="v-rec" type="button">Ricrea il testo dai dati</button><button class="btn ghost" id="v-copia" type="button">Copia il testo</button>
          <span class="err" id="v-err"></span></div>
        <div class="hint" id="v-stato-reg" style="margin-top:8px">${canEdit() ? 'Il registro conserva data, presenze, ospiti e testo: serve per l’archivio dei verbali e per le presenze dei Fratelli.' : 'Solo amministratore e Segretario possono salvare nel registro.'}</div></div>`;

    mascheraDate(v);
    const ta = $('#v-testo', v), err = $('#v-err', v);
    const rigenera = () => { if (!x.modificato) ta.value = x.testo = costruisciTesto(g); };

    $$('input[data-k]', v).forEach((inp) => inp.addEventListener('input', async () => {
      const k = inp.dataset.k;
      if (inp.dataset.g) { x[k] = inp.value; if (k === 'tav') x.tocco = true; } else { c[k] = inp.value; c.tocco[k] = true; }
      if (k === 'data') {
        const iso = itToIso(inp.value);
        if (iso && iso !== 'ERR') { await applicaData(false); $('#v-tav', v) && g && ($('#v-tav', v).value = x.tav); const pr = $('#v-prossima', v); if (pr) pr.value = c.prossima; ['mv', 'segretario', 'oratore'].forEach((q) => { const e = $('#v-' + q, v); if (e) e.value = c[q]; }); }
      }
      if (k === 'gemellata') { try { localStorage.setItem('lemmi.gemellata', inp.value); } catch (e) { /* facoltativo */ } }
      rigenera();
    }));
    $('#v-cal', v).addEventListener('change', async (e) => {
      if (!e.target.value) return;
      c.data = isoToIt(e.target.value); $('#v-data', v).value = c.data;
      await applicaData(false);
      ['mv', 'segretario', 'oratore'].forEach((q) => { const el = $('#v-' + q, v); if (el) el.value = c[q]; });
      const tv = $('#v-tav', v); if (tv) tv.value = x.tav;
      const pr = $('#v-prossima', v); if (pr) pr.value = c.prossima;
      rigenera();
    });
    $$('input[data-as]', v).forEach((cb) => cb.addEventListener('change', () => {
      const sel = $$('input[data-as]', v).filter((q) => q.checked).map((q) => q.dataset.as);
      c.assenti = sel.join(', '); $('#v-assenti', v).value = c.assenti; rigenera();
    }));
    ta.addEventListener('input', () => { x.testo = ta.value; x.modificato = true; });
    $('#v-rec', v).addEventListener('click', () => {
      if (x.modificato && !confirm('Il testo modificato a mano verrà sostituito con quello preparato dai dati. Continuare?')) return;
      x.modificato = false; ta.value = x.testo = costruisciTesto(g);
    });
    $('#v-copia', v).addEventListener('click', async () => { try { await navigator.clipboard.writeText(ta.value); toast('Testo copiato', 'ok'); } catch (e) { toast('Copia non riuscita: seleziona il testo e usa Ctrl+C.', 'bad'); } });
    $('#v-dl', v).addEventListener('click', () => scaricaDocx(g, ta.value, err));

    const sincronizza = () => {
      const el = eleggibili(g);
      const pres = el.filter((f) => statoPres(x, f.id) === 'presente').length;
      const giu = el.filter((f) => statoPres(x, f.id) === 'giustificato');
      const ass = el.filter((f) => statoPres(x, f.id) === 'assente').length;
      c.presenti = String(pres); c.assenti = giu.map((f) => f.cognome).join(', ');
      c.tocco.presenti = true; c.tocco.assenti = true;
      const ip = $('#v-presenti', v), ia = $('#v-assenti', v);
      if (ip) { ip.value = c.presenti; ip.readOnly = true; }
      if (ia) { ia.value = c.assenti; ia.readOnly = true; }
      const r = $('#v-pres-riep', v);
      if (r) r.textContent = `${pres} presenti · ${giu.length} assenti giustificati · ${ass} assenti non giustificati`;
      rigenera();
    };
    $$('select[data-pres]', v).forEach((sel) => sel.addEventListener('change', () => {
      (x.pres || (x.pres = {}))[sel.dataset.pres] = sel.value; sincronizza();
    }));
    const tp = $('#v-tuttip', v);
    if (tp) tp.addEventListener('click', () => { x.pres = {}; $$('select[data-pres]', v).forEach((sel) => { sel.value = 'presente'; }); sincronizza(); });
    sincronizza();
    const sb = $('#v-salva', v);
    if (sb) sb.addEventListener('click', () => salvaNelRegistro(g, ta.value, err, sb));
  }

  /* ---------- registro dei verbali e presenze ---------- */
  const GRADO_N = { apprendista: 1, compagno: 2, maestro: 3 };
  const gradoFr = (f) => { const t = norm(f.grado_attuale || ''); return t.startsWith('maestr') ? 3 : t.startsWith('compagn') ? 2 : t.startsWith('apprend') ? 1 : 0; };
  // chi può partecipare: tornata di Apprendista = tutti; di Compagno = Compagni e Maestri; di Maestro = Maestri (grado non noto = incluso)
  const eleggibili = (g) => vb.attivi.filter((f) => { const n = gradoFr(f); return !n || n >= GRADO_N[g]; });
  const statoPres = (x, id) => (x.pres && x.pres[id]) || 'presente';

  async function salvaNelRegistro(g, testo, err, btn) {
    err.textContent = '';
    const iso = itToIso(vb.c.data);
    if (!iso || iso === 'ERR') { err.textContent = 'Scrivi la data della tornata nel formato gg/mm/aaaa.'; $('#v-data').focus(); return; }
    const c = vb.c, x = vb.g[g], el = eleggibili(g);
    const etichetta = btn.textContent; btn.disabled = true; btn.textContent = 'Salvo…';
    try {
      const rec = {
        data: iso, grado: g, presenti: Number(c.presenti) || 0, ospiti: c.ospiti || null, testo: testo || null,
        dati: { c: JSON.parse(JSON.stringify(c)), x: JSON.parse(JSON.stringify(x)) }, aggiornato_il: new Date().toISOString(),
      };
      const es = chk(await state.sb.from('verbali').select('id').eq('data', iso).eq('grado', g).maybeSingle());
      let id, nuovo = !es;
      if (es) { id = es.id; chk(await state.sb.from('verbali').update(rec).eq('id', id)); }
      else id = chk(await state.sb.from('verbali').insert(rec).select('id').single()).id;
      chk(await state.sb.from('presenze_verbale').delete().eq('verbale_id', id));
      if (el.length) chk(await state.sb.from('presenze_verbale').insert(el.map((f) => ({ verbale_id: id, fratello_id: String(f.id), esito: statoPres(x, f.id) }))));
      toast(nuovo ? 'Verbale salvato nel registro' : 'Verbale aggiornato nel registro', 'ok');
      const st = $('#v-stato-reg'); if (st) st.innerHTML = `Salvato nel registro il ${new Date().toLocaleDateString('it-IT')}. <a href="#/verbali">Apri il registro</a>`;
    } catch (e) {
      const m = L.messaggioErrore ? L.messaggioErrore(e) : (e && e.message) || 'Errore';
      err.textContent = /verbali|presenze_verbale/.test(String(e && (e.message || e.details))) && /relation|schema cache|does not exist|not find/i.test(String(e && e.message))
        ? 'Manca la parte di database del registro: esegui lemmi_aggiornamento_19.sql in Supabase.' : m;
    } finally { btn.disabled = false; btn.textContent = etichetta; }
  }

  // usata dal registro: riapre un verbale salvato nel generatore
  L.apriVerbaleSalvato = async function (rec) {
    if (!vb.init) await inizializza();
    const d = rec.dati || {};
    if (d.c) vb.c = d.c;
    vb.g[rec.grado] = d.x || { tav: '', extra: '', testo: rec.testo || '', modificato: true, tocco: true };
    if (rec.testo) { vb.g[rec.grado].testo = rec.testo; vb.g[rec.grado].modificato = true; }
    location.hash = '#/template/verbale/' + rec.grado;
  };
  L.eleggibiliPerGrado = async function () { if (!vb.init) await inizializza(); return { attivi: vb.attivi, gradoFr, GRADO_N }; };

  function scaricaDocx(g, testo, err) {
    err.textContent = '';
    const iso = itToIso(vb.c.data), di = infoData(iso);
    if (!di) { err.textContent = 'Scrivi la data della tornata nel formato gg/mm/aaaa.'; $('#v-data').focus(); return; }
    const paragrafi = String(testo || '').split(/\n+/).map((t) => t.trim()).filter(Boolean);
    if (!paragrafi.length) { err.textContent = 'Il testo del verbale è vuoto.'; return; }
    if (/\[[^\]\n]+\]/.test(testo) && !confirm('Il testo contiene ancora parti tra parentesi quadre da completare. Scaricare comunque?')) return;
    const c = vb.c;
    const blob = window.LemmiDocx.crea({
      intestazione: ['A:.G:.D:.G:.A:.D:.U:.', 'MASSONERIA UNIVERSALE', 'GRANDE ORIENTE D’ITALIA – PALAZZO GIUSTINIANI',
        'RISPETTABILE LOGGIA ' + String(state.loggia.nome || '').toUpperCase() + ' N. ' + (state.loggia.numero || '') + ' O:.R:. DI ' + String(state.loggia.oriente || '').toUpperCase()],
      titolo: 'TORNATA RITUALE IN GRADO DI ' + GRADI[g].n.toUpperCase() + ' DEL ' + di.punti,
      paragrafi,
      mv: { titolo: 'Il Maestro Venerabile', nome: c.mv },
      firme: [{ titolo: 'Il Maestro Segretario', nome: c.segretario }, { titolo: 'Il Maestro Oratore', nome: c.oratore }],
    });
    const nome = 'Verbale_' + GRADI[g].n + '_' + iso + '.docx';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = nome; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('Verbale scaricato: ' + nome, 'ok');
  }


  /* ====================================================================
   *  Compilazione guidata dei moduli GOI (N/1, C/3, N/2-3, C/3 bis)
   * ==================================================================== */
  const mod = { vals: {}, scelta: {} };

  const conProv = (c, p) => (c ? c + (p ? ' (' + p + ')' : '') : '');

  function bussanteBase(b, dueVot) {
    return {
      cognome: b.cognome, nome: b.nome, nominativo: (b.nome + ' ' + b.cognome).trim(), nato: b.luogo_nascita || '', il: isoToIt(b.data_nascita), residente: conProv(b.citta, b.provincia), cap: b.cap || '',
      _scelta: { riammissione: 'riammissione', regolarizzazione: 'regolarizzazione', cancellazione_pena: 'pena' }[b.tipo_domanda] || '',
      via: b.indirizzo || '', tel: b.cellulare || '', studio: b.titolo_studio || '', professione: b.professione || '',
      data_domanda: isoToIt(b.data_domanda), data_seduta: isoToIt(dueVot ? b.data_seconda_votazione : b.data_prima_votazione),
      v1_data: isoToIt(b.data_prima_votazione), v2_data: dueVot ? isoToIt(b.data_seconda_votazione) : '',
    };
  }

  async function soggettoDati(M, id) {
    if (M.soggetto === 'bussante') {
      const b = chk(await state.sb.from('bussanti').select('*').eq('id', id).maybeSingle());
      if (!b) return {};
      const dueVot = b.tipo_domanda === 'iniziazione';
      const div = (window.LemmiPDF && window.LemmiPDF.dividiVia) || ((x) => [x || '', '']);
      const [via, civ] = div(b.indirizzo);
      const domVuoto = !b.domicilio_citta && !b.domicilio_indirizzo;
      const [dvia, dciv] = domVuoto ? [via, civ] : div(b.domicilio_indirizzo);
      const pv = b.provenienza || {}, rif = Array.isArray(b.referenti) ? b.referenti : [];
      const riga = (r) => (r ? [r.nome, r.indirizzo].filter(Boolean).join(' - ') : '');
      const conCiv = M.campi.some((c) => c.k === 'civ');
      return Object.assign(bussanteBase(b, dueVot), {
        nome_completo: (b.cognome + ' ' + b.nome).trim(), prov_nato: b.provincia_nascita || '', cf: b.codice_fiscale || '', email: b.email || '',
        civ, dom_citta: domVuoto ? conProv(b.citta, b.provincia) : conProv(b.domicilio_citta, b.domicilio_provincia), dom_cap: domVuoto ? (b.cap || '') : (b.domicilio_cap || ''),
        dom_via: dvia, dom_civ: dciv, rif1: riga(rif[0]), rif2: riga(rif[1]), rif3: riga(rif[2]),
        gran_loggia: pv.obbedienza || '', grado_ricoperto: pv.grado_ricoperto || pv.grado || '', esp_sent: isoToIt(pv.espulso_sentenza_del), esp_def: isoToIt(pv.espulso_definitiva_il),
      }, conCiv ? { via } : {});
    }
    const f = chk(await state.sb.from('fratelli').select('*').eq('id', id).maybeSingle());
    if (!f) return {};
    return {
      cognome: f.cognome, nome: f.nome, nato: f.luogo_nascita || '', il: isoToIt(f.data_nascita), residente: conProv(f.citta, f.provincia), cap: f.cap || '',
      via: f.indirizzo || '', tel: f.cellulare || '', nominativo: (f.nome + ' ' + f.cognome).trim(),
    };
  }

  async function vistaModulo(v, cod, preId) {
    const M = window.LemmiModuli && window.LemmiModuli.MODULI[cod];
    if (!M) { location.hash = '#/template'; return; }
    if (!['amministratore', 'venerabile', 'segretario'].includes(state.profilo.ruolo)) { v.innerHTML = '<div class="notice bad">Il tuo ruolo non ha accesso a questa sezione.</div>'; return; }
    const bus = M.soggetto === 'bussante', nessuno = M.soggetto === 'nessuno';
    const lista = nessuno ? [] : bus ? chk(await state.sb.from('bussanti').select('id,cognome,nome').order('cognome').order('nome')) : await L.caricaFratelli();
    const vals = mod.vals[cod] || (mod.vals[cod] = {});
    const sc = M.scelta;
    if (sc && !mod.scelta[cod]) mod.scelta[cod] = sc.opzioni[0].v;
    const gruppi = [];
    M.campi.forEach((c) => { const g = c.gruppo || 'Dati del modulo'; if (c.label && !gruppi.includes(g)) gruppi.push(g); });

    const campoHtml = (c) => (!c.label ? '' : c.area
      ? `<div class="f s12" data-campo="${c.k}"><label for="m-${c.k}" data-lab>${esc(c.label)}</label>
      <textarea id="m-${c.k}" data-k="${c.k}" rows="${c.righe.length > 3 ? 4 : 3}" style="width:100%">${esc(vals[c.k] || '')}</textarea><span class="hint">Il testo va a capo da solo sulle righe del modello (${c.righe.length} righe disponibili).</span></div>`
      : `<div class="f ${c.corto ? 's3' : 's6'}" data-campo="${c.k}"><label for="m-${c.k}" data-lab>${esc(c.label)}</label>
      <input id="m-${c.k}" data-k="${c.k}" ${c.tipo === 'data' ? 'data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"' : ''} value="${esc(vals[c.k] || '')}"></div>`);

    v.innerHTML = `
      <div class="crumb"><a href="#/template">Template</a> › Modulo ${esc(M.cod)}</div>
      <div class="page-head"><div><h1>${esc(M.titolo)}</h1><p>${esc(M.quando)}</p></div></div>
      ${nessuno ? '' : `<div class="card"><h2>${bus ? 'Bussante' : 'Fratello'}</h2>
        <div class="form-grid"><div class="f s8"><label for="m-sog">${bus ? 'Scegli il bussante' : 'Scegli il Fratello'}</label>
          <select id="m-sog"><option value="">— scegli —</option>${lista.map((x) => `<option value="${esc(x.id)}" ${String(x.id) === String(vals._id) ? 'selected' : ''}>${esc(x.cognome)} ${esc(x.nome)}</option>`).join('')}</select>
          <span class="hint">I dati anagrafici si compilano da soli; quelli che mancano si scrivono qui sotto.</span></div></div></div>`}
      ${sc ? `<div class="card" style="margin-top:18px"><h2>${esc(sc.label)}</h2><div class="radio-col">${sc.opzioni.map((o) => `<label class="check"><input type="radio" name="m-sc" value="${o.v}" ${mod.scelta[cod] === o.v ? 'checked' : ''}> ${esc(o.t)}</label>`).join('')}</div></div>` : ''}
      ${gruppi.map((g) => `<div class="card" style="margin-top:18px"><h2>${esc(g)}</h2><div class="form-grid">${M.campi.filter((c) => (c.gruppo || 'Dati del modulo') === g).map(campoHtml).join('')}</div></div>`).join('')}
      <div class="card" style="margin-top:18px"><p class="muted" style="margin:0 0 12px">${esc(M.invio)}<br>Il PDF si compila sopra il modello ufficiale: <b>firma del Maestro Venerabile, visto del Collegio e data di trasmissione restano in bianco</b>.</p>
        <div class="actions"><button class="btn gold" id="m-gen" type="button">${IC.pdf} Genera il PDF</button><span class="err" id="m-err"></span></div></div>`;

    mascheraDate(v);
    const aggiorna = () => {
      const s0 = mod.scelta[cod];
      M.campi.forEach((c) => {
        const box = $('[data-campo="' + c.k + '"]', v); if (!box) return;
        box.style.display = !c.se || !c.se.scelta || c.se.scelta.includes(s0) ? '' : 'none';
        if (c.etichettaPer) $('[data-lab]', box).textContent = c.etichettaPer[s0] || c.label;
      });
    };
    aggiorna();
    $$('input[data-k], textarea[data-k]', v).forEach((i) => i.addEventListener('input', () => { vals[i.dataset.k] = i.value; }));
    $$('input[name="m-sc"]', v).forEach((r) => r.addEventListener('change', () => { mod.scelta[cod] = r.value; aggiorna(); }));
    if ($('#m-sog', v)) $('#m-sog', v).addEventListener('change', async (e) => {
      vals._id = e.target.value;
      if (!e.target.value) return;
      try {
        const d = await soggettoDati(M, e.target.value);
        Object.keys(d).forEach((k) => { if (k === '_scelta') return; vals[k] = d[k]; const i = $('#m-' + k, v); if (i) i.value = d[k]; });
        if (d._scelta && M.scelta && M.scelta.opzioni.some((o) => o.v === d._scelta)) {
          mod.scelta[cod] = d._scelta; const r = $('input[name="m-sc"][value="' + d._scelta + '"]', v); if (r) r.checked = true; aggiorna();
        }
      } catch (x) { toast(messaggioErrore(x), 'bad'); }
    });
    $('#m-gen', v).addEventListener('click', () => generaModulo(M, cod, v, $('#m-err', v)));
    if (preId && $('#m-sog', v) && String(vals._id) !== String(preId) && lista.some((x) => String(x.id) === String(preId))) {
      $('#m-sog', v).value = preId; $('#m-sog', v).dispatchEvent(new Event('change'));
    }
  }

  async function generaModulo(M, cod, v, err) {
    err.textContent = '';
    const vals = mod.vals[cod] || {};
    if (M.soggetto !== 'nessuno' && !vals._id) { err.textContent = 'Scegli prima ' + (M.soggetto === 'bussante' ? 'il bussante.' : 'il Fratello.'); return; }
    const out = {};
    for (const c of M.campi) {
      const raw = String(vals[c.k] || '').trim();
      if (c.tipo === 'data' && raw) {
        const iso = itToIso(raw);
        if (!iso || iso === 'ERR') { err.textContent = '«' + c.label + '»: scrivi la data come gg/mm/aaaa.'; return; }
        out[c.k] = iso;
      } else out[c.k] = raw;
    }
    if (M.scelta) out[M.scelta.k] = mod.scelta[cod];
    const btn = $('#m-gen', v), et = btn.innerHTML; btn.disabled = true; btn.textContent = 'Genero…';
    try {
      const r = await fetch('templates/' + M.file + '.pdf');
      if (!r.ok) throw new Error('Modello templates/' + M.file + '.pdf non trovato.');
      const bytes = await window.LemmiModuli.compila(cod, out, state.loggia, new Uint8Array(await r.arrayBuffer()));
      const chi = vals.cognome ? (vals.cognome + '_' + (vals.nome || '')) : (vals.nominativo || '');
      const nome = M.file + (chi ? '_' + nomeFile(chi) : '_' + new Date().toISOString().slice(0, 10)) + '.pdf';
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = nome; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
      toast('PDF generato: ' + nome, 'ok');
    } catch (e) { err.textContent = messaggioErrore(e); }
    btn.disabled = false; btn.innerHTML = et;
  }

  L.viste.template = async function (v, parti) {
    if (parti[1] === 'modulo') return vistaModulo(v, String(parti[2] || '').toUpperCase(), parti[3]);
    if (parti[1] === 'verbale') return vistaVerbale(v, parti[2]);
    return vistaIndice(v);
  };
})();
