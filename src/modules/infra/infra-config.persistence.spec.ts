import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GLOBAL_VALIDATION_OPTIONS } from '../../config/app-validation';
import { recordOsEnvKeys, recordPinnedEnvKeys } from '../../config/env-precedence';
import { SaveConfigDto } from './dto/save-config.dto';
import { InfraConfigController } from './infra-config.controller';

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return { ...actual, writeFileSync: jest.fn(actual.writeFileSync), renameSync: jest.fn(actual.renameSync) };
});

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const dotenv = jest.requireActual<typeof import('dotenv')>('dotenv');
const database = {
  DATABASE_TYPE: 'postgres',
  DATABASE_HOST: 'db.example.invalid',
  DATABASE_USERNAME: 'app',
  DATABASE_PASSWORD: 'DummyPassword123456',
};
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

async function admitted<T>(body: unknown, metatype: new () => T): Promise<T> {
  return new ValidationPipe(GLOBAL_VALIDATION_OPTIONS).transform(body, { type: 'body', metatype }) as Promise<T>;
}

async function save(body: unknown) {
  return build().controller.saveConfig(await admitted(body, SaveConfigDto));
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

it('preserves the old overlay after a bounded partial write failure and lets a retry succeed', async () => {
  seed({ ...database, PUPPETEER_HEADLESS: 'true' });
  const before = actualFs.readFileSync(file);
  jest.mocked(fs.writeFileSync).mockImplementationOnce((target, data, options) => {
    actualFs.writeFileSync(
      target,
      (typeof data === 'string'
        ? Buffer.from(data)
        : Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      ).subarray(0, 64),
      options,
    );
    throw Object.assign(new Error('bounded write failure'), { code: 'ENOSPC' });
  });
  expect((await save({ engine: { headless: false } })).saved).toBe(false);
  expect(actualFs.readFileSync(file)).toEqual(before);
  expect(actualFs.readdirSync(path.dirname(file))).toEqual(['.env.generated']);
  expect((await save({ engine: { headless: false } })).saved).toBe(true);
  expect(dotenv.parse(actualFs.readFileSync(file)).PUPPETEER_HEADLESS).toBe('false');
});

it('preserves the old overlay and removes staging after a replacement failure', async () => {
  const before = actualFs.readFileSync(file);
  jest.mocked(fs.renameSync).mockImplementationOnce(() => {
    throw new Error('replacement denied');
  });
  expect((await save({ engine: { headless: false } })).saved).toBe(false);
  expect(actualFs.readFileSync(file)).toEqual(before);
  expect(actualFs.readdirSync(path.dirname(file))).toEqual(['.env.generated']);
});

it('creates and replaces the overlay owner-only', async () => {
  actualFs.unlinkSync(file);
  expect((await save({ engine: { headless: false } })).saved).toBe(true);
  expect((await save({ engine: { headless: true } })).saved).toBe(true);
  if (process.platform !== 'win32') expect(actualFs.statSync(file).mode & 0o777).toBe(0o600);
  expect(dotenv.parse(actualFs.readFileSync(file)).PUPPETEER_HEADLESS).toBe('true');
});

const invalidBootCases: Array<{
  name: string;
  stored: Record<string, string>;
  pins: Record<string, string>;
  body: unknown;
}> = [
  {
    name: 'missing PostgreSQL host and user',
    stored: {},
    pins: {},
    body: { database: { type: 'postgres', password: 'DummyPassword123456' } },
  },
  {
    name: 'a PostgreSQL bare name under a SQLite type pin',
    stored: {},
    pins: { DATABASE_TYPE: 'sqlite' },
    body: { database: { type: 'postgres', builtIn: true } },
  },
  { name: 'an exponent-form pool size', stored: database, pins: {}, body: { database: { poolSize: 1e21 } } },
];
for (const example of invalidBootCases) {
  it(`refuses ${example.name} before persisting`, async () => {
    seed(example.stored);
    Object.assign(process.env, example.pins);
    recordPinnedEnvKeys(example.pins);
    const before = actualFs.readFileSync(file);
    const input = await admitted(example.body, SaveConfigDto);
    expect(() => build().controller.saveConfig(input)).toThrow(BadRequestException);
    expect(actualFs.readFileSync(file)).toEqual(before);
    expect(actualFs.readdirSync(path.dirname(file))).toEqual(['.env.generated']);
  });
}

it('accepts a valid partial PostgreSQL change and preserves an absent pool value', async () => {
  seed({ ...database, DATABASE_POOL_SIZE: '17' });
  expect((await save({ database: { poolSize: null } })).saved).toBe(true);
  expect(dotenv.parse(actualFs.readFileSync(file)).DATABASE_POOL_SIZE).toBe('17');
  expect((await save({ database: { poolSize: 18 } })).saved).toBe(true);
  expect(dotenv.parse(actualFs.readFileSync(file)).DATABASE_POOL_SIZE).toBe('18');
});
