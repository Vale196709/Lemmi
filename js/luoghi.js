/* Lemmi - province e comuni scelti da elenco (data/luoghi.json, fonte ISTAT).
 * collega(form, coppie): trasforma i campi "comune" e "provincia" in campi con suggerimenti.
 * verifica(form): controlla che comune e provincia siano nell'elenco e coerenti tra loro.
 * catastale(form, nomeCampoComune): codice catastale del comune scelto (serve al controllo del codice fiscale).
 * Se l'elenco non si carica, i campi restano di testo libero e l'app funziona come prima. */
(function () {
  'use strict';
  let DATI = null, caricamento = null;

  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim();
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  function carica() {
    if (DATI) return Promise.resolve(DATI);
    if (!caricamento) {
      caricamento = fetch('data/luoghi.json').then((r) => { if (!r.ok) throw new Error('luoghi.json'); return r.json(); }).then((j) => {
        const comuni = j.comuni.map((c) => ({ nome: c[0], sigla: c[1], cat: c[2], n: norm(c[0]) }));
        const perNome = new Map();
        comuni.forEach((c) => { if (!perNome.has(c.n)) perNome.set(c.n, []); perNome.get(c.n).push(c); });
        DATI = { province: j.province, comuni, perNome };
        return DATI;
      }).catch((e) => { caricamento = null; throw e; });
    }
    return caricamento;
  }

  // comuni con quel nome (ignorando maiuscole e accenti), eventualmente solo nella provincia indicata
  function trova(nome, sigla) {
    if (!DATI) return [];
    const m = DATI.perNome.get(norm(nome)) || [];
    return sigla ? m.filter((c) => c.sigla === sigla) : m;
  }

  async function collega(f, coppie) {
    let D;
    try { D = await carica(); } catch (_) { return; }       // senza elenco: campi liberi come prima
    if (!f.querySelector('#dl-prov-lemmi')) {
      const dp = document.createElement('datalist');
      dp.id = 'dl-prov-lemmi';
      dp.innerHTML = Object.entries(D.province).map(([s, n]) => '<option value="' + s + '">' + esc(n) + '</option>').join('');
      f.appendChild(dp);
    }
    f.__luoghi = f.__luoghi || [];
    coppie.forEach((p) => {
      const ec = f.elements[p.comune], ep = f.elements[p.prov];
      if (!ec || !ep) return;                                // il campo non è in questo modulo
      const dlId = 'dl-com-' + p.comune;
      const dl = document.createElement('datalist'); dl.id = dlId; f.appendChild(dl);
      ec.setAttribute('autocomplete', 'off'); ep.setAttribute('autocomplete', 'off');
      const voce = { comuneNome: p.comune, ec, ep, fuori: null };

      const siglaOk = () => { const s = ep.value.trim().toUpperCase(); return D.province[s] ? s : ''; };
      const suggerisci = () => {
        const q = norm(ec.value), s = siglaOk();
        if (q.length < 2) { dl.innerHTML = ''; return; }
        const r = D.comuni.filter((c) => c.n.startsWith(q) && (!s || c.sigla === s));
        r.sort((a, b) => a.n < b.n ? -1 : a.n > b.n ? 1 : a.sigla < b.sigla ? -1 : 1);
        dl.innerHTML = r.slice(0, 40).map((c) => '<option value="' + esc(c.nome) + '">' + c.sigla + ' – ' + esc(D.province[c.sigla]) + '</option>').join('');
      };
      const allinea = () => {
        if (voce.fuori && voce.fuori.checked) return;
        const m = trova(ec.value, siglaOk());
        if (m.length === 1) { ec.value = m[0].nome; ep.value = m[0].sigla; }   // nome scritto in modo uniforme + provincia compilata
      };
      const modoLibero = (libero, forza) => {
        if (libero) { ec.removeAttribute('list'); ep.removeAttribute('list'); if (forza || !ep.value.trim()) ep.value = 'EE'; }
        else { ec.setAttribute('list', dlId); ep.setAttribute('list', 'dl-prov-lemmi'); }
      };

      if (p.estero) {
        const w = document.createElement('div');
        w.className = 'f';
        w.innerHTML = '<label class="check"><input type="checkbox"> Nato all’estero o in un comune non più esistente (scrivi lo Stato o il comune; come provincia EE per l’estero)</label>';
        const anchor = ep.closest('.f');
        anchor.parentNode.insertBefore(w, anchor.nextSibling);
        voce.fuori = w.querySelector('input');
        const c = ec.value.trim(), s = ep.value.trim().toUpperCase();
        voce.fuori.checked = !!c && (s === 'EE' || trova(c, D.province[s] ? s : '').length === 0);   // dato già salvato fuori elenco
        voce.fuori.addEventListener('change', () => { modoLibero(voce.fuori.checked, true); if (!voce.fuori.checked) allinea(); });
      }
      modoLibero(!!(voce.fuori && voce.fuori.checked));
      ec.addEventListener('input', () => { if (!(voce.fuori && voce.fuori.checked)) suggerisci(); });
      ec.addEventListener('change', allinea);
      ep.addEventListener('input', () => { if (!(voce.fuori && voce.fuori.checked)) suggerisci(); });
      ep.addEventListener('change', () => { ep.value = ep.value.toUpperCase(); allinea(); });
      f.__luoghi.push(voce);
    });
  }

  // Restituisce null se tutto va bene, altrimenti { campo: <input>, msg }
  function verifica(f) {
    if (!DATI || !f.__luoghi) return null;
    for (const v of f.__luoghi) {
      if (v.ec.closest('.hidden')) continue;
      const s = v.ep.value.trim().toUpperCase(), c = v.ec.value.trim();
      if (v.fuori && v.fuori.checked) {
        if (c && !/^[A-Z]{2}$/.test(s)) return { campo: v.ep, msg: 'Indica la provincia con due lettere (EE se è all’estero).' };
        continue;
      }
      if (s && !DATI.province[s]) return { campo: v.ep, msg: 'Provincia non valida: scegli la sigla dall’elenco (es. RM).' };
      if (!c) continue;
      const m = trova(c, s);
      if (!m.length) {
        const altrove = s ? trova(c, '') : [];
        const msg = altrove.length
          ? '“' + c + '” non risulta in provincia di ' + DATI.province[s] + ': controlla la provincia.'
          : '“' + c + '” non è nell’elenco dei comuni: scegline uno dai suggerimenti.' + (v.fuori ? ' Se è nato all’estero o in un comune soppresso, spunta la casella sotto.' : '');
        return { campo: altrove.length ? v.ep : v.ec, msg };
      }
      if (m.length > 1) return { campo: v.ep, msg: '“' + c + '” esiste in più province: indica la sigla della provincia.' };
    }
    return null;
  }

  function catastale(f, nomeCampoComune) {
    const v = (f.__luoghi || []).find((x) => x.comuneNome === nomeCampoComune);
    if (!v || !DATI || (v.fuori && v.fuori.checked)) return null;
    const s = v.ep.value.trim().toUpperCase();
    const m = trova(v.ec.value, DATI.province[s] ? s : '');
    return m.length === 1 ? m[0].cat : null;
  }

  window.LemmiLuoghi = { carica, collega, verifica, catastale, trova };
})();
