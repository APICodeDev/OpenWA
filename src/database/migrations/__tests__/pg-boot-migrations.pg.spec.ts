/* istanbul ignore file -- PG-gated: only runs under DATABASE_TYPE=postgres (test-postgres CI job);
   skipped in the default test job, so its lines would be unread and skew the global coverage gate. */
import 'reflect-metadata';
import { readFileSync } from 'fs';
import * as path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createBootDataSource } from '../../pg-boot-migrations';
import { BuiltInFtsProvider } from '../../../modules/search/providers/builtin-fts.provider';

/**
 * Postgres runtime coverage for the boot-migration advisory lock. Two "replicas" (independent
 * boot paths sharing nothing but the database) start migrating CONCURRENTLY; without the lock
 * both would see an empty migrations ledger and race DDL (duplicate tables / deadlocks). With the
 * lock, one applies the chain while the other blocks in pg_advisory_lock, then applies nothing.
 *
 * Gating: mirrors the repo's PG harness convention exactly (scripts/pg-uuid-smoke.js + the
 * "Test (PostgreSQL migrations)" CI job + 1782400000000-AddMessagesFts.pg.spec.ts) — skip the
 * whole suite unless DATABASE_TYPE=postgres is set; the CI job runs it against a postgres:16
 * service, locally it skips cleanly.
 */
const POSTGRES_ENABLED = process.env.DATABASE_TYPE === 'postgres';

(POSTGRES_ENABLED ? describe : describe.skip)('postgres boot migrations (advisory lock)', () => {
  const schema = process.env.POSTGRES_SCHEMA || 'public';
  const useCustomSearchPath = schema !== 'public';
  let admin: DataSource;

  const connectionOptions = {
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    username: process.env.DATABASE_USERNAME || 'openwa',
    password: process.env.DATABASE_PASSWORD || 'openwa',
    database: process.env.DATABASE_NAME || 'openwa',
  };

  // The exact options shape app.module.ts hands to createBootDataSource for the postgres data
  // connection: full migration chain, non-public schema via pg's startup search_path (see
  // pg-uuid-smoke.js for why the `options` parameter — not TypeORM's `schema` — is what routes
  // raw DDL to the schema).
  const bootMigratorOptions = (): DataSourceOptions => ({
    type: 'postgres',
    ...connectionOptions,
    migrations: [path.join(__dirname, '..', '*{.ts,.js}')],
    ...(useCustomSearchPath ? { extra: { options: `-c search_path=${schema},public` } } : {}),
  });

  beforeEach(async () => {
    admin = new DataSource({ type: 'postgres', ...connectionOptions });
    await admin.initialize();
    // Fresh schema each test: the CI job shares one service across steps, so wipe whatever the
    // pg-smoke step (or a previous test) left behind — tables AND the migrations ledger.
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.query(`CREATE SCHEMA "${schema}"`);
  });

  afterEach(async () => {
    if (admin && admin.isInitialized) {
      await admin.destroy();
    }
  });

  it('serializes two concurrent boot migrators: both resolve, ledger holds one row per migration', async () => {
    // Promise.all starts both boot paths before either can finish — the exact race replicas
    // hit when a deployment scales up against one shared Postgres.
    const [a, b] = await Promise.all([
      createBootDataSource(bootMigratorOptions()),
      createBootDataSource(bootMigratorOptions()),
    ]);

    try {
      const expected = a.migrations.length; // the full chain, loaded from the same glob
      // Unqualified name: resolves through the same session search_path the ledger was written
      // under, exactly like the raw migration SQL.
      const ledger: Array<{ name: string }> = await a.query(`SELECT name FROM "migrations"`);
      expect(ledger).toHaveLength(expected);
      // No migration applied twice — the double-apply shape concurrent migrationsRun produces.
      expect(new Set(ledger.map(row => row.name)).size).toBe(expected);
    } finally {
      await a.destroy();
      await b.destroy();
    }
  }, 120_000);
});

(POSTGRES_ENABLED ? describe : describe.skip)('docs/05 index maintenance queries on a chain-built database', () => {
  // The REINDEX line of the same block rewrites a real table and needs no check of its column names.
  const selects = (): string[] => {
    const doc = readFileSync(path.join(__dirname, '..', '..', '..', '..', 'docs', '05-database-design.md'), 'utf8');
    const block = /```sql\n([\s\S]*?)```/.exec(doc.slice(doc.indexOf('### Index Maintenance')))?.[1] ?? '';
    return block
      .split(';')
      .map(statement => statement.replace(/^\s*--.*$/gm, '').trim())
      .filter(statement => statement.startsWith('SELECT'));
  };

  it('runs every SELECT the block hands operators, as written', async () => {
    const ds = await createBootDataSource({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: Number(process.env.DATABASE_PORT || 5432),
      username: process.env.DATABASE_USERNAME || 'openwa',
      password: process.env.DATABASE_PASSWORD || 'openwa',
      database: process.env.DATABASE_NAME || 'openwa',
      migrations: [path.join(__dirname, '..', '*{.ts,.js}')],
    });
    try {
      const statements = selects();
      expect(statements).toHaveLength(2);
      for (const statement of statements) {
        await expect(ds.query(statement)).resolves.toEqual(expect.any(Array));
      }
    } finally {
      await ds.destroy();
    }
  }, 120_000);
});

