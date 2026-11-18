/* Lemmi - sezione "Biblioteca": libri, pubblicazioni, foto e altri file della Loggia.
 * I file si comprimono in ZIP già nel browser prima del caricamento (se il risparmio è reale) e si decomprimono
 * da soli al download: chi scarica riceve il file originale. Le foto si possono anche ridurre di dimensione.
 * Archivio privato "biblioteca" su Supabase (sql/lemmi_aggiornamento_45.sql). */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, IC, canEdit } = L;

  const BUCKET = 'biblioteca';
  const MAX_BYTE = 50 * 1024 * 1024;           // limite di Supabase per singolo file (dopo la compressione)
  const CATEGORIE = { libro: 'Libro', pubblicazione: 'Pubblicazione', foto: 'Foto', documento: 'Documento', altro: 'Altro' };
  const VISIBILITA = { ufficio: 'Solo ufficio (Amministratore, Maestro Venerabile, Segretario)', fratelli: 'Tutti i Fratelli' };
  // formati già compressi: lo ZIP non porterebbe risparmio, quindi non si prova nemmeno
  const GIA_COMPRESSI = ['zip', '7z', 'rar', 'gz', 'bz2', 'xz', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'mp3', 'm4a', 'aac', 'ogg', 'mp4', 'mov', 'mkv', 'avi', 'webm', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub'];
  const bi = { righe: [], q: '', cat: '' };

  const puoGestire = () => canEdit();
  const vedeVisibilita = () => ['amministratore', 'venerabile', 'segretario'].includes(state.profilo && state.profilo.ruolo);
  const nuovoId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  const kb = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(2).replace('.', ',') + ' GB'
    : n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const estensione = (nome) => { const m = /\.([A-Za-z0-9]+)$/.exec(nome || ''); return m ? m[1].toLowerCase() : ''; };
  const senzaEstensione = (nome) => String(nome || '').replace(/\.[A-Za-z0-9]+$/, '');
  const nomeSicuro = (nome) => String(nome || 'file').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(-80) || 'file';
  const opzioni = (mappa, sel, vuoto) => (vuoto !== undefined ? `<option value="">${esc(vuoto)}</option>` : '') +
    Object.keys(mappa).map((k) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(mappa[k])}</option>`).join('');

  /* ---------- compressione ---------- */
  async function comprimiZip(file) {
    const zip = await L.libreria('zip');
    const w = new zip.ZipWriter(new zip.BlobWriter('application/zip'));
    await w.add(file.name, new zip.BlobReader(file), { level: 9 });
    return w.close();
  }

  async function decomprimiZip(blob, tipo) {
    const zip = await L.libreria('zip');
    const r = new zip.ZipReader(new zip.BlobReader(blob));
    try {
      const voci = await r.getEntries();
      if (!voci.length) throw new Error('L’archivio ZIP è vuoto.');
      return await voci[0].getData(new zip.BlobWriter(tipo || 'application/octet-stream'));
    } finally { await r.close(); }
  }

  // riduce le foto grandi (lato massimo 2400 px, JPEG qualità 85%); se non conviene restituisce l'originale
  async function riduciFoto(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file;
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (e) { return file; }
    const max = 2400, scala = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scala === 1 && file.size < 1.5 * 1048576) { bmp.close && bmp.close(); return file; }
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scala); c.height = Math.round(bmp.height * scala);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);   // le trasparenze del PNG diventano bianche
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], senzaEstensione(file.name) + '.jpg', { type: 'image/jpeg' });
  }

  /* ---------- dati ---------- */
  async function carica() { bi.righe = chk(await state.sb.from('biblioteca').select('*').order('creato_il', { ascending: false })); }

  /* ---------- finestra ---------- */
  function finestra(titolo, corpo, opt) {
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titolo)}">
      <div class="modal-h"><h2 style="margin:0">${esc(titolo)}</h2><button class="btn ghost small" type="button" data-x>Chiudi</button></div>
      <div class="modal-b"><form novalidate>${corpo}<div class="err" data-err style="margin-top:10px"></div>
        <div class="actions" style="margin-top:14px"><button class="btn gold" type="submit">${esc(opt.testoOk || 'Salva')}</button>${opt.extra || ''}</div></form></div></div>`;
    document.body.appendChild(ov);
    let occupato = false;
    const tasto = (e) => { if (e.key === 'Escape' && !occupato) chiudi(); };
    const chiudi = () => { document.removeEventListener('keydown', tasto); ov.remove(); };
    document.addEventListener('keydown', tasto);
    $('[data-x]', ov).onclick = () => { if (!occupato) chiudi(); };
    ov.addEventListener('mousedown', (e) => { if (e.target === ov && !occupato) chiudi(); });
    const f = $('form', ov);
    const errore = (msg) => { $('[data-err]', ov).textContent = msg; };
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); errore('');
      const b = $('button[type=submit]', f); b.disabled = true; occupato = true;
      try { await opt.onSubmit(f, chiudi, errore); } catch (e) { errore(messaggioErrore(e)); }
      b.disabled = false; occupato = false;
    });
    return { ov, f, chiudi, errore };
  }

  /* ---------- aggiunta ---------- */
  function apriAggiunta() {
    const corpo = `<div class="form-grid">
      <div class="f s12"><label for="b-file">File <span class="req">*</span> <span class="hint">anche più di uno alla volta · fino a 50 MB ciascuno dopo la compressione</span></label>
        <input id="b-file" class="vis" name="file" type="file" multiple></div>
      <div class="f s8"><label for="b-tit">Titolo <span class="hint">(se carichi più file, ognuno prende il proprio nome)</span></label><input id="b-tit" name="titolo" autocomplete="off"></div>
      <div class="f s4"><label for="b-cat">Categoria</label><select id="b-cat" name="categoria">${opzioni(CATEGORIE, 'libro')}</select></div>
      <div class="f s8"><label for="b-aut">Autore</label><input id="b-aut" name="autore" autocomplete="off"></div>
      <div class="f s4"><label for="b-anno">Anno</label><input id="b-anno" name="anno" inputmode="numeric" maxlength="4" autocomplete="off"></div>
      <div class="f s12"><label for="b-desc">Descrizione</label><textarea id="b-desc" name="descrizione" rows="2"></textarea></div>
      <div class="f s12"><label for="b-vis">Chi può vederlo</label><select id="b-vis" name="visibilita">${opzioni(VISIBILITA, 'ufficio')}</select></div>
      <div class="f s12">
        <label style="display:flex;gap:6px;align-items:center;font-weight:500"><input type="checkbox" name="zip" checked> Comprimi in ZIP prima del caricamento <span class="hint">(si tiene solo se il risparmio è almeno del 5%; al download torna il file originale)</span></label>
        <label style="display:flex;gap:6px;align-items:center;font-weight:500;margin-top:6px"><input type="checkbox" name="riduci"> Riduci le foto grandi <span class="hint">(lato massimo 2400 px, JPEG qualità 85%: la foto originale non si recupera)</span></label>
        <div class="hint" id="b-prog" style="margin-top:10px"></div></div>
    </div>`;
    const m = finestra('Aggiungi alla Biblioteca', corpo, {
      testoOk: 'Carica',
      onSubmit: async (f, chiudi, errore) => {
        const e = f.elements;
        const files = Array.from(e.file.files || []);
        if (!files.length) return errore('Scegli almeno un file.');
        const anno = e.anno.value.trim();
        if (anno && !/^\d{4}$/.test(anno)) return errore('L’anno deve avere quattro cifre, per esempio 1998.');
        const prog = $('#b-prog', f);
        const comuni = {
          categoria: e.categoria.value, autore: e.autore.value.trim() || null, anno: anno ? parseInt(anno, 10) : null,
          descrizione: e.descrizione.value.trim() || null, visibilita: e.visibilita.value,
        };
        const esiti = []; let originali = 0, finali = 0, ok = 0;
        for (let i = 0; i < files.length; i++) {
          let file = files[i];
          const etichetta = `(${i + 1}/${files.length}) ${file.name}`;
          let caricato = null;
          try {
            let tipo = file.type || 'application/octet-stream';
            if (e.riduci.checked) { prog.textContent = 'Riduco la foto ' + etichetta + '…'; file = await riduciFoto(file); }
            const dimOrig = file.size;
            let blob = file, compresso = false;
            if (e.zip.checked && !GIA_COMPRESSI.includes(estensione(file.name))) {
              prog.textContent = 'Comprimo ' + etichetta + '…';
              const z = await comprimiZip(file);
              if (z.size <= file.size * 0.95) { blob = z; compresso = true; }
            }
            if (blob.size > MAX_BYTE) throw new Error('supera i 50 MB anche dopo la compressione (' + kb(blob.size) + ')');
            prog.textContent = 'Carico ' + etichetta + '…';
            const id = nuovoId();
            const path = id + '/' + Date.now() + '_' + nomeSicuro(file.name) + (compresso ? '.zip' : '');
            try { chk(await state.sb.storage.from(BUCKET).upload(path, blob, { contentType: compresso ? 'application/zip' : tipo, upsert: false })); }
            catch (er) {
              const t = String((er && er.message) || er);
              if (/bucket not found/i.test(t)) throw new Error('manca l’archivio «biblioteca» su Supabase: esegui lo script sql/lemmi_aggiornamento_45.sql');
              if (/row-level security|violates|not authorized|unauthorized/i.test(t)) throw new Error('non hai il permesso di caricare file (servono i ruoli amministratore o segretario)');
              throw er;
            }
            caricato = path;
            const titolo = (files.length === 1 && e.titolo.value.trim()) || senzaEstensione(file.name) || file.name;
            chk(await state.sb.from('biblioteca').insert(Object.assign({
              id, titolo, file_path: path, file_nome: file.name, file_tipo: tipo,
              dimensione_originale: dimOrig, dimensione: blob.size, compresso,
            }, comuni)));
            ok++; originali += dimOrig; finali += blob.size;
          } catch (er) {
            if (caricato) { try { await state.sb.storage.from(BUCKET).remove([caricato]); } catch (x) { /* si ripulisce a mano se serve */ } }
            esiti.push(file.name + ': ' + messaggioErrore(er));
          }
        }
        prog.textContent = '';
        if (ok) {
          const risp = originali > finali ? ' (risparmiati ' + kb(originali - finali) + ')' : '';
          toast(ok === 1 ? 'File caricato' + risp : ok + ' file caricati' + risp, 'ok');
        }
        if (esiti.length) {
          errore('Non caricati: ' + esiti.join(' · '));
          if (ok) { await carica(); disegna(); }
          return;                                  // la finestra resta aperta per leggere gli errori
        }
        chiudi(); L.route();
      },
    });
    return m;
  }

  /* ---------- modifica dei dati ---------- */
  function apriModifica(r) {
    const corpo = `<div class="form-grid">
      <div class="f s8"><label for="b-tit">Titolo <span class="req">*</span></label><input id="b-tit" name="titolo" value="${esc(r.titolo)}"></div>
      <div class="f s4"><label for="b-cat">Categoria</label><select id="b-cat" name="categoria">${opzioni(CATEGORIE, r.categoria)}</select></div>
      <div class="f s8"><label for="b-aut">Autore</label><input id="b-aut" name="autore" value="${esc(r.autore || '')}"></div>
      <div class="f s4"><label for="b-anno">Anno</label><input id="b-anno" name="anno" inputmode="numeric" maxlength="4" value="${esc(r.anno || '')}"></div>
      <div class="f s12"><label for="b-desc">Descrizione</label><textarea id="b-desc" name="descrizione" rows="2">${esc(r.descrizione || '')}</textarea></div>
      <div class="f s12"><label for="b-vis">Chi può vederlo</label><select id="b-vis" name="visibilita">${opzioni(VISIBILITA, r.visibilita)}</select></div>
      <div class="f s12 hint">File: <b>${esc(r.file_nome)}</b> · ${kb(r.dimensione_originale || r.dimensione || 0)}. Per cambiare il file, eliminalo e caricalo di nuovo.</div></div>`;
    const m = finestra('Modifica', corpo, {
      extra: '<button class="btn danger" type="button" data-del>Elimina</button>',
      onSubmit: async (f, chiudi, errore) => {
        const e = f.elements;
        const titolo = e.titolo.value.trim();
        if (!titolo) return errore('Indica il titolo.');
        const anno = e.anno.value.trim();
        if (anno && !/^\d{4}$/.test(anno)) return errore('L’anno deve avere quattro cifre, per esempio 1998.');
        chk(await state.sb.from('biblioteca').update({
          titolo, categoria: e.categoria.value, autore: e.autore.value.trim() || null, anno: anno ? parseInt(anno, 10) : null,
          descrizione: e.descrizione.value.trim() || null, visibilita: e.visibilita.value,
        }).eq('id', r.id));
        chiudi(); toast('Salvato', 'ok'); L.route();
      },
    });
    $('[data-del]', m.ov).onclick = () => {
      m.chiudi();
      L.eliminaConAnnulla({ domanda: 'Eliminare «' + r.titolo + '» e il suo file?', messaggio: 'Elemento eliminato (con il file)', esegui: async () => {
        chk(await state.sb.storage.from(BUCKET).remove([r.file_path]));
        chk(await state.sb.from('biblioteca').delete().eq('id', r.id));
      } });
    };
  }

  /* ---------- download (decomprime da solo) ---------- */
  async function scarica(r) {
    toast('Preparo il file…', 'info');
    const u = chk(await state.sb.storage.from(BUCKET).createSignedUrl(r.file_path, 120));
    const risp = await fetch(u.signedUrl);
    if (!risp.ok) throw new Error('Download non riuscito (' + risp.status + ').');
    let blob = await risp.blob();
    if (r.compresso) blob = await decomprimiZip(blob, r.file_tipo);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = r.file_nome || 'file'; a.rel = 'noopener noreferrer'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /* ---------- vista ---------- */
  let disegna = () => {};
  L.viste.biblioteca = async function (v) {
    await carica();
    v.innerHTML = `
      <div class="page-head"><div><h1>Biblioteca</h1><p>Libri, pubblicazioni, foto e altri file della Loggia</p></div>
        <div class="right actions">${puoGestire() ? `<button class="btn gold" id="bi-new">${IC.plus} Aggiungi</button>` : ''}</div></div>
      <div class="actions" style="margin-bottom:14px;flex-wrap:wrap">
        <div class="searchbar">${IC.search}<input id="bi-q" type="search" placeholder="Cerca per titolo, autore o descrizione…" value="${esc(bi.q)}"></div>
        <select id="bi-cat" style="width:auto">${opzioni(CATEGORIE, bi.cat, 'Tutte le categorie')}</select>
        <span class="muted" id="bi-conta"></span></div>
      <div id="bi-corpo"></div>`;
    if (puoGestire()) $('#bi-new').onclick = () => apriAggiunta();
    $('#bi-q').addEventListener('input', (e) => { bi.q = e.target.value; disegna(); });
    $('#bi-cat').addEventListener('change', (e) => { bi.cat = e.target.value; disegna(); });

    disegna = function () {
      const q = bi.q.trim().toLowerCase();
      const lista = bi.righe.filter((r) => {
        if (bi.cat && r.categoria !== bi.cat) return false;
        if (!q) return true;
        return [r.titolo, r.autore, r.descrizione, r.file_nome].some((s) => String(s || '').toLowerCase().includes(q));
      });
      const tot = lista.reduce((a, r) => a + Number(r.dimensione || 0), 0);
      $('#bi-conta').textContent = lista.length + (lista.length === 1 ? ' elemento' : ' elementi') + (lista.length ? ' · ' + kb(tot) : '');
      const c = $('#bi-corpo');
      if (!lista.length) {
        c.innerHTML = `<div class="card empty">${IC.inbox}<div>${bi.righe.length ? 'Nessun risultato.' : 'La Biblioteca è ancora vuota.' + (puoGestire() ? ' Usa “Aggiungi” per caricare il primo file.' : '')}</div></div>`;
        return;
      }
      const vis = vedeVisibilita();
      c.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Titolo</th><th>Categoria</th><th>Autore</th><th class="num">Dimensione</th>${vis ? '<th>Visibile a</th>' : ''}<th></th></tr></thead><tbody>${lista.map((r) => {
        const risp = r.compresso && r.dimensione_originale > r.dimensione ? Math.round((1 - r.dimensione / r.dimensione_originale) * 100) : 0;
        return `<tr data-id="${esc(r.id)}"><td><b>${esc(r.titolo)}</b>${r.descrizione ? `<div class="hint">${esc(r.descrizione)}</div>` : ''}<div class="hint">${esc(r.file_nome)}</div></td>
          <td><span class="badge gray">${esc(CATEGORIE[r.categoria] || r.categoria)}</span></td>
          <td>${esc(r.autore || '—')}${r.anno ? `<div class="hint">${esc(r.anno)}</div>` : ''}</td>
          <td class="num">${kb(r.dimensione || 0)}${risp ? `<div class="hint">ZIP −${risp}%</div>` : ''}</td>
          ${vis ? `<td><span class="badge ${r.visibilita === 'fratelli' ? 'ok' : 'gray'}">${r.visibilita === 'fratelli' ? 'Tutti i Fratelli' : 'Solo ufficio'}</span></td>` : ''}
          <td class="num" style="white-space:nowrap"><button class="btn ghost small" data-scarica="${esc(r.id)}">Scarica</button>${puoGestire() ? ` <button class="btn ghost small" data-mod="${esc(r.id)}">Modifica</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>
      ${puoGestire() ? `<p class="hint" style="margin-top:8px">Spazio usato dalla Biblioteca: ${kb(bi.righe.reduce((a, r) => a + Number(r.dimensione || 0), 0))}. Il piano gratuito di Supabase offre 1 GB in tutto, condiviso con gli altri archivi.</p>` : ''}`;
      $$('[data-scarica]', c).forEach((b) => b.addEventListener('click', async () => {
        const r = bi.righe.find((x) => x.id === b.dataset.scarica); if (!r) return;
        b.disabled = true;
        try { await scarica(r); } catch (e) { toast(messaggioErrore(e), 'bad'); }
        b.disabled = false;
      }));
      $$('[data-mod]', c).forEach((b) => b.addEventListener('click', () => { const r = bi.righe.find((x) => x.id === b.dataset.mod); if (r) apriModifica(r); }));
    };
    disegna();
  };
})();
