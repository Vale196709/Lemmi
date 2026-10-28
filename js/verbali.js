/* Lemmi - Registro dei verbali di tornata e presenze dei Fratelli.
 * I verbali si salvano dal generatore (Template > Verbali di tornata, pulsante «Salva nel registro»).
 * Qui si consultano per anno, si riaprono nel generatore, si vedono i verbali mancanti rispetto al Calendario
 * e le presenze di ogni Fratello, con l'avviso quando l'assenza si avvicina ai 6 mesi (art. 12 Costituzione).
 * Richiede lemmi_aggiornamento_19.sql. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, oggi, canEdit } = L;

  const GRADI = { apprendista: 'Apprendista', compagno: 'Compagno', maestro: 'Maestro' };
  const st = { anno: null, periodo: 'anno', soloAvvisi: false };
  const GIORNI_AVVISO = 150;   // circa 5 mesi
  const GIORNI_LIMITE = 183;   // circa 6 mesi
  const giorniTra = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
  const mancaTabella = (e) => /relation|schema cache|does not exist|not find/i.test(String((e && e.message) || '')) && /verbali|presenze_verbale/.test(String((e && e.message) || ''));

  async function leggiTutto(q) {
    const out = [];
    for (let da = 0; ; da += 1000) {
      const r = await q().range(da, da + 999);
      const righe = chk(r);
      out.push(...righe);
      if (righe.length < 1000) break;
    }
    return out;
  }

  const tabs = (k) => `<div class="tabs">
    <a class="tab ${k === 'registro' ? 'on' : ''}" href="#/verbali">Registro dei verbali</a>
    <a class="tab ${k === 'presenze' ? 'on' : ''}" href="#/verbali/presenze">Presenze dei Fratelli</a></div>`;

  function avvisoDb(v, e) {
    v.innerHTML = `<div class="page-head"><div><h1>Verbali e presenze</h1></div></div>
      <div class="notice bad">${mancaTabella(e) ? 'Manca la parte di database del registro: esegui <code>lemmi_aggiornamento_19.sql</code> in Supabase (SQL Editor), poi ricarica la pagina.' : esc(messaggioErrore ? messaggioErrore(e) : (e && e.message) || 'Errore')}</div>`;
  }

  /* ---------- registro ---------- */
  async function vistaRegistro(v) {
    const ora = Number(oggi().slice(0, 4));
    if (!st.anno) st.anno = ora;
    const dal = st.anno + '-01-01', al = st.anno + '-12-31';
    let verbali, pres, tornate = [];
    try {
      verbali = chk(await state.sb.from('verbali').select('id,data,grado,presenti,ospiti,testo,dati').gte('data', dal).lte('data', al).order('data', { ascending: false }));
      pres = verbali.length ? await leggiTutto(() => state.sb.from('presenze_verbale').select('verbale_id,esito').in('verbale_id', verbali.map((x) => x.id)).order('id')) : [];
    } catch (e) { avvisoDb(v, e); return; }
    try { tornate = chk(await state.sb.from('tornate').select('data,tipo,grado,stato').gte('data', dal).lte('data', al).order('data')); } catch (e) { tornate = []; }

    const conta = {};
    pres.forEach((p) => { const o = conta[p.verbale_id] || (conta[p.verbale_id] = { giustificato: 0, assente: 0 }); if (p.esito !== 'presente') o[p.esito]++; });
    const fatti = new Set(verbali.map((x) => x.data + '|' + x.grado));
    const mancanti = tornate.filter((t) => t.grado && GRADI[t.grado] && t.stato !== 'annullata' && t.data <= oggi() && !fatti.has(t.data + '|' + t.grado));
    const media = verbali.length ? Math.round(verbali.reduce((s, x) => s + x.presenti, 0) / verbali.length) : 0;
    const anni = Array.from(new Set([ora - 2, ora - 1, ora, st.anno])).sort();

    v.innerHTML = `
      <div class="page-head"><div><h1>Verbali e presenze</h1><p>Archivio dei verbali di tornata e presenze dei Fratelli</p></div>
        <div class="right actions"><a class="btn gold" href="#/template/verbale/apprendista">Nuovo verbale</a></div></div>
      ${tabs('registro')}
      <div class="actions" style="margin:14px 0"><label for="v-anno" class="muted">Anno</label>
        <select id="v-anno">${anni.map((a) => `<option ${a === st.anno ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <div class="grid cols-3" style="margin-bottom:14px">
        <div class="stat"><div class="n">${verbali.length}</div><div class="l">Verbali nel ${st.anno}</div></div>
        <div class="stat"><div class="n">${media || '—'}</div><div class="l">Presenti in media</div></div>
        <div class="stat"><div class="n">${mancanti.length}</div><div class="l">Tornate in Calendario senza verbale</div></div></div>
      ${mancanti.length ? `<div class="notice" style="margin-bottom:14px"><b>Verbali ancora da registrare</b> (tornate già svolte secondo il Calendario):
        ${mancanti.map((t) => `<span class="badge warn" style="margin:2px">${fmtData(t.data)} · ${esc(GRADI[t.grado])}</span>`).join(' ')}
        <div class="hint" style="margin-top:6px">Apri il generatore con «Nuovo verbale», scegli la tornata dal Calendario e salva.</div></div>` : ''}
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Grado</th><th>Presenti</th><th>Assenti giustif.</th><th>Assenti</th><th>Ospiti</th><th></th></tr></thead><tbody>
        ${verbali.length ? verbali.map((x) => { const c = conta[x.id] || { giustificato: 0, assente: 0 };
          return `<tr><td>${fmtData(x.data)}</td><td>${esc(GRADI[x.grado])}</td><td>${x.presenti}</td><td>${c.giustificato}</td>
            <td>${c.assente ? `<span class="badge warn">${c.assente}</span>` : 0}</td><td>${esc(x.ospiti || '—')}</td>
            <td class="actions"><button class="btn small" data-apri="${esc(x.id)}" type="button">Apri</button>${canEdit() ? `<button class="btn ghost small" data-del="${esc(x.id)}" type="button">Elimina</button>` : ''}</td></tr>`; }).join('')
          : `<tr><td colspan="7" class="muted">Nessun verbale registrato nel ${st.anno}. Dal generatore (Template › Verbali di tornata) usa «Salva nel registro».</td></tr>`}
      </tbody></table></div>`;

    $('#v-anno', v).onchange = (e) => { st.anno = Number(e.target.value); L.route(); };
    $$('[data-apri]', v).forEach((b) => b.addEventListener('click', () => {
      const rec = verbali.find((x) => x.id === b.dataset.apri);
      if (rec) L.apriVerbaleSalvato(rec);
    }));
    $$('[data-del]', v).forEach((b) => b.addEventListener('click', async () => {
      const rec = verbali.find((x) => x.id === b.dataset.del);
      if (!rec || !confirm(`Eliminare dal registro il verbale del ${fmtData(rec.data)} (${GRADI[rec.grado]})? Anche le presenze collegate saranno cancellate.`)) return;
      try { chk(await state.sb.from('verbali').delete().eq('id', rec.id)); toast('Verbale eliminato dal registro', 'ok'); L.route(); }
      catch (e) { toast(messaggioErrore ? messaggioErrore(e) : e.message, 'bad'); }
    }));
  }

  /* ---------- presenze dei Fratelli ---------- */
  async function vistaPresenze(v) {
    const ora = oggi();
    const dalPeriodo = st.periodo === 'anno' ? ora.slice(0, 4) + '-01-01' : new Date(Date.parse(ora + 'T00:00:00Z') - 365 * 864e5).toISOString().slice(0, 10);
    const dal24 = new Date(Date.parse(ora + 'T00:00:00Z') - 730 * 864e5).toISOString().slice(0, 10);
    let righe, info;
    try {
      info = await L.eleggibiliPerGrado();
      righe = await leggiTutto(() => state.sb.from('presenze_verbale').select('fratello_id,esito,verbali!inner(data,grado)').gte('verbali.data', dal24).order('id'));
    } catch (e) { avvisoDb(v, e); return; }

    const per = {};
    righe.forEach((r) => { (per[r.fratello_id] || (per[r.fratello_id] = [])).push({ data: r.verbali.data, esito: r.esito }); });
    const elenco = info.attivi.map((f) => {
      const tutte = (per[String(f.id)] || []).sort((a, b) => a.data.localeCompare(b.data));
      const nelPeriodo = tutte.filter((r) => r.data >= dalPeriodo);
      const pr = nelPeriodo.filter((r) => r.esito === 'presente').length;
      const gi = nelPeriodo.filter((r) => r.esito === 'giustificato').length;
      const as = nelPeriodo.filter((r) => r.esito === 'assente').length;
      const validi = tutte.filter((r) => r.esito !== 'assente');
      const ultima = validi.length ? validi[validi.length - 1].data : null;
      // riferimento per il conteggio dei 6 mesi: ultima presenza o assenza giustificata; se non c'è, la prima tornata registrata
      const rif = ultima || (tutte.length ? tutte[0].data : null);
      const giorni = rif ? giorniTra(rif, ora) : null;
      const livello = giorni === null ? 0 : giorni >= GIORNI_LIMITE ? 2 : giorni >= GIORNI_AVVISO ? 1 : 0;
      return { f, tot: nelPeriodo.length, pr, gi, as, ultima, rif, giorni, livello, perc: nelPeriodo.length ? Math.round(100 * pr / nelPeriodo.length) : null };
    }).sort((a, b) => (b.livello - a.livello) || a.f.cognome.localeCompare(b.f.cognome, 'it'));
    const daControllare = elenco.filter((x) => x.livello > 0).length;
    const mostra = st.soloAvvisi ? elenco.filter((x) => x.livello > 0) : elenco;

    v.innerHTML = `
      <div class="page-head"><div><h1>Verbali e presenze</h1><p>Presenze dei Fratelli attivi ricavate dai verbali registrati</p></div></div>
      ${tabs('presenze')}
      <div class="actions" style="margin:14px 0">
        <label for="p-per" class="muted">Periodo</label>
        <select id="p-per"><option value="anno" ${st.periodo === 'anno' ? 'selected' : ''}>Anno in corso</option><option value="12" ${st.periodo === '12' ? 'selected' : ''}>Ultimi 12 mesi</option></select>
        <label class="check"><input type="checkbox" id="p-solo" ${st.soloAvvisi ? 'checked' : ''}> Solo Fratelli da controllare (${daControllare})</label></div>
      ${daControllare ? `<div class="notice" style="margin-bottom:14px"><b>${daControllare} ${daControllare === 1 ? 'Fratello da controllare' : 'Fratelli da controllare'}.</b>
        L’art. 12 della Costituzione prevede la decadenza per assenza senza giustificato motivo oltre i 6 mesi. Prima di ogni passo verifica dispense, malattie e giustificazioni,
        poi segui la procedura: <a href="#/procedure/depennamento">Procedure › Depennamento</a>.</div>` : ''}
      <div class="table-wrap"><table><thead><tr><th>Fratello</th><th>Grado</th><th>Tornate</th><th>Presente</th><th>Giustif.</th><th>Assente</th><th>% presenza</th><th>Ultima presenza o giustificazione</th><th>Stato</th></tr></thead><tbody>
        ${mostra.length ? mostra.map((x) => `<tr>
          <td><a class="nome" href="#/fratelli/${esc(x.f.id)}">${esc(x.f.cognome)} ${esc(x.f.nome)}</a></td><td>${esc(x.f.grado_attuale || '—')}</td>
          <td>${x.tot}</td><td>${x.pr}</td><td>${x.gi}</td><td>${x.as ? `<span class="badge warn">${x.as}</span>` : 0}</td>
          <td>${x.perc === null ? '—' : x.perc + '%'}</td>
          <td>${x.rif ? fmtData(x.rif) + (x.ultima ? '' : ' <span class="hint">(prima tornata registrata)</span>') : '—'}</td>
          <td>${x.livello === 2 ? `<span class="badge bad">Oltre 6 mesi (${Math.round(x.giorni / 30.4)} mesi)</span>` : x.livello === 1 ? `<span class="badge warn">Vicino ai 6 mesi (${Math.round(x.giorni / 30.4)} mesi)</span>` : x.giorni === null ? '<span class="hint">nessun dato</span>' : '<span class="badge ok">Regolare</span>'}</td></tr>`).join('')
          : '<tr><td colspan="9" class="muted">Nessun dato: salva i verbali dal generatore per costruire le presenze.</td></tr>'}
      </tbody></table></div>
      <div class="hint" style="margin-top:10px">Il conteggio parte dai verbali registrati nell’app. Il calcolo dei mesi è indicativo: non tiene conto della sospensione estiva né delle dispense dalla frequenza (art. 22 del Regolamento).</div>`;
    $('#p-per', v).onchange = (e) => { st.periodo = e.target.value; L.route(); };
    $('#p-solo', v).onchange = (e) => { st.soloAvvisi = e.target.checked; L.route(); };
  }

  L.viste.verbali = async function (v, parti) {
    if (parti[1] === 'presenze') return vistaPresenze(v);
    return vistaRegistro(v);
  };
})();
