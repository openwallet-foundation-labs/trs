import { createHash } from 'node:crypto';
import { TrustSourceUnavailableError } from '@app/adapter-kit';
import { JwsVerificationError, normalizeHex, verifyCompactJws } from '@app/jws';

/** ETSI TS 119 602 List of Trusted Entities — only the members this adapter reads. */
export interface Lote {
  listAndSchemeInformation?: {
    schemeName?: string;
    listIssueDateTime?: string;
    nextUpdate?: string;
  };
  trustedEntitiesList?: {
    trustedEntityInformation?: {
      teName?: string;
      teTradeName?: string;
      teInformationUri?: string[];
    };
    trustedEntityServices?: {
      serviceTypeIdentifier?: string;
      serviceName?: string;
      serviceDigitalIdentity?: {
        x509Certificate?: string;
        x509SubjectName?: string;
        x509Ski?: string;
      };
    }[];
  }[];
}

/** One (entity, service) pair from one list — the unit a TRQP query is answered against. */
export interface ListedService {
  listSlug: string;
  schemeName?: string;
  entityName: string;
  entityTradeName?: string;
  entityInfoUri: string[];
  serviceTypeIdentifier: string;
  serviceName: string;
  /** Subject Key Identifier of the service's trust anchor, lowercase hex. */
  ski?: string;
  subject?: string;
  /** SHA-256 over the trust anchor's DER, lowercase hex. */
  certSha256?: string;
}

export interface TrustedListConfig {
  /** Origin serving `/tl/lists.json` and `/tl/{slug}.jws`. */
  baseUrl: string;
  /**
   * SHA-256 fingerprint of the Scheme Operator certificate every list must be signed by. Without
   * this pin a signature proves only that *someone* signed the list, so it is required.
   */
  schemeOperatorCertSha256: string;
  /** How long a fetched set of lists is reused before re-fetching. Default 15 min. */
  ttlMs?: number;
  /** Per-request network timeout. Default 10 s. */
  timeoutMs?: number;
}

const flatten = (slug: string, lote: Lote): ListedService[] =>
  (lote.trustedEntitiesList ?? []).flatMap((entity) => {
    const info = entity.trustedEntityInformation ?? {};
    return (entity.trustedEntityServices ?? []).flatMap((service) => {
      if (!service.serviceTypeIdentifier) return [];
      const sdi = service.serviceDigitalIdentity ?? {};
      return [
        {
          listSlug: slug,
          schemeName: lote.listAndSchemeInformation?.schemeName,
          entityName: info.teName ?? '(unnamed entity)',
          entityTradeName: info.teTradeName,
          entityInfoUri: info.teInformationUri ?? [],
          serviceTypeIdentifier: service.serviceTypeIdentifier,
          serviceName: service.serviceName ?? '(unnamed service)',
          ski: sdi.x509Ski ? normalizeHex(sdi.x509Ski) : undefined,
          subject: sdi.x509SubjectName,
          certSha256: sdi.x509Certificate
            ? createHash('sha256').update(Buffer.from(sdi.x509Certificate, 'base64')).digest('hex')
            : undefined,
        },
      ];
    });
  });

/**
 * Fetches and verifies the Scheme Operator's Trusted Lists, and keeps the flattened result in
 * memory for `ttlMs`. Every list is JAdES-signed; a list that does not verify against the pinned
 * Scheme Operator certificate is not used.
 */
export class TrustedListClient {
  private cached?: { services: ListedService[]; expires: number };
  private inflight?: Promise<ListedService[]>;

  constructor(private readonly cfg: TrustedListConfig) {}

  private get ttlMs(): number {
    return this.cfg.ttlMs ?? 15 * 60_000;
  }

  /** When the currently cached snapshot goes stale — surfaced as the decision's `freshUntil`. */
  get freshUntil(): Date | undefined {
    return this.cached ? new Date(this.cached.expires) : undefined;
  }

  async services(): Promise<ListedService[]> {
    const hit = this.cached;
    if (hit && hit.expires > Date.now()) return hit.services;
    // Collapse concurrent misses onto one fetch — a cold resolver under load would otherwise
    // pull every list once per in-flight query.
    this.inflight ??= this.load().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  private async get(path: string): Promise<Response> {
    const url = `${this.cfg.baseUrl.replace(/\/+$/, '')}${path}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 10_000) });
    } catch (e) {
      throw new TrustSourceUnavailableError(
        `trusted list unreachable: GET ${url} (${(e as Error).message})`,
      );
    }
    if (!res.ok)
      throw new TrustSourceUnavailableError(`trusted list returned ${res.status} for GET ${url}`);
    return res;
  }

  private async load(): Promise<ListedService[]> {
    // The manifest itself is unsigned, so it is used only to discover slugs: each list it points at
    // is verified independently below. A tampered manifest can hide a list (a hidden list yields a
    // negative decision — fail-closed), but cannot introduce a trusted entity.
    const manifest = (await (await this.get('/tl/lists.json')).json()) as {
      lists?: { slug?: string }[];
    };
    const slugs = (manifest.lists ?? []).map((l) => l.slug).filter((s): s is string => !!s);
    if (!slugs.length)
      throw new TrustSourceUnavailableError('trusted list manifest lists no trusted lists');

    const services = await Promise.all(
      slugs.map(async (slug) => {
        const jws = await (await this.get(`/tl/${slug}.jws`)).text();
        try {
          const { payload } = verifyCompactJws<Lote>(jws, {
            pinCertSha256: this.cfg.schemeOperatorCertSha256,
          });
          return flatten(slug, payload);
        } catch (e) {
          if (e instanceof JwsVerificationError) {
            throw new TrustSourceUnavailableError(
              `trusted list '${slug}' failed verification: ${e.message}`,
            );
          }
          throw e;
        }
      }),
    );

    const flat = services.flat();
    this.cached = { services: flat, expires: Date.now() + this.ttlMs };
    return flat;
  }
}
