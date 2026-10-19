import { pem } from '../test/fixtures/fixtures';
import { CrlFetcher, CrlStore } from './crl.store';

const URL = 'http://pki.test/issuing.crl';

function store(responses: (string | Error)[], now: { t: Date }) {
  const calls: string[] = [];
  const fetcher: CrlFetcher = {
    async fetch(url) {
      calls.push(url);
      const next = responses.shift();
      if (!next || next instanceof Error) throw next ?? new Error('404');
      return Buffer.from(next);
    },
  };
  const s = new CrlStore({
    fetcher,
    maxCacheAgeMs: 60 * 60 * 1000,
    retryAfterFailureMs: 60_000,
    now: () => now.t,
  });
  return { s, calls };
}

describe('CrlStore', () => {
  it('caches until the cache age limit, then refetches', async () => {
    const now = { t: new Date('2030-01-01T00:00:00Z') };
    const { s, calls } = store(
      [pem('issuing.crl.pem'), pem('issuing.crl.pem')],
      now,
    );
    const first = await s.load(URL);
    expect(first.expiresAt).toEqual(new Date('2030-01-01T01:00:00Z'));
    await s.load(URL);
    expect(calls).toHaveLength(1);
    now.t = new Date('2030-01-01T02:00:00Z');
    await s.load(URL);
    expect(calls).toHaveLength(2);
  });

  it('shares one fetch between concurrent loads', async () => {
    const { s, calls } = store([pem('issuing.crl.pem')], {
      t: new Date('2030-01-01Z'),
    });
    await Promise.all([s.load(URL), s.load(URL)]);
    expect(calls).toHaveLength(1);
  });

  it('backs off after a failure', async () => {
    const now = { t: new Date('2030-01-01T00:00:00Z') };
    const { s, calls } = store(
      [new Error('down'), pem('issuing.crl.pem')],
      now,
    );
    await expect(s.load(URL)).rejects.toThrow('down');
    await expect(s.load(URL)).rejects.toThrow('down');
    expect(calls).toHaveLength(1);
    now.t = new Date('2030-01-01T00:02:00Z');
    await expect(s.load(URL)).resolves.toBeDefined();
  });

  it('refuses a CRL past its NextUpdate', async () => {
    const { s } = store([pem('issuing-stale.crl.pem')], {
      t: new Date('2030-01-01Z'),
    });
    await expect(s.load(URL)).rejects.toThrow('stale CRL');
  });
});
