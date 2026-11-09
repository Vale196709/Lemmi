/* Lemmi - finestre di conferma nello stile dell'app (al posto di quelle del browser).
 * LemmiDialogo.conferma({ titolo, testo, punti: [..], ok, annulla, focus: 'annulla'|'ok' }) -> Promise<boolean>
 * LemmiDialogo.punti(avvisi) -> Promise<boolean>   riquadro "Controlla questi punti" con Correggi / Salva comunque
 * Si chiude con Esc (= annulla); il fuoco parte dal pulsante prudente e resta dentro la finestra. */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  function conferma(o) {
    o = o || {};
    const testoSemplice = [o.titolo, o.testo].concat(o.punti || []).filter(Boolean).join('\n\n- ');
    if (typeof document === 'undefined' || !document.body) return Promise.resolve(window.confirm(testoSemplice));
    return new Promise((risolvi) => {
      const ov = document.createElement('div');
      ov.className = 'modal-ov';
      const punti = (o.punti || []).map((p) => '<li>' + esc(p) + '</li>').join('');
      ov.innerHTML = '<div class="modal dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" style="width:min(520px,100%)">' +
        '<div class="modal-h"><h2 id="dlg-t">' + esc(o.titolo || 'Confermi?') + '</h2></div><div class="modal-b">' +
        (o.testo ? '<p style="margin:0 0 6px">' + esc(o.testo) + '</p>' : '') +
        (punti ? '<ul class="dlg-punti">' + punti + '</ul>' : '') +
        '<div class="dlg-az"><button type="button" class="btn ghost" data-r="no">' + esc(o.annulla || 'Annulla') + '</button>' +
        '<button type="button" class="btn" data-r="si">' + esc(o.ok || 'Conferma') + '</button></div></div></div>';
      const precedente = document.activeElement;
      const bottoni = () => Array.from(ov.querySelectorAll('button'));
      const chiudi = (valore) => {
        document.removeEventListener('keydown', tasti, true);
        ov.remove();
        if (precedente && precedente.focus) { try { precedente.focus(); } catch (_) { /* elemento sparito */ } }
        risolvi(valore);
      };
      const tasti = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudi(false); }
        else if (e.key === 'Tab') {                       // il fuoco resta tra i due pulsanti
          const b = bottoni(), i = b.indexOf(document.activeElement);
          if (i < 0) { e.preventDefault(); b[0].focus(); }
          else if (e.shiftKey && i === 0) { e.preventDefault(); b[b.length - 1].focus(); }
          else if (!e.shiftKey && i === b.length - 1) { e.preventDefault(); b[0].focus(); }
        }
      };
      ov.addEventListener('click', (e) => {
        if (e.target === ov) chiudi(false);
        const b = e.target.closest && e.target.closest('button[data-r]');
        if (b) chiudi(b.dataset.r === 'si');
      });
      document.addEventListener('keydown', tasti, true);
      document.body.appendChild(ov);
      const b = bottoni();
      (o.focus === 'ok' ? b[1] : b[0]).focus();
    });
  }

  function punti(avvisi, opz) {
    return conferma(Object.assign({
      titolo: 'Controlla questi punti', testo: 'Alcuni dati non tornano. Puoi correggerli oppure salvare comunque.',
      punti: avvisi, ok: 'Salva comunque', annulla: 'Correggi',
    }, opz || {}));
  }

  const API = { conferma, punti };
  if (typeof window !== 'undefined') window.LemmiDialogo = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
