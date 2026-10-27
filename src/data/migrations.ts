import { MAX_MINOR } from '../domain/money';
import { Database, type SqlConnection } from './sql';

export async function seedIncomeCategories(sql: SqlConnection): Promise<void> {
  const categories = [['Allowance', 'allowance'], ['Salary', 'salary'], ['Freelance', 'work'], ['Gift', 'gift'], ['Other income', 'income']];
  for (const [index, [name, icon]] of categories.entries()) {
    await sql.runAsync("INSERT OR IGNORE INTO categories (id, profile_id, type, name, icon_key, color_token) SELECT ?, id, 'income', ?, ?, 'success' FROM profiles", `00000000-0000-4000-8000-${String(index + 200).padStart(12, '0')}`, name, icon);
  }
}

export async function seedFeeCategory(sql: SqlConnection): Promise<void> {
  await sql.runAsync("INSERT OR IGNORE INTO categories (id, profile_id, type, name, icon_key, color_token) SELECT ?, id, 'expense', 'Fees', 'fees', 'slate' FROM profiles", FEE_CATEGORY);
}

export const FEE_CATEGORY = '00000000-0000-4000-8000-000000000106';
export const SCHEMA_VERSION = 8;
// v4: transfers carry two entries, linked fee expenses, budgets and preferences.
const ledgerSchema = `
CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL CHECK (type IN ('expense','income','opening','transfer')),
  occurred_at TEXT NOT NULL,
  local_date TEXT NOT NULL CHECK (length(local_date) = 10),
  time_zone TEXT NOT NULL,
  offset_minutes INTEGER NOT NULL CHECK (offset_minutes BETWEEN -840 AND 840),
  note TEXT NOT NULL CHECK (length(note) <= 500),
  category_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  linked_id TEXT REFERENCES transactions(id),
  FOREIGN KEY (category_id, profile_id) REFERENCES categories(id, profile_id),
  CHECK ((type IN ('expense','income') AND category_id IS NOT NULL) OR (type IN ('opening','transfer') AND category_id IS NULL)),
  CHECK (linked_id IS NULL OR type = 'expense'),
  UNIQUE (id, profile_id)
);
CREATE TABLE entries (
  id TEXT PRIMARY KEY NOT NULL,
  transaction_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND abs(amount_minor) <= ${MAX_MINOR}),
  FOREIGN KEY (transaction_id, profile_id) REFERENCES transactions(id, profile_id),
  FOREIGN KEY (account_id, profile_id) REFERENCES accounts(id, profile_id)
);
`;
const entrySignCheck = `SELECT CASE WHEN
    ((SELECT type FROM transactions WHERE id = NEW.transaction_id) = 'expense' AND NEW.amount_minor >= 0)
    OR ((SELECT type FROM transactions WHERE id = NEW.transaction_id) = 'income' AND NEW.amount_minor <= 0)
    OR ((SELECT type FROM transactions WHERE id = NEW.transaction_id) = 'opening' AND NEW.amount_minor < 0)
    OR ((SELECT type FROM transactions WHERE id = NEW.transaction_id) = 'transfer' AND NEW.amount_minor = 0)
    THEN RAISE(ABORT, 'invalid entry sign') END;`;
const categoryCheck = `SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id = NEW.category_id AND profile_id = NEW.profile_id AND type = NEW.type)
    THEN RAISE(ABORT, 'invalid category type') END;`;
