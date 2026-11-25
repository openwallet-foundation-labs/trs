import { DidDocument } from './did-document';
import { didWebToUrl } from './did-web.url';

/** Retrieves and validates the DID document for a did:web DID. */
export interface DidDocumentFetcher {
  fetch(did: string): Promise<DidDocument>;
}

export interface HttpDidDocumentFetcherOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export class DidDocumentFetchError extends Error {
  constructor(
    readonly did: string,
    message: string,
  ) {
    super(`${did}: ${message}`);
    this.name = 'DidDocumentFetchError';
  }
}

/**
 * Default fetcher on Node's global `fetch`: https only (guaranteed by
 * `didWebToUrl`), bounded time and size, same-origin redirects only, and the
 * document `id` must equal the DID that was asked for.
 */
export class HttpDidDocumentFetcher implements DidDocumentFetcher {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;

  constructor(opts: HttpDidDocumentFetcherOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 5_000;
    this.maxBytes = opts.maxBytes ?? 256 * 1024;
    this.maxRedirects = opts.maxRedirects ?? 3;
  }

  async fetch(did: string): Promise<DidDocument> {
    const url = new URL(didWebToUrl(did));
    const body = await this.get(did, url);

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new DidDocumentFetchError(did, 'DID document is not valid JSON');
    }
    const parsed = DidDocument.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new DidDocumentFetchError(
        did,
        `invalid DID document: ${issue.path.join('.') || '(root)'} ${issue.message}`,
      );
    }
    if (parsed.data.id !== did) {
      throw new DidDocumentFetchError(
        did,
        `DID document id "${parsed.data.id}" does not match`,
      );
    }
    return parsed.data;
  }

  private async get(did: string, start: URL): Promise<string> {
    let current = start;
    for (let hop = 0; ; hop++) {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: 'application/did+json, application/json' },
      }).catch((e: Error) => {
        throw new DidDocumentFetchError(did, e.message);
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location || hop >= this.maxRedirects) {
          throw new DidDocumentFetchError(did, 'too many or invalid redirects');
        }
        const next = new URL(location, current);
        if (next.origin !== start.origin) {
          throw new DidDocumentFetchError(
            did,
            `cross-origin redirect to ${next.origin}`,
          );
        }
        current = next;
        continue;
      }
      if (!res.ok) throw new DidDocumentFetchError(did, `HTTP ${res.status}`);
      return this.readBody(did, res);
    }
  }

  private async readBody(did: string, res: Response): Promise<string> {
    const tooLarge = () =>
      new DidDocumentFetchError(
        did,
        `DID document larger than ${this.maxBytes} bytes`,
      );
    if (Number(res.headers.get('content-length')) > this.maxBytes) {
      throw tooLarge();
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
        throw tooLarge();
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
