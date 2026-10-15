
CREATE TABLE profiles (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = '00000000-0000-4000-8000-000000000001'),
  currency TEXT NOT NULL CHECK (currency = 'PHP'),
  time_zone TEXT NOT NULL
);
CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  kind TEXT NOT NULL CHECK (kind IN ('cash','bank','ewallet')),
  archived_at TEXT,
  UNIQUE (id, profile_id)
);
CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL CHECK (type = 'expense'),
  name TEXT NOT NULL,
  icon_key TEXT NOT NULL,
  color_token TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (id, profile_id)
);
CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL CHECK (type IN ('expense','opening')),
  occurred_at TEXT NOT NULL,
  local_date TEXT NOT NULL CHECK (length(local_date) = 10),
  time_zone TEXT NOT NULL,
  offset_minutes INTEGER NOT NULL CHECK (offset_minutes BETWEEN -840 AND 840),
  note TEXT NOT NULL CHECK (length(note) <= 500),
  category_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  FOREIGN KEY (category_id, profile_id) REFERENCES categories(id, profile_id),
  CHECK ((type = 'expense' AND category_id IS NOT NULL) OR (type = 'opening' AND category_id IS NULL)),
  UNIQUE (id, profile_id)
);
CREATE TABLE entries (
  id TEXT PRIMARY KEY NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  profile_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND abs(amount_minor) <= 9000000000000),
  FOREIGN KEY (transaction_id, profile_id) REFERENCES transactions(id, profile_id),
  FOREIGN KEY (account_id, profile_id) REFERENCES accounts(id, profile_id)
);
CREATE TRIGGER validate_entry BEFORE INSERT ON entries BEGIN
  SELECT CASE WHEN
    ((SELECT type FROM transactions WHERE id = NEW.transaction_id) = 'expense' AND NEW.amount_minor >= 0)
    OR ((SELECT type FROM transactions WHERE id = NEW.transaction_id) = 'opening' AND NEW.amount_minor < 0)
    THEN RAISE(ABORT, 'invalid entry sign') END;
END;
CREATE INDEX entries_account ON entries(account_id);
CREATE INDEX transactions_date ON transactions(local_date DESC, occurred_at DESC, id DESC);
CREATE INDEX transactions_category_date ON transactions(category_id, local_date);
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);

ALTER TABLE accounts ADD COLUMN opening_name TEXT NOT NULL DEFAULT '';
INSERT INTO schema_migrations VALUES (1, '2026-10-14'), (2, '2026-10-15');
PRAGMA user_version = 2;
