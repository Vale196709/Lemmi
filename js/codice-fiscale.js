/* Controllo del codice fiscale italiano - nessuna dipendenza, nessun servizio esterno.
   Uso nel browser:  CodiceFiscale.valida(cf)  /  CodiceFiscale.controllaCoerenza(cf, dati)  */
(function (global) {
  'use strict';

  var MESI = 'ABCDEHLMPRST';
  var OMOCODIA = 'LMNPQRSTUV';           // lettere che sostituiscono le cifre 0-9
  var POS_NUMERICHE = [6, 7, 9, 10, 12, 13, 14];
  var DISPARI = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
  var FORMATO = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPR-T][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

  function normalizza(cf) {
    return String(cf || '').replace(/\s+/g, '').toUpperCase();
  }

  function letteraControllo(primi15) {
    var somma = 0;
    for (var i = 0; i < 15; i++) {
      var c = primi15.charAt(i);
      var v = /[0-9]/.test(c) ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 65;
      somma += (i % 2 === 0) ? DISPARI[v] : v;   // posizioni 1,3,5... (indice pari) = dispari
    }
    return String.fromCharCode(65 + (somma % 26));
  }

  // Riporta a cifre le lettere di omocodia
  function sistemaOmocodia(cf) {
    var a = cf.split('');
    POS_NUMERICHE.forEach(function (p) {
      var idx = OMOCODIA.indexOf(a[p]);
      if (idx >= 0) a[p] = String(idx);
    });
    return a.join('');
  }

  function senzaAccenti(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z]/g, '');
  }

  function consonanti(s) { return s.replace(/[AEIOU]/g, ''); }
  function vocali(s) { return s.replace(/[^AEIOU]/g, ''); }

  function codiceCognome(cognome) {
    var s = senzaAccenti(cognome);
    return (consonanti(s) + vocali(s) + 'XXX').substr(0, 3);
  }

  function codiceNome(nome) {
    var s = senzaAccenti(nome);
    var c = consonanti(s);
    if (c.length >= 4) c = c.charAt(0) + c.charAt(2) + c.charAt(3);
    return (c + vocali(s) + 'XXX').substr(0, 3);
  }

  /* Controllo formale: lunghezza, struttura, lettera di controllo */
  function valida(cfIn) {
    var cf = normalizza(cfIn);
    var errori = [];
    if (cf.length === 0) return { ok: false, cf: cf, errori: ['Codice fiscale mancante'] };
    if (cf.length !== 16) errori.push('Il codice fiscale deve avere 16 caratteri (ne ha ' + cf.length + ')');
    else if (!FORMATO.test(cf)) errori.push('Formato non valido: controlla lettere e cifre');
    else if (letteraControllo(cf.substr(0, 15)) !== cf.charAt(15)) errori.push('Lettera di controllo errata: probabile errore di battitura');
    return { ok: errori.length === 0, cf: cf, errori: errori };
  }

  /* Coerenza con i dati anagrafici. dati = { cognome, nome, dataNascita:'AAAA-MM-GG', sesso:'M'|'F', codiceCatastale }
     Si confronta solo cio' che viene fornito. Restituisce avvisi (non blocca). */
  function controllaCoerenza(cfIn, dati) {
    var v = valida(cfIn);
    if (!v.ok) return { ok: false, avvisi: v.errori };
    dati = dati || {};
    var cf = sistemaOmocodia(v.cf);
    var avvisi = [];

    if (dati.cognome && cf.substr(0, 3) !== codiceCognome(dati.cognome))
      avvisi.push('Le prime 3 lettere non corrispondono al cognome');
    if (dati.nome && cf.substr(3, 3) !== codiceNome(dati.nome))
      avvisi.push('Le lettere 4-6 non corrispondono al nome');

    if (dati.dataNascita) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dati.dataNascita);
      if (m) {
        if (cf.substr(6, 2) !== m[1].substr(2, 2)) avvisi.push('L\'anno di nascita non corrisponde');
        if (cf.charAt(8) !== MESI.charAt(parseInt(m[2], 10) - 1)) avvisi.push('Il mese di nascita non corrisponde');
        var giorno = parseInt(cf.substr(9, 2), 10);
        var sessoCf = giorno > 40 ? 'F' : 'M';
        if ((giorno > 40 ? giorno - 40 : giorno) !== parseInt(m[3], 10)) avvisi.push('Il giorno di nascita non corrisponde');
        if (dati.sesso && dati.sesso.toUpperCase() !== sessoCf) avvisi.push('Il sesso non corrisponde');
      }
    } else if (dati.sesso) {
      var g = parseInt(cf.substr(9, 2), 10);
      if (dati.sesso.toUpperCase() !== (g > 40 ? 'F' : 'M')) avvisi.push('Il sesso non corrisponde');
    }

    if (dati.codiceCatastale && cf.substr(11, 4) !== String(dati.codiceCatastale).toUpperCase())
      avvisi.push('Il comune di nascita non corrisponde al codice');

    return { ok: avvisi.length === 0, avvisi: avvisi };
  }

  /* Calcolo (utile per i test e per proporre il codice a partire dai dati) */
  function calcola(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.dataNascita);
    var giorno = parseInt(m[3], 10) + (d.sesso.toUpperCase() === 'F' ? 40 : 0);
    var p = codiceCognome(d.cognome) + codiceNome(d.nome) + m[1].substr(2, 2) +
      MESI.charAt(parseInt(m[2], 10) - 1) + ('0' + giorno).slice(-2) + d.codiceCatastale.toUpperCase();
    return p + letteraControllo(p);
  }

  global.CodiceFiscale = {
    normalizza: normalizza, valida: valida, controllaCoerenza: controllaCoerenza, calcola: calcola
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.CodiceFiscale;
})(typeof window !== 'undefined' ? window : globalThis);
