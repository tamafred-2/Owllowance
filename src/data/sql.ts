export type SqlValue = string | number | null;
export interface SqlConnection {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
}

// Every query uses this one connection and queue, including read snapshots.
// Expo's exclusive transaction helper is unavailable on web.
export class Database {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly connection: SqlConnection) {}

  exclusive<T>(work: (sql: SqlConnection) => Promise<T>): Promise<T> {
    const result = this.tail.then(() => work(this.connection));
    this.tail = result.catch(() => undefined);
    return result;
  }

  transaction<T>(work: (sql: SqlConnection) => Promise<T>): Promise<T> {
    return this.exclusive(async sql => {
      await sql.execAsync('BEGIN IMMEDIATE');
      try {
        const result = await work(sql);
        await sql.execAsync('COMMIT');
        return result;
      } catch (error) {
        await sql.execAsync('ROLLBACK');
        throw error;
      }
    });
  }
}
