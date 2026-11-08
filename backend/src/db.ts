import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Én fælles SQLite-database for hele MateVerse-hubben. Hver mate får sine egne tabeller
 * med præfiks (fx `stockmate_`), mens brugerne er fælles på tværs af alle mates.
 */
export const DB_PATH = process.env.DB_PATH ?? 'data/mateverse.sqlite'

mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH, { create: true, strict: true })
db.exec('PRAGMA journal_mode = WAL;')
db.exec('PRAGMA foreign_keys = ON;')

/**
 * Simple migrationer: hver indgang køres én gang og nummereres via `PRAGMA user_version`.
 * Tilføj kun nye migrationer til sidst – ret aldrig i en, der allerede er kørt.
 */
const MIGRATIONS: string[] = [
  // 1: fælles brugere
  `CREATE TABLE IF NOT EXISTS user (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     username TEXT NOT NULL UNIQUE,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   INSERT OR IGNORE INTO user (username) VALUES ('Nicki'), ('Solveig');`,

  // 2: Stockmate
  `CREATE TABLE IF NOT EXISTS stockmate_stock (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ticker TEXT NOT NULL UNIQUE,
     name TEXT,
     currency TEXT NOT NULL DEFAULT 'DKK',
     last_price REAL,
     last_price_at TEXT
   );
   CREATE TABLE IF NOT EXISTS stockmate_transaction (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
     stock_id INTEGER NOT NULL REFERENCES stockmate_stock(id),
     depot_type TEXT NOT NULL,
     type TEXT NOT NULL CHECK (type IN ('Buy', 'Sell')),
     quantity REAL NOT NULL CHECK (quantity > 0),
     price_per_share REAL NOT NULL CHECK (price_per_share >= 0),
     currency TEXT NOT NULL DEFAULT 'DKK',
     fx_rate REAL NOT NULL DEFAULT 1,
     brokerage_fee REAL NOT NULL DEFAULT 0,
     transaction_date TEXT NOT NULL,
     note TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS stockmate_tx_user ON stockmate_transaction(user_id, transaction_date);
   CREATE TABLE IF NOT EXISTS stockmate_fx (
     currency TEXT PRIMARY KEY,
     rate_dkk REAL NOT NULL,
     updated_at TEXT NOT NULL
   );`,

  // 3: Econmate – begivenheder (budget eller projekt) med deltagere, udgifter og udligninger.
  // paid_by NULL betyder "Fælles": udgiften deles ligeligt mellem deltagerne.
  `CREATE TABLE IF NOT EXISTS econmate_event (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     event_type TEXT NOT NULL CHECK (event_type IN ('budget', 'project')),
     start_date TEXT,
     end_date TEXT,
     budget_amount REAL NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE IF NOT EXISTS econmate_member (
     event_id INTEGER NOT NULL REFERENCES econmate_event(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES user(id),
     PRIMARY KEY (event_id, user_id)
   );
   CREATE TABLE IF NOT EXISTS econmate_expense (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     event_id INTEGER NOT NULL REFERENCES econmate_event(id) ON DELETE CASCADE,
     description TEXT NOT NULL,
     amount REAL NOT NULL,
     paid_by INTEGER REFERENCES user(id),
     category TEXT,
     expense_date TEXT NOT NULL,
     payment_frequency TEXT,
     payment_method TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE IF NOT EXISTS econmate_settlement (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     event_id INTEGER NOT NULL REFERENCES econmate_event(id) ON DELETE CASCADE,
     payer_id INTEGER NOT NULL REFERENCES user(id),
     receiver_id INTEGER NOT NULL REFERENCES user(id),
     amount REAL NOT NULL CHECK (amount > 0),
     settlement_date TEXT NOT NULL
   );`,

  // 4: KanMate – projekter, opgaver og underopgaver. Papirkurv (deleted_at) og arkiv (archived_at).
  `CREATE TABLE IF NOT EXISTS kanmate_project (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     color TEXT NOT NULL DEFAULT '#64748b',
     is_archived INTEGER NOT NULL DEFAULT 0,
     deleted_at TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE IF NOT EXISTS kanmate_task (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     description TEXT,
     column_name TEXT NOT NULL DEFAULT 'todo' CHECK (column_name IN ('todo', 'doing', 'done')),
     project_id INTEGER REFERENCES kanmate_project(id) ON DELETE SET NULL,
     position REAL NOT NULL DEFAULT 0,
     deadline TEXT,
     priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
     assigned_to INTEGER REFERENCES user(id) ON DELETE SET NULL,
     archived_at TEXT,
     deleted_at TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE IF NOT EXISTS kanmate_subtask (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id INTEGER NOT NULL REFERENCES kanmate_task(id) ON DELETE CASCADE,
     description TEXT NOT NULL,
     is_completed INTEGER NOT NULL DEFAULT 0,
     position INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX IF NOT EXISTS kanmate_task_project ON kanmate_task(project_id);`,

  // 5: Savemate – opsparingsmål og indbetalinger. goal_id NULL = generelt engangsbeløb.
  // Det opsparede beløb gemmes ikke, men summeres altid af indbetalingerne.
  `CREATE TABLE IF NOT EXISTS savemate_goal (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     target_amount REAL NOT NULL CHECK (target_amount > 0),
     target_date TEXT NOT NULL,
     owner_id INTEGER REFERENCES user(id) ON DELETE SET NULL,
     icon TEXT NOT NULL DEFAULT '🎯',
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE IF NOT EXISTS savemate_contribution (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     goal_id INTEGER REFERENCES savemate_goal(id) ON DELETE CASCADE,
     amount REAL NOT NULL,
     contribution_date TEXT NOT NULL,
     description TEXT,
     is_lump_sum INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`,

  // 6: Kinmate – slægtsforskning. Samme struktur og tekst-id'er som Tauri-udgaven,
  // så data kan flyttes over uden at skulle omnummereres.
  `CREATE TABLE IF NOT EXISTS kinmate_person (
     id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
     navn TEXT NOT NULL,
     fødselsdato TEXT,
     fødselsogn TEXT,
     dødsdato TEXT,
     dødssogn TEXT,
     køn TEXT,
     noter TEXT,
     billede TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE IF NOT EXISTS kinmate_relation (
     id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
     person1_id TEXT NOT NULL REFERENCES kinmate_person(id) ON DELETE CASCADE,
     person2_id TEXT NOT NULL REFERENCES kinmate_person(id) ON DELETE CASCADE,
     type TEXT NOT NULL,
     start_dato TEXT,
     slut_dato TEXT,
     noter TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS kinmate_relation_p1 ON kinmate_relation(person1_id);
   CREATE INDEX IF NOT EXISTS kinmate_relation_p2 ON kinmate_relation(person2_id);
   CREATE TABLE IF NOT EXISTS kinmate_kilde (
     id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
     titel TEXT NOT NULL,
     type TEXT,
     arkiv_reference TEXT,
     url TEXT,
     noter TEXT,
     oprettet_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE IF NOT EXISTS kinmate_kilde_kobling (
     id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
     kilde_id TEXT NOT NULL REFERENCES kinmate_kilde(id) ON DELETE CASCADE,
     person_id TEXT REFERENCES kinmate_person(id) ON DELETE CASCADE,
     relation_id TEXT REFERENCES kinmate_relation(id) ON DELETE CASCADE,
     felt TEXT,
     sikkerhed TEXT,
     noter TEXT,
     oprettet_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE IF NOT EXISTS kinmate_forskningsopgave (
     id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
     person_id TEXT NOT NULL REFERENCES kinmate_person(id) ON DELETE CASCADE,
     beskrivelse TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'åben',
     oprettet_at TEXT NOT NULL DEFAULT (datetime('now')),
     løst_at TEXT
   );
   CREATE TABLE IF NOT EXISTS kinmate_sted (
     id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
     navn TEXT NOT NULL UNIQUE,
     lat REAL,
     lng REAL,
     kilde TEXT
   );`,

  // 7: DiskMate – disc golf. Samme skema som Tauri-udgaven (UDisc-import, fysiske huller på tværs af
  // layouts, runder, diske og diske pr. runde), med præfiks. Spillere er navne fra UDisc, ikke hubbrugere.
  `CREATE TABLE IF NOT EXISTS diskmate_courses (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE
   );
   CREATE TABLE IF NOT EXISTS diskmate_layouts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     course_id INTEGER NOT NULL REFERENCES diskmate_courses(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     hole_count INTEGER NOT NULL DEFAULT 0,
     UNIQUE(course_id, name)
   );
   CREATE TABLE IF NOT EXISTS diskmate_course_holes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     course_id INTEGER NOT NULL REFERENCES diskmate_courses(id) ON DELETE CASCADE,
     label TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS diskmate_holes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     layout_id INTEGER NOT NULL REFERENCES diskmate_layouts(id) ON DELETE CASCADE,
     hole_number INTEGER NOT NULL,
     par INTEGER NOT NULL,
     course_hole_id INTEGER REFERENCES diskmate_course_holes(id) ON DELETE SET NULL,
     UNIQUE(layout_id, hole_number)
   );
   CREATE TABLE IF NOT EXISTS diskmate_rounds (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     layout_id INTEGER NOT NULL REFERENCES diskmate_layouts(id) ON DELETE CASCADE,
     player_name TEXT NOT NULL,
     date TEXT NOT NULL,
     total_score INTEGER NOT NULL,
     total_par INTEGER NOT NULL,
     to_par INTEGER NOT NULL,
     rating INTEGER,
     wind TEXT,
     weather TEXT,
     UNIQUE(layout_id, player_name, date)
   );
   CREATE TABLE IF NOT EXISTS diskmate_round_scores (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     round_id INTEGER NOT NULL REFERENCES diskmate_rounds(id) ON DELETE CASCADE,
     hole_number INTEGER NOT NULL,
     strokes INTEGER NOT NULL,
     par INTEGER NOT NULL,
     to_par INTEGER NOT NULL,
     UNIQUE(round_id, hole_number)
   );
   CREATE TABLE IF NOT EXISTS diskmate_discs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     brand TEXT,
     mold TEXT,
     category TEXT NOT NULL DEFAULT 'Andet',
     color TEXT,
     in_bag INTEGER NOT NULL DEFAULT 1,
     speed REAL, glide REAL, turn REAL, fade REAL,
     weight_grams INTEGER,
     plastic TEXT,
     condition TEXT,
     notes TEXT,
     image_path TEXT,
     holder TEXT,
     lost INTEGER NOT NULL DEFAULT 0,
     skill_levels TEXT,
     best_wind TEXT,
     best_weather TEXT,
     stability TEXT,
     acquired_date TEXT
   );
   CREATE TABLE IF NOT EXISTS diskmate_round_discs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     round_id INTEGER NOT NULL REFERENCES diskmate_rounds(id) ON DELETE CASCADE,
     disc_id INTEGER NOT NULL REFERENCES diskmate_discs(id) ON DELETE CASCADE,
     UNIQUE(round_id, disc_id)
   );
   CREATE INDEX IF NOT EXISTS diskmate_idx_rounds_layout_player ON diskmate_rounds(layout_id, player_name);
   CREATE INDEX IF NOT EXISTS diskmate_idx_round_scores_round ON diskmate_round_scores(round_id);
   CREATE INDEX IF NOT EXISTS diskmate_idx_round_discs_round ON diskmate_round_discs(round_id);
   CREATE INDEX IF NOT EXISTS diskmate_idx_holes_course_hole ON diskmate_holes(course_hole_id);`,

  // 8: Savemate er fjernet igen (Econmates projekter dækker opsparing). Migration 5 rettes ikke,
  // så tabellerne droppes her i stedet.
  `DROP TABLE IF EXISTS savemate_contribution;
   DROP TABLE IF EXISTS savemate_goal;`,

  // 9: DiskMate — Caddiebog. Taktiske scouting-noter pr. fysisk hul, opdelt pr. tee-farve
  // (Rød/Gul/Hvid), da samme kurv kan have forskellig par/længde alt efter hvilken farve
  // man spiller fra. Uafhængig af layout/par-statistikken i diskmate_holes/diskmate_rounds.
  `CREATE TABLE IF NOT EXISTS diskmate_hole_caddie_notes (
     course_hole_id    INTEGER NOT NULL REFERENCES diskmate_course_holes(id) ON DELETE CASCADE,
     tee_color         TEXT NOT NULL,
     par               INTEGER,
     length_meters     INTEGER,
     elevation_meters  INTEGER,
     elevated_basket   INTEGER NOT NULL DEFAULT 0,
     fairway_type      TEXT,
     throw_shape       TEXT,
     ground_surface    TEXT,
     hazards           TEXT,
     recommended_throw TEXT,
     recommended_disc  TEXT,
     notes             TEXT,
     image_path        TEXT,
     PRIMARY KEY (course_hole_id, tee_color)
   );`,

  // 10: Stockmate — porteføljehistorik. Ét snapshot pr. bruger pr. dag, gemt når porteføljen
  // hentes (se routes.ts), så graferne kan vise udviklingen over tid.
  `CREATE TABLE IF NOT EXISTS stockmate_portfolio_snapshot (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
     snapshot_date TEXT NOT NULL,
     total_value_dkk REAL NOT NULL,
     total_invested_dkk REAL NOT NULL,
     UNIQUE(user_id, snapshot_date)
   );`,

  // 11: Stockmate — tilføj 'Dividend' som transaktionstype (til skatteopgørelsen). SQLite kan
  // ikke ændre et CHECK direkte, så tabellen genskabes med samme data og en udvidet CHECK.
  `CREATE TABLE stockmate_transaction_new (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
     stock_id INTEGER NOT NULL REFERENCES stockmate_stock(id),
     depot_type TEXT NOT NULL,
     type TEXT NOT NULL CHECK (type IN ('Buy', 'Sell', 'Dividend')),
     quantity REAL NOT NULL CHECK (quantity > 0),
     price_per_share REAL NOT NULL CHECK (price_per_share >= 0),
     currency TEXT NOT NULL DEFAULT 'DKK',
     fx_rate REAL NOT NULL DEFAULT 1,
     brokerage_fee REAL NOT NULL DEFAULT 0,
     transaction_date TEXT NOT NULL,
     note TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   INSERT INTO stockmate_transaction_new SELECT * FROM stockmate_transaction;
   DROP TABLE stockmate_transaction;
   ALTER TABLE stockmate_transaction_new RENAME TO stockmate_transaction;
   CREATE INDEX IF NOT EXISTS stockmate_tx_user ON stockmate_transaction(user_id, transaction_date);`,

  // 12: Stockmate — krypto. Delt beholdning for hele husstanden (ikke pr. bruger, ligesom
  // Tauri-udgaven). 'setting' gemmer Coinbase/CoinGecko-nøgler ukrypteret efter aftale.
  `CREATE TABLE IF NOT EXISTS stockmate_setting (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS stockmate_crypto_holding (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     coin_id TEXT NOT NULL,
     symbol TEXT NOT NULL,
     name TEXT NOT NULL,
     amount REAL NOT NULL,
     platform TEXT NOT NULL,
     last_known_price_usd REAL,
     last_known_price_dkk REAL,
     last_price_updated TEXT,
     updated_at TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE(coin_id, platform)
   );`,

  // 13: ContactMate — port af Tauri-udgaven. Google Contacts (OAuth, to-vejs sync) og Gmail
  // (separat OAuth, "sidst kontaktet"-statistik) er fælles for husstanden, ikke pr. bruger.
  // 'setting' gemmer OAuth-klient-id/secret og tokens ukrypteret, samme aftale som Stockmates krypto.
  `CREATE TABLE IF NOT EXISTS contactmate_setting (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );

   CREATE TABLE IF NOT EXISTS contactmate_contact (
     id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
     google_id TEXT UNIQUE,
     fornavn TEXT,
     efternavn TEXT,
     visningsnavn TEXT NOT NULL,
     firma TEXT,
     titel TEXT,
     foto_url TEXT,
     noter TEXT,
     synced_at TEXT,
     lokalt_redigeret INTEGER NOT NULL DEFAULT 0,
     ny_fra_google INTEGER NOT NULL DEFAULT 0,
     foedselsdag TEXT,
     foedselsdag_uden_aar INTEGER NOT NULL DEFAULT 0,
     adresse_gade TEXT,
     adresse_by TEXT,
     adresse_postnr TEXT,
     adresse_land TEXT,
     sidst_kontakt_at TEXT,
     antal_emails INTEGER NOT NULL DEFAULT 0,
     sidst_gmail_sync TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS idx_contactmate_contact_google ON contactmate_contact(google_id);
   CREATE INDEX IF NOT EXISTS idx_contactmate_contact_navn   ON contactmate_contact(visningsnavn);

   CREATE TABLE IF NOT EXISTS contactmate_email (
     id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
     contact_id TEXT NOT NULL REFERENCES contactmate_contact(id) ON DELETE CASCADE,
     email TEXT NOT NULL,
     type TEXT,
     primaer INTEGER NOT NULL DEFAULT 0,
     klassificering TEXT,
     lokalt_redigeret INTEGER NOT NULL DEFAULT 0,
     ny_fra_google INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX IF NOT EXISTS idx_contactmate_email_contact ON contactmate_email(contact_id);

   CREATE TABLE IF NOT EXISTS contactmate_phone (
     id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
     contact_id TEXT NOT NULL REFERENCES contactmate_contact(id) ON DELETE CASCADE,
     nummer TEXT NOT NULL,
     type TEXT,
     primaer INTEGER NOT NULL DEFAULT 0,
     lokalt_redigeret INTEGER NOT NULL DEFAULT 0,
     ny_fra_google INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX IF NOT EXISTS idx_contactmate_phone_contact ON contactmate_phone(contact_id);

   CREATE TABLE IF NOT EXISTS contactmate_group (
     google_id TEXT PRIMARY KEY,
     navn TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS contactmate_contact_group (
     contact_id TEXT NOT NULL REFERENCES contactmate_contact(id) ON DELETE CASCADE,
     group_id   TEXT NOT NULL REFERENCES contactmate_group(google_id) ON DELETE CASCADE,
     PRIMARY KEY (contact_id, group_id)
   );

   CREATE TABLE IF NOT EXISTS contactmate_ignored_duplicate (
     id_a TEXT NOT NULL,
     id_b TEXT NOT NULL,
     PRIMARY KEY (id_a, id_b),
     CHECK (id_a < id_b)
   );

   CREATE TABLE IF NOT EXISTS contactmate_deleted_google_id (google_id TEXT PRIMARY KEY);
   CREATE TABLE IF NOT EXISTS contactmate_deleted_email (contact_id TEXT NOT NULL, email  TEXT NOT NULL, PRIMARY KEY (contact_id, email));
   CREATE TABLE IF NOT EXISTS contactmate_deleted_phone (contact_id TEXT NOT NULL, nummer TEXT NOT NULL, PRIMARY KEY (contact_id, nummer));

   CREATE TABLE IF NOT EXISTS contactmate_linkedin_connection (
     id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
     fornavn TEXT,
     efternavn TEXT,
     email TEXT,
     firma TEXT,
     titel TEXT,
     forbundet_den TEXT,
     contact_id TEXT REFERENCES contactmate_contact(id) ON DELETE SET NULL,
     fuzzy_kandidat_id TEXT,
     match_score INTEGER NOT NULL DEFAULT 0,
     imported_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS idx_contactmate_linkedin_contact ON contactmate_linkedin_connection(contact_id);
   CREATE TABLE IF NOT EXISTS contactmate_linkedin_hidden (linkedin_id TEXT PRIMARY KEY);`,

  // 14: 500Mate — port af Tauri-udgaven. Scoretæller til kortspillet "500", fælles spillerkartotek
  // for husstanden på tværs af spil. Tabel-præfiks 'mate500_' (ikke '500mate_') fordi SQLite ikke
  // tillader bare identifier-navne, der starter med et tal.
  `CREATE TABLE IF NOT EXISTS mate500_player (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     navn TEXT NOT NULL UNIQUE,
     farve TEXT NOT NULL,
     aktiv INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE IF NOT EXISTS mate500_game (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     navn TEXT,
     dato TEXT NOT NULL,
     afsluttet INTEGER NOT NULL DEFAULT 0,
     vinder_id INTEGER REFERENCES mate500_player(id),
     notat TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE IF NOT EXISTS mate500_game_player (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     game_id INTEGER NOT NULL REFERENCES mate500_game(id) ON DELETE CASCADE,
     player_id INTEGER NOT NULL REFERENCES mate500_player(id),
     position INTEGER NOT NULL,
     UNIQUE(game_id, player_id)
   );
   CREATE TABLE IF NOT EXISTS mate500_round (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     game_id INTEGER NOT NULL REFERENCES mate500_game(id) ON DELETE CASCADE,
     runde_nr INTEGER NOT NULL,
     melding_spiller_id INTEGER REFERENCES mate500_player(id),
     melding_antal INTEGER,
     melding_farve TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE IF NOT EXISTS mate500_round_point (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     round_id INTEGER NOT NULL REFERENCES mate500_round(id) ON DELETE CASCADE,
     player_id INTEGER NOT NULL REFERENCES mate500_player(id),
     point INTEGER NOT NULL,
     stik_vundet INTEGER NOT NULL,
     UNIQUE(round_id, player_id)
   );
   CREATE INDEX IF NOT EXISTS idx_mate500_round_game ON mate500_round(game_id);
   CREATE INDEX IF NOT EXISTS idx_mate500_point_round ON mate500_round_point(round_id);`,
]

export function migrate(database: Database = db) {
  const { user_version } = database.query('PRAGMA user_version').get() as { user_version: number }
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    database.transaction(() => {
      database.exec(MIGRATIONS[v])
      database.exec(`PRAGMA user_version = ${v + 1}`)
    })()
  }
}

migrate()
