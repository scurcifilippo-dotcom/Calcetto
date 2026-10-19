# Pubblicare gratis con Vercel e Supabase

Il backend remoto è implementato: Vercel esegue Next.js e tutte le informazioni
persistenti risiedono in PostgreSQL su Supabase, inclusi account, sessioni e inviti.
I test usano lo schema SQL reale su PostgreSQL locale e un adattatore HTTP del
contratto Supabase. Non sono una verifica del progetto Supabase dell’utente.
L’accesso al progetto reale e il deploy richiedono le impostazioni indicate sotto.

## 1. Preparare Supabase

Il Project URL fornito dall’utente è `https://kqjvhtxwdctlmjuvvebh.supabase.co`.

1. Nel progetto aprire **SQL Editor → New query**, incollare il contenuto completo
   di `supabase/schema.sql` ed eseguirlo. Si può rieseguire lo schema: non elimina
   account, inviti, stagioni o partite esistenti.
2. In **Project Settings → API Keys** recuperare una chiave server `service_role`
   (Legacy API keys), oppure una nuova chiave secret del progetto. Salvarla nelle
   impostazioni sicure come `SUPABASE_SERVICE_ROLE_KEY`, mai in chat o nel repository.
   La chiave publishable/anon non è sufficiente.

Le tabelle risiedono nello schema privato `calcetto_private`, con RLS e senza accesso
per i ruoli anon/authenticated. Soltanto la chiave server può eseguire la funzione
`public.calcetto_rpc`. Non aggiungere policy pubbliche o esporre lo schema privato.
Il server verifica account e permessi nelle API; inviti e cambi password sono atomici
nel database. Non sono richiesti SMTP o email automatiche.

**Gli account dell’app non sono gli account della dashboard Supabase** e non usano
Supabase Auth: l’autenticazione email/password già implementata usa scrypt, cookie
HttpOnly e tabelle private. Le registrazioni non compaiono in Authentication → Users.
L’email usata per Vercel/Supabase non registra automaticamente un giocatore nell’app.

## 2. Importare il progetto in Vercel

1. Il codice deve essere presente nel repository GitHub `scurcifilippo-dotcom/Calcetto`.
2. Dal proprio account Vercel scegliere **Add New → Project**, collegare GitHub se
   necessario e importare quel repository. Root directory: radice, framework Next.js,
   Node.js 24. Il file `vercel.json` contiene la configurazione di installazione.
3. Aggiungere le variabili al progetto Vercel, almeno nell’ambiente Production:

   | Nome | Valore |
   | --- | --- |
   | `SUPABASE_URL` | Il Project URL sopra |
   | `SUPABASE_SERVICE_ROLE_KEY` | Chiave server privata, contrassegnata Sensitive |
   | `APP_URL` | L’origine HTTPS effettiva del sito, appena disponibile |

   Nessuna chiave deve iniziare per `NEXT_PUBLIC_`. Non impostare `CALCETTO_DB_PATH`:
   il filesystem di Vercel non è il database. Se `APP_URL` manca, il server usa il
   dominio di produzione fornito da `VERCEL_PROJECT_PRODUCTION_URL`, se disponibile;
   dopo il primo deploy è comunque consigliato impostare esplicitamente `APP_URL`.
4. Eseguire il deploy e aprire il dominio `.vercel.app` assegnato: non serve acquistare
   un dominio. Se si modifica una variabile, effettuare un nuovo deploy per applicarla.
5. Verificare `/api/health`: deve restituire `{"ok":true}`. La pagina principale deve
   mostrare l’accesso al gruppo. Un errore di collegamento richiede controllo della
   chiave server e dell’esecuzione dello schema SQL, non l’apertura delle policy RLS.

I piani gratuiti sono soggetti alle condizioni dei provider, quote e possibili pause
per inattività. Non è stato attivato alcun piano a pagamento. Non abilitare componenti
aggiuntivi a pagamento per eseguire questa configurazione.

## 3. Creare i quattro primi inviti

In un terminale privato del progetto con `SUPABASE_URL`, chiave server e **APP_URL
uguale all’indirizzo pubblico** già configurati, eseguire:

```sh
npm run admin:invite
```

Genera quattro file privati sotto `data/`, per Fiori, Pippo, Gigi e Presidente:
`primo-accesso-fiori.txt`, `primo-accesso-pippo.txt`, `primo-accesso-gigi.txt` e
`primo-accesso-presidente.txt`. I link contengono token personali: copiarli in privato,
consegnare ciascuno soltanto al destinatario, quindi cancellare i file locali.
Il comando non stampa token e non invia messaggi agli amici. Vercel non fornisce una
shell persistente: il comando va eseguito da questo ambiente di sviluppo o in locale.

Ogni amministratore apre il proprio link e sceglie email e password. I link sono
monouso, validi 72 ore e revocabili. Prima del primo amministratore registrato il
comando può rigenerarli; dopo il primo accesso gli altri inviti si gestiscono da
**Inviti** nel sito. I restanti link iniziali continuano a funzionare fino alla scadenza.
L’amministratore crea una stagione, una partita e seleziona fino a dieci partecipanti;
le conferme dei giocatori sono facoltative. Per un nuovo amico: aggiungere il giocatore,
poi generare il suo link in Inviti.

## Dati e traffico

La chat contiene soltanto testo, menzioni e sticker emoji/CSS. GIF e foto non sono
ammesse, nemmeno tramite API. Le foto dei profili vengono ridimensionate fino a 320 px
prima del salvataggio; restano disponibili nelle sezioni dei giocatori.
Gli aggiornamenti usano una versione dei dati: in assenza di novità Supabase non
restituisce il contenuto completo e il sito risponde 304, riducendo il traffico.
Un conflitto sullo stesso elemento viene segnalato; le conferme individuali concorrenti
vengono unite con un nuovo tentativo, senza perdere quelle degli altri.

## Backup privato

Con la chiave server configurata:

```sh
npm run backup -- /percorso/privato/backup-calcetto.json
```

Produce una copia coerente dei dati, account, sessioni e inviti. Conservarla in uno
spazio privato esterno al progetto e al provider; contiene hash password e sessioni.
Il backup non è una procedura di ripristino automatico: un ripristino deve avvenire in
una transazione SQL privata a sito fermo, conservando una copia dello stato corrente.
La variante SQLite locale usa invece `npm run backup -- /percorso/backup.sqlite`.

## Verifiche prima e dopo la pubblicazione

`npm run typecheck`, `npm run build`, `npm run test:live` e `npm run test:supabase`.
Quest’ultimo richiede Docker e PostgreSQL; crea un database temporaneo e un adattatore
HTTP locale della funzione RPC. Verifica isolamento di anon/authenticated, registrazioni,
inviti, permessi, concorrenza, cache, chat, foto compatte, backup e riavvio. Non contatta
il progetto Supabase dell’utente e non dimostra da solo che il deploy sia riuscito.

Dopo il deploy ripetere accesso e chat da due dispositivi reali, verificare un invito
usato, confermare una disponibilità, registrare una partita e controllare i dati dopo
un nuovo deploy. La pubblicazione dell’ambiente Codex non pubblica il sito.