// v5: recurring bills/income and one row per handled occurrence (rule + due date), so nothing posts twice.
const v5Objects = `
CREATE TABLE recurring (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  type TEXT NOT NULL CHECK (type IN ('expense','income')),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0 AND amount_minor <= ${MAX_MINOR}),
  account_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly','weekly','days')),
  every INTEGER NOT NULL CHECK (every BETWEEN 1 AND 366),
  start_date TEXT NOT NULL CHECK (length(start_date) = 10),
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0,1)),
  FOREIGN KEY (account_id, profile_id) REFERENCES accounts(id, profile_id),
  FOREIGN KEY (category_id, profile_id) REFERENCES categories(id, profile_id)
);
CREATE TABLE recurring_occurrences (
  recurring_id TEXT NOT NULL REFERENCES recurring(id) ON DELETE CASCADE,
  due_date TEXT NOT NULL CHECK (length(due_date) = 10),
  status TEXT NOT NULL CHECK (status IN ('paid','skipped')),
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  PRIMARY KEY (recurring_id, due_date)
);
CREATE INDEX recurring_occurrences_transaction ON recurring_occurrences(transaction_id);
`;
// v6: savings goals and their contributions. Contributions track money set aside; they are not
// ledger entries, so balances, spending and net worth are unchanged.
const v6Objects = `
CREATE TABLE goals (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  target_minor INTEGER NOT NULL CHECK (typeof(target_minor) = 'integer' AND target_minor > 0 AND target_minor <= ${MAX_MINOR}),
  target_date TEXT CHECK (target_date IS NULL OR length(target_date) = 10),
  icon_key TEXT NOT NULL,
  color_token TEXT NOT NULL,
  archived_at TEXT
);
CREATE TABLE goal_contributions (
  id TEXT PRIMARY KEY NOT NULL,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor <> 0 AND abs(amount_minor) <= ${MAX_MINOR}),
  local_date TEXT NOT NULL CHECK (length(local_date) = 10),
  note TEXT NOT NULL CHECK (length(note) <= 200)
);
CREATE INDEX goal_contributions_goal ON goal_contributions(goal_id, local_date);
`;
// v7: goal descriptions and cover photos, and wallet-backed contributions. A linked contribution owns a
// one-sided transfer on its wallet, so wallet balances move while net worth (wallets + goals) stays the same.
const v7Objects = `
ALTER TABLE goals ADD COLUMN description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500);
ALTER TABLE goals ADD COLUMN image_uri TEXT CHECK (image_uri IS NULL OR length(image_uri) <= 1000);
ALTER TABLE goal_contributions ADD COLUMN transaction_id TEXT REFERENCES transactions(id);
CREATE UNIQUE INDEX goal_contributions_transaction ON goal_contributions(transaction_id);
`;
// v8: completed goals, and debts (money owed to or by someone). A debt entry with a wallet owns a
// one-sided transfer like goal money: borrowing or being repaid credits the wallet, paying back or
// lending debits it. Debts never change net worth; "after debts" is shown separately.
const v8Objects = `
ALTER TABLE goals ADD COLUMN completed_at TEXT;
CREATE TABLE debts (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  direction TEXT NOT NULL CHECK (direction IN ('owe','owed')),
  due_date TEXT CHECK (due_date IS NULL OR length(due_date) = 10),
  note TEXT NOT NULL CHECK (length(note) <= 500),
  archived_at TEXT
);
CREATE TABLE debt_entries (
  id TEXT PRIMARY KEY NOT NULL,
  debt_id TEXT NOT NULL REFERENCES debts(id),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor <> 0 AND abs(amount_minor) <= ${MAX_MINOR}),
  local_date TEXT NOT NULL CHECK (length(local_date) = 10),
  note TEXT NOT NULL CHECK (length(note) <= 200),
  transaction_id TEXT REFERENCES transactions(id)
);
CREATE INDEX debt_entries_debt ON debt_entries(debt_id, local_date);
CREATE UNIQUE INDEX debt_entries_transaction ON debt_entries(transaction_id);
`;
const v4Objects = `
CREATE TRIGGER validate_entry BEFORE INSERT ON entries BEGIN ${entrySignCheck} END;
CREATE TRIGGER validate_entry_update BEFORE UPDATE ON entries BEGIN ${entrySignCheck} END;
CREATE TRIGGER validate_transaction_category BEFORE INSERT ON transactions WHEN NEW.type IN ('expense','income') BEGIN ${categoryCheck} END;
CREATE TRIGGER validate_transaction_category_update BEFORE UPDATE ON transactions WHEN NEW.type IN ('expense','income') BEGIN ${categoryCheck} END;
CREATE INDEX entries_account ON entries(account_id);
CREATE INDEX entries_transaction ON entries(transaction_id);
CREATE INDEX transactions_date ON transactions(local_date DESC, occurred_at DESC, id DESC);
CREATE INDEX transactions_category_date ON transactions(category_id, local_date);
CREATE INDEX transactions_linked ON transactions(linked_id);
CREATE TABLE budgets (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  category_id TEXT NOT NULL UNIQUE,
  period TEXT NOT NULL CHECK (period IN ('monthly','weekly','custom')),
  start_date TEXT,
  end_date TEXT,
  limit_minor INTEGER NOT NULL CHECK (typeof(limit_minor) = 'integer' AND limit_minor > 0 AND limit_minor <= ${MAX_MINOR}),
  FOREIGN KEY (category_id, profile_id) REFERENCES categories(id, profile_id),
  CHECK ((period = 'custom' AND length(start_date) = 10 AND length(end_date) = 10 AND end_date > start_date)
    OR (period <> 'custom' AND start_date IS NULL AND end_date IS NULL))
);
CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL CHECK (length(value) <= 100));
CREATE TABLE restore_snapshots (id INTEGER PRIMARY KEY CHECK (id = 1), created_at TEXT NOT NULL, payload TEXT NOT NULL);
`;
const schema = `
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
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND abs(amount_minor) <= ${MAX_MINOR}),
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
`;

