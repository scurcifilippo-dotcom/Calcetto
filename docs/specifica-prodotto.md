# Calcetto — specifica del prodotto

Stato: applicazione Next.js con account reali su invito, autorizzazioni server,
database remoto Supabase e dati condivisi tra browser. Deploy Vercel ancora da verificare.
L’HTML autonomo resta una demo locale separata. Vedi README.md e pubblicazione.md.
Amministratori iniziali: Fiori, Pippo, Gigi e Presidente.

## Obiettivo

Un sito per un gruppo di amici che organizza partite di calcetto 5 contro 5,
raccoglie le disponibilità e conserva risultati, valutazioni e statistiche.
Stile richiesto: futuristico, minimale, ispirato all'atmosfera della Champions League.

## Decisioni confermate

- Ogni membro accede con un account personale, tramite email e password.
- L'ingresso nel gruppo avviene su invito.
- Solo gli amministratori possono creare e gestire le partite e inserire i voti.
- L'amministratore può scegliere subito i partecipanti quando crea la partita.
- I partecipanti possono poi confermare facoltativamente la propria disponibilità.
- Un'icona accanto al nome di ogni giocatore mostra se la disponibilità è stata
  confermata: spunta per la conferma, orologio grigio se non ancora confermata.
- La conferma non è un requisito per selezionare i partecipanti, comporre le
  squadre o concludere la partita.
- Si gioca esclusivamente 5 contro 5, registrando le due squadre e il risultato.
- Per i giocatori si registrano gol, voto e l'eventuale assegnazione di MVP.
- I voti vanno da 1 a 10 e ammettono mezzi punti, per esempio 6,5.
- L'MVP viene scelto manualmente da chi inserisce le valutazioni.
- Si registrano risultato e gol fatti; non è prevista una registrazione degli autogol.
- Ogni giocatore ha un ruolo e un'immagine personalizzabile: foto caricata oppure
  scelta da una raccolta di icone.
- Le statistiche richieste sono partite giocate, gol fatti, media voto e numero di MVP.
- Sono previste stagioni separate, con statistiche della singola stagione e complessive.
- Gli amministratori creano le stagioni e scelgono manualmente la stagione di
  ogni partita.

## Elenco iniziale dei giocatori

| Ruolo | Giocatori |
| --- | --- |
| Portiere | Trieu |
| Difensore | Egor, Pippo, Pujia, Presidente, Adriano |
| Centrocampista | Tiziano, Lele, Buba, Michele, Cristian |
| Attaccante | Baldo, Fiori, Gigi, Arossa |

Totale: 15 giocatori. Baldo e Fiori sono due persone distinte.
Nessun account o indirizzo email viene inventato per popolare l'elenco.

## Sezioni richieste

I testi dell'interfaccia devono essere descrittivi e neutrali, senza slogan
motivazionali. I titoli principali sono Home, Partite, Giocatori, Statistiche e Chat.

### Home

- Dati generali del gruppo.
- Ultime partite.
- Accesso alla creazione di una partita per gli amministratori.
- Classifica marcatori o relativo riepilogo.

Proposta di composizione: prossima partita con la propria disponibilità,
indicatori generali, risultati recenti e anteprima delle classifiche.

### Partite

- Creazione e gestione riservate agli amministratori.
- Scelta dei partecipanti da parte dell'amministratore già durante la creazione,
  modificabile successivamente prima di concludere la partita.
- Conferme di disponibilità facoltative e visibili accanto ai nomi, sia nella
  lista dei partecipanti sia nelle squadre.
- Composizione delle squadre e registrazione del risultato.
- Inserimento di gol, voti e MVP.
- Consultazione dello storico.

Flusso aggiornato: creazione della partita con selezione dei partecipanti,
eventuali conferme di disponibilità, composizione delle squadre, registrazione
dei dati finali e conclusione della partita.
Nel modello proposto l'organizzatore è l'amministratore responsabile della
partita; non viene introdotto un ulteriore ruolo con permessi separati.
Da definire i dettagli operativi: data, ora, luogo, annullamenti e rinunce dopo
la convocazione. L'inserimento di partite già disputate è una proposta utile
per recuperare lo storico e non è ancora stato concordato.

