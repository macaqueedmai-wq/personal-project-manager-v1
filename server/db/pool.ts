import pg from 'pg';

// SQL DATE must stay a YYYY-MM-DD string. Converting it to a JS Date would
// reintroduce a UTC-midnight shift that the specification forbids.
pg.types.setTypeParser(1082, (value: string) => value);

export type DbPool = pg.Pool;

export function createPool(databaseUrl: string): DbPool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
}
