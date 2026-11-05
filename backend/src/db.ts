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

  // 7: Savemate er fjernet igen (Econmates projekter dækker opsparing). Migration 5 rettes ikke,
  // så tabellerne droppes her i stedet.
  `DROP TABLE IF EXISTS savemate_contribution;
   DROP TABLE IF EXISTS savemate_goal;`,
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
