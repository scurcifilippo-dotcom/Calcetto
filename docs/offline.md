# Calcetto offline

Scaricare `calcetto-offline.html` e salvarlo in una cartella stabile sul PC.
Aprirlo con Chrome o Edge in una finestra normale, anche senza connessione.
Non occorrono installazione, account, inviti, Vercel o Supabase per usarlo.

Il programma include i quindici giocatori del gruppo, aggiunta di giocatori,
ruoli, foto e icone, stagioni, partite 5 contro 5, squadre, risultati, gol,
voti da 1 a 10 con mezzi punti e MVP. Le statistiche considerano le partite
concluse; i giocatori senza voto contano come presenze e non nella media voto.
Per registrare una partita già giocata: crearla, selezionare dieci giocatori,
aprire “Squadre e voti”, inserire i dati e premere “Concludi partita”.
I profili di tutti i giocatori sono modificabili. La chat non compare.

Le modifiche si salvano immediatamente in localStorage con una chiave separata
dall'anteprima. Riaprire lo stesso file, nello stesso percorso, con lo stesso
browser e profilo mantiene i dati dopo la chiusura. Il comportamento dello
storage dei file locali dipende dal browser: non spostare o rinominare il file
senza un backup. La navigazione privata e la cancellazione dei dati del browser
possono eliminare i dati. I dati non sono incorporati nel file HTML.

“Backup e dati → Esporta backup JSON” crea una copia trasferibile tra PC o browser.
Per ripristinarla: scegliere il JSON, verificare il riepilogo e confermare.
Un JSON non valido non sovrascrive l'archivio. Prima di un ripristino viene
scaricata anche una copia dell'archivio precedente. Conservarla tra i propri file.
Se la memoria è piena o il browser blocca il salvataggio, la modifica viene
rifiutata con un messaggio e i dati precedenti restano disponibili per il backup.
Un archivio illeggibile non viene sostituito silenziosamente con uno vuoto.
Evitare modifiche contemporanee in più finestre: una versione diversa dell'archivio
fa rifiutare il salvataggio della finestra rimasta indietro.

## Generazione e verifica

`npm run offline:export` genera un singolo HTML con JavaScript, CSS e icone inclusi.
Una CSP interna impedisce richieste di rete. `npm run test:offline` verifica
in un profilo Chromium temporaneo: inserimento reale di una partita, statistiche,
riavvio del browser, backup/ripristino e rifiuto di dati corrotti o salvataggi falliti.
Il browser gestito dell'ambiente vieta gli URL `file://`: i test caricano lo stesso
HTML tramite HTTP locale e disattivano la rete dopo il caricamento del documento.
L'apertura diretta del file sul PC dell'utente richiede una verifica manuale.

`npm run test:offline:downloads` è un controllo separato del browser: una pagina
minima, senza codice di Calcetto, scarica un JSON prima e dopo il riavvio del profilo.
In questo ambiente il primo download riesce e il secondo chiude il browser gestito
(`Target page, context or browser has been closed`). Il controllo resta fallito e
non sono state disabilitate policy per aggirarlo. Backup, ripristino e copia di
sicurezza sono verificati nella prima sessione dal test principale; il download
dopo la riapertura e l'apertura diretta da file vanno controllati su Chrome/Edge
del PC dell'utente.
