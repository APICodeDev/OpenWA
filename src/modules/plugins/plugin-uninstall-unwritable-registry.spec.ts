import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PluginLoaderService } from '../../core/plugins/plugin-loader.service';
import { PluginStorageService } from '../../core/plugins/plugin-storage.service';
import { HookManager } from '../../core/hooks';
import { PluginInstance, PluginStatus, PluginType } from '../../core/plugins/plugin.interfaces';
import type { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';

// The registry entry is the last thing an uninstall removes. When registry.json cannot take that write, the plugin
// is already unloaded and its package deleted, so the answer and the audit trail must say it was uninstalled, and
// the entry left behind must stay removable by repeating the call.
describe('Uninstall when registry.json cannot be written after the package is removed', () => {
  let tmp: string;
  let registryRoot: string;
  let packageDir: string;
  let configService: ConfigService;
  let storage: PluginStorageService;
  let loader: PluginLoaderService;
  let logInfo: jest.Mock;
  let controller: PluginsController;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-uninstall-unwritable-'));
    registryRoot = path.join(tmp, 'data', 'plugins');
    // PLUGINS_DIR outside the data directory: the package tree stays writable when the data volume does not.
    const packagesRoot = path.join(tmp, 'packages');
    fs.mkdirSync(packagesRoot, { recursive: true });
    const values: Record<string, unknown> = { dataDir: path.join(tmp, 'data'), 'plugins.dir': packagesRoot };
    configService = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
    storage = new PluginStorageService(configService);
    storage.setPluginEntry({
      id: 'p1',
      type: PluginType.EXTENSION,
      name: 'P1',
      version: '1.0.0',
      status: PluginStatus.INSTALLED,
      config: {},
      builtIn: false,
      installedAt: new Date(),
      updatedAt: new Date(),
    });
    const port = { unregister: jest.fn(), releaseTakeovers: jest.fn().mockResolvedValue(undefined) };
    loader = new PluginLoaderService(configService, new HookManager(), storage, {
      get: jest.fn().mockReturnValue(port),
    } as unknown as ModuleRef);
    packageDir = path.join(packagesRoot, 'p1');
    fs.mkdirSync(packageDir);
    fs.writeFileSync(path.join(packageDir, 'manifest.json'), '{}');
    const plugin = {
      manifest: { id: 'p1', name: 'P1', version: '1.0.0', type: PluginType.EXTENSION, main: 'index.js' },
      status: PluginStatus.INSTALLED,
      config: {},
      instance: {},
      builtIn: false,
      packageDir,
    } as PluginInstance;
    (loader as unknown as { plugins: Map<string, PluginInstance> }).plugins.set('p1', plugin);
    logInfo = jest.fn().mockResolvedValue(null);
    controller = new PluginsController(new PluginsService(loader, configService), {
      logInfo,
    } as unknown as AuditService);
  });

  afterEach(() => {
    fs.chmodSync(registryRoot, 0o700);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const onDisk = () => new PluginStorageService(configService);

  it('answers the uninstall as done, audits it, and keeps the entry until a repeat can store its removal', async () => {
    // The data volume's plugin directory stops accepting writes (an ownership change).
    fs.chmodSync(registryRoot, 0o500);

    const result = await controller.uninstall('p1');

    expect(loader.getPlugin('p1')).toBeUndefined();
    expect(fs.existsSync(packageDir)).toBe(false);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/uninstalled/);
    expect(result.message).toMatch(/registry/);
    expect(result.message).not.toMatch(/not applied/);
    expect(logInfo).toHaveBeenCalledWith(AuditAction.PLUGIN_UNINSTALLED, {
      sessionId: undefined,
      metadata: { pluginId: 'p1' },
    });
    // The entry stays in memory and on disk alike, so the repeat below and one after a restart both find it.
    expect(storage.getPluginEntry('p1')).toBeDefined();
    expect(onDisk().getPluginEntry('p1')).toBeDefined();

    fs.chmodSync(registryRoot, 0o700);
    const repeat = await controller.uninstall('p1');

    expect(repeat).toEqual({ success: true, message: 'Plugin p1 uninstalled successfully' });
    expect(storage.getPluginEntry('p1')).toBeUndefined();
    expect(onDisk().getPluginEntry('p1')).toBeUndefined();
  });
});
