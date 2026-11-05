/* Lemmi - controlli su telefono e codici fiscali doppi.
 * telefono(testo) -> { errore?, avviso? }   errore blocca, avviso chiede conferma
 * doppioni(sb, cf, escludi) -> Promise<[testo]>  persone già in archivio con lo stesso codice fiscale
 * Nessun dato viene modificato: i controlli segnalano soltanto. */
(function () {
  'use strict';

  function telefono(raw) {
    const t = String(raw == null ? '' : raw).trim();
    if (!t) return {};
    if (/[A-Za-z]/.test(t)) return { errore: 'Il numero di telefono non può contenere lettere.' };
    if (!/^[+\d\s().\/-]+$/.test(t)) return { errore: 'Il numero contiene caratteri non validi: usa cifre, spazi e, se serve, il prefisso +.' };
    let n = t.replace(/[\s().\/-]/g, '');
    if (n.slice(0, 2) === '00') n = '+' + n.slice(2);
    if (n.indexOf('+') > 0) return { errore: 'Il segno + va solo all’inizio del numero (prefisso internazionale).' };
    if (n.slice(0, 3) === '+39') n = n.slice(3);
    else if (n.charAt(0) === '+') {
      const c = n.slice(1);
      return (c.length >= 8 && c.length <= 15) ? {} : { avviso: 'Il numero «' + t + '» ha una lunghezza insolita per un numero estero: controlla che sia completo.' };
    }
    if (/^3\d{8,9}$/.test(n)) return {};                  // cellulare italiano
    if (/^0\d{5,10}$/.test(n)) return {};                 // fisso italiano
    if (/^(800|803|199|848)\d{3,7}$/.test(n)) return {};  // numeri verdi e simili
    return { avviso: 'Il numero «' + t + '» non sembra un numero italiano valido (cellulari: 3 + 8 o 9 cifre; fissi: 0 + prefisso): controlla che sia completo.' };
  }

  async function doppioni(sb, cf, escludi) {
    const codice = String(cf || '').replace(/\s/g, '').toUpperCase();
    if (!sb || !/^[A-Z0-9]{16}$/.test(codice)) return [];
    const out = [];
    for (const [tab, etichetta] of [['fratelli', 'Fratello'], ['bussanti', 'Bussante']]) {
      try {
        const r = await sb.from(tab).select('id,cognome,nome').eq('codice_fiscale', codice);
        if (r.error) continue;
        (r.data || []).forEach((x) => {
          if (escludi && escludi.tabella === tab && String(escludi.id) === String(x.id)) return;
          out.push(etichetta + ' ' + x.cognome + ' ' + x.nome);
        });
      } catch (_) { /* se la verifica non riesce, il salvataggio prosegue */ }
    }
    return out;
  }

  const API = { telefono, doppioni };
  if (typeof window !== 'undefined') window.LemmiControlli = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