### Giocatori

- Elenco completo con ruolo e immagine personale.
- Gli amministratori possono aggiungere nuovi giocatori con nome, ruolo e
  icona oppure foto, senza creare automaticamente account.
- Ogni giocatore può impostare il proprio ruolo, caricare una foto oppure scegliere
  un'icona dalla raccolta.
- Profilo con partite giocate, gol, media voto e MVP.

Proposta: collegare ogni account a un unico giocatore, già presente o aggiunto
successivamente, tramite l'invito, evitando profili duplicati. L'elenco iniziale
non limita la possibilità di accogliere altri giocatori.

### Statistiche

- Classifica marcatori.
- Partite giocate per ciascun giocatore.
- Media voto per ciascun giocatore.
- Numero di MVP per ciascun giocatore.

Le statistiche sono disponibili sia per una singola stagione sia per tutto lo
storico. Gli amministratori creano le stagioni e selezionano manualmente la
stagione quando inseriscono una partita. Le date non determinano automaticamente
l'appartenenza a una stagione.

### Chat

- Una voce Chat nel navigatore apre la conversazione del gruppo.
- Invio di messaggi testuali e menzioni `@nome`, selezionabili dall'elenco dei giocatori.
- Nessuna GIF o foto in chat, per ridurre il traffico. Nessun caricamento o catalogo esterno.
- Sticker integrati basati su emoji, senza file da scaricare. Avatar della chat con icone.
- Nell'anteprima i messaggi sono locali e si possono provare autori diversi con
  il selettore della vista. Nell’app Next.js i messaggi sono condivisi fra gli
  account autenticati; le sessioni si aggiornano ogni tre secondi.
- Le API rifiutano nuovi allegati multimediali. Quelli delle conversazioni precedenti
  vengono rimossi conservando testo, autore, data e menzioni. I messaggi senza testo
  mostrano “Allegato rimosso”. La migrazione conserva giocatori e dati sportivi.

## Regole di integrità

Queste regole sono applicate dall’interfaccia e dal server, salvo le funzionalità
esplicitamente indicate come future.

- La disponibilità a un invito resta distinta dalla presenza effettiva in partita.
- Ritirare una conferma non rimuove il partecipante né modifica squadra, gol,
  voto o MVP. L'orologio grigio significa mancata conferma, non assenza.
- Le statistiche derivano dalle partecipazioni effettive alle partite concluse.
- Lo stesso giocatore non può comparire due volte nella stessa partita.
- Alla conclusione della partita ciascuna squadra contiene cinque giocatori.
- I gol e i punteggi sono numeri interi non negativi.
- L'MVP è unico per partita ed è scelto tra chi ha effettivamente giocato.
- Il voto può mancare: in tal caso la presenza conta e il voto è escluso dalla media.
- Le correzioni ai dati delle partite aggiornano le statistiche derivate.
- Ogni partita appartiene a una sola stagione. La vista complessiva include tutte
  le stagioni senza duplicare le partite.
- La media voto complessiva si calcola su tutti i voti presenti nelle prestazioni,
  evitando di fare la media delle medie delle singole stagioni.
- La stessa identità del giocatore viene mantenuta fra le stagioni, senza creare
  profili separati per ciascun periodo.
- Poiché non si registrano gli autogol, risultato e totale dei gol individuali
  possono differire; una differenza va segnalata senza attribuire gol inventati.
- Funzionalità futura: archiviare un giocatore mantenendo i suoi risultati storici.
- I controlli sui permessi devono essere applicati dal backend oltre che dall'interfaccia.

## Direzione grafica proposta

