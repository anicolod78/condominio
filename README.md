# Portale Condominio

Piccolo portale riservato ai condomini: **bacheca avvisi**, **archivio documenti**, **sondaggi** ed **elenco condomini**.

- **Frontend**: HTML e JavaScript statici in `web/`, pubblicati su **GitHub Pages**. Nessuna build.
- **Backend**: **Supabase** (piano gratuito) per login via email, database Postgres e archivio file.
- **Sicurezza**: accesso solo su invito. I permessi sono applicati dal database tramite Row Level Security (`supabase/schema.sql`).

```
condominio/
├── supabase/
│   ├── schema.sql               tabelle, permessi (RLS), bucket file
│   ├── 002_elenco_condomini.sql elenco condomini e profilo personale
│   ├── 003_sicurezza_funzioni.sql correzioni del Security Advisor
│   ├── 004_data_documenti.sql   data di riferimento dei documenti
│   └── 005_anagrafica_millesimi.sql anagrafica condomini e millesimi
├── web/                         sito pubblicato su GitHub Pages
│   ├── config.js                ← URL e chiave pubblica Supabase
│   ├── index.html
│   ├── css/style.css
│   └── js/  app.js, supabase.js, ui.js, views/*.js
└── .github/workflows/
    ├── deploy.yml               pubblicazione automatica su Pages
    └── keepalive.yml            evita la pausa del progetto Supabase gratuito
```

**Ruoli**
| | Condomino | Admin |
|---|---|---|
| Leggere avvisi e scaricare documenti | ✔ | ✔ |
| Votare (e cambiare voto finché il sondaggio è aperto) | ✔ | ✔ |
| Vedere l'elenco condomini (nome, unità e millesimi) | ✔ | ✔ |
| Modificare il proprio telefono e scegliere se mostrare i contatti | ✔ | ✔ |
| Pubblicare avvisi, caricare documenti, creare e chiudere sondaggi | | ✔ |
| Gestire l'anagrafica (anche senza email), i millesimi, gli inviti e i ruoli | | ✔ |

Nell'elenco condomini email e telefono sono visibili agli altri solo se la persona lo sceglie dal proprio profilo. Il consenso è disattivato per impostazione predefinita.

**Anagrafica e millesimi.** L'elenco dei condomini è indipendente dagli account: una scheda può esistere senza email e senza accesso al portale. Quando qualcuno accetta un invito, il suo account si collega alla scheda con la stessa email. Nei sondaggi, a ogni opzione si sommano i millesimi delle schede di chi l'ha votata. Le percentuali sono calcolate sul totale dei millesimi in anagrafica. Chi ha accesso al portale ma 0 millesimi (es. un familiare) conta nel numero dei voti, non nei millesimi.

I voti sono riservati: ognuno vede solo il proprio. I risultati complessivi compaiono dopo aver votato o alla chiusura del sondaggio. Anche l'admin vede solo i totali.

---

## Messa in esercizio passo passo

### 1. Crea il progetto Supabase
1. Registrati su <https://supabase.com> (va bene anche l'accesso con GitHub).
2. **New project**: scegli un nome (es. `condominio`), una password robusta per il database (conservala) e una **Region europea** (es. *Central EU – Frankfurt*), utile per il GDPR.
3. Attendi un paio di minuti che il progetto sia pronto.

### 2. Crea il database
1. Menu **SQL Editor** → **New query**.
2. Incolla tutto il contenuto di [`supabase/schema.sql`](supabase/schema.sql) e premi **Run**. Poi fai lo stesso, ognuno in una nuova query, con [`supabase/002_elenco_condomini.sql`](supabase/002_elenco_condomini.sql), [`supabase/003_sicurezza_funzioni.sql`](supabase/003_sicurezza_funzioni.sql), [`supabase/004_data_documenti.sql`](supabase/004_data_documenti.sql) e [`supabase/005_anagrafica_millesimi.sql`](supabase/005_anagrafica_millesimi.sql). Gli script vanno eseguiti in ordine, una volta sola.
3. Controlla che in **Table Editor** compaiano `profiles`, `announcements`, `documents`, `polls`, `poll_options` e `votes`, e che in **Storage** ci sia il bucket `documenti`.

### 3. Configura l'autenticazione
In **Authentication**:
1. **Sign In / Providers** → *Email*: lascia attivo **Email**. Disattiva **Allow new users to sign up**: così entra solo chi è stato invitato.
2. **Emails → SMTP Settings**: configura un **SMTP personalizzato**. Il servizio email integrato di Supabase invia messaggi solo agli indirizzi del tuo team Supabase, con limiti molto bassi: senza SMTP i condomini non riceverebbero inviti né link di accesso. Opzioni gratuite:
   - **Brevo** (300 email al giorno gratis). Basta verificare l'indirizzo mittente, non serve un dominio. Host `smtp-relay.brevo.com`, porta `587`, utente e chiave SMTP dalla sezione *SMTP & API* di Brevo.
   - **Gmail** con una *password per le app* (serve la verifica in due passaggi). Host `smtp.gmail.com`, porta `587`. Adatto a volumi piccoli.
