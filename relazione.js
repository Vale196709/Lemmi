/* Lemmi - Relazione annuale del Maestro Venerabile: una bozza scritta con i dati dell'anno (tornate, presenze,
 * iniziazioni e passaggi, lavori, Fratelli, tesoreria). Si legge, si completa nel riquadro e si scarica in Word (.docx).
 * I numeri vengono da Calendario, Verbali, Fratelli, Storia, Lavori e Conto di Loggia: vanno controllati prima dell'uso. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, esc, chk, toast, messaggioErrore, oggi } = L;

  const GRADO = { apprendista: 'Apprendista', compagno: 'Compagno d’Arte', maestro: 'Maestro' };
  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
  const plur = (n, s, p) => n + ' ' + (n === 1 ? s : p);
  const eur = (x) => (Number(x) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  const lista = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]);
  const sicuro = async (p, def) => { try { return chk(await p) || def; } catch (e) { return def; } };

  async function raccogli(anno) {
    const sb = state.sb, dal = anno + '-01-01', al = anno + '-12-31';
    const [tornate, verbali, fratelli, completi, passaggi, bussanti, lavori, movimenti] = await Promise.all([
      sicuro(sb.from('tornate').select('data,tipo,grado,stato').gte('data', dal).lte('data', al), []),
      sicuro(sb.from('verbali').select('data,grado,presenti').gte('data', dal).lte('data', al), []),
      sicuro(sb.from('fratelli').select('id,cognome,nome,stato,data_iniziazione,anno_iniziazione'), []),
      sicuro(sb.from('v_fratelli_completi').select('id,stato,grado_attuale'), []),
      sicuro(sb.from('passaggi_grado').select('fratello_id,grado,anno,data'), []),
      sicuro(sb.from('bussanti').select('id'), []),
      sicuro(sb.from('lavori').select('titolo,fratello_id,autore_esterno,stato,data_presentazione').in('stato', ['presentato', 'archiviato']).gte('data_presentazione', dal).lte('data_presentazione', al), []),
      sicuro(sb.from('v_conto_movimenti').select('importo,data_operazione').gte('data_operazione', dal).lte('data_operazione', al), null),
    ]);
    return { anno, tornate, verbali, fratelli, completi, passaggi, bussanti, lavori, movimenti };
  }

  function scrivi(d) {
    const a = d.anno, nome = {}; d.fratelli.forEach((f) => { nome[f.id] = 'Fr.·. ' + f.cognome + ' ' + f.nome; });
    const loggia = state.loggia || {};
    const out = [];
    out.push(`Carissimi Fratelli, al termine dell’anno ${a} presento la relazione sull’attività svolta dalla nostra Rispettabile Loggia${loggia.nome ? ' ' + loggia.nome : ''}.`);

    // tornate
    const oggiIso = oggi();
    const svolte = d.tornate.filter((t) => t.stato !== 'annullata' && (t.stato === 'svolta' || t.data <= oggiIso));
    const per = (tipo) => svolte.filter((t) => t.tipo === tipo);
    const ord = per('ordinaria'), inf = per('informale'), str = per('straordinaria'), aga = per('agape');
    const annullate = d.tornate.filter((t) => t.stato === 'annullata').length;
    out.push('## Attività rituale');
    if (!svolte.length) out.push('Nel Calendario non risultano tornate per questo anno.');
    else {
      const gr = ['apprendista', 'compagno', 'maestro'].map((g) => [g, ord.filter((t) => t.grado === g).length]).filter((x) => x[1]);
      let t = `Nel ${a} la Loggia si è riunita in ${plur(svolte.length, 'occasione', 'occasioni')}: ${lista([
        ord.length && plur(ord.length, 'tornata rituale ordinaria', 'tornate rituali ordinarie') + (gr.length ? ' (' + gr.map((x) => x[1] + ' in grado di ' + GRADO[x[0]]).join(', ') + ')' : ''),
        inf.length && plur(inf.length, 'conferenza via web', 'conferenze via web'),
        str.length && plur(str.length, 'tornata straordinaria', 'tornate straordinarie'),
        aga.length && plur(aga.length, 'agape', 'agapi')].filter(Boolean))}.`;
      if (annullate) t += ` ${plur(annullate, 'riunione prevista è stata annullata', 'riunioni previste sono state annullate')}.`;
      out.push(t);
    }
    const vr = d.verbali;
    if (vr.length) {
      const media = vr.reduce((s, x) => s + (Number(x.presenti) || 0), 0) / vr.length;
      out.push(`Sono stati redatti e registrati ${plur(vr.length, 'verbale', 'verbali')} di tornata; la presenza media è stata di ${media.toFixed(1).replace('.', ',')} Fratelli per tornata.`);
    }

    // persone
    out.push('## La vita della Loggia');
    const attivi = d.completi.filter((f) => String(f.stato || '').toLowerCase() === 'attivo');
    const gradi = ['apprendista', 'compagno', 'maestro'].map((g) => [g, attivi.filter((f) => String(f.grado_attuale || '').toLowerCase() === g).length]);
    const ETI = { apprendista: ['Apprendista', 'Apprendisti'], compagno: ['Compagno d’Arte', 'Compagni d’Arte'], maestro: ['Maestro', 'Maestri'] };
    if (attivi.length) out.push(`Al momento di questa relazione i Fratelli attivi sono ${attivi.length}: ${lista(gradi.filter((x) => x[1]).map((x) => x[1] + ' ' + ETI[x[0]][x[1] === 1 ? 0 : 1]))}.`);
    const iniz = d.fratelli.filter((f) => (f.data_iniziazione && f.data_iniziazione.slice(0, 4) === String(a)) || (!f.data_iniziazione && Number(f.anno_iniziazione) === a));
    out.push(iniz.length ? `${iniz.length === 1 ? 'È stato iniziato 1 nuovo Fratello' : 'Sono stati iniziati ' + iniz.length + ' nuovi Fratelli'}: ${lista(iniz.map((f) => 'Fr.·. ' + f.cognome + ' ' + f.nome))}.` : `Nel ${a} non risultano nuove iniziazioni.`);
    const pas = d.passaggi.filter((p) => (p.data ? p.data.slice(0, 4) === String(a) : Number(p.anno) === a));
    const comp = pas.filter((p) => p.grado === 'compagno'), mae = pas.filter((p) => p.grado === 'maestro');
    if (comp.length) out.push(`Hanno ricevuto il passaggio al grado di Compagno d’Arte: ${lista(comp.map((p) => nome[p.fratello_id] || 'un Fratello'))}.`);
    if (mae.length) out.push(`Sono stati elevati al grado di Maestro: ${lista(mae.map((p) => nome[p.fratello_id] || 'un Fratello'))}.`);
    if (!comp.length && !mae.length) out.push(`Nel ${a} non risultano passaggi di grado.`);
    if (d.bussanti.length) out.push(d.bussanti.length === 1 ? 'È presente 1 bussante in attesa di essere esaminato.' : `Sono presenti ${d.bussanti.length} bussanti in attesa di essere esaminati.`);

    // lavori
    out.push('## Lavori e tavole');
    out.push(d.lavori.length ? `${d.lavori.length === 1 ? 'È stato presentato 1 lavoro' : 'Sono stati presentati ' + d.lavori.length + ' lavori'}: ${lista(d.lavori.map((l) => '«' + l.titolo + '» (' + (l.fratello_id ? nome[l.fratello_id] || 'Fratello' : l.autore_esterno || 'autore esterno') + ')'))}.` : `Nel ${a} non risultano lavori presentati nel registro.`);

    // tesoreria
    if (d.movimenti) {
      const ent = d.movimenti.filter((x) => Number(x.importo) > 0).reduce((s, x) => s + Number(x.importo), 0);
      const usc = d.movimenti.filter((x) => Number(x.importo) < 0).reduce((s, x) => s - Number(x.importo), 0);
      out.push('## Situazione economica');
      out.push(d.movimenti.length ? `Dal Conto di Loggia risultano nel ${a} entrate per ${eur(ent)} e uscite per ${eur(usc)}, con un risultato di ${eur(ent - usc)}. Per il dettaglio si rinvia alla relazione del Maestro Tesoriere.` : `Nel Conto di Loggia non risultano movimenti per il ${a}.`);
    }

    out.push('## Considerazioni del Maestro Venerabile');
    out.push('[Scrivi qui le tue considerazioni sull’andamento dell’anno: clima di Loggia, risultati raggiunti, difficoltà incontrate.]');
    out.push('## Obiettivi per il prossimo anno');
    out.push('[Indica gli obiettivi e le priorità per l’anno che viene.]');
    out.push('Con il consueto triplice fraterno abbraccio.');
    return out.join('\n\n');
  }

  function daTesto(testo) {
    return String(testo || '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith('## ') ? { titolo: t.slice(3).trim() } : t.replace(/\n+/g, ' ')));
  }

  function scaricaDocx(anno, testo, err) {
    err.textContent = '';
    if (!window.LemmiDocx) { err.textContent = 'Generatore Word non caricato: ricarica la pagina.'; return; }
    const par = daTesto(testo);
    if (!par.length) { err.textContent = 'Il testo è vuoto.'; return; }
    if (/\[[^\]\n]+\]/.test(testo) && !confirm('Il testo contiene ancora parti tra parentesi quadre da completare. Scaricare comunque?')) return;
    const l = state.loggia || {};
    const blob = window.LemmiDocx.crea({
      intestazione: ['A:.G:.D:.G:.A:.D:.U:.', 'MASSONERIA UNIVERSALE', 'GRANDE ORIENTE D’ITALIA – PALAZZO GIUSTINIANI',
        'RISPETTABILE LOGGIA ' + String(l.nome || '').toUpperCase() + ' N. ' + (l.numero || '') + ' O:.R:. DI ' + String(l.oriente || '').toUpperCase()],
      titolo: 'RELAZIONE ANNUALE DEL MAESTRO VENERABILE – ANNO ' + anno,
      paragrafi: par,
      mv: { titolo: 'Il Maestro Venerabile', nome: '' },
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Relazione_annuale_' + anno + '.docx'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('Relazione scaricata: Relazione_annuale_' + anno + '.docx', 'ok');
  }

  L.viste.relazione = async function (v) {
    const ora = new Date().getFullYear();
    let anno = ora;
    v.innerHTML = `<div class="page-head"><div><h1>Relazione annuale</h1><p>Bozza della relazione del Maestro Venerabile, scritta con i dati dell’anno · da rileggere e completare</p></div></div>
      <div class="card"><div class="actions" style="margin-bottom:12px;flex-wrap:wrap"><label class="lbl" for="rl-anno">Anno</label>
        <select id="rl-anno" style="width:auto">${[ora - 2, ora - 1, ora].map((x) => `<option ${x === ora ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <button class="btn ghost" type="button" id="rl-rigenera">Riscrivi dai dati</button></div>
        <div class="notice" style="margin-bottom:12px"><b>Controlla i numeri.</b> Il testo si ricava da Calendario, Verbali, Fratelli, Storia, Lavori e Conto di Loggia: se un dato non è stato registrato, non compare. Le righe che iniziano con «##» sono titoli di sezione. Completa le parti tra parentesi quadre.</div>
        <textarea id="rl-testo" rows="22" style="width:100%;font-family:inherit;line-height:1.5" aria-label="Testo della relazione"></textarea>
        <div class="err" id="rl-err" style="margin-top:8px"></div>
        <div class="actions" style="margin-top:12px"><button class="btn gold" type="button" id="rl-docx">Scarica in Word (.docx)</button>
          <button class="btn ghost" type="button" id="rl-stampa">Stampa</button></div></div>`;
    const ta = $('#rl-testo', v), err = $('#rl-err', v);
    let modificato = false;
    ta.addEventListener('input', () => { modificato = true; });
    async function carica() {
      ta.value = 'Raccolgo i dati…';
      try { ta.value = scrivi(await raccogli(anno)); modificato = false; }
      catch (e) { ta.value = ''; err.textContent = messaggioErrore(e); }
    }
    $('#rl-anno', v).addEventListener('change', (e) => {
      if (modificato && !confirm('Hai modificato il testo: cambiando anno lo perdi. Continuare?')) { e.target.value = String(anno); return; }
      anno = Number(e.target.value); carica();
    });
    $('#rl-rigenera', v).addEventListener('click', () => { if (!modificato || confirm('Il testo che hai scritto andrà perso. Continuare?')) carica(); });
    $('#rl-docx', v).addEventListener('click', () => scaricaDocx(anno, ta.value, err));
    $('#rl-stampa', v).addEventListener('click', () => {
      const w = window.open('', '_blank');
      if (!w) { toast('Il browser ha bloccato la finestra di stampa: usa «Scarica in Word».', 'bad'); return; }
      const corpo = daTesto(ta.value).map((p) => (typeof p === 'object' ? `<h2>${esc(p.titolo)}</h2>` : `<p>${esc(p)}</p>`)).join('');
      w.document.write(`<!doctype html><meta charset="utf-8"><title>Relazione annuale ${anno}</title><style>body{font:14pt/1.5 "Times New Roman",serif;margin:2.5cm;text-align:justify}h1,h2{font-size:14pt}h1{text-align:center}p{text-indent:1.2cm;margin:0 0 .5em}</style><h1>RELAZIONE ANNUALE DEL MAESTRO VENERABILE – ANNO ${anno}</h1>${corpo}`);
      w.document.close(); w.focus(); w.print();
    });
    carica();
  };

  L.relazione = { scrivi, daTesto };
})();
