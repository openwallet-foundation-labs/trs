import { Logger } from '@nestjs/common';
import type {
  SignatureCheck,
  TrustedListSignatureVerifier,
} from './signature-verifier';
import { isListOfListsType, TSL_XML_MIME_TYPE } from './tsl.constants';
import { IndexedTrustedList, indexTrustedList } from './tsl.evaluator';
import type { OtherTslPointer } from './tsl.model';
import { parseTrustedList } from './tsl.parser';
import type { TrustedListFetcher } from './trusted-list.fetcher';

export interface LoadedList {
  url: string;
  kind: 'lotl' | 'tl';
  index: IndexedTrustedList;
  fetchedAt: Date;
  /** When this snapshot must be refreshed (min of NextUpdate and max cache age). */
  expiresAt: Date;
  signature: SignatureCheck;
  /** NextUpdate had already passed when the list was fetched. */
  expired: boolean;
}

export interface StoreSettings {
  fetcher: TrustedListFetcher;
  verifier: TrustedListSignatureVerifier;
  requireSignatureVerification: boolean;
  maxCacheAgeMs: number;
  retryAfterFailureMs: number;
  now: () => Date;
}

interface Entry {
  value?: LoadedList;
  error?: Error;
  /** epoch ms until which `value` / `error` is served without refetching */
  until: number;
  inflight?: Promise<LoadedList>;
}

/** Normalizes a list URL for comparison; undefined if not http(s). */
export function normalizeListUrl(input: string): string | undefined {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    u.hash = '';
    return u.href;
  } catch {
    return undefined;
  }
}

/** A national list pointer that is an XML trusted list (not a LoTL, not a PDF). */
export const isXmlTlPointer = (p: OtherTslPointer): boolean =>
  !isListOfListsType(p.tslType) &&
  (!p.mimeType || p.mimeType === TSL_XML_MIME_TYPE);

/**
 * Loads, verifies (via the pluggable verifier), parses and caches trusted
 * lists. Concurrent requests for the same list share one download.
 */
export class TrustedListStore {
  private readonly log = new Logger('EuTrustedListStore');
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly s: StoreSettings) {}

  /** Last known snapshot (possibly due for refresh), without any I/O. */
  last(url: string): LoadedList | undefined {
    return this.entries.get(url)?.value;
  }

  async load(
    url: string,
    kind: 'lotl' | 'tl',
    expectedSigners: Buffer[],
  ): Promise<LoadedList> {
    const now = this.s.now().getTime();
    const e = this.entries.get(url) ?? { until: 0 };
    this.entries.set(url, e);
    if (e.until > now) {
      if (e.value) return e.value;
      if (e.error) throw e.error;
    }
    if (e.inflight) return e.inflight;

    e.inflight = this.fetchAndParse(url, kind, expectedSigners)
      .then((loaded) => {
        e.value = loaded;
        e.error = undefined;
        e.until = loaded.expiresAt.getTime();
        return loaded;
      })
      .catch((err: Error) => {
        const retryAt = this.s.now().getTime() + this.s.retryAfterFailureMs;
        const prev = e.value;
        const nextUpdate = prev?.index.list.nextUpdate;
        if (
          prev &&
          nextUpdate &&
          nextUpdate.getTime() > this.s.now().getTime()
        ) {
          // Refresh failed but the previous snapshot is still within its NextUpdate.
          this.log.warn(
            `refresh of ${url} failed, serving previous snapshot: ${err.message}`,
          );
          e.until = retryAt;
          return prev;
        }
        this.log.warn(`loading ${url} failed: ${err.message}`);
        e.value = undefined;
        e.error = err;
        e.until = retryAt;
        throw err;
      })
      .finally(() => {
        e.inflight = undefined;
      });
    return e.inflight;
  }

  private async fetchAndParse(
    url: string,
    kind: 'lotl' | 'tl',
    expectedSigners: Buffer[],
  ): Promise<LoadedList> {
    const xml = await this.s.fetcher.fetch(url);
    const list = parseTrustedList(xml);
    if (kind === 'lotl' && !isListOfListsType(list.tslType)) {
      throw new Error(
        `${url} is not a list of trusted lists (TSLType ${list.tslType})`,
      );
    }
    if (kind === 'tl' && isListOfListsType(list.tslType)) {
      throw new Error(
        `${url} is a list of trusted lists, expected a trusted list`,
      );
    }

    const signature = await this.s.verifier.verify(xml, {
      url,
      kind,
      list,
      expectedSigners,
    });
    if (this.s.requireSignatureVerification && !signature.verified) {
      throw new Error(
        `${url}: signature not verified (${signature.detail ?? 'no detail'})`,
      );
    }
    for (const w of list.warnings) this.log.warn(`${url}: ${w}`);

    const fetchedAt = this.s.now();
    const nextUpdate = list.nextUpdate?.getTime();
    const expired =
      nextUpdate !== undefined && nextUpdate <= fetchedAt.getTime();
    const cap = fetchedAt.getTime() + this.s.maxCacheAgeMs;
    const until = expired
      ? fetchedAt.getTime() + this.s.retryAfterFailureMs // re-check soon for a fresh issue
      : Math.min(cap, nextUpdate ?? cap);
    if (expired)
      this.log.warn(
        `${url}: NextUpdate ${list.nextUpdate?.toISOString()} has passed`,
      );

    return {
      url,
      kind,
      index: indexTrustedList(list),
      fetchedAt,
      expiresAt: new Date(until),
      signature,
      expired,
    };
  }
}
