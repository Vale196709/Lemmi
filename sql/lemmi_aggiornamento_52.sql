-- Lemmi - aggiornamento 52: gli archivi dei file accettano anche gli ZIP
-- Da eseguire una volta su Supabase (SQL Editor). Si può rieseguire senza danni.
--
-- Dalla versione con la compressione, l'app comprime i file prima di caricarli (se si risparmia almeno il 5%)
-- e li invia come «application/zip». Gli archivi creati con un elenco di tipi ammessi (es. solo PDF e Word)
-- rifiutavano lo ZIP con l'errore «mime type application/zip is not supported».
-- Qui si aggiunge lo ZIP a ogni archivio che ha un elenco di tipi ammessi; gli altri restano come sono.

update storage.buckets
   set allowed_mime_types = array_append(allowed_mime_types, 'application/zip')
 where allowed_mime_types is not null
   and not ('application/zip' = any (allowed_mime_types));

-- controllo: per ogni archivio i tipi ammessi («nessun limite» = accetta tutto) e il limite di dimensione
select id as archivio,
       coalesce(array_to_string(allowed_mime_types, ', '), 'nessun limite') as tipi_ammessi,
       coalesce(pg_size_pretty(file_size_limit::bigint), 'nessuno') as dimensione_massima
  from storage.buckets order by id;
