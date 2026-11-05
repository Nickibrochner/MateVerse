# MateVerse 🪐

**MateVerse** samler alle mates ét sted. Du åbner hubben og vælger appen derfra. Brugerne deles af alle mates. Hver mate har sine egne sider i frontenden og sit eget API-plugin i backenden.

Stakken er den samme som i DND Vault: Vue 3 og Bun/Elysia med SQLite, og det hele køres med Docker Compose.

## Apps

| Mate | Indhold | Kilde |
| --- | --- | --- |
| 📈 **Stockmate** | Porteføljer med depoter, kurser fra Yahoo Finance, realiseret og urealiseret gevinst i DKK | Flask-udgaven |
| 💰 **Econmate** | Faste budgetter pr. måned og projekter med udlæg, udligning og forslag til overførsler | Tauri-udgaven |
| 🐷 **Savemate** | Opsparingsmål med fremdrift, månedligt behov, faste indbetalinger, engangsbeløb og hævninger | Familia (Flask) |
| 🌳 **Kinmate** | Slægtsforskning: stamtræ, anecirkel, kort, tidslinje, kilder, forskningslog, datakvalitet og GEDCOM | Tauri-udgaven |
| 📋 **KanMate** | Kanban med projekter, deadlines, prioritet, underopgaver, arkiv og papirkurv | Tauri-udgaven |

### Hubben (`/`)

- Kort for hver mate. Stockmate viser den samlede porteføljeværdi live.
- Fælles brugere (Nicki og Solveig oprettes automatisk), og nye brugere kan tilføjes.
- Topbaren viser hvilken mate du er i og har en menu til at skifte mate. Accentfarven skifter med maten.

### Stockmate (`/stockmate`)

- Beholdninger pr. aktie og depot med gennemsnitlig købspris inkl. kurtage, aktuel kurs, værdi og urealiseret gevinst/tab.
- Transaktionshistorik med realiseret gevinst/tab. Et salg kan ikke være større end beholdningen på datoen.
- Tickersøgning, automatisk kurs og valuta, standardkurtage på 1 % og valutakurs gemt pr. transaktion.

### Econmate (`/econmate`)

- **Budgetter:** faste udgifter med frekvens (månedlig, kvartalsvis, årlig …) omregnet til pr. måned. Fordeling pr. kategori og pr. person.
- **Projekter:** udlæg, budget, saldo pr. deltager, forslag til overførsler og registrerede udligninger.
- Deltagerne er hubbens brugere. "Fælles" udgifter deles ligeligt. Søgning, filtre, sortering og CSV-eksport.

### Savemate (`/savemate`)

- Mål med ikon, ejer (bruger eller fælles), målbeløb og dato.
- Månedligt behov pr. mål og samlet. Status (på sporet/bagud) ud fra de seneste tre måneders opsparing.
- Generelle engangsbeløb uden mål trækkes fra det samlede behov.

### Kinmate (`/kinmate`)

- Personer med billede, relationer med automatisk modpart (fx søn ↔ far), dubletter og forslag til manglende relationer.
- Stamtræ med zoom, panorering og slægtskabssti (shift+klik), anecirkel, tidslinje og kort over sogne (OpenStreetMap/Nominatim).
- Kilder, forskningslog, datakvalitetstjek, fletning af persondubletter, AI-prompt og arkiv-opslag.
- GEDCOM-import/-eksport og backup i samme JSON-format som Tauri-udgaven.

### KanMate (`/kanmate`)

- Projekter med farver og fremdrift. Board med træk-og-slip og pile, filtrering på person.
- Opgaver med prioritet, deadline, tildeling og underopgaver. Deadline-oversigt, arkiv og papirkurv med gendannelse.

## Kom i gang

Kræver Docker med Docker Compose.

```bash
docker compose up --build
```

- Hub og frontend: <http://localhost:5173>
- Backend (API): <http://localhost:3000>

