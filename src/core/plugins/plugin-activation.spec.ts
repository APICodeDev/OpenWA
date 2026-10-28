import {
  type ConfigLayerManifest,
  isAllSessionsScope,
  isPluginActiveForSession,
  resolveInstanceConfig,
  resolvePluginConfig,
  sessionScopeKey,
} from './plugin-activation';

describe('isPluginActiveForSession', () => {
  it('a global (non-session-scoped) plugin is always active', () => {
    expect(isPluginActiveForSession(false, [], 'sess-1')).toBe(true);
    expect(isPluginActiveForSession(false, ['other'], 'sess-1')).toBe(true);
  });

  it("a session-scoped plugin with ['*'] is active for any session", () => {
    expect(isPluginActiveForSession(true, ['*'], 'sess-1')).toBe(true);
    expect(isPluginActiveForSession(true, ['*'], 'sess-2')).toBe(true);
  });

  it('a session-scoped plugin is active only for sessions in its list', () => {
    expect(isPluginActiveForSession(true, ['sess-1', 'sess-2'], 'sess-1')).toBe(true);
    expect(isPluginActiveForSession(true, ['sess-1', 'sess-2'], 'sess-3')).toBe(false);
  });

  it('an empty active list means active for no session', () => {
    expect(isPluginActiveForSession(true, [], 'sess-1')).toBe(false);
  });

  it('a non-session-attributed event (no sessionId) is not gated', () => {
    expect(isPluginActiveForSession(true, [], undefined)).toBe(true);
  });
});

const NO_HOSTS: ConfigLayerManifest = {};

describe('resolvePluginConfig', () => {
  const base = { greeting: 'hi', lang: 'en', timeoutMs: 4000 };

  it('returns the base config when there is no per-session override', () => {
    expect(resolvePluginConfig(base, undefined, 'sess-1', true, NO_HOSTS)).toEqual(base);
    expect(resolvePluginConfig(base, {}, 'sess-1', true, NO_HOSTS)).toEqual(base);
    expect(resolvePluginConfig(base, { 'other-sess': { lang: 'he' } }, 'sess-1', true, NO_HOSTS)).toEqual(base);
  });

  it('shallow-merges the session override over the base (override wins per top-level key)', () => {
    expect(resolvePluginConfig(base, { 'sess-1': { lang: 'he', extra: true } }, 'sess-1', true, NO_HOSTS)).toEqual({
      greeting: 'hi',
      lang: 'he',
      timeoutMs: 4000,
      extra: true,
    });
  });

  it('deep-merges a nested object override, inheriting untouched nested keys (e.g. a nested secret)', () => {
    const b = { smtp: { host: 'mail.x', password: 'real' }, lang: 'en' };
    const sc = { 'sess-1': { smtp: { host: 'mail.y' } } };
    expect(resolvePluginConfig(b, sc, 'sess-1', true, NO_HOSTS)).toEqual({
      smtp: { host: 'mail.y', password: 'real' },
      lang: 'en',
    });
  });

  it('replaces arrays wholesale on override (no element-wise merge)', () => {
    const b = { items: [1, 2, 3] };
    const sc = { 'sess-1': { items: [9] } };
    expect(resolvePluginConfig(b, sc, 'sess-1', true, NO_HOSTS)).toEqual({ items: [9] });
  });

  it('ignores overrides for a global (non-session-scoped) plugin', () => {
    expect(resolvePluginConfig(base, { 'sess-1': { lang: 'he' } }, 'sess-1', false, NO_HOSTS)).toEqual(base);
  });

  it('ignores overrides for a non-session-attributed event (no sessionId)', () => {
    expect(resolvePluginConfig(base, { 'sess-1': { lang: 'he' } }, undefined, true, NO_HOSTS)).toEqual(base);
  });

  it('does not mutate the base or the override', () => {
    const b = { a: 1 };
    const sc = { 'sess-1': { a: 2 } };
    const out = resolvePluginConfig(b, sc, 'sess-1', true, NO_HOSTS);
    expect(out).toEqual({ a: 2 });
    expect(b).toEqual({ a: 1 });
    expect(sc).toEqual({ 'sess-1': { a: 2 } });
  });
});

// An adapter that calls an operator-configured host (a Chatwoot-style base URL) with a stored token.
const adapter: ConfigLayerManifest = {
  net: { allowConfigHosts: ['baseUrl'] },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string' },
      apiToken: { type: 'string', secret: true },
      inboxId: { type: 'string' },
      auth: {
        type: 'object',
        properties: { user: { type: 'string' }, password: { type: 'string', secret: true } },
      },
      accounts: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' }, key: { type: 'string', secret: true } },
        },
      },
      tags: { type: 'array', items: { type: 'string' } },
    },
  },
};

