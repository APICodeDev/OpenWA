import * as dnsPromises from 'dns/promises';
import { assertSafeFetchUrl, SsrfBlockedError } from './ssrf-guard';

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

  const warnings = (): string[] => warn.mock.calls.map(([line]) => String(line));

  it('names an entry with a scheme, port, path or wildcard, once, and still refuses the destination', async () => {
    process.env.SSRF_ALLOWED_HOSTS = 'http://n8n-a:5678, n8n-b:5678, n8n-c.local/hooks, *.corp-a, minio';
    jest.mocked(dnsPromises.lookup).mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as never);

    await expect(assertSafeFetchUrl('http://n8n-b:5678/hook')).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(assertSafeFetchUrl('http://n8n-b:5678/hook')).rejects.toBeInstanceOf(SsrfBlockedError);

    const lines = warnings().filter(line => line.includes('SSRF_ALLOWED_HOSTS'));
    expect(lines).toHaveLength(1);
    for (const entry of ['http://n8n-a:5678', 'n8n-b:5678', 'n8n-c.local/hooks', '*.corp-a']) {
      expect(lines[0]).toContain(entry);
    }
    expect(lines[0]).not.toContain('minio');
  });

  it('says nothing for host names and IP literals, whatever their case, brackets or underscores', async () => {
    process.env.SSRF_ALLOWED_HOSTS =
      'Localhost, minio, my_service.internal, host.docker.internal, 10.0.0.9, [::1], ::2';
    jest.mocked(dnsPromises.lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);

    await expect(assertSafeFetchUrl('http://localhost/')).resolves.toBeUndefined();

    expect(warnings().filter(line => line.includes('SSRF_ALLOWED_HOSTS'))).toEqual([]);
  });
});
