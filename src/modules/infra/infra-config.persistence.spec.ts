import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { recordOsEnvKeys, recordPinnedEnvKeys } from '../../config/env-precedence';
import { InfraConfigController } from './infra-config.controller';

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return { ...actual, writeFileSync: jest.fn(actual.writeFileSync), renameSync: jest.fn(actual.renameSync) };
});

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const dotenv = jest.requireActual<typeof import('dotenv')>('dotenv');
const pinKeys = ['DATABASE_TYPE', 'DATABASE_HOST', 'DATABASE_SSL', 'REDIS_HOST', 'S3_ENDPOINT'];
let directory: string;
let file: string;
let previous: Array<[string, string | undefined]>;

beforeEach(() => {
  directory = actualFs.mkdtempSync(path.join(os.tmpdir(), 'openwa-config-'));
  actualFs.mkdirSync(path.join(directory, 'data'));
  file = path.join(directory, 'data', '.env.generated');
  previous = pinKeys.map(key => [key, process.env[key]]);
  for (const key of pinKeys) delete process.env[key];
  recordOsEnvKeys({});
  recordPinnedEnvKeys({});
  jest.spyOn(process, 'cwd').mockReturnValue(directory);
  jest.mocked(fs.writeFileSync).mockImplementation(actualFs.writeFileSync);
  jest.mocked(fs.renameSync).mockImplementation(actualFs.renameSync);
  seed({});
});

afterEach(() => {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  recordOsEnvKeys(process.env);
  recordPinnedEnvKeys({});
  jest.restoreAllMocks();
  actualFs.rmSync(directory, { recursive: true, force: true });
});

function seed(values: Record<string, string>): void {
  const config = { DATABASE_TYPE: 'sqlite', STORAGE_TYPE: 'local', ENGINE_TYPE: 'baileys', ...values };
  actualFs.writeFileSync(
    file,
    Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
}

function build(available = true) {
  const stop = jest.fn().mockResolvedValue(true);
  const shutdown = jest.fn();
  return {
    stop,
    shutdown,
    controller: new InfraConfigController(
      { getAvailableEngines: () => [{ id: 'baileys' }, { id: 'whatsapp-web.js' }] } as never,
      { isDockerAvailable: () => available, stopManagedService: stop, orchestrateProfiles: jest.fn() } as never,
      { shutdown } as never,
    ),
  };
}

it.each([true, false])('preserves the SQLite file path with an explicit type %s', explicit => {
  seed({ DATABASE_NAME: './data/customer.sqlite' });
  const result = build().controller.saveConfig({
    database: explicit ? { type: 'sqlite' } : {},
    engine: { headless: false },
  });
  expect(result.saved).toBe(true);
  expect(dotenv.parse(actualFs.readFileSync(file)).DATABASE_NAME).toBe('./data/customer.sqlite');
});

it('drops the PostgreSQL database name when leaving PostgreSQL for SQLite', () => {
  seed({ DATABASE_TYPE: 'postgres', DATABASE_HOST: 'db.example.invalid', DATABASE_NAME: 'openwa' });
  const result = build().controller.saveConfig({ database: { type: 'sqlite' } });
  expect(result.saved).toBe(true);
  expect(dotenv.parse(actualFs.readFileSync(file))).not.toHaveProperty('DATABASE_NAME');
});
