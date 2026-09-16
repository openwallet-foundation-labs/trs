/** Retrieves the raw XML of a trusted list. Swap it out for tests or proxies. */
export interface TrustedListFetcher {
  fetch(url: string): Promise<string>;
}

export interface HttpTrustedListFetcherOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Plain http:// lists are refused unless enabled (local testing only). */
  allowInsecureHttp?: boolean;
}

export class TrustedListFetchError extends Error {
  constructor(
    readonly url: string,
    message: string,
  ) {
    super(`${url}: ${message}`);
    this.name = 'TrustedListFetchError';
  }
}

/**
 * Default fetcher on top of Node's global `fetch`: https only, bounded time and
 * size, and redirects are followed only within the same origin.
 */
export class HttpTrustedListFetcher implements TrustedListFetcher {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;
  private readonly allowInsecureHttp: boolean;

  constructor(opts: HttpTrustedListFetcherOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxBytes = opts.maxBytes ?? 32 * 1024 * 1024;
    this.maxRedirects = opts.maxRedirects ?? 3;
    this.allowInsecureHttp = opts.allowInsecureHttp ?? false;
  }

  async fetch(url: string): Promise<string> {
    let current = this.checkUrl(url, url);
    const origin = current.origin;
    for (let hop = 0; ; hop++) {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/vnd.etsi.tsl+xml, application/xml, text/xml',
        },
      }).catch((e: Error) => {
        throw new TrustedListFetchError(url, e.message);
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location || hop >= this.maxRedirects) {
          throw new TrustedListFetchError(url, `too many or invalid redirects`);
        }
        const next = this.checkUrl(url, new URL(location, current).href);
        if (next.origin !== origin) {
          throw new TrustedListFetchError(
            url,
            `cross-origin redirect to ${next.origin}`,
          );
        }
        current = next;
        continue;
      }
      if (!res.ok) throw new TrustedListFetchError(url, `HTTP ${res.status}`);
      return this.readBody(url, res);
    }
  }

  private checkUrl(original: string, candidate: string): URL {
    let u: URL;
    try {
      u = new URL(candidate);
    } catch {
      throw new TrustedListFetchError(original, 'invalid URL');
    }
    if (
      u.protocol !== 'https:' &&
      !(this.allowInsecureHttp && u.protocol === 'http:')
    ) {
      throw new TrustedListFetchError(original, `refusing ${u.protocol} URL`);
    }
    return u;
  }

  private async readBody(url: string, res: Response): Promise<string> {
    const declared = Number(res.headers.get('content-length'));
    if (declared > this.maxBytes) {
      throw new TrustedListFetchError(
        url,
        `list larger than ${this.maxBytes} bytes`,
      );
    }
    if (!res.body) return '';
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > this.maxBytes) {
        await reader.cancel();
        throw new TrustedListFetchError(
          url,
          `list larger than ${this.maxBytes} bytes`,
        );
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