Databasen er en SQLite-fil i `data/mateverse.sqlite`, og Kinmates billeder ligger i `data/kinmate-billeder/`. Mappen er mountet ind i backend-containeren, så data overlever genstarter, og den committes ikke.

### Overførsel af data

- **Kinmate:** lav en backup i den gamle Tauri-app (Indstillinger → Backup) og gendan filen under Kinmate → Indstillinger. Billeder skal tilføjes igen.
- **Stockmate:** se nedenfor.
- **Econmate, Savemate og KanMate:** importscripts kommer, når data fra de gamle apps er klar.

### Import fra den gamle Flask-udgave af Stockmate

Data fra den tidligere Flask-app (`stockmate.db`) kan flyttes over:

```bash
cd backend && bun install && bun run import-flask /sti/til/stockmate.db
```

Brugere matches på navn. Scriptet kan køres flere gange, fordi transaktioner der allerede er importeret, springes over. Den gamle app gemte ingen valutakurs, så transaktioner i fremmed valuta får dagens kurs.

## Teknologi

| Del | Teknologi |
| --- | --- |
| Frontend | Vue 3 (`<script setup>`), Pinia, Vue Router, Tailwind CSS, Vite, TypeScript |
| Backend | Bun, Elysia |
| Database | SQLite via `bun:sqlite` |
| Markedsdata | Yahoo Finance (kurser, valutakurser og tickersøgning) |
| Kort | Leaflet med OpenStreetMap, geokodning via Nominatim (Kinmate) |

## Projektstruktur

```text
docker-compose.yml
data/                           SQLite-database og billeder (lokalt, committes ikke)
backend/
  src/index.ts                  Hubbens API: /health, /users – og monterer hver mate
  src/db.ts                     Fælles database og nummererede migrationer
  src/lib/http.ts               HttpError og fejlhåndtering, som alle mates bruger
  src/mates/<mate>/routes.ts    Hver mates endpoints under /<mate>
  src/mates/stockmate/          portfolio.ts (regnemotor), market.ts (Yahoo Finance)
  src/mates/econmate/calc.ts    Månedlige beløb, saldi og forslag til overførsler
  src/mates/savemate/calc.ts    Månedligt behov og status
  src/mates/kinmate/            relations.ts (typer, modparter, forslag), gedcom.ts, prompt.ts
  src/mates/**/*.test.ts        Tests (bun test)
  scripts/import-flask.ts       Import fra den gamle Stockmate (Flask)
frontend/src/
  mates.ts                      Registret over mates – hub og topbar bygges herfra
  api.ts                        Fælles fetch-hjælper og hub-API (brugere)
  stores/users.ts               Fælles brugere (Pinia)
  lib/                          Formatering (format.ts) og CSV-eksport (csv.ts)
  components/                   Fælles komponenter: Modal, ConfirmButton, MemberPicker, BarList, MateSwitcher
  views/Hub.vue                 Hubbens forside
  mates/<mate>/
    routes.ts                   Matens ruter (/<mate>/…)
    api.ts                      Typer og kald til /<mate>
    views/, components/         Matens sider og komponenter
  mates/kinmate/store.ts        Kinmates data i én Pinia-store, som alle siderne deler
```

## Arkitektur

### Hub og mates

- **Frontend:** `src/mates.ts` er registret. En mate har id, navn, ikon, accentfarve og status. Ruterne sætter `meta.mate`, og App.vue bruger den til topbaren og accentfarven (`--accent` i `tailwind.config.js`).
- **Backend:** hver mate er et Elysia-plugin med eget præfiks (`/stockmate`). Det monteres i `src/index.ts`.
- **Database:** én fælles fil. Tabellen `user` er fælles, og hver mates tabeller har præfiks (`stockmate_…`, `econmate_…`, `savemate_…`, `kinmate_…`, `kanmate_…`).
- **Fælles komponenter:** `Modal`, `ConfirmButton` (to klik for at slette), `MemberPicker` (vælg hubbrugere) og `BarList` (simple søjlediagrammer) bruges på tværs af mates.