3. **Emails → Templates**: sostituisci il modello **Magic Link** con quello in italiano riportato più sotto. Contiene sia il link sia il **codice di accesso** (`{{ .Token }}`): senza questo modello chi chiede il codice non lo riceve. Il modello *Invite user* è facoltativo.
4. Gli **URL** li configuri al passo 6, quando conosci l'indirizzo del sito.

### 4. Collega il sito a Supabase
1. In Supabase vai su **Project Settings → API Keys** (oppure *Connect*) e copia:
   - **Project URL**, es. `https://abcdefgh.supabase.co`
   - la chiave **Publishable** (`sb_publishable_…`) oppure, nei progetti con le chiavi legacy, la chiave **anon public**.
2. Inseriscile in [`web/config.js`](web/config.js). Qui puoi anche impostare `NOME_CONDOMINIO` e le categorie dei documenti.

> ⚠️ Non usare mai la chiave **secret / service_role**: aggirerebbe tutte le protezioni. La chiave pubblica invece può stare nel repository senza problemi.

### 5. Pubblica su GitHub Pages
1. Su GitHub crea un nuovo repository, es. `condominio`. Può essere pubblico: i dati stanno su Supabase, non nel repository. Un repository privato con Pages richiede un piano GitHub a pagamento.
2. Dalla cartella del progetto:
   ```bash
   git init -b main
   git add .
   git commit -m "Portale condominio"
   git remote add origin https://github.com/TUO-UTENTE/condominio.git
   git push -u origin main
   ```
3. Nel repository vai su **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. In **Actions** rilancia il workflow *Pubblica su GitHub Pages* (**Run workflow**) se il primo tentativo è partito prima di questa impostazione.
5. Il sito sarà su `https://TUO-UTENTE.github.io/condominio/`.

### 6. Imposta gli URL di reindirizzamento
In Supabase: **Authentication → URL Configuration**
- **Site URL**: `https://TUO-UTENTE.github.io/condominio/`
- **Redirect URLs**: aggiungi lo stesso indirizzo e, per le prove in locale, `http://localhost:8000/`

Il link contenuto nelle email di invito e di accesso rimanda qui.

### 7. Crea il primo amministratore (tu)
1. **Authentication → Users → Add user → Send invitation**, con la tua email.
2. Apri il link nell'email: arrivi sul portale già autenticato.
3. In **SQL Editor** esegui:
   ```sql
   update public.profiles set role = 'admin' where email = 'tua@email.it';
   ```
4. Ricarica il portale: compare la voce **Gestione**, divisa nelle schede Avvisi, Documenti, Sondaggi e Condomini.

### 8. Pubblica la funzione per gli inviti
Questa funzione permette all'admin di invitare e rimuovere i condomini direttamente dal portale.
1. In Supabase vai su **Edge Functions → Deploy a new function → Via Editor**.
2. Come nome inserisci esattamente `gestione-utenti`.
3. Sostituisci il codice di esempio con il contenuto di [`supabase/functions/gestione-utenti/index.ts`](supabase/functions/gestione-utenti/index.ts) e premi **Deploy function**.
4. Nei **Details / Settings** della funzione **disattiva "Verify JWT"** (*Enforce JWT verification*) e salva. Il controllo di chi la chiama, cioè utente valido e ruolo admin, lo fa la funzione stessa.

La chiave secret non va configurata: Supabase la mette a disposizione della funzione in automatico.

### 9. Attiva l'accesso con Google (facoltativo)
Funziona per chi ha un account Google (Gmail o Google Workspace) **con lo stesso indirizzo con cui è stato invitato**. Gli account Google non invitati vengono rifiutati, perché le nuove registrazioni sono disattivate.

