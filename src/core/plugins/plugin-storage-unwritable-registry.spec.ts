import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { PluginRegistryWriteError, PluginStorageService } from './plugin-storage.service';
import { PluginPackageScanner } from './plugin-package-scanner';
import { PluginInstance, PluginStatus, PluginType } from './plugin.interfaces';
import { createLogger } from '../../common/services/logger.service';

// Operator-facing registry writes fail loudly and leave the entry as it was; the boot scan and runtime status
// writes stay best-effort, so a read-only or full data volume still loads every plugin.
describe('PluginStorageService with a registry it cannot write', () => {
  let tmp: string;
  let pluginsRoot: string;
  let configService: ConfigService;
  let storage: PluginStorageService;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-registry-readonly-'));
    pluginsRoot = path.join(tmp, 'plugins');
    const values: Record<string, unknown> = { dataDir: tmp, 'plugins.dir': pluginsRoot };
    configService = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
    storage = new PluginStorageService(configService);
    storage.setPluginEntry({
      id: 'p1',
      type: PluginType.EXTENSION,
      name: 'P1',
      version: '1.0.0',
      status: PluginStatus.INSTALLED,
      config: { apiKey: 'old' },
      builtIn: false,
      installedAt: new Date(),
      updatedAt: new Date(0),
      enabledByOperator: true,
    });
  });

  afterEach(() => {
    fs.chmodSync(pluginsRoot, 0o700);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('throws on an operator write and keeps the entry as it was', () => {
    fs.chmodSync(pluginsRoot, 0o500);
    const before = { ...storage.getPluginEntry('p1') };

    expect(() => storage.setPluginConfig('p1', { apiKey: 'rotated' })).toThrow(PluginRegistryWriteError);
    expect(() => storage.setPluginEnabledByOperator('p1', false)).toThrow(PluginRegistryWriteError);
    expect(() => storage.setPluginSessions('p1', ['*'])).toThrow(PluginRegistryWriteError);
    expect(() => storage.setPluginSessionConfig('p1', { s1: { apiKey: 'x' } })).toThrow(PluginRegistryWriteError);
    expect(() => storage.deletePluginEntry('p1')).toThrow(PluginRegistryWriteError);

    expect(storage.getPluginEntry('p1')).toEqual(before);
    expect(storage.getPluginEntry('p1')).not.toHaveProperty('activeSessions', ['*']);
  });

  it('keeps a runtime status write best-effort', () => {
    fs.chmodSync(pluginsRoot, 0o500);

    expect(() => storage.setPluginStatus('p1', PluginStatus.ERROR)).not.toThrow();
    expect(storage.getPluginStatus('p1')).toBe(PluginStatus.ERROR);
  });

  it('still loads plugins at boot, a stale entry prune included', () => {
    const pkg = path.join(pluginsRoot, 'p1');
    fs.mkdirSync(pkg);
    fs.writeFileSync(
      path.join(pkg, 'manifest.json'),
      JSON.stringify({ id: 'p1', name: 'P1', version: '1.0.0', type: 'extension', main: 'index.js' }),
    );
    fs.writeFileSync(path.join(pkg, 'index.js'), 'module.exports = class {};');
    // A leftover directory of a removed bundled plugin, whose registry entry the scan prunes.
    fs.mkdirSync(path.join(pluginsRoot, 'auto-reply'));
    storage.setPluginEntry({ ...storage.getPluginEntry('p1')!, id: 'auto-reply', name: 'Auto reply' });
    fs.chmodSync(pluginsRoot, 0o500);
    const plugins = new Map<string, PluginInstance>();
    const scanner = new PluginPackageScanner(createLogger('test'), configService, storage, pluginsRoot, null, plugins);

    expect(() => scanner.scanAtBoot()).not.toThrow();
    expect(plugins.get('p1')?.status).toBe(PluginStatus.INSTALLED);
  });
});
