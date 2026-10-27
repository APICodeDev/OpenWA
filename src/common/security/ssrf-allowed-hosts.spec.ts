import * as dnsPromises from 'dns/promises';
import { assertSafeFetchUrl, SsrfBlockedError, warnUnusableAllowedHosts } from './ssrf-guard';

jest.mock('dns/promises', () => {
  const actual = jest.requireActual<typeof import('dns/promises')>('dns/promises');
  return { __esModule: true, ...actual, lookup: jest.fn(actual.lookup) };
});

describe('SSRF_ALLOWED_HOSTS entries the guard can never match', () => {
  const original = process.env.SSRF_ALLOWED_HOSTS;
  let warn: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    jest.mocked(dnsPromises.lookup).mockReset();
    if (original === undefined) delete process.env.SSRF_ALLOWED_HOSTS;
    else process.env.SSRF_ALLOWED_HOSTS = original;
  });

  const warnings = (): string[] =>
    warn.mock.calls.map(([line]) => String(line)).filter(line => line.includes('SSRF_ALLOWED_HOSTS'));

  it('names each entry by position and reason, once, without echoing it, and still refuses the destination', async () => {
    process.env.SSRF_ALLOWED_HOSTS =
      'https://user:token@n8n-a:5678, n8n-b:5678, n8n-c.local/hooks, *.corp-a, minio, 127.1, 0:0:0:0:0:0:0:1, 2130706433';
    jest.mocked(dnsPromises.lookup).mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as never);

    await expect(assertSafeFetchUrl('http://n8n-b:5678/hook')).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(assertSafeFetchUrl('http://n8n-b:5678/hook')).rejects.toBeInstanceOf(SsrfBlockedError);

    const lines = warnings();
    expect(lines).toHaveLength(1);
    for (const named of [
      'entry 1 (a scheme or credentials)',
      'entry 2 (a port)',
      'entry 3 (a path)',
      'entry 4 (a wildcard)',
      'entry 6 (a spelling the URL parser rewrites)',
      'entry 7 (a spelling the URL parser rewrites)',
      'entry 8 (a spelling the URL parser rewrites)',
    ]) {
      expect(lines[0]).toContain(named);
    }
    expect(lines[0]).not.toContain('entry 5');
    expect(lines[0]).not.toMatch(/token|user|n8n|corp|hooks|minio/);
  });

  // The URL parser rewrites these hosts, and the guard compares the rewritten hostname, so the spelling written in
  // the entry never equals it; the same address written as the parser prints it does.
  it('is right that a non-canonical IP address entry never matches, and that the canonical one does', async () => {
    process.env.SSRF_ALLOWED_HOSTS = '127.1';
    await expect(assertSafeFetchUrl('http://127.1/')).rejects.toBeInstanceOf(SsrfBlockedError);

    process.env.SSRF_ALLOWED_HOSTS = '0:0:0:0:0:0:0:1';
    await expect(assertSafeFetchUrl('http://[::1]/')).rejects.toBeInstanceOf(SsrfBlockedError);

    process.env.SSRF_ALLOWED_HOSTS = '127.0.0.1, ::1';
    jest
      .mocked(dnsPromises.lookup)
      .mockImplementation(((host: string) =>
        Promise.resolve([{ address: host, family: host.includes(':') ? 6 : 4 }])) as never);
    await expect(assertSafeFetchUrl('http://127.1/')).resolves.toBeUndefined();
    await expect(assertSafeFetchUrl('http://[0:0:0:0:0:0:0:1]/')).resolves.toBeUndefined();
  });

  it('says nothing for host names and IP literals the parser keeps as written', async () => {
    process.env.SSRF_ALLOWED_HOSTS =
      'Localhost, minio, my_service.internal, host.docker.internal, minio., 10.0.0.9, [::1], ::2, fe80::1, ,';
    jest.mocked(dnsPromises.lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);

    await expect(assertSafeFetchUrl('http://localhost/')).resolves.toBeUndefined();
    warnUnusableAllowedHosts();

    expect(warnings()).toEqual([]);
  });
});