**Su Google Cloud** (<https://console.cloud.google.com>, gratuito):
1. Crea un nuovo progetto, es. `portale-condominio`.
2. Vai su **Google Auth Platform → Branding**: inserisci il nome dell'app (es. "Portale Condominio") e l'email di assistenza. Non caricare un logo: richiederebbe la verifica di Google.
3. In **Audience** scegli il tipo **External**, poi premi **Publish app** per metterla *In production*. In modalità *Testing* possono entrare solo gli utenti di test. Si usano solo i dati di base (email e nome), quindi non serve la verifica di Google.
4. In **Clients → Create client** scegli il tipo **Web application**:
   - **Authorized JavaScript origins**: `https://TUO-UTENTE.github.io`
   - **Authorized redirect URIs**: `https://TUO-PROGETTO.supabase.co/auth/v1/callback`. L'indirizzo esatto lo trovi anche in Supabase, nella scheda del provider Google.
5. Copia **Client ID** e **Client secret**.

**Su Supabase**: **Authentication → Sign In / Providers → Google**. Attivalo, incolla Client ID e Client secret e salva.

Nota: nella schermata di consenso Google comparirà l'indirizzo `TUO-PROGETTO.supabase.co`. Per mostrare un dominio personalizzato serve un piano Supabase a pagamento.

### 10. Invita i condomini
- Dal portale, in **Gestione → Condomini**:
  - aggiungi le schede di tutti i condomini con nome, unità e **millesimi**. L'email è facoltativa;
  - per chi ha un'email premi **Invita**, oppure spunta "Invia subito l'invito" quando crei la scheda.
- In alternativa: **Authentication → Users → Add user → Send invitation**. Se esiste già una scheda con la stessa email, l'account si collega a quella; altrimenti ne viene creata una nuova.
- Controlla che il totale dei millesimi sia 1000: la pagina lo segnala se non torna.
- Dallo stesso elenco puoi correggere nome, unità e ruolo, oppure **Rimuovere** chi lascia il condominio.
- Agli accessi successivi, dalla pagina di login si può:
  - premere **Accedi con Google**;
  - oppure inserire la propria email e poi aprire il link ricevuto **o** digitare il codice contenuto nell'email. Il codice è comodo quando si legge la posta sul telefono ma si usa il portale dal computer.

  Non ci sono password.

### 11. Prova in locale (facoltativo)
Serve un qualsiasi server statico sulla porta 8000 che pubblichi la cartella `web/`, per esempio:
- **VS Code** con l'estensione *Live Server* (imposta la porta 8000 in `liveServer.settings.port`);
- **Python**: `python -m http.server 8000` dentro `web/`;
- **Node 18+**: `npx http-server web -p 8000`.

Poi apri <http://localhost:8000/>. Non aprire `index.html` con doppio clic: i moduli JavaScript non funzionano da `file://`.

---

## Manutenzione

- **Pausa del progetto gratuito**: Supabase mette in pausa i progetti gratuiti dopo 7 giorni senza richieste. Il workflow `keepalive.yml` lo evita chiamando il database ogni 3 giorni. GitHub però disattiva i workflow pianificati dopo 60 giorni senza commit: se ricevi l'avviso, riattivalo da **Actions**. Se il progetto va comunque in pausa, lo riattivi con **Restore** dalla dashboard Supabase.
- **Backup**: il piano gratuito non include backup scaricabili. Ogni tanto esporta i dati:
  - tabelle: **Table Editor → Export to CSV**, oppure `pg_dump` con la stringa di connessione indicata in *Connect*;
  - file: conserva una copia locale dei documenti che carichi.
- **Limiti del piano gratuito** (indicativi): 500 MB di database, 1 GB di file, 50.000 utenti attivi al mese. Più che sufficienti per un condominio.
- **Aggiornamenti del sito**: ogni `git push` su `main` che tocca `web/` ripubblica il sito in automatico.

## Privacy (GDPR) — promemoria
- Il portale tratta dati personali (email, nomi, unità, documenti). Aggiungi un'informativa essenziale: chi è il titolare, quali dati, per quale finalità, per quanto tempo.
- Carica solo documenti destinati a tutti i condomini. Evita, o anonimizza, quelli con dati di singole persone (morosità, contenziosi, dati sanitari).
- Quando qualcuno vende o lascia l'appartamento, vai in **Gestione → Condomini**. Usa **Revoca accesso** per togliere l'accesso al portale lasciando la scheda, oppure **Elimina** per cancellare anche la scheda. In entrambi i casi i suoi voti vengono cancellati.
- I sondaggi sono **consultivi** e non sostituiscono le delibere dell'assemblea.

## Modelli email in italiano

**Invite user** — oggetto: `Invito al portale del condominio`
```html
<h2>Benvenuto/a nel portale del condominio</h2>
<p>Sei stato/a invitato/a ad accedere al portale riservato ai condomini.</p>
<p><a href="{{ .ConfirmationURL }}">Accedi al portale</a></p>
<p>Per gli accessi successivi puoi usare "Accedi con Google" oppure inserire la tua email nella pagina del portale: riceverai un link e un codice.</p>
```

**Magic Link** (necessario per il codice di accesso) — oggetto: `Il tuo accesso al portale del condominio`
```html
<h2>Accesso al portale del condominio</h2>
<p><a href="{{ .ConfirmationURL }}">Clicca qui per entrare</a></p>
<p>Oppure inserisci questo codice nella pagina di accesso:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>Link e codice sono validi per un solo accesso e scadono dopo poco tempo. Se non hai richiesto l'accesso, ignora questa email.</p>
```

## Possibili estensioni
- Notifiche email ai condomini quando esce un nuovo avviso (Supabase Edge Function + Brevo).
- Voto "per unità" invece che "per persona", aggiungendo una tabella `units`.
- Calendario di manutenzioni e scadenze.
- Segnalazione guasti da parte dei condomini.