export async function migrate(database: Database): Promise<void> {
  await database.exclusive(sql => sql.execAsync('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;'));
  await database.transaction(async sql => {
    const row = await sql.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const version = row?.user_version ?? 0;
    if (version > SCHEMA_VERSION) throw new Error('This database needs a newer version of Owllowance.');
    if (version === 0) {
      await sql.execAsync(schema);
      await sql.runAsync('INSERT INTO schema_migrations VALUES (?, ?)', 1, new Date().toISOString());
      await sql.execAsync('PRAGMA user_version = 1');
    }
    if (version < 2) {
      // Preserve the immutable creation payload so retries remain safe after renaming.
      await sql.execAsync("ALTER TABLE accounts ADD COLUMN opening_name TEXT NOT NULL DEFAULT ''; UPDATE accounts SET opening_name = name;");
      await sql.runAsync('INSERT INTO schema_migrations VALUES (?, ?)', 2, new Date().toISOString());
      await sql.execAsync('PRAGMA user_version = 2');
    }
    if (version < 3) {
      // Rebuild constrained tables inside the same transaction, keeping foreign keys on.
      await sql.execAsync(`
        CREATE TEMP TABLE saved_categories AS SELECT * FROM categories ORDER BY rowid;
        CREATE TEMP TABLE saved_transactions AS SELECT * FROM transactions ORDER BY rowid;
        CREATE TEMP TABLE saved_entries AS SELECT * FROM entries ORDER BY rowid;
        DROP TABLE entries;
        DROP TABLE transactions;
        DROP TABLE categories;
      `);
      const incomeSchema = schema.slice(schema.indexOf('CREATE TABLE categories'), schema.indexOf('CREATE TABLE schema_migrations'))
        .replace("CHECK (type = 'expense')", "CHECK (type IN ('expense','income'))")
        .replace("type IN ('expense','opening')", "type IN ('expense','income','opening')")
        .replace("type = 'expense' AND category_id", "type IN ('expense','income') AND category_id")
        .replace("OR ((SELECT type FROM transactions WHERE id = NEW.transaction_id) = 'opening'", "OR ((SELECT type FROM transactions WHERE id = NEW.transaction_id) = 'income' AND NEW.amount_minor <= 0) OR ((SELECT type FROM transactions WHERE id = NEW.transaction_id) = 'opening'");
      await sql.execAsync(incomeSchema);
      await sql.execAsync(`
        INSERT INTO categories SELECT * FROM saved_categories;
        INSERT INTO transactions (id, profile_id, type, occurred_at, local_date, time_zone, offset_minutes, note, category_id, revision)
          SELECT id, profile_id, type, occurred_at, local_date, time_zone, offset_minutes, note, category_id, revision FROM saved_transactions;
        INSERT INTO entries SELECT * FROM saved_entries;
        DROP TABLE saved_entries;
        DROP TABLE saved_transactions;
        DROP TABLE saved_categories;
        CREATE TRIGGER validate_transaction_category BEFORE INSERT ON transactions
        WHEN NEW.type IN ('expense','income') BEGIN
          SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id = NEW.category_id AND profile_id = NEW.profile_id AND type = NEW.type)
          THEN RAISE(ABORT, 'invalid category type') END;
        END;
      `);
      await seedIncomeCategories(sql);
      if ((await sql.getAllAsync('PRAGMA foreign_key_check')).length) throw new Error('Migration integrity check failed.');
      await sql.runAsync('INSERT INTO schema_migrations VALUES (?, ?)', 3, new Date().toISOString());
      await sql.execAsync('PRAGMA user_version = 3');
    }
    if (version < 4) {
      await sql.execAsync(`
        CREATE TEMP TABLE saved_transactions AS SELECT * FROM transactions ORDER BY rowid;
        CREATE TEMP TABLE saved_entries AS SELECT * FROM entries ORDER BY rowid;
        DROP TABLE entries;
        DROP TABLE transactions;
      `);
      await sql.execAsync(ledgerSchema);
      await sql.execAsync(`
        INSERT INTO transactions (id, profile_id, type, occurred_at, local_date, time_zone, offset_minutes, note, category_id, revision)
          SELECT id, profile_id, type, occurred_at, local_date, time_zone, offset_minutes, note, category_id, revision FROM saved_transactions;
        INSERT INTO entries SELECT * FROM saved_entries;
        DROP TABLE saved_entries;
        DROP TABLE saved_transactions;
      `);
      await sql.execAsync(v4Objects);
      await seedFeeCategory(sql);
      if ((await sql.getAllAsync('PRAGMA foreign_key_check')).length) throw new Error('Migration integrity check failed.');
      await sql.runAsync('INSERT INTO schema_migrations VALUES (?, ?)', 4, new Date().toISOString());
      await sql.execAsync('PRAGMA user_version = 4');
    }
    if (version < 5) {
      await sql.execAsync(v5Objects);
      if ((await sql.getAllAsync('PRAGMA foreign_key_check')).length) throw new Error('Migration integrity check failed.');
      await sql.runAsync('INSERT INTO schema_migrations VALUES (?, ?)', 5, new Date().toISOString());
      await sql.execAsync('PRAGMA user_version = 5');
    }
    if (version < 6) {
      await sql.execAsync(v6Objects);
      if ((await sql.getAllAsync('PRAGMA foreign_key_check')).length) throw new Error('Migration integrity check failed.');
      await sql.runAsync('INSERT INTO schema_migrations VALUES (?, ?)', 6, new Date().toISOString());
      await sql.execAsync('PRAGMA user_version = 6');
    }
    if (version < 7) {
      await sql.execAsync(v7Objects);
      if ((await sql.getAllAsync('PRAGMA foreign_key_check')).length) throw new Error('Migration integrity check failed.');
      await sql.runAsync('INSERT INTO schema_migrations VALUES (?, ?)', 7, new Date().toISOString());
      await sql.execAsync('PRAGMA user_version = 7');
    }
    if (version < 8) {
      await sql.execAsync(v8Objects);
      if ((await sql.getAllAsync('PRAGMA foreign_key_check')).length) throw new Error('Migration integrity check failed.');
      await sql.runAsync('INSERT INTO schema_migrations VALUES (?, ?)', 8, new Date().toISOString());
      await sql.execAsync('PRAGMA user_version = 8');
    }
  });
}