- Blu notte come fondo, bianco e argento per testi e superfici, accenti azzurri.
- Tipografia leggibile e numeri in evidenza per risultati e classifiche.
- Richiami discreti alle luci dello stadio e animazioni contenute.
- Layout adatto al telefono, con conferma presenza e lettura dei risultati immediate.

## Architettura implementata

- Next.js, React e TypeScript; Node.js 24, PostgreSQL Supabase e deploy Vercel.
- SQLite resta la variante per sviluppo locale/server con disco; è bloccato su Vercel.
- Un account per giocatore, email/password; inviti personali monouso validi 72 ore,
  revocabili. Gli amministratori possono creare link per recuperare la password.
- Password con scrypt e sale casuale; token invito/sessione conservati come digest.
- Sessioni di 14 giorni con cookie HttpOnly, SameSite e Secure su HTTPS. Controllo
  dell’origine delle scritture, limite tentativi accesso e controlli dei permessi server.
- Dati condivisi aggiornati ogni tre secondi a pagina visibile; conflitti sullo stesso
  elemento rifiutati. Le disponibilità personali vengono unite senza perdere le altre.
- Foto dei profili JPG/PNG/WebP fino a 2 MB validate sul server; al momento sono
  ridimensionate fino a 320 px e conservate nel database. La chat contiene soltanto testo, menzioni e sticker emoji.
- Statistiche derivate dalle partite, senza contatori manuali o risultati di esempio.
- Demo HTML autonoma con salvataggio nel browser e simulazione delle viste. Non usa
  il database reale e non consente registrazioni o condivisione con altri dispositivi.

Il progetto Supabase è stato indicato; schema, credenziali e deploy pubblico sono ancora da verificare. I link pubblici devono usare l’indirizzo HTTPS
realmente assegnato all’app. Non vengono inviati messaggi agli amici automaticamente.
Nessun servizio GIF o chiave GIPHY necessario.

## Questioni ancora aperte

- Collegamento dell’account hosting, piano con disco persistente e indirizzo pubblico.
- Modifica o archiviazione amministrativa dell'anagrafica; l'aggiunta dei nuovi
  giocatori è ora disponibile agli amministratori.
- Dettagli del calendario, rinunce e correzioni successive alla convocazione.
- Eventuali stati di disponibilità aggiuntivi oltre alla conferma.

## Verifiche previste per la prima versione

- Un utente senza invito non può entrare nel gruppo.
- Un membro può gestire la propria disponibilità e il proprio profilo.
- Un membro non amministratore non può creare partite o alterare i dati sportivi.
- Un amministratore può creare una stagione e assegnarla manualmente a una partita.
- La data di una partita non modifica automaticamente la stagione selezionata.
- L'amministratore può selezionare dieci persone direttamente nel modulo di creazione,
  senza attendere conferme.
- La partita può essere conclusa con zero conferme; statistiche e controlli 5v5
  restano corretti anche dopo il ricaricamento.
- Confermare la disponibilità non aumenta le partite giocate nelle statistiche.
- Una partita conclusa aggiorna correttamente gol, presenze, media voto e MVP.
- Una correzione non genera duplicati nei conteggi.
- Il filtro stagione include solo le partite appartenenti alla stagione selezionata; la vista
  complessiva comprende tutto lo storico e calcola correttamente la media voto.
- Il giocatore può scegliere un'icona oppure caricare una foto sul proprio profilo.
- Un membro non può sostituire la foto di un altro giocatore.
- Le azioni di creazione funzionano anche nell'anteprima incorporata, che può
  impedire l'invio nativo dei moduli e l'accesso allo storage.
- Se lo storage non è disponibile, un avviso persistente segnala che i dati
  restano temporanei in memoria; le operazioni continuano nella sessione.
- L'aggiunta di un giocatore aggiorna conteggi e liste senza modificare lo storico.
- I dati sono condivisi tra account e rimangono disponibili dopo un nuovo accesso.

Le verifiche automatiche sono documentate nel README. Il test multiutente usa
account e database temporanei; la verifica su hosting pubblico resta da eseguire.