**Sådan tilføjes en ny mate**, fx Foodmate:

1. Backend: opret `backend/src/mates/foodmate/routes.ts` med `new Elysia({ prefix: '/foodmate' })`, og tilføj `.use(foodmate)` i `src/index.ts`.
2. Database: tilføj en ny migration sidst i `MIGRATIONS` i `src/db.ts`, med tabeller der hedder `foodmate_…`.
3. Frontend: opret `frontend/src/mates/foodmate/` med `routes.ts`, `api.ts` og `views/`, og læg ruterne ind i `src/router/index.ts`.
4. Sæt status til `'ready'` i `src/mates.ts`.

### Stockmates regnemotor

Beholdninger gemmes ikke. De udledes hver gang af transaktionerne (`replay()` i `portfolio.ts`):

- **Køb** lægger antal og kostpris (inkl. kurtage) til positionen for aktie og depot.
- **Salg** trækker gennemsnitlig kostpris × antal fra. Den realiserede gevinst er salgssum − kurtage − kostpris.
- Hver transaktion gemmer sin egen **valutakurs** (`fx_rate`, DKK pr. enhed). Så ændrer historiske beløb sig ikke, når valutakursen flytter sig. Kursen hentes automatisk og kan rettes.

Hver ændring kontrolleres i en databasetransaktion. Gør ændringen et salg ugyldigt, rulles den tilbage, og API'et svarer `422` med en forklaring.

## API

| Metode | Sti | Beskrivelse |
| --- | --- | --- |
| GET | `/health` | Sundhedstjek |
| GET/POST | `/users` | Fælles brugere |
| GET | `/stockmate/meta` | Depottyper og standardkurtage |
| GET | `/stockmate/overview` | Værdi og gevinst/tab pr. bruger |
| GET | `/stockmate/users/:id/portfolio` | Beholdninger, transaktioner og totaler |
| GET | `/stockmate/stocks` | Kendte aktier |
| GET | `/stockmate/search?q=` | Tickersøgning |
| GET | `/stockmate/quote/:ticker` | Aktuel kurs, valuta og valutakurs |
| GET | `/stockmate/fx/:currency` | Valutakurs til DKK |
| POST | `/stockmate/refresh` | Tøm kurs-cachen |
| POST | `/stockmate/transactions` | Opret transaktion |
| GET/PUT/DELETE | `/stockmate/transactions/:id` | Hent, ret eller slet transaktion |

De øvrige mates følger samme mønster under `/econmate`, `/savemate`, `/kinmate` og `/kanmate`. Se den enkelte mates `routes.ts`.

## Udvikling

- **Backend:** `bun run --watch` genstarter ved ændringer. Containeren opdager ikke altid ændringer via bind-mountet på Windows. Kør så `docker restart mateverse-backend-1`.
- **Frontend:** Vite hot-reloader. Containeren har sine egne `node_modules`. Kør `npm install` i `frontend/` lokalt, så editoren får typerne.
- **Tests:** `cd backend && bun test`
- **Type-check:** `cd frontend && npx vue-tsc --noEmit` og `cd backend && npx tsc --noEmit`
- **Ny mate:** se "Sådan tilføjes en ny mate" ovenfor.
- **Build:** `npm run build` i `frontend/`.
- Elysia er låst til `1.4.19`, fordi 1.4.31 fejler ved validering af URL-parametre.

## Kendte begrænsninger

- Ingen login. Alle i hubben kan se alle data, ligesom i de gamle udgaver.
- Stockmate: udbytte, aktiesplit og skat registreres ikke endnu, og kurser er Yahoos seneste kurs, ikke realtid.
- Kinmate: billeder følger ikke med en backup fra Tauri-udgaven, fordi de lå som filer på den gamle maskine.
- Kinmate-kortet og geokodningen kræver adgang til OpenStreetMap og Nominatim.
- KanMates synkronisering til PostgreSQL på Hetzner er ikke med. Hubbens egen backend erstatter den.
