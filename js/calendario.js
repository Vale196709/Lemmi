/* Lemmi - sezione "Calendario": tornate ordinarie, informali, straordinarie e agapi. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, isAdmin, IC, fmtData, isoToIt, itToIso, mascheraDate } = L;

  const RUOLI_SCRITTURA = ['amministratore', 'venerabile', 'segretario'];
  const RUOLI_CANCELLA = ['amministratore', 'segretario'];
  const puoScrivere = () => RUOLI_SCRITTURA.includes(state.profilo && state.profilo.ruolo);
  const puoCancellare = () => RUOLI_CANCELLA.includes(state.profilo && state.profilo.ruolo);

  const TIPI = { ordinaria: 'Ordinaria', informale: 'Conferenza (web)', straordinaria: 'Straordinaria', agape: 'Agape' };
  const TIPO_BADGE = { ordinaria: 'info', informale: 'gray', straordinaria: 'warn', agape: 'gold' };
  const GRADI = { apprendista: 'Apprendista', compagno: 'Compagno d’Arte', maestro: 'Maestro' };
  const STATI = { programmata: 'Programmata', convocata: 'Convocata', svolta: 'Svolta', annullata: 'Annullata' };
  const STATO_BADGE = { programmata: 'gray', convocata: 'info', svolta: 'ok', annullata: 'bad' };
  const SOLENNITA = ['Commemorazione dei Fratelli passati all’Oriente Eterno', 'Equinozio di Primavera', 'Solstizio d’Estate', 'Equinozio d’Autunno', 'Solstizio d’Inverno'];
  const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

  const st = { righe: [], lavori: {}, anno: new Date().getFullYear(), tipo: '', nascondiAnnullate: false };

  const giornoSettimana = (iso) => { const [a, m, g] = iso.split('-').map(Number); return GIORNI[new Date(Date.UTC(a, m - 1, g)).getUTCDay()]; };
  const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
  const opzioni = (mappa, sel, vuoto) => (vuoto !== undefined ? `<option value="">${esc(vuoto)}</option>` : '') +
    Object.keys(mappa).map((k) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(mappa[k])}</option>`).join('');
  const urlSicuro = (u) => (/^https?:\/\//i.test(String(u || '')) ? u : null);

  async function carica() {
    const dal = st.anno + '-01-01', al = st.anno + '-12-31';
    st.righe = chk(await state.sb.from('tornate').select('*').gte('data', dal).lte('data', al).order('data').order('ora'));
    // lavori e tavole collegati (solo per chi può vederli; per gli altri resta vuoto)
    st.lavori = {};
    if (puoScrivere()) {
      try {
        const ids = st.righe.map((t) => t.id);
        if (ids.length) {
          const [lav, fra] = await Promise.all([
            state.sb.from('lavori').select('titolo,tornata_id,fratello_id,autore_esterno').in('tornata_id', ids),
            state.sb.from('fratelli').select('id,cognome,nome'),
          ]);
          const nomi = {}; chk(fra).forEach((f) => { nomi[f.id] = f.cognome + ' ' + f.nome; });
          chk(lav).forEach((l) => { (st.lavori[l.tornata_id] = st.lavori[l.tornata_id] || []).push(l.titolo + ' — ' + (l.fratello_id ? nomi[l.fratello_id] || '' : l.autore_esterno || '')); });
        }
      } catch (e) { st.lavori = {}; }
    }
  }

  /* ---------- finestra generica ---------- */
  function finestra(titolo, corpo, opt) {
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titolo)}">
      <div class="modal-h"><h2 style="margin:0">${esc(titolo)}</h2><button class="btn ghost small" type="button" data-x>Chiudi</button></div>
      <div class="modal-b"><form novalidate>${corpo}<div class="err" data-err style="margin-top:10px"></div>
        <div class="actions" style="margin-top:14px"><button class="btn gold" type="submit">${esc(opt.testoOk || 'Salva')}</button>${opt.extra || ''}</div></form></div></div>`;
    document.body.appendChild(ov);
    const chiudi = () => { document.removeEventListener('keydown', esc_); ov.remove(); };
    const esc_ = (e) => { if (e.key === 'Escape') chiudi(); };
    document.addEventListener('keydown', esc_);
    $('[data-x]', ov).onclick = chiudi;
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) chiudi(); });
    const f = $('form', ov);
    const errore = (msg) => { $('[data-err]', ov).textContent = msg; };
    mascheraDate(ov);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); errore('');
      const b = $('button[type=submit]', f); b.disabled = true;
      try { await opt.onSubmit(f, chiudi, errore); } catch (e) { errore(messaggioErrore(e)); }
      b.disabled = false;
    });
    return { ov, f, chiudi, errore };
  }

  /* ---------- modifica / nuova tornata ---------- */
  function apriTornata(t) {
    const nuova = !t;
    const x = t || { data: '', ora: '', tipo: 'straordinaria', grado: '', luogo: '', link_online: '', di_famiglia: false, formazione: false, solennita: '', ordine_del_giorno: '', relatore: '', stato: 'programmata', note: '' };
    const corpo = `<div class="form-grid">
      <div class="f s4"><label for="t-data">Data <span class="req">*</span></label><input id="t-data" name="data" value="${esc(isoToIt(x.data))}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"></div>
      <div class="f s4"><label for="t-ora">Ora</label><input id="t-ora" name="ora" type="time" value="${esc(hhmm(x.ora))}"></div>
      <div class="f s4"><label for="t-tipo">Tipo <span class="req">*</span></label><select id="t-tipo" name="tipo">${opzioni(TIPI, x.tipo)}</select></div>
      <div class="f s4" id="w-grado"><label for="t-grado">Grado</label><select id="t-grado" name="grado">${opzioni(GRADI, x.grado, '— da stabilire —')}</select></div>
      <div class="f s4"><label for="t-stato">Stato</label><select id="t-stato" name="stato">${opzioni(STATI, x.stato)}</select></div>
      <div class="f s4"><label for="t-sol">Solennità</label><select id="t-sol" name="solennita"><option value="">— nessuna —</option>${SOLENNITA.map((s) => `<option ${s === x.solennita ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
      <div class="f s6" id="w-luogo"><label for="t-luogo">Luogo</label><input id="t-luogo" name="luogo" value="${esc(x.luogo || '')}"></div>
      <div class="f s6" id="w-link"><label for="t-link">Collegamento online (https://…)</label><input id="t-link" name="link_online" value="${esc(x.link_online || '')}" placeholder="https://"></div>
      <div class="f s6"><label for="t-rel">Relatore / titolare del lavoro</label><input id="t-rel" name="relatore" value="${esc(x.relatore || '')}"></div>
      <div class="f s6"><label>&nbsp;</label><div class="actions" style="gap:18px;align-items:center;min-height:40px">
        <label style="display:flex;gap:6px;align-items:center;font-weight:500"><input type="checkbox" name="di_famiglia" ${x.di_famiglia ? 'checked' : ''}> Tornata di Famiglia</label>
        <label style="display:flex;gap:6px;align-items:center;font-weight:500"><input type="checkbox" name="formazione" ${x.formazione ? 'checked' : ''}> Formazione / esoterismo</label></div></div>
      <div class="f s12"><label for="t-odg">Ordine del giorno</label><textarea id="t-odg" name="ordine_del_giorno" rows="4">${esc(x.ordine_del_giorno || '')}</textarea>
        <span class="hint">Le iniziazioni, le riammissioni e le affiliazioni hanno la precedenza (art. 54 del Regolamento).</span></div>
      <div class="f s12"><label for="t-note">Note</label><input id="t-note" name="note" value="${esc(x.note || '')}"></div></div>`;
    const extra = !nuova && puoCancellare() ? '<button class="btn danger" type="button" data-del>Elimina</button>' : '';
    const m = finestra(nuova ? 'Nuova tornata' : 'Modifica tornata', corpo, {
      extra,
      onSubmit: async (f, chiudi, errore) => {
        const e = f.elements;
        const data = itToIso(e.data.value);
        if (!data || data === 'ERR') return errore('Data non valida: usa il formato gg/mm/aaaa.');
        const tipo = e.tipo.value;
        const link = e.link_online.value.trim();
        if (link && !urlSicuro(link)) return errore('Il collegamento online deve iniziare con http:// o https://');
        const dati = {
          data, ora: e.ora.value || null, tipo,
          grado: tipo === 'informale' ? null : (e.grado.value || null),
          luogo: e.luogo.value.trim() || null, link_online: link || null,
          di_famiglia: e.di_famiglia.checked, formazione: e.formazione.checked,
          solennita: e.solennita.value || null,
          ordine_del_giorno: e.ordine_del_giorno.value.trim() || null,
          relatore: e.relatore.value.trim() || null,
          stato: e.stato.value, note: e.note.value.trim() || null,
        };
        try {
          if (nuova) chk(await state.sb.from('tornate').insert(dati));
          else chk(await state.sb.from('tornate').update(dati).eq('id', t.id));
        } catch (er) {
          if (er && er.code === '23505') return errore('Esiste già una tornata dello stesso tipo in quella data.');
          throw er;
        }
        chiudi(); toast('Tornata salvata', 'ok');
        const anno = Number(data.slice(0, 4)); if (anno !== st.anno) st.anno = anno;
        L.route();
      },
    });
    const aggiorna = () => {
      const tipo = m.f.elements.tipo.value;
      $('#w-grado', m.ov).classList.toggle('hidden', tipo === 'informale');
      $('#w-luogo', m.ov).classList.toggle('hidden', tipo === 'informale');
      $('#w-link', m.ov).classList.toggle('hidden', tipo !== 'informale');
    };
    m.f.elements.tipo.addEventListener('change', aggiorna); aggiorna();
    const del = $('[data-del]', m.ov);
    if (del) del.onclick = async () => {
      if (!window.confirm('Eliminare definitivamente questa tornata? Se vuoi solo annullarla, imposta lo stato “Annullata”.')) return;
      try { chk(await state.sb.from('tornate').delete().eq('id', t.id)); m.chiudi(); toast('Tornata eliminata', 'ok'); L.route(); }
      catch (er) { m.errore(messaggioErrore(er)); }
    };
  }

  /* ---------- festività (evidenziate in rosso) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const isoDi = (a, m, g) => a + '-' + pad(m) + '-' + pad(g);
  function pasqua(y) {   // algoritmo di Meeus/Jones/Butcher (calendario gregoriano)
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(y, mese - 1, giorno));
  }
  // giorni festivi nazionali; per Roma anche i Santi Pietro e Paolo (29 giugno)
  function festivita(anno) {
    const f = {};
    [[1, 1, 'Capodanno'], [1, 6, 'Epifania'], [4, 25, 'Festa della Liberazione'], [5, 1, 'Festa dei Lavoratori'], [6, 2, 'Festa della Repubblica'],
      [8, 15, 'Ferragosto'], [11, 1, 'Ognissanti'], [12, 8, 'Immacolata Concezione'], [12, 25, 'Natale'], [12, 26, 'Santo Stefano']]
      .forEach((x) => { f[isoDi(anno, x[0], x[1])] = x[2]; });
    const p = pasqua(anno), lun = new Date(p.getTime() + 864e5);
    f[isoDi(anno, p.getUTCMonth() + 1, p.getUTCDate())] = 'Pasqua';
    f[isoDi(anno, lun.getUTCMonth() + 1, lun.getUTCDate())] = 'Lunedì dell’Angelo (Pasquetta)';
    if (/roma/i.test((state.loggia && state.loggia.oriente) || '')) f[isoDi(anno, 6, 29)] = 'Santi Pietro e Paolo (patrono di Roma)';
    return f;
  }
  // i lunedì di ogni mese: [[1°, 2°, 3°, 4°, (5°)], ...]
  function lunedi(anno) {
    return Array.from({ length: 12 }, (_, m) => {
      const out = [];
      for (let g = 1; g <= 31; g++) { const d = new Date(Date.UTC(anno, m, g)); if (d.getUTCMonth() !== m) break; if (d.getUTCDay() === 1) out.push(isoDi(anno, m + 1, g)); }
      return out;
    });
  }

  /* ---------- generazione del calendario annuale ---------- */
  function apriGenera() {
    const a = st.anno;
    const it = (m, g, anno) => pad(g) + '/' + pad(m) + '/' + (anno || a);
    const FE = festivita(a);
    const feste = [].concat(...lunedi(a).map((l) => l.slice(0, 4))).filter((d) => FE[d]);
    const corpo = `<p class="muted" style="margin-top:0">Crea le tornate del ${a}: <b>rituali</b> (1° e 3° lunedì del mese) e <b>conferenze via web</b> (2° e 4° lunedì), escluse le sospensioni. Le tornate già presenti non vengono duplicate.
        Il quinto lunedì, quando c’è, è a scelta del Venerabile. Straordinarie e agapi si aggiungono a mano con “Nuova tornata”.</p>
      ${feste.length ? `<div class="notice bad" style="margin:10px 0"><b>Attenzione, queste date cadono in un giorno di festa</b> (saranno create ma evidenziate in rosso, da spostare o annullare):<br>
        ${feste.map((d) => `${fmtData(d)} · ${esc(FE[d])}`).join('<br>')}</div>` : ''}
      <div class="form-grid">
        <div class="f s6"><label for="g-oo">Ora dei rituali</label><input id="g-oo" name="ora_ord" type="time"></div>
        <div class="f s6"><label for="g-oi">Ora delle conferenze</label><input id="g-oi" name="ora_inf" type="time"></div>
        <div class="f s6"><label for="g-ed">Sospensione estiva: dal</label><input id="g-ed" name="estate_dal" value="${it(6, 24)}" data-date="1" inputmode="numeric" maxlength="10"></div>
        <div class="f s6"><label for="g-ea">fino al</label><input id="g-ea" name="estate_al" value="${it(9, 20)}" data-date="1" inputmode="numeric" maxlength="10"></div>
        <div class="f s6"><label for="g-id">Sospensione invernale: dal</label><input id="g-id" name="inv_dal" value="${it(12, 21)}" data-date="1" inputmode="numeric" maxlength="10"></div>
        <div class="f s6"><label for="g-ia">Riprese di gennaio: sospese fino al</label><input id="g-ia" name="inv_al" value="${it(1, 7)}" data-date="1" inputmode="numeric" maxlength="10"></div>
        <div class="f s12"><label class="check"><input type="checkbox" name="quinti"> Inserisci anche i quinti lunedì come tornate da stabilire (il Venerabile deciderà se farle)</label></div></div>`;
    finestra('Genera il calendario ' + a, corpo, {
      testoOk: 'Genera calendario',
      onSubmit: async (f, chiudi, errore) => {
        const e = f.elements;
        const d = { ed: itToIso(e.estate_dal.value), ea: itToIso(e.estate_al.value), id: itToIso(e.inv_dal.value), ia: itToIso(e.inv_al.value) };
        if (Object.values(d).some((v) => !v || v === 'ERR')) return errore('Controlla le date delle sospensioni (gg/mm/aaaa).');
        if (d.ea < d.ed) return errore('La sospensione estiva termina prima di iniziare.');
        const sospesa = (iso) => (iso >= d.ed && iso <= d.ea) || (iso >= d.id && iso <= a + '-12-31') || (iso >= a + '-01-01' && iso <= d.ia);
        const gia = new Set(chk(await state.sb.from('tornate').select('data,tipo').gte('data', a + '-01-01').lte('data', a + '-12-31')).map((r) => r.data + '|' + r.tipo));
        const nuove = [];
        const aggiungi = (data, tipo, ora, note) => { if (!sospesa(data) && !gia.has(data + '|' + tipo)) nuove.push({ data, ora: ora || null, tipo, grado: null, stato: 'programmata', di_famiglia: false, formazione: false, note: note || null }); };
        lunedi(a).forEach((l) => {
          [0, 2].forEach((i) => l[i] && aggiungi(l[i], 'ordinaria', e.ora_ord.value));
          [1, 3].forEach((i) => l[i] && aggiungi(l[i], 'informale', e.ora_inf.value));
          if (e.quinti.checked && l[4]) aggiungi(l[4], 'straordinaria', e.ora_ord.value, 'Quinto lunedì: a scelta del Venerabile');
        });
        if (nuove.length) chk(await state.sb.from('tornate').insert(nuove));
        const FEm = festivita(a), inFesta = nuove.filter((r) => FEm[r.data]).length;
        chiudi();
        toast(nuove.length ? nuove.length + (nuove.length === 1 ? ' tornata creata' : ' tornate create') + (inFesta ? ` (${inFesta} in giorno di festa, in rosso)` : '') : 'Nessuna nuova tornata: il calendario era già completo', 'ok');
        L.route();
      },
    });
  }

  /* ---------- vista ---------- */
  L.viste.calendario = async function (v) {
    await carica();
    const ora = new Date().getFullYear();
    const anni = Array.from(new Set([ora - 1, ora, ora + 1, st.anno])).sort();
    const oggiIso = L.oggi();

    v.innerHTML = `
      <div class="page-head"><div><h1>Calendario delle tornate</h1><p>Rituali (1° e 3° lunedì), conferenze via web (2° e 4°), straordinarie e agapi · le feste sono in rosso</p></div>
        <div class="right actions">${puoScrivere() ? `<button class="btn ghost" id="c-gen">Genera calendario</button><button class="btn gold" id="c-new">${IC.plus} Nuova tornata</button>` : ''}</div></div>
      <div class="actions" style="margin-bottom:14px;flex-wrap:wrap">
        <label class="lbl" for="c-anno">Anno</label>
        <select id="c-anno" style="width:auto">${anni.map((a) => `<option ${a === st.anno ? 'selected' : ''}>${a}</option>`).join('')}</select>
        <label class="lbl" for="c-tipo">Tipo</label>
        <select id="c-tipo" style="width:auto">${opzioni(TIPI, st.tipo, 'Tutti')}</select>
        <label style="display:flex;gap:6px;align-items:center;font-weight:500"><input type="checkbox" id="c-ann" ${st.nascondiAnnullate ? 'checked' : ''}> Nascondi annullate</label>
        <span class="muted" id="c-conta"></span></div>
      <div id="c-corpo"></div>`;

    $('#c-anno').addEventListener('change', (e) => { st.anno = Number(e.target.value); L.route(); });
    $('#c-tipo').addEventListener('change', (e) => { st.tipo = e.target.value; disegna(); });
    $('#c-ann').addEventListener('change', (e) => { st.nascondiAnnullate = e.target.checked; disegna(); });
    if (puoScrivere()) { $('#c-new').onclick = () => apriTornata(null); $('#c-gen').onclick = apriGenera; }

    function disegna() {
      const lista = st.righe.filter((t) => (!st.tipo || t.tipo === st.tipo) && !(st.nascondiAnnullate && t.stato === 'annullata'));
      $('#c-conta').textContent = lista.length + (lista.length === 1 ? ' tornata' : ' tornate');
      const c = $('#c-corpo');
      const FE = Object.assign({}, festivita(st.anno - 1), festivita(st.anno), festivita(st.anno + 1));
      if (!lista.length) {
        c.innerHTML = `<div class="card empty">${IC.inbox}<div>Nessuna tornata in calendario per il ${st.anno}.${puoScrivere() ? ' Usa “Genera calendario” per creare i rituali e le conferenze.' : ''}</div></div>`;
        return;
      }
      c.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Ora</th><th>Tipo</th><th>Grado</th><th>Luogo / collegamento</th><th>Dettagli</th><th>Stato</th><th></th></tr></thead><tbody>
        ${lista.map((t) => {
          const link = urlSicuro(t.link_online);
          const dove = t.tipo === 'informale'
            ? (link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Apri collegamento</a>` : '<span class="muted">collegamento da indicare</span>')
            : esc(t.luogo || '—');
          const segni = [t.di_famiglia ? '<span class="badge gold">di Famiglia</span>' : '', t.formazione ? '<span class="badge info">formazione</span>' : '', t.solennita ? `<span class="badge gray">${esc(t.solennita)}</span>` : ''].filter(Boolean).join(' ');
          const extra = [t.relatore ? 'Relatore: ' + esc(t.relatore) : '', ...(st.lavori[t.id] || []).map((x) => 'Lavoro: ' + esc(x)), t.ordine_del_giorno ? esc(t.ordine_del_giorno).replace(/\n/g, '<br>') : ''].filter(Boolean).join('<br>');
          const passata = t.data < oggiIso, fe = FE[t.data];
          return `<tr class="${fe ? 'festa-riga' : ''}" style="${t.stato === 'annullata' ? 'opacity:.55;' : ''}">
            <td data-sort="${t.data} ${hhmm(t.ora)}"><b ${fe ? 'class="festa"' : ''}>${fmtData(t.data)}</b><br><span class="${fe ? 'festa' : 'muted'}">${giornoSettimana(t.data)}</span>${fe ? `<br><span class="badge bad">Festa: ${esc(fe)}</span>` : ''}${t.data === oggiIso ? ' <span class="badge ok">oggi</span>' : ''}</td>
            <td>${esc(hhmm(t.ora) || '—')}</td>
            <td><span class="badge ${TIPO_BADGE[t.tipo]}">${esc(TIPI[t.tipo])}</span></td>
            <td>${t.tipo === 'informale' ? '—' : (t.grado ? esc(GRADI[t.grado]) : '<span class="muted">da stabilire</span>')}</td>
            <td>${dove}</td>
            <td>${segni}${segni && extra ? '<br>' : ''}${extra ? `<span class="muted" style="font-size:.85rem">${extra}</span>` : ''}</td>
            <td><span class="badge ${STATO_BADGE[t.stato]}">${esc(STATI[t.stato])}</span>${passata && t.stato === 'programmata' ? '<br><span class="muted" style="font-size:.8rem">da aggiornare</span>' : ''}</td>
            <td class="act">${puoScrivere() ? `<button class="btn ghost small" data-mod="${esc(t.id)}">Modifica</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>`;
      $$('[data-mod]', c).forEach((b) => b.addEventListener('click', () => apriTornata(st.righe.find((x) => x.id === b.dataset.mod))));
    }
    disegna();
  };
})();
