/* Lemmi - Elezioni, consegna 2: insediamento delle cariche (promessa solenne, nomina del Segretario e degli Ufficiali,
 * trapasso dei poteri, relazione sui lavori, conto gestione, aggiornamenti). Si aggancia alla schermata Elezioni. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, isoToIt, itToIso, IC, mascheraDate } = L;

  const UFF = [['segretarioAgg', 'Segretario aggiunto'], ['oratoreAgg', 'Oratore aggiunto'], ['tesoriereAgg', 'Tesoriere aggiunto'], ['esperto', 'Esperto'], ['maestroCerimonie', 'Maestro delle Cerimonie'],
    ['primoDiacono', 'Primo Diacono'], ['secondoDiacono', 'Secondo Diacono'], ['portastendardo', 'Portastendardo'], ['ospedaliere', 'Ospedaliere'], ['elemosiniere', 'Elemosiniere'],
    ['copritoreInterno', 'Copritore Interno'], ['copritoreEsterno', 'Copritore Esterno'], ['architettoRevisore', 'Architetto Revisore']];
  const VOCI_ENT = [['capitazioni', 'Capitazioni'], ['quoteIniz', 'Quote iniziazioni, promozioni, ecc.'], ['oblazioni', 'Oblazioni ed eventuali quote di Loggia'], ['residuoPrec', 'Residuo gestioni precedenti']];
  const VOCI_USC = [['capGoi', 'Capitazioni al G.O.I.'], ['quoteNo', 'Quote per N.O. al G.O.I.'], ['capCollegio', 'Capitazioni al Collegio'], ['speseLocali', 'Spese locali'], ['speseGestione', 'Spese gestione']];
  const MAIL = { anagrafe: 'anagrafe@grandeoriente.it', gran: 'gran.segreteria@grandeoriente.it', spedizioni: 'ufficio.spedizioni@grandeoriente.it' };

  /* ---------- utilità ---------- */
  const eur2 = (n) => L.eur(n).replace(/\s*€$/, '');                         // 1.234,56 senza simbolo (il modulo ha già l'€)
  const leggi = (t) => { let x = String(t || '').trim().replace(/\s/g, ''); if (!x) return 0; if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); const n = Number(x); return Number.isFinite(n) ? n : NaN; };
  const dataLunga = (iso, MESI) => { if (!iso) return ''; const [a, m, g] = iso.split('-'); return Number(g) + ' ' + MESI[Number(m) - 1] + ' ' + a; };
  const imposta = (obj, percorso, val) => { const p = percorso.split('.'); let o = obj; p.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; }); o[p[p.length - 1]] = val; };
  const prendi = (obj, percorso) => percorso.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
  const scarica = (bytes, nome) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = nome; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const ok = async (p) => { try { return chk(await p); } catch (e) { return null; } };

  /* ---------- dati per relazione e conto gestione ---------- */
  async function bozzaRelazione(Y, MESI) {
    const sb = state.sb, dal = Y + '-01-01', al = Y + '-12-31';
    const [tor, pas, fra, lav, trv, mov] = await Promise.all([
      ok(sb.from('tornate').select('tipo,grado,stato,data').gte('data', dal).lte('data', al).neq('stato', 'annullata')),
      ok(sb.from('passaggi_grado').select('grado,anno,data')),
      ok(sb.from('fratelli').select('anno_iniziazione,data_iniziazione')),
      ok(sb.from('lavori').select('titolo,fratello_id,autore_esterno,stato,data_presentazione,tornata_id').in('stato', ['presentato', 'archiviato'])),
      ok(sb.from('v_versamenti_elenco').select('voce,importo,data_versamento').gte('data_versamento', dal).lte('data_versamento', al)),
      ok(sb.from('v_conto_movimenti').select('importo,categoria').gte('data_operazione', dal).lte('data_operazione', al)),
    ]);
    const n = (tipo) => (tor || []).filter((t) => t.tipo === tipo).length;
    const rit = (tor || []).filter((t) => t.tipo === 'ordinaria' || t.tipo === 'straordinaria');
    const perGrado = (g) => rit.filter((t) => t.grado === g).length;
    const righe = [];
    const pl = (k, sing, plur) => k + ' ' + (k === 1 ? sing : plur);
    const parti = [];
    if (n('ordinaria')) parti.push(pl(n('ordinaria'), 'tornata ordinaria', 'tornate ordinarie'));
    if (n('straordinaria')) parti.push(pl(n('straordinaria'), 'tornata straordinaria', 'tornate straordinarie'));
    if (n('informale')) parti.push(pl(n('informale'), 'tornata informale via web', 'tornate informali via web'));
    if (n('agape')) parti.push(pl(n('agape'), 'agape fraterna', 'agapi fraterne'));
    righe.push(parti.length ? `Nel corso del ${Y} la Loggia ha tenuto ${parti.join(', ')} (secondo il calendario dei lavori).` : `Nel corso del ${Y} non risultano tornate registrate nel calendario.`);
    if (rit.some((t) => t.grado)) righe.push(`Per grado, tra ordinarie e straordinarie: ${perGrado('apprendista')} in primo grado, ${perGrado('compagno')} in secondo, ${perGrado('maestro')} in terzo.`);
    const iniz = (fra || []).filter((f) => Number(f.anno_iniziazione) === Y || String(f.data_iniziazione || '').startsWith(String(Y))).length;
    const pc = (pas || []).filter((p) => (String(p.data || '').startsWith(String(Y)) || Number(p.anno) === Y) && String(p.grado).toLowerCase() === 'compagno').length;
    const pm = (pas || []).filter((p) => (String(p.data || '').startsWith(String(Y)) || Number(p.anno) === Y) && String(p.grado).toLowerCase() === 'maestro').length;
    const mov_ = [];
    if (iniz) mov_.push(iniz === 1 ? 'è stato iniziato 1 Fratello' : `sono stati iniziati ${iniz} Fratelli`);
    if (pc) mov_.push(pc === 1 ? '1 Fratello è passato al grado di Compagno d’Arte' : `${pc} Fratelli sono passati al grado di Compagno d’Arte`);
    if (pm) mov_.push(pm === 1 ? '1 Fratello è stato elevato al grado di Maestro' : `${pm} Fratelli sono stati elevati al grado di Maestro`);
    if (mov_.length) righe.push(mov_.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.');
    const tav = (lav || []).filter((l) => String(l.data_presentazione || '').startsWith(String(Y)));
    if (tav.length) righe.push('Sono state presentate le seguenti tavole: ' + tav.slice(0, 14).map((l) => '«' + l.titolo + '»').join('; ') + (tav.length > 14 ? ' e altre ' + (tav.length - 14) : '') + '.');
    const tronco = (trv || []).filter((x) => /tronco|vedova/i.test(x.voce || '')).reduce((a, x) => a + Number(x.importo), 0);
    const benef = (mov || []).filter((x) => /benefic/i.test(x.categoria || '') && Number(x.importo) < 0).reduce((a, x) => a - Number(x.importo), 0);
    if (tronco || benef) righe.push(`Il Tronco della Vedova ha raccolto ${L.eur(tronco)}${benef ? '; gli atti di beneficenza ammontano a ' + L.eur(benef) : ''}.`);
    return righe.join(' ');
  }

  async function calcolaConto(Y) {
    const sb = state.sb, dal = Y + '-01-01', al = Y + '-12-31';
    const [mov, vers, sal] = await Promise.all([
      ok(sb.from('v_conto_movimenti').select('importo,categoria').gte('data_operazione', dal).lte('data_operazione', al)),
      ok(sb.from('v_versamenti_elenco').select('voce,importo,data_versamento').gte('data_versamento', dal).lte('data_versamento', al)),
      ok(sb.from('conto_saldi').select('data,saldo').lte('data', (Y - 1) + '-12-31').order('data', { ascending: false }).limit(1)),
    ]);
    if (!mov) throw new Error('Non riesco a leggere il Conto di Loggia con i tuoi permessi.');
    const cat = (x) => L.elezioni.norm(x.categoria || '');
    const sommaUsc = (re) => mov.filter((x) => Number(x.importo) < 0 && re.test(cat(x))).reduce((a, x) => a - Number(x.importo), 0);
    const totE = mov.filter((x) => Number(x.importo) > 0).reduce((a, x) => a + Number(x.importo), 0);
    const totU = mov.filter((x) => Number(x.importo) < 0).reduce((a, x) => a - Number(x.importo), 0);
    const perVoce = (re) => (vers || []).filter((x) => re.test(L.elezioni.norm(x.voce || ''))).reduce((a, x) => a + Number(x.importo), 0);
    const capitazioni = perVoce(/capitazion/);
    const tronco = perVoce(/tronco|vedova/);
    const quoteIngresso = mov.filter((x) => Number(x.importo) > 0 && /quote di ingresso/.test(cat(x))).reduce((a, x) => a + Number(x.importo), 0);
    const quoteIniz = quoteIngresso + perVoce(/aumento|promoz|iniziazion/);
    const oblazioni = Math.max(0, totE - capitazioni - quoteIniz - tronco);
    const capGoi = sommaUsc(/versamento capitazioni al goi/), quoteNo = sommaUsc(/ammissione goi/), capCollegio = sommaUsc(/collegio dei mm/);
    const speseLocali = sommaUsc(/\b(local|affitt|sede|tempio)/);
    const beneficenza = sommaUsc(/benefic/);
    const speseGestione = Math.max(0, totU - capGoi - quoteNo - capCollegio - speseLocali - beneficenza);
    const residuoPrec = sal && sal[0] ? Number(sal[0].saldo) : 0;
    return { capitazioni, quoteIniz, oblazioni, residuoPrec, capGoi, quoteNo, capCollegio, speseLocali, speseGestione, troncoEntrate: tronco, beneficenza, residuoNoto: !!(sal && sal[0]) };
  }

  /* ---------- riquadro ---------- */
  L.elezioniExtra = L.elezioniExtra || [];
  L.elezioniExtra.push(async (box) => {
    const X = L.elezioni;
    const { el, MESI } = X;
    const d = el.dati;
    const ins = d.ins = d.ins || {};
    ['ufficiali', 'aggiornamenti', 'conto', 'trapasso'].forEach((k) => { ins[k] = ins[k] || {}; });
    ins.trapasso.tipo = ins.trapasso.tipo || 'nuovo';
    const Y = el.anno - 1;                                       // anno solare che si chiude (relazione e conto gestione)
    if (!ins.dataInsediamento) ins.dataInsediamento = null;
    if (!ins.trapasso.dataNullaOsta && d.nulla_osta_data) ins.trapasso.dataNullaOsta = d.nulla_osta_data;
    const maestri = el.valut.map((x) => x.f);
    const dl = `<datalist id="dl-ins-m">${maestri.map((f) => `<option value="${esc(X.elencoNome(f))}"></option>`).join('')}</datalist>`;
    const campo = (percorso, label, o) => {
      o = o || {}; const val = prendi(ins, percorso);
      const v = o.data ? isoToIt(val) : (val == null ? '' : val);
      return `<div class="f ${o.cls || 's6'}"><label>${esc(label)}</label><input data-ins="${percorso}" ${o.data ? 'data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"' : ''} ${o.list ? 'list="dl-ins-m" autocomplete="off"' : ''} ${o.ro ? 'readonly' : ''} value="${esc(v)}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''}></div>`;
    };
    const euro = (percorso, label, ro) => `<div class="f s6"><label>${esc(label)}</label><input data-eu="${percorso}" ${ro ? 'readonly style="background:var(--bg)"' : ''} inputmode="decimal" value="${esc(prendi(ins, percorso) || '')}" placeholder="0,00"></div>`;

    box.innerHTML = `<div class="card"><h2>5. Insediamento delle cariche</h2>${dl}
      <p class="muted" style="margin-top:0">Si compila dopo il Nulla Osta, a insediamento avvenuto. I modelli sono quelli GOI 2024 con l’anno massonico aggiornato; firme e date di firma restano in bianco.</p>
      <details open><summary style="cursor:pointer;font-weight:600">Data e nomine</summary><div class="form-grid" style="margin-top:10px">
        ${campo('dataInsediamento', 'Data dell’insediamento', { cls: 's4', data: true })}${campo('dataTornata', 'Tornata della nomina (se diversa)', { cls: 's4', data: true })}
        ${campo('segretarioNuovo', 'Segretario nominato dal Venerabile', { cls: 's4', list: true, ph: 'Cognome e nome' })}</div>
        <h3 style="margin:14px 0 6px">Ufficiali nominati</h3><div class="form-grid">${UFF.map(([k, t]) => campo('ufficiali.' + k, t, { cls: 's4', list: true })).join('')}</div></details>
      <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Verbale di trapasso dei poteri</summary><div class="form-grid" style="margin-top:10px">
        <div class="f s4"><label>Maestro Venerabile</label><select data-ins="trapasso.tipo"><option value="nuovo" ${ins.trapasso.tipo === 'nuovo' ? 'selected' : ''}>Neoeletto (subentrante)</option><option value="confermato" ${ins.trapasso.tipo === 'confermato' ? 'selected' : ''}>Confermato</option></select></div>
        ${campo('trapasso.dataNullaOsta', 'Tavola del N.O. del', { cls: 's4', data: true })}
        ${campo('trapasso.circolare', 'Circolare GOI dell’anno (es. N. 3/EM del 5 ottobre 2026)', { cls: 's4' })}
        <div class="f hint">Se lasci vuota la circolare, nel modulo resta citata quella stampata nel modello 2024 (N. 2/EM del 1° ottobre 2024): controlla se quest’anno ne è arrivata una nuova.</div></div></details>
      <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Relazione sui lavori del ${Y}</summary><div style="margin-top:10px">
        <div class="actions" style="margin-bottom:8px"><button class="btn ghost small" type="button" id="i-rel-b">Prepara la bozza dai dati dell’app</button></div>
        <textarea data-ins="relazione" rows="9" style="width:100%" placeholder="Testo della relazione (compresi eventuali atti di beneficenza)">${esc(ins.relazione || '')}</textarea>
        <div class="hint">Nel modulo c’è spazio per circa una pagina di testo.</div></div></details>
      <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Conto gestione ${Y}</summary><div style="margin-top:10px">
        <div class="actions" style="margin-bottom:8px"><button class="btn ghost small" type="button" id="i-con-b">Calcola dal Conto di Loggia</button></div>
        <div class="grid cols-2"><div><h3 style="margin:0 0 6px">Entrate</h3><div class="form-grid">${VOCI_ENT.map(([k, t]) => euro('conto.' + k, t)).join('')}${euro('conto.totEntrate', 'Totale entrate', true)}</div>
          <h3 style="margin:14px 0 6px">Tronco della Vedova</h3><div class="form-grid">${euro('conto.troncoEntrate', 'Entrate')}</div></div>
        <div><h3 style="margin:0 0 6px">Uscite</h3><div class="form-grid">${VOCI_USC.map(([k, t]) => euro('conto.' + k, t)).join('')}${euro('conto.totUscite', 'Totale uscite', true)}${euro('conto.accLoggia', 'Accantonamenti')}</div>
          <h3 style="margin:14px 0 6px">Tronco della Vedova</h3><div class="form-grid">${euro('conto.beneficenza', 'Beneficenza')}${euro('conto.accTronco', 'Accantonamenti')}${euro('conto.pareggio', 'Totale a pareggio', true)}</div></div></div>
        <div id="i-con-msg" class="hint" style="margin-top:8px"></div></div></details>
      <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Aggiornamenti ${el.anno}</summary><div class="form-grid" style="margin-top:10px">
        ${campo('aggiornamenti.cf', 'Codice fiscale della Loggia', { cls: 's6' })}${campo('aggiornamenti.giorni', 'Giorni di tornata', { cls: 's6', ph: 'es. 1° e 3° mercoledì del mese' })}
        ${campo('aggiornamenti.indirizzo1', 'Indirizzo completo del luogo di riunione (riga 1)', { cls: 's12' })}${campo('aggiornamenti.indirizzo2', 'Indirizzo completo del luogo di riunione (riga 2)', { cls: 's12' })}
        <div class="f s12"><label class="muted">Indirizzo per la corrispondenza e i pacchi destinati alla Loggia</label></div>
        ${campo('aggiornamenti.corrispondenza.nome', 'Nome e cognome', { cls: 's4' })}${campo('aggiornamenti.corrispondenza.via', 'Via', { cls: 's4' })}${campo('aggiornamenti.corrispondenza.capCitta', 'CAP e città', { cls: 's4' })}</div></details>
      <h3 style="margin:18px 0 8px">Documenti e registrazione</h3>
      <div class="actions" style="flex-wrap:wrap">
        <button class="btn gold" type="button" data-pdf="anagrafe">PDF per l’Anagrafe</button>
        <button class="btn gold" type="button" data-pdf="gran">PDF per la Gran Segreteria</button>
        <button class="btn gold" type="button" data-pdf="spedizioni">PDF Aggiornamenti</button>
        <button class="btn ghost" type="button" data-pdf="tutto">Tutto in un unico PDF</button></div>
      <div class="hint" style="margin-top:8px">Anagrafe (promessa solenne e nomina del Segretario) → ${MAIL.anagrafe}. Gran Segreteria (nomina degli Ufficiali, trapasso dei poteri, relazione e conto gestione) → ${MAIL.gran}. Aggiornamenti → GOI (${MAIL.spedizioni}) e Segreteria del Collegio dei MM.VV.</div>
      <div id="i-esito"></div>
      <div class="actions" style="margin-top:14px"><button class="btn ghost" type="button" id="i-cariche">Registra le cariche nella storia dei Fratelli</button><button class="btn ghost" type="button" id="i-salva">Salva l’insediamento</button></div></div>`;
    mascheraDate(box);

    /* collegamento dei campi */
    const aggiornaConto = () => {
      const c = ins.conto, n = (k) => { const x = leggi(c[k]); return Number.isNaN(x) ? 0 : x; };
      const totE = n('capitazioni') + n('quoteIniz') + n('oblazioni') + n('residuoPrec');
      const totU = n('capGoi') + n('quoteNo') + n('capCollegio') + n('speseLocali') + n('speseGestione');
      const pareggio = totE + n('troncoEntrate');
      c.totEntrate = eur2(totE); c.totUscite = eur2(totU); c.pareggio = eur2(pareggio);
      ['totEntrate', 'totUscite', 'pareggio'].forEach((k) => { const i = $(`[data-eu="conto.${k}"]`, box); if (i) i.value = c[k]; });
      const diff = Math.round((totU + n('accLoggia') + n('beneficenza') + n('accTronco') - pareggio) * 100) / 100;
      $('#i-con-msg', box).innerHTML = Math.abs(diff) < 0.005 ? '<span style="color:var(--ok)">Il conto pareggia.</span>' : `<span style="color:var(--bad)">Il conto non pareggia: uscite + accantonamenti + beneficenza differiscono di ${L.eur(diff)} dal totale a pareggio. Correggi gli accantonamenti.</span>`;
    };
    box.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.ins) imposta(ins, t.dataset.ins, t.value);
      if (t.dataset.eu) { imposta(ins, t.dataset.eu, t.value); aggiornaConto(); }
    });
    box.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.ins && t.hasAttribute('data-date')) { const i = itToIso(t.value); if (i === 'ERR') { toast('Data non valida: usa gg/mm/aaaa.', 'bad'); return; } imposta(ins, t.dataset.ins, i); }
      if (t.dataset.ins === 'trapasso.tipo') imposta(ins, 'trapasso.tipo', t.value);
    });
    aggiornaConto();

    $('#i-rel-b', box).onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try { ins.relazione = await bozzaRelazione(Y, MESI); $('[data-ins="relazione"]', box).value = ins.relazione; toast('Bozza preparata: rileggila e correggila', 'ok'); }
      catch (e) { toast(messaggioErrore(e), 'bad'); }
      b.disabled = false;
    };
    $('#i-con-b', box).onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        const r = await calcolaConto(Y), c = ins.conto;
        ['capitazioni', 'quoteIniz', 'oblazioni', 'residuoPrec', 'capGoi', 'quoteNo', 'capCollegio', 'speseLocali', 'speseGestione', 'troncoEntrate', 'beneficenza'].forEach((k) => { c[k] = eur2(r[k]); });
        const totE = r.capitazioni + r.quoteIniz + r.oblazioni + r.residuoPrec, totU = r.capGoi + r.quoteNo + r.capCollegio + r.speseLocali + r.speseGestione;
        c.accLoggia = eur2(Math.max(0, totE - totU)); c.accTronco = eur2(Math.max(0, r.troncoEntrate - r.beneficenza));
        $$('[data-eu]', box).forEach((i) => { const v = prendi(ins, i.dataset.eu); if (v !== undefined) i.value = v; });
        aggiornaConto();
        toast(r.residuoNoto ? 'Conto calcolato dai dati: controllalo' : 'Conto calcolato: manca il saldo al 31 dicembre precedente, inserisci tu il residuo', 'ok');
      } catch (e) { toast(messaggioErrore(e), 'bad'); }
      b.disabled = false;
    };

    /* PDF */
    async function generaPdf(quale) {
      const nuovoSeg = X.trovaFratello(ins.segretarioNuovo);
      if (quale !== 'spedizioni' && !nuovoSeg) throw new Error('Indica il Segretario nominato scegliendo un nome dall’elenco.');
      if (!ins.dataInsediamento) throw new Error('Indica la data dell’insediamento.');
      const anag = nuovoSeg ? await X.anagraficheVincitori([nuovoSeg]) : {};
      const ufficiali = {};
      UFF.forEach(([k]) => { const f = X.trovaFratello(ins.ufficiali[k]); ufficiali[k] = f ? X.nomeCompleto(f) : (ins.ufficiali[k] || ''); });
      const [aa, mm, gg] = ins.dataInsediamento.split('-');
      const dati = {
        annoMassonico: el.anno, loggia: state.loggia || {},
        dataInsediamento: dataLunga(ins.dataInsediamento, MESI), dataTornata: dataLunga(ins.dataTornata || ins.dataInsediamento, MESI),
        segretario: nuovoSeg ? X.schedaAutocert(anag[nuovoSeg.id]) : {}, ufficiali,
        trapasso: { tipo: ins.trapasso.tipo, anno: aa, giorno: String(Number(gg)), mese: MESI[Number(mm) - 1], dataNullaOsta: dataLunga(ins.trapasso.dataNullaOsta, MESI), circolare: ins.trapasso.circolare || '' },
        relazione: ins.relazione || '', conto: ins.conto, aggiornamenti: ins.aggiornamenti,
      };
      if (nuovoSeg) dati.segretario.nome = X.nomeCompleto(nuovoSeg);
      const r = await fetch('templates/INSEDIAMENTO.pdf');
      if (!r.ok) throw new Error('Modello templates/INSEDIAMENTO.pdf non trovato.');
      const full = await window.LemmiInsediamentoPdf.compila(new Uint8Array(await r.arrayBuffer()), dati);
      const parti = { anagrafe: [[0, 1], 'Insediamento_Anagrafe_' + el.anno], gran: [[2, 3, 4, 5], 'Insediamento_Gran_Segreteria_' + el.anno], spedizioni: [[6], 'Aggiornamenti_' + el.anno] };
      if (quale === 'tutto') scarica(full, 'Insediamento_completo_' + el.anno + '.pdf');
      else scarica(await window.LemmiInsediamentoPdf.estrai(full, parti[quale][0]), parti[quale][1] + '.pdf');
      return nuovoSeg ? X.mancanti(anag[nuovoSeg.id]) : [];
    }
    $$('[data-pdf]', box).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true; $('#i-esito', box).innerHTML = '';
      try {
        await X.salva(true).catch(() => {});
        const manc = await generaPdf(b.dataset.pdf);
        $('#i-esito', box).innerHTML = `<div class="notice" style="margin-top:10px">PDF generato. Stampa, fai firmare e invia. ${ins.trapasso.circolare ? '' : '<b>Nota:</b> il verbale di trapasso cita ancora la circolare del 2024.'}${manc.length ? `<br><b>Dati mancanti del Segretario in anagrafica:</b> ${esc(manc.join(', '))}.` : ''}</div>`;
      } catch (e) { $('#i-esito', box).innerHTML = `<div class="notice" style="margin-top:10px;background:var(--bad-soft,#fde8e8);color:var(--bad,#a12)">${esc(messaggioErrore(e))}</div>`; }
      b.disabled = false;
    }));

    /* registra le cariche nella storia dei Fratelli */
    $('#i-cariche', box).onclick = async (ev) => {
      const b = ev.currentTarget;
      if (!window.confirm('Registrare nella storia dei Fratelli le cariche di Venerabile, Dignitari e Segretario per il ' + el.anno + '?')) return;
      b.disabled = true;
      try {
        const voc = chk(await state.sb.from('elenco_cariche').select('nome'));
        const trova = (re, no) => { const m = voc.find((c) => re.test(X.norm(c.nome)) && !(no && no.test(X.norm(c.nome)))); return m ? m.nome : null; };
        const ruoli = [
          ['mv', 'Maestro Venerabile', trova(/venerabile/, /gran|aggiunt/)], ['s1', '1° Sorvegliante', trova(/(primo|1).*sorvegliante|sorvegliante.*(1|primo)/, /gran|aggiunt/)],
          ['s2', '2° Sorvegliante', trova(/(secondo|2).*sorvegliante|sorvegliante.*(2|secondo)/, /gran|aggiunt/)], ['oratore', 'Oratore', trova(/oratore/, /gran|aggiunt/)],
          ['tesoriere', 'Tesoriere', trova(/tesorier/, /gran|aggiunt/)], ['segretario', 'Segretario', trova(/segretari/, /gran|aggiunt/)],
        ];
        const mancanti = ruoli.filter((r) => !r[2]).map((r) => r[1]);
        if (mancanti.length) throw new Error('Nell’elenco delle cariche non trovo: ' + mancanti.join(', ') + '. Aggiungile da Fratelli → Storia e riprova.');
        const righe = [];
        for (const [k, titolo, nomeCarica] of ruoli) {
          const nome = k === 'segretario' ? ins.segretarioNuovo : X.esito(k).vincitore;
          const f = X.trovaFratello(nome);
          if (!f) throw new Error('Per ' + titolo + ' manca un Fratello valido (votazioni o nomina).');
          righe.push({ fratello_id: f.id, carica: nomeCarica, anno_dal: el.anno, anno_al: el.anno });
        }
        const gia = chk(await state.sb.from('cariche_storico').select('fratello_id,carica,anno_dal').eq('anno_dal', el.anno));
        const nuove = righe.filter((r) => !gia.some((g) => g.fratello_id === r.fratello_id && g.carica === r.carica));
        if (nuove.length) chk(await state.sb.from('cariche_storico').insert(nuove));
        toast(nuove.length ? nuove.length + ' cariche registrate nella storia dei Fratelli' : 'Le cariche erano già registrate', 'ok');
      } catch (e) { toast(messaggioErrore(e), 'bad'); }
      b.disabled = false;
    };
    $('#i-salva', box).onclick = async () => { try { await X.salva(false); } catch (e) { toast(messaggioErrore(e), 'bad'); } };
  });
})();