/**
 * The session settings the data connection relies on, read back on every pooled connection: the runtime
 * statement_timeout, the configured search_path and the UTC zone. Directly against PostgreSQL, and through
 * PgBouncer in session mode when PGBOUNCER_PORT names one in front of the same server (docs/05 allows a
 * session-mode pooler; PgBouncer refuses statement_timeout in the startup packet).
 */
(POSTGRES_ENABLED ? describe : describe.skip)('data connection session settings on every pooled connection', () => {
  const host = process.env.DATABASE_HOST || 'localhost';
  const credentials = {
    username: process.env.DATABASE_USERNAME || 'openwa',
    password: process.env.DATABASE_PASSWORD || 'openwa',
  };
  const directPort = Number(process.env.DATABASE_PORT || 5432);
  const poolerPort = process.env.PGBOUNCER_PORT ? Number(process.env.PGBOUNCER_PORT) : undefined;
  let admin: DataSource;

  beforeAll(async () => {
    admin = await new DataSource({
      type: 'postgres',
      host,
      port: directPort,
      ...credentials,
      database: process.env.DATABASE_NAME || 'openwa',
    }).initialize();
  });

  afterAll(async () => {
    await admin?.destroy();
  });

  // The options app.module.ts builds for the data connection.
  const appOptions = (port: number, database: string, schema: string): DataSourceOptions => ({
    type: 'postgres',
    schema,
    host,
    port,
    ...credentials,
    database,
    migrations: [path.join(__dirname, '..', '*{.ts,.js}')],
    migrationsRun: true,
    extra: {
      max: 10,
      statement_timeout: 30000,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ...(schema !== 'public' ? { options: `-c search_path=${schema},public` } : {}),
    },
  });

  /** What four connections held at once report, so four pooled clients answer. */
  const settings = async (ds: DataSource): Promise<unknown[]> => {
    const runners = await Promise.all(
      [0, 1, 2, 3].map(async () => {
        const runner = ds.createQueryRunner();
        await runner.connect();
        return runner;
      }),
    );
    try {
      return await Promise.all(
        runners.map(async runner => {
          const [row] = (await runner.query(
            `SELECT current_setting('statement_timeout') AS timeout, current_setting('search_path') AS path,
                    current_setting('TimeZone') AS zone, to_regclass('messages') IS NOT NULL AS messages`,
          )) as unknown[];
          return row;
        }),
      );
    } finally {
      await Promise.all(runners.map(runner => runner.release()));
    }
  };

  const cases: Array<[string, number | undefined, string]> = [
    ['directly', directPort, 'public'],
    ['directly', directPort, 'boot_settings_schema'],
    ['through PgBouncer in session mode', poolerPort, 'public'],
    ['through PgBouncer in session mode', poolerPort, 'boot_settings_schema'],
  ];

  it.each(cases)(
    '%s (port %s), schema %s: boots, and every connection carries them, also after a reconnect',
    async (_how, port, schema) => {
      if (port === undefined) return; // no pooler configured for this run
      const database = `boot_settings_${process.pid}_${port}_${schema}`.slice(0, 63);
      await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${database}"`);
      if (schema !== 'public') {
        const scoped = await new DataSource({
          type: 'postgres',
          host,
          port: directPort,
          ...credentials,
          database,
        }).initialize();
        await scoped.query(`CREATE SCHEMA "${schema}"`);
        await scoped.destroy();
      }
      const expected = {
        timeout: '30s',
        path: schema === 'public' ? '"$user", public' : `${schema},public`,
        zone: 'UTC',
        messages: true,
      };
      const ds = await createBootDataSource(appOptions(port, database, schema));
      try {
        expect(await settings(ds)).toEqual([expected, expected, expected, expected]);
        await admin.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [database],
        );
        await new Promise(resolve => setTimeout(resolve, 300));
        let after: unknown[] = [];
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            after = await settings(ds);
            break;
          } catch {
            // A pooled client still holding a terminated backend fails once and leaves the pool.
          }
        }
        expect(after).toEqual([expected, expected, expected, expected]);
      } finally {
        await ds.destroy();
        await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      }
    },
    120_000,
  );

  it('keeps the runtime bound on the connection the contains index build lifted it on', async () => {
    const database = `boot_settings_${process.pid}_trigram`;
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${database}"`);
    const ds = await createBootDataSource(appOptions(directPort, database, 'public'));
    try {
      const provider = new BuiltInFtsProvider(ds, new ConfigService({ search: { containsEnabled: true } }));
      await provider.buildContainsIndex();
      const [{ valid }] = await ds.query<Array<{ valid: boolean }>>(
        `SELECT indisvalid AS valid FROM pg_index WHERE indexrelid = to_regclass('idx_messages_body_trgm')`,
      );
      expect(valid).toBe(true);
      // The pool hands out its last released connection first, so the build's own is among these.
      const timeouts = (await settings(ds)).map(row => (row as { timeout: string }).timeout);
      expect(timeouts).toEqual(['30s', '30s', '30s', '30s']);
      provider.onModuleDestroy();
    } finally {
      await ds.destroy();
      await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    }
  }, 120_000);
});