describe('a layer that names another host than the layer beneath', () => {
  const base = {
    baseUrl: 'https://chat.example.com',
    apiToken: 'OPERATOR-TOKEN',
    inboxId: '7',
    auth: { user: 'bot', password: 'OPERATOR-PASSWORD' },
    accounts: [{ id: 'a', key: 'OPERATOR-KEY' }],
    tags: ['x'],
  };
  const resolveFor = (override: Record<string, unknown>, manifest: ConfigLayerManifest = adapter) =>
    resolvePluginConfig(base, { 'sess-1': override }, 'sess-1', true, manifest);

  it('does not inherit the declared secrets, at any depth, and keeps everything else', () => {
    expect(resolveFor({ baseUrl: 'https://attacker.example' })).toEqual({
      baseUrl: 'https://attacker.example',
      inboxId: '7',
      auth: { user: 'bot' },
      tags: ['x'],
    });
  });

  it('keeps the secrets the layer brings itself', () => {
    expect(resolveFor({ baseUrl: 'https://other.example', apiToken: 'OWN', auth: { password: 'OWN-PW' } })).toEqual({
      baseUrl: 'https://other.example',
      apiToken: 'OWN',
      inboxId: '7',
      auth: { user: 'bot', password: 'OWN-PW' },
      tags: ['x'],
    });
  });

  it('inherits them when the layer names the same origin, however it is spelled', () => {
    for (const same of ['https://chat.example.com', 'HTTPS://Chat.Example.com:443/other/path?x=1']) {
      expect(resolveFor({ baseUrl: same })).toMatchObject({ apiToken: 'OPERATOR-TOKEN', auth: base.auth });
    }
  });

  it('inherits them when the layer leaves the host key alone', () => {
    expect(resolveFor({ inboxId: '9' })).toMatchObject({ apiToken: 'OPERATOR-TOKEN', inboxId: '9' });
  });

  it('is no redirect when the host key is set to nothing or to a non-string', () => {
    for (const none of ['', '   ', null, 5]) {
      expect(resolveFor({ baseUrl: none })).toMatchObject({ apiToken: 'OPERATOR-TOKEN' });
    }
  });

  it('counts a host named where the base names none', () => {
    expect(resolvePluginConfig({ apiToken: 'T' }, { s: { baseUrl: 'https://x.example' } }, 's', true, adapter)).toEqual(
      {
        baseUrl: 'https://x.example',
      },
    );
  });

  it('compares a value that is no URL as text', () => {
    expect(resolveFor({ baseUrl: 'chat.example.com' })).not.toHaveProperty('apiToken');
  });

  it('inherits nothing when the manifest declares no schema, as nothing can be told secret', () => {
    expect(resolveFor({ baseUrl: 'https://attacker.example' }, { net: adapter.net })).toEqual({
      baseUrl: 'https://attacker.example',
    });
  });

  it('merges as before when the manifest names no host keys', () => {
    expect(resolveFor({ baseUrl: 'https://attacker.example' }, { configSchema: adapter.configSchema })).toMatchObject({
      apiToken: 'OPERATOR-TOKEN',
    });
    expect(resolveFor({ baseUrl: 'https://attacker.example' }, { ...adapter, net: { allow: ['*'] } })).toMatchObject({
      apiToken: 'OPERATOR-TOKEN',
    });
  });

  it('does not mutate the layer beneath', () => {
    const before = JSON.stringify(base);
    resolveFor({ baseUrl: 'https://attacker.example' });
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe('resolveInstanceConfig', () => {
  const resolved = { baseUrl: 'https://chat.example.com', apiToken: 'OPERATOR-TOKEN', inboxId: '7' };

  it('returns what the earlier layers produced when the instance has no config', () => {
    expect(resolveInstanceConfig(resolved, null, adapter)).toBe(resolved);
    expect(resolveInstanceConfig(resolved, undefined, adapter)).toBe(resolved);
  });

  it('does not hand the secrets beneath to an instance that names another host', () => {
    expect(resolveInstanceConfig(resolved, { baseUrl: 'https://attacker.example' }, adapter)).toEqual({
      baseUrl: 'https://attacker.example',
      inboxId: '7',
    });
  });

  it('hands them to an instance that names the same host or none', () => {
    expect(resolveInstanceConfig(resolved, { baseUrl: 'https://chat.example.com/x' }, adapter)).toMatchObject({
      apiToken: 'OPERATOR-TOKEN',
    });
    expect(resolveInstanceConfig(resolved, { inboxId: '9' }, adapter)).toMatchObject({ apiToken: 'OPERATOR-TOKEN' });
  });

  it('applies on top of a session override that kept the base host', () => {
    const viaOverride = resolvePluginConfig(resolved, { s: { inboxId: '8' } }, 's', true, adapter);
    expect(viaOverride).toMatchObject({ apiToken: 'OPERATOR-TOKEN', inboxId: '8' });
    expect(resolveInstanceConfig(viaOverride, { baseUrl: 'https://attacker.example' }, adapter)).not.toHaveProperty(
      'apiToken',
    );
  });
});

describe('the all-sessions scope', () => {
  it.each([null, undefined, '', '*'])('is one key whichever way it is spelled (%j)', scope => {
    expect(sessionScopeKey(scope)).toBe('*');
    expect(isAllSessionsScope(scope)).toBe(true);
  });

  it('leaves a concrete session id as it is', () => {
    expect(sessionScopeKey('sess-1')).toBe('sess-1');
    expect(isAllSessionsScope('sess-1')).toBe(false);
  });
});
