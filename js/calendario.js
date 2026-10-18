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

  const TIPI = { ordinaria: 'Ordinaria', informale: 'Informale (web)', straordinaria: 'Straordinaria', agape: 'Agape' };
  const TIPO_BADGE = { ordinaria: 'info', informale: 'gray', straordinaria: 'warn', agape: 'gold' };
  const GRADI = { apprendista: 'Apprendista', compagno: 'Compagno d’Arte', maestro: 'Maestro' };
  const STATI = { programmata: 'Programmata', convocata: 'Convocata', svolta: 'Svolta', annullata: 'Annullata' };
  const STATO_BADGE = { programmata: 'gray', convocata: 'info', svolta: 'ok', annullata: 'bad' };
  const SOLENNITA = ['Commemorazione dei Fratelli passati all’Oriente Eterno', 'Equinozio di Primavera', 'Solstizio d’Estate', 'Equinozio d’Autunno', 'Solstizio d’Inverno'];
  const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

  const st = { righe: [], anno: new Date().getFullYear(), tipo: '', nascondiAnnullate: false };

  const giornoSettimana = (iso) => { const [a, m, g] = iso.split('-').map(Number); return GIORNI[new Date(Date.UTC(a, m - 1, g)).getUTCDay()]; };
  const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
  const opzioni = (mappa, sel, vuoto) => (vuoto !== undefined ? `<option value="">${esc(vuoto)}</option>` : '') +
    Object.keys(mappa).map((k) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(mappa[k])}</option>`).join('');
  const urlSicuro = (u) => (/^https?:\/\//i.test(String(u || '')) ? u : null);

  async function carica() {
    const dal = st.anno + '-01-01', al = st.anno + '-12-31';
    st.righe = chk(await state.sb.from('tornate').select('*').gte('data', dal).lte('data', al).order('data').order('ora'));
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

  /* ---------- generazione del calendario annuale ---------- */
  function apriGenera() {
    const a = st.anno;
    const it = (m, g, anno) => String(g).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/' + (anno || a);
    const corpo = `<p class="muted" style="margin-top:0">Crea le tornate <b>ordinarie</b> (1° e 3° mercoledì) e <b>informali</b> (2° e 4° lunedì) del ${a}, escluse le sospensioni. Le tornate già presenti non vengono duplicate. Straordinarie e agapi si aggiungono a mano; il grado delle ordinarie si indica tornata per tornata.</p>
      <div class="form-grid">
        <div class="f s6"><label for="g-oo">Ora delle ordinarie</label><input id="g-oo" name="ora_ord" type="time"></div>
        <div class="f s6"><label for="g-oi">Ora delle informali</label><input id="g-oi" name="ora_inf" type="time"></div>
        <div class="f s6"><label for="g-ed">Sospensione estiva: dal</label><input id="g-ed" name="estate_dal" value="${it(6, 24)}" data-date="1" inputmode="numeric" maxlength="10"></div>
        <div class="f s6"><label for="g-ea">fino al</label><input id="g-ea" name="estate_al" value="${it(9, 20)}" data-date="1" inputmode="numeric" maxlength="10"></div>
        <div class="f s6"><label for="g-id">Sospensione invernale: dal</label><input id="g-id" name="inv_dal" value="${it(12, 21)}" data-date="1" inputmode="numeric" maxlength="10"></div>
        <div class="f s6"><label for="g-ia">Riprese di gennaio: sospese fino al</label><input id="g-ia" name="inv_al" value="${it(1, 7)}" data-date="1" inputmode="numeric" maxlength="10"></div></div>`;
    finestra('Genera il calendario ' + a, corpo, {
      testoOk: 'Genera calendario',
      onSubmit: async (f, chiudi, errore) => {
        const e = f.elements;
        const d = { ed: itToIso(e.estate_dal.value), ea: itToIso(e.estate_al.value), id: itToIso(e.inv_dal.value), ia: itToIso(e.inv_al.value) };
        if (Object.values(d).some((v) => !v || v === 'ERR')) return errore('Controlla le date delle sospensioni (gg/mm/aaaa).');
        if (d.ea < d.ed) return errore('La sospensione estiva termina prima di iniziare.');
        const n = chk(await state.sb.rpc('genera_calendario', {
          p_anno: a, p_ora_ordinaria: e.ora_ord.value || null, p_ora_informale: e.ora_inf.value || null,
          p_estate_dal: d.ed, p_estate_al: d.ea, p_inverno_dal: d.id, p_inverno_al_gen: d.ia,
        }));
        chiudi();
        toast(n ? n + (n === 1 ? ' tornata creata' : ' tornate create') : 'Nessuna nuova tornata: il calendario era già completo', 'ok');
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
      <div class="page-head"><div><h1>Calendario delle tornate</h1><p>Ordinarie, informali, straordinarie e agapi</p></div>
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
      if (!lista.length) {
        c.innerHTML = `<div class="card empty">${IC.inbox}<div>Nessuna tornata in calendario per il ${st.anno}.${puoScrivere() ? ' Usa “Genera calendario” per creare quelle ordinarie e informali.' : ''}</div></div>`;
        return;
      }
      const perMese = {};
      lista.forEach((t) => { const m = Number(t.data.slice(5, 7)) - 1; (perMese[m] = perMese[m] || []).push(t); });
      c.innerHTML = Object.keys(perMese).map(Number).sort((a, b) => a - b).map((m) => `
        <h2 class="section-title">${MESI[m]} ${st.anno}</h2>
        <div class="table-wrap" style="margin-bottom:18px"><table><thead><tr><th>Data</th><th>Ora</th><th>Tipo</th><th>Grado</th><th>Luogo / collegamento</th><th>Dettagli</th><th>Stato</th><th></th></tr></thead><tbody>
        ${perMese[m].map((t) => {
          const link = urlSicuro(t.link_online);
          const dove = t.tipo === 'informale'
            ? (link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Apri collegamento</a>` : '<span class="muted">collegamento da indicare</span>')
            : esc(t.luogo || '—');
          const segni = [t.di_famiglia ? '<span class="badge gold">di Famiglia</span>' : '', t.formazione ? '<span class="badge info">formazione</span>' : '', t.solennita ? `<span class="badge gray">${esc(t.solennita)}</span>` : ''].filter(Boolean).join(' ');
          const extra = [t.relatore ? 'Relatore: ' + esc(t.relatore) : '', t.ordine_del_giorno ? esc(t.ordine_del_giorno).replace(/\n/g, '<br>') : ''].filter(Boolean).join('<br>');
          const passata = t.data < oggiIso;
          return `<tr style="${t.stato === 'annullata' ? 'opacity:.55;' : ''}">
            <td><b>${fmtData(t.data)}</b><br><span class="muted">${giornoSettimana(t.data)}</span>${t.data === oggiIso ? ' <span class="badge ok">oggi</span>' : ''}</td>
            <td>${esc(hhmm(t.ora) || '—')}</td>
            <td><span class="badge ${TIPO_BADGE[t.tipo]}">${esc(TIPI[t.tipo])}</span></td>
            <td>${t.tipo === 'informale' ? '—' : (t.grado ? esc(GRADI[t.grado]) : '<span class="muted">da stabilire</span>')}</td>
            <td>${dove}</td>
            <td>${segni}${segni && extra ? '<br>' : ''}${extra ? `<span class="muted" style="font-size:.85rem">${extra}</span>` : ''}</td>
            <td><span class="badge ${STATO_BADGE[t.stato]}">${esc(STATI[t.stato])}</span>${passata && t.stato === 'programmata' ? '<br><span class="muted" style="font-size:.8rem">da aggiornare</span>' : ''}</td>
            <td class="act">${puoScrivere() ? `<button class="btn ghost small" data-mod="${esc(t.id)}">Modifica</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>`).join('');
      $$('[data-mod]', c).forEach((b) => b.addEventListener('click', () => apriTornata(st.righe.find((x) => x.id === b.dataset.mod))));
    }
    disegna();
  };
})();
