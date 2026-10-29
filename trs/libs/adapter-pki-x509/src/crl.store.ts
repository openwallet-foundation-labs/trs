import { Crl, parseCrl } from './crl';

export interface CrlFetcher {
  fetch(url: string): Promise<Buffer>;
}

export interface HttpCrlFetcherOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export class CrlFetchError extends Error {
  constructor(
    readonly url: string,
    message: string,
  ) {
    super(`${url}: ${message}`);
    this.name = 'CrlFetchError';
  }
}

export class HttpCrlFetcher implements CrlFetcher {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;

  constructor(opts: HttpCrlFetcherOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxBytes = opts.maxBytes ?? 16 * 1024 * 1024;
    this.maxRedirects = opts.maxRedirects ?? 3;
  }

  async fetch(url: string): Promise<Buffer> {
    let current = this.checkUrl(url, url);
    const origin = current.origin;
    for (let hop = 0; ; hop++) {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: 'application/pkix-crl, */*' },
      }).catch((e: Error) => {
        throw new CrlFetchError(url, e.message);
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location || hop >= this.maxRedirects) {
          throw new CrlFetchError(url, 'too many or invalid redirects');
        }
        const next = this.checkUrl(url, new URL(location, current).href);
        if (next.origin !== origin) {
          throw new CrlFetchError(
            url,
            `cross-origin redirect to ${next.origin}`,
          );
        }
        current = next;
        continue;
      }
      if (!res.ok) throw new CrlFetchError(url, `HTTP ${res.status}`);
      return this.readBody(url, res);
    }
  }

  private checkUrl(original: string, candidate: string): URL {
    let u: URL;
    try {
      u = new URL(candidate);
    } catch {
      throw new CrlFetchError(original, 'invalid URL');
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      throw new CrlFetchError(original, `refusing ${u.protocol} URL`);
    }
    return u;
  }

  private async readBody(url: string, res: Response): Promise<Buffer> {
    if (Number(res.headers.get('content-length')) > this.maxBytes) {
      throw new CrlFetchError(url, `CRL larger than ${this.maxBytes} bytes`);
    }
    if (!res.body) return Buffer.alloc(0);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > this.maxBytes) {
        await reader.cancel();
        throw new CrlFetchError(url, `CRL larger than ${this.maxBytes} bytes`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }
}

export interface LoadedCrl {
  url: string;
  crl: Crl;
  expiresAt: Date;
}

interface Entry {
  loaded?: LoadedCrl;
  failure?: { error: Error; retryAt: number };
  pending?: Promise<LoadedCrl>;
}

export class CrlStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly opts: {
      fetcher: CrlFetcher;
      maxCacheAgeMs: number;
      retryAfterFailureMs: number;
      now: () => Date;
    },
  ) {}

  async load(url: string): Promise<LoadedCrl> {
    const now = this.opts.now().getTime();
    const entry = this.entries.get(url) ?? {};
    this.entries.set(url, entry);

    if (entry.loaded && entry.loaded.expiresAt.getTime() > now)
      return entry.loaded;
    if (entry.failure && entry.failure.retryAt > now) throw entry.failure.error;
    if (entry.pending) return entry.pending;

    entry.pending = this.fetch(url, now)
      .then((loaded) => {
        entry.loaded = loaded;
        entry.failure = undefined;
        return loaded;
      })
      .catch((e: Error) => {
        entry.failure = {
          error: e,
          retryAt: now + this.opts.retryAfterFailureMs,
        };
        throw e;
      })
      .finally(() => {
        entry.pending = undefined;
      });
    return entry.pending;
  }

  private async fetch(url: string, now: number): Promise<LoadedCrl> {
    const bytes = await this.opts.fetcher.fetch(url);
    const der = bytes.subarray(0, 32).toString('latin1').includes('-----BEGIN')
      ? Buffer.from(
          bytes
            .toString('latin1')
            .replace(/-----(BEGIN|END) X509 CRL-----/g, '')
            .replace(/\s+/g, ''),
          'base64',
        )
      : bytes;
    const crl = parseCrl(der);
    if (crl.nextUpdate && crl.nextUpdate.getTime() < now) {
      throw new CrlFetchError(
        url,
        `stale CRL (NextUpdate ${crl.nextUpdate.toISOString()})`,
      );
    }
    const limit = now + this.opts.maxCacheAgeMs;
    const next = crl.nextUpdate?.getTime() ?? limit;
    return {
      url,
      crl,
      expiresAt: new Date(Math.max(now, Math.min(next, limit))),
    };
  }
}
