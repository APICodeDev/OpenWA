import { EventEmitter } from 'events';
import * as fs from 'fs';
import { Client, WAState } from 'whatsapp-web.js';
import { WhatsAppWebJsAdapter } from './whatsapp-web-js.adapter';
import { NAVIGATION_EPISODE_CAP_MS, NAVIGATION_REINJECT_GRACE_MS, WwebjsLifecycle } from './wwebjs-lifecycle';
import { EngineStatus } from '../interfaces/whatsapp-engine.interface';

/**
 * WhatsApp Web's socket answers CONNECTED again after a page reload whether or not whatsapp-web.js managed to
 * re-inject into the new page, and the library's re-emitted 'ready' can come from a run that started in the
 * previous document. So while a reload of a ready page is unverified the liveness probe also asks the page for
 * whatsapp-web.js's helpers. It never answers dead inside the reload grace, nor for a reload that is merely
 * slow: only once the helpers stayed missing past the episode cap.
 */
describe('liveness of a ready page after a reload', () => {
  type Page = EventEmitter & { evaluate: jest.Mock };
  type FakeClient = EventEmitter & { getState: jest.Mock; pupBrowser: EventEmitter; pupPage: Page };

  const wire = (): { adapter: WhatsAppWebJsAdapter; client: FakeClient } => {
    const adapter = new WhatsAppWebJsAdapter({
      sessionId: 'sess-reload',
      sessionDataPath: './data/sessions',
      puppeteer: {},
    });
    const pupPage = Object.assign(new EventEmitter(), { evaluate: jest.fn().mockResolvedValue(true) });
    const client = Object.assign(new EventEmitter(), {
      getState: jest.fn().mockResolvedValue(WAState.CONNECTED),
      pupBrowser: new EventEmitter(),
      pupPage,
    });
    (adapter as unknown as { client: unknown }).client = client;
    (adapter as unknown as { callbacks: unknown }).callbacks = {};
    (adapter as unknown as { status: EngineStatus }).status = EngineStatus.READY;
    const lifecycle = (adapter as unknown as { lifecycle: WwebjsLifecycle }).lifecycle;
    lifecycle.setupEventHandlers();
    lifecycle.attachPuppeteerLifecycleListeners();
    return { adapter, client };
  };
  const reload = (client: FakeClient): void => {
    client.pupPage.emit('framenavigated', { url: () => 'https://web.whatsapp.com/' });
  };
  const later = (ms: number): void => {
    jest.setSystemTime(Date.now() + ms);
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('answers alive after a normal reload and stops asking once the helpers were found', async () => {
    const { adapter, client } = wire();
    reload(client);
    client.emit('ready');

    await expect(adapter.probeLiveness()).resolves.toBe(true);
    later(NAVIGATION_EPISODE_CAP_MS);
    client.pupPage.evaluate.mockResolvedValue(false);
    await expect(adapter.probeLiveness()).resolves.toBe(true);

    expect(client.pupPage.evaluate).toHaveBeenCalledTimes(1);
  });

  it('never answers dead inside the reload grace while the helpers are still missing', async () => {
    const { adapter, client } = wire();
    client.pupPage.evaluate.mockResolvedValue(false);
    reload(client);
    later(NAVIGATION_REINJECT_GRACE_MS / 2);

    await expect(adapter.probeLiveness()).resolves.toBe(true);
  });

  it('keeps answering alive for a slow reload that is still under the episode cap', async () => {
    const { adapter, client } = wire();
    client.pupPage.evaluate.mockResolvedValue(false);
    reload(client);
    later(NAVIGATION_EPISODE_CAP_MS - 1_000);

    await expect(adapter.probeLiveness()).resolves.toBe(true);
  });

  it('answers dead once the helpers stayed missing past the episode cap', async () => {
    const { adapter, client } = wire();
    client.pupPage.evaluate.mockResolvedValue(false);
    reload(client);
    later(NAVIGATION_EPISODE_CAP_MS);

    await expect(adapter.probeLiveness()).resolves.toBe(false);
  });

  // A 'ready' that reaches us after the reload closes the grace window, but it may belong to the previous page.
  it('is not convinced by a ready that the reloaded page itself did not back', async () => {
    const { adapter, client } = wire();
    client.pupPage.evaluate.mockResolvedValue(false);
    reload(client);
    client.emit('ready');

    later(NAVIGATION_EPISODE_CAP_MS - 1_000);
    await expect(adapter.probeLiveness()).resolves.toBe(true);
    later(1_000);
    await expect(adapter.probeLiveness()).resolves.toBe(false);
  });

  it('treats a helpers read that fails or hangs like missing helpers, inside the same probe budget', async () => {
    const { adapter, client } = wire();
    client.pupPage.evaluate.mockRejectedValue(new Error('Execution context was destroyed.'));
    reload(client);
    later(NAVIGATION_REINJECT_GRACE_MS + 1_000);
    await expect(adapter.probeLiveness()).resolves.toBe(true);

    later(NAVIGATION_EPISODE_CAP_MS);
    client.pupPage.evaluate.mockReturnValue(new Promise<never>(() => {}));
    const probe = adapter.probeLiveness();
    const assertion = expect(probe).resolves.toBe(false);
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not ask the page when no reload is pending', async () => {
    const { adapter, client } = wire();

    await expect(adapter.probeLiveness()).resolves.toBe(true);
    expect(client.pupPage.evaluate).not.toHaveBeenCalled();
  });
});

describe('a re-inject that throws in a reloaded page', () => {
  let rmSpy: jest.SpyInstance;
  let initSpy: jest.SpyInstance;
  let injectSpy: jest.SpyInstance;
  let savedWebVersion: string | undefined;

  beforeEach(() => {
    savedWebVersion = process.env.WWEBJS_WEB_VERSION;
    process.env.WWEBJS_WEB_VERSION = 'off';
    rmSpy = jest.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);
    initSpy = jest
      .spyOn(Client.prototype as unknown as { initialize: () => Promise<void> }, 'initialize')
      .mockResolvedValue(undefined);
    injectSpy = jest
      .spyOn(Client.prototype as unknown as { inject: () => Promise<void> }, 'inject')
      .mockRejectedValue('ready timeout');
  });
  afterEach(() => {
    rmSpy.mockRestore();
    initSpy.mockRestore();
    injectSpy.mockRestore();
    if (savedWebVersion === undefined) delete process.env.WWEBJS_WEB_VERSION;
    else process.env.WWEBJS_WEB_VERSION = savedWebVersion;
  });

  it('is logged as a warning naming the session instead of escaping as an unhandled rejection', async () => {
    const adapter = new WhatsAppWebJsAdapter({
      sessionId: 'sess-reinject',
      sessionDataPath: './data/sessions',
      puppeteer: {},
    });
    const warn = jest.spyOn((adapter as unknown as { logger: { warn: () => void } }).logger, 'warn');
    await adapter.initialize({});
    const client = (adapter as unknown as { client: { inject: () => Promise<void> } }).client;

    // whatsapp-web.js calls this from its own framenavigated listener, which awaits nothing.
    await expect(client.inject()).resolves.toBeUndefined();

    expect(injectSpy).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('re-inject'),
      expect.objectContaining({ sessionId: 'sess-reinject', action: 'page_reinject_failed', error: 'ready timeout' }),
    );
  });
});
