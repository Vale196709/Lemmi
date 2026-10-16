/* Lemmi - sezione "Storia": cariche ricoperte dai Fratelli, per anno di competenza. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L || !L.pagamenti) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, canEdit, isAdmin, IC, campo } = L;
  const P = L.pagamenti;

  const st = { cariche: [], elenco: [], frat: [], modo: 'anno', anno: new Date().getFullYear(), fratello: '' };
  const ALTRA = '__altra__';

  const nominativo = (id) => { const f = st.frat.find((x) => x.id === id); return f ? f.cognome + ' ' + f.nome : '(Fratello non trovato)'; };
  const periodo = (c) => (c.anno_al && c.anno_al !== c.anno_dal ? c.anno_dal + '–' + c.anno_al : String(c.anno_dal));
  const ordineCarica = (nome) => { const e = st.elenco.find((x) => x.nome === nome); return e && e.ordine !== null && e.ordine !== undefined ? e.ordine : 9999; };

  async function carica() {
    const sb = state.sb;
    const [c, e, f] = await Promise.all([
      sb.from('cariche_storico').select('id,fratello_id,carica,anno_dal,anno_al,note').order('anno_dal', { ascending: false }),
      sb.from('elenco_cariche').select('nome,ordine').order('ordine'),
      L.caricaFratelli(),
    ]);
    st.cariche = chk(c); st.elenco = chk(e); st.frat = f;
  }

  /* ---------- finestra di inserimento / modifica ---------- */
  function apriCarica(c, predefinito) {
    const frat = st.frat;
    const noteElenco = st.elenco.map((x) => x.nome);
    const attuale = c ? c.carica : '';
    const inElenco = !c || noteElenco.includes(attuale);
    const corpo = `<div class="form-grid">
      ${P.campoFratello(frat, { id: 'h-frat', cls: 's12' })}
      ${campo('anno', 'Anno di competenza', c ? c.anno_dal : (predefinito && predefinito.anno) || '', { cls: 's4' })}
      ${campo('anno_fine', 'Ultimo anno (se è durata più anni)', c && c.anno_al !== c.anno_dal ? c.anno_al : '', { cls: 's4' })}
      <div class="f s4"><label for="h-carica">Carica <span class="req">*</span></label><select id="h-carica" name="carica">
        <option value="">— scegli —</option>${P.opzioni(noteElenco.map((n) => ({ v: n, t: n })), inElenco ? attuale : ALTRA)}<option value="${ALTRA}" ${inElenco ? '' : 'selected'}>Altra carica…</option></select></div>
      <div class="f hidden" id="w-altra"><label for="h-altra">Nome della carica</label><input id="h-altra" name="altra" value="${inElenco ? '' : esc(attuale)}"></div>
      ${campo('note', 'Note', c ? c.note || '' : '', { cls: 's12' })}</div>`;
    const extra = c && isAdmin() ? '<button class="btn danger" type="button" data-del>Elimina</button>' : '';
    const m = P.modal(c ? 'Modifica carica' : 'Nuova carica', corpo, {
      extra,
      onSubmit: async (f, chiudi, errore) => {
        const fid = P.idFratello(frat, f.elements.fratello.value);
        if (!fid) return errore('Indica il nome del Fratello: scrivi il cognome e scegli dall’elenco.');
        const dal = Number(f.elements.anno.value);
        if (!Number.isInteger(dal) || dal < 1900 || dal > 2100) return errore('Anno di competenza non valido (4 cifre, es. 2024).');
        const fineTesto = f.elements.anno_fine.value.trim();
        const al = fineTesto ? Number(fineTesto) : dal;
        if (!Number.isInteger(al) || al < dal || al > 2100) return errore('L’ultimo anno non può essere precedente all’anno di competenza.');
        const carica = f.elements.carica.value === ALTRA ? f.elements.altra.value.trim() : f.elements.carica.value;
        if (!carica) return errore('Scegli la carica (o scrivi il nome dell’altra carica).');
        const dati = { fratello_id: fid, carica, anno_dal: dal, anno_al: al, note: f.elements.note.value.trim() || null };
        if (c) chk(await state.sb.from('cariche_storico').update(dati).eq('id', c.id));
        else chk(await state.sb.from('cariche_storico').insert(dati));
        chiudi(); toast('Carica salvata', 'ok'); L.route();
      },
    });
    const f = m.f;
    const f0 = c ? frat.find((x) => x.id === c.fratello_id) : (predefinito && predefinito.fratello_id ? frat.find((x) => x.id === predefinito.fratello_id) : null);
    if (f0) f.elements.fratello.value = f0.cognome + ' ' + f0.nome;
    const agg = () => $('#w-altra', f).classList.toggle('hidden', f.elements.carica.value !== ALTRA);
    f.elements.carica.addEventListener('change', agg); agg();
    const del = $('[data-del]', m.ov);
    if (del) del.onclick = async () => {
      if (!window.confirm('Eliminare questa carica dalla storia del Fratello?')) return;
      try { chk(await state.sb.from('cariche_storico').delete().eq('id', c.id)); m.chiudi(); toast('Carica eliminata', 'ok'); L.route(); }
      catch (e) { $('[data-err]', m.ov).textContent = messaggioErrore(e); }
    };
  }

  /* ---------- vista ---------- */
  L.viste.storia = async function (v) {
    await carica();
    const anniUsati = st.cariche.flatMap((c) => { const r = []; for (let a = c.anno_dal; a <= (c.anno_al || c.anno_dal); a++) r.push(a); return r; });
    const ora = new Date().getFullYear();
    const anni = Array.from(new Set([...anniUsati, ora, ora + 1, st.anno])).sort((a, b) => b - a);
    v.innerHTML = `
      <div class="page-head"><div><h1>Storia dei Fratelli</h1><p>Cariche ricoperte negli anni</p></div>
        <div class="right actions">${canEdit() ? `<button class="btn gold" id="h-new">${IC.plus} Aggiungi carica</button>` : ''}</div></div>
      <div class="tabs"><a class="tab ${st.modo === 'anno' ? 'on' : ''}" href="javascript:void(0)" data-modo="anno">Per anno</a>
        <a class="tab ${st.modo === 'fratello' ? 'on' : ''}" href="javascript:void(0)" data-modo="fratello">Per Fratello</a></div>
      <div id="h-corpo"></div>`;
    $$('[data-modo]', v).forEach((a) => a.addEventListener('click', () => { st.modo = a.dataset.modo; L.route(); }));
    if (canEdit()) $('#h-new').onclick = () => apriCarica(null, st.modo === 'anno' ? { anno: st.anno } : { fratello_id: P.idFratello(st.frat, st.fratello) });
    const c = $('#h-corpo');

    const azioni = (x) => (canEdit() ? `<button class="btn ghost small" data-mod="${esc(x.id)}">Modifica</button>` : '');
    const lega = () => $$('[data-mod]', c).forEach((b) => b.addEventListener('click', () => apriCarica(st.cariche.find((x) => x.id === b.dataset.mod))));

    if (st.modo === 'anno') {
      c.innerHTML = `<div class="actions" style="margin-bottom:14px"><label class="lbl" for="h-anno">Anno</label>
        <select id="h-anno" style="width:auto">${anni.map((a) => `<option value="${a}" ${a === st.anno ? 'selected' : ''}>${a}</option>`).join('')}</select><span class="muted" id="h-conta"></span></div>
        <div class="table-wrap"><table><thead><tr><th>Carica</th><th>Fratello</th><th>Periodo</th><th>Note</th><th></th></tr></thead><tbody id="h-righe"></tbody></table></div>`;
      const disegna = () => {
        const lista = st.cariche.filter((x) => x.anno_dal <= st.anno && (x.anno_al || x.anno_dal) >= st.anno)
          .sort((a, b) => ordineCarica(a.carica) - ordineCarica(b.carica) || nominativo(a.fratello_id).localeCompare(nominativo(b.fratello_id)));
        $('#h-conta').textContent = lista.length + (lista.length === 1 ? ' carica' : ' cariche');
        $('#h-righe').innerHTML = lista.length ? lista.map((x) => `<tr><td><b>${esc(x.carica)}</b></td><td>${esc(nominativo(x.fratello_id))}</td><td>${periodo(x)}</td><td>${esc(x.note || '')}</td><td class="act">${azioni(x)}</td></tr>`).join('')
          : `<tr><td colspan="5"><div class="empty">${IC.inbox}<div>Nessuna carica registrata per il ${st.anno}.</div></div></td></tr>`;
        lega();
      };
      $('#h-anno').addEventListener('change', (e) => { st.anno = Number(e.target.value); disegna(); });
      disegna();
    } else {
      c.innerHTML = `<div class="form-grid" style="margin-bottom:14px">${P.campoFratello(st.frat, { id: 'h-sel', label: 'Fratello', req: false, cls: 's6' })}</div><div id="h-fr"></div>`;
      const inp = $('#h-sel'); inp.value = st.fratello;
      const disegna = () => {
        st.fratello = inp.value;
        const fid = P.idFratello(st.frat, inp.value);
        if (!fid) { $('#h-fr').innerHTML = `<div class="empty">${IC.users}<div>Scrivi il cognome di un Fratello per vedere la sua storia.</div></div>`; return; }
        const lista = st.cariche.filter((x) => x.fratello_id === fid).sort((a, b) => b.anno_dal - a.anno_dal || ordineCarica(a.carica) - ordineCarica(b.carica));
        $('#h-fr').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Anno</th><th>Carica</th><th>Note</th><th></th></tr></thead><tbody>
          ${lista.length ? lista.map((x) => `<tr><td><b>${periodo(x)}</b></td><td>${esc(x.carica)}</td><td>${esc(x.note || '')}</td><td class="act">${azioni(x)}</td></tr>`).join('')
            : `<tr><td colspan="4"><div class="empty">Nessuna carica registrata per ${esc(nominativo(fid))}.</div></td></tr>`}</tbody></table></div>`;
        lega();
      };
      inp.addEventListener('input', disegna); inp.addEventListener('change', disegna);
      disegna();
    }
  };
})();
