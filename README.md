# Calcetto

## Versione offline senza installazione

La versione richiesta attualmente è un unico file HTML: aprire `calcetto-offline.html`
in Chrome o Edge, anche senza connessione. Partite, giocatori, voti e statistiche
si salvano nel browser e restano dopo la chiusura. “Backup e dati” permette di
esportare e ripristinare un archivio JSON. Nessun account o servizio cloud richiesto.

`npm run offline:export` genera `artifacts/calcetto-offline.html` e la copia
scaricabile `public/calcetto-offline.html`. `npm run test:offline` verifica il flusso.
Leggere [docs/offline.md](docs/offline.md) per salvataggio e backup.

## Versione online precedente

Sito privato per il gruppo: partite 5 contro 5, convocazioni e conferme facoltative,
giocatori, stagioni, statistiche e chat con testo, menzioni e sticker emoji.
Nessuna partita o statistica di esempio: all’avvio ci sono i 15 giocatori concordati.

## Pubblicazione gratuita

Il backend supporta **Vercel + Supabase**: tutte le informazioni persistenti sono nel
database remoto, con inviti personali e permessi sul server. La configurazione è in
`vercel.json`; lo schema protetto è in `supabase/schema.sql`.
Seguire [docs/pubblicazione.md](docs/pubblicazione.md) per SQL, chiave server, importazione
Vercel e primi link. Gli amministratori iniziali sono Fiori, Pippo, Gigi e Presidente.
I piani gratuiti restano soggetti a quote e condizioni dei provider.

Servono `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e il dominio pubblico `APP_URL`.
Su Vercel, se APP_URL manca, si usa `VERCEL_PROJECT_PRODUCTION_URL` quando disponibile.
La sola email della dashboard non collega le credenziali e non registra un giocatore.
L’account dell’app è creato con l’invito; l’autenticazione usa scrypt e tabelle private
su Supabase, non Supabase Auth. Non serve un servizio di invio email.

## Sviluppo e verifiche

Richiede Node.js 24 e npm. Usare il checkout esistente, senza creare worktree.

```sh
npm ci --cache /workspace/.cache/npm
npm run dev
```

Le variabili sono descritte in `.env.example`; inserire i valori segreti solo nelle
impostazioni sicure. Con SUPABASE_URL impostato il server usa Supabase e rifiuta un
collegamento incompleto. Senza SUPABASE_URL lo sviluppo locale usa SQLite in `data/`:
serve APP_URL con l’origine del server locale e, facoltativamente, CALCETTO_DB_PATH.
Su Vercel la modalità SQLite è bloccata, per evitare di perdere dati sul filesystem
temporaneo. Dockerfile/render.yaml restano una variante a server singolo con disco.

```sh
npm run typecheck
npm run test:config
npm run build
npm run test:live
npm run test:supabase
```

Le suite usano database temporanei e browser separati con Chromium (`/usr/bin/chromium`,
override PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH). test:supabase richiede Docker: esegue il
vero schema SQL su PostgreSQL e usa un adattatore HTTP locale del contratto RPC.
Distingue i test locali dalla verifica del progetto Supabase pubblico, che richiede la
chiave e lo schema applicato. Non usare dati di produzione nei test.

## Accessi e inviti

Ogni account è collegato a un giocatore. Solo gli amministratori gestiscono stagioni,
partite, squadre, risultati, voti, gol e MVP. I giocatori aggiornano il proprio profilo,
confermano la propria disponibilità e scrivono con la propria identità in chat.

Con APP_URL uguale al sito pubblico e database già configurato, `npm run admin:invite`
genera i primi quattro link in file privati `data/primo-accesso-NOME.txt`. Non stampa
token e non invia messaggi. Dopo il primo amministratore registrato si usa **Inviti**
nel sito. I link durano 72 ore, sono monouso, revocabili e collegati a un solo giocatore.
Un nuovo link sostituisce quello precedente dello stesso tipo. Condividere in privato:
chi riceve il link può reclamare l’account di quel giocatore.

Gli amministratori possono creare link di recupero password per account esistenti.
Il giocatore deve usare la stessa email; il cambio chiude tutte le vecchie sessioni.
Password con scrypt e sale casuale; token casuali memorizzati soltanto come digest.
Cookie HttpOnly, SameSite=Lax, Secure su HTTPS, sessioni 14 giorni. Controllo origine,
limite tentativi, accesso alle tabelle privato e funzione RPC riservata alla chiave server.

## Regole e traffico

Fino a dieci partecipanti selezionati dall’amministratore durante la creazione o in
seguito. Le conferme sono facoltative: ritirarle non cambia squadra, convocazione o
statistiche. Per concludere servono cinque giocatori per squadra; voti 1–10 anche con
mezzi punti, S.V. escluso dalla media, MVP scelto dall’amministratore. Nessun autogol;
risultato e somma individuale possono differire con avviso. Statistiche per stagione
e complessive, derivate dalle partite concluse.

Le modifiche sono salvate sul server; le altre sessioni controllano novità ogni tre
secondi quando visibili. Senza novità non vengono ritrasmessi i dati dal database o al
browser. I conflitti sono segnalati e le conferme concorrenti vengono unite.
La chat conserva testo, menzioni e sticker integrati senza file immagine. Le API
rifiutano GIF e foto; i vecchi allegati vengono ripuliti conservando il testo, o
sostituiti da “Allegato rimosso”. La chat usa icone, senza foto degli avatar.
Le foto dei profili restano nelle altre sezioni: JPG/PNG/WebP fino a 2 MB in ingresso,
ridimensionati a 320 px prima del salvataggio. GIPHY non è necessario.

## Backup e demo

`npm run backup -- /percorso/privato/calcetto.json` esporta un backup Supabase coerente.
Conservarlo in privato fuori dal repository. Per il database SQLite locale usare un
nome `.sqlite`. I file sotto `data/`, le chiavi e i backup non devono entrare in Git.

La demo HTML è distinta dagli account e dai dati condivisi:

```sh
npm run preview:export
python3 -m http.server 3001 --bind 127.0.0.1 --directory artifacts
# In un altro terminale:
npm run test:smoke
npm run test:preview
npm run test:chat
```

`artifacts/calcetto-anteprima.html` e v5 simulano le viste con dati nel browser; non
registrano utenti, non condividono dati e non importano automaticamente le vecchie
prove nel gruppo reale. In sandbox senza storage, la demo usa memoria e lo segnala.
