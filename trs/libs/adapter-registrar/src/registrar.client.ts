import { TrustSourceUnavailableError } from '@app/adapter-kit';
import { JwsVerificationError, verifyCompactJws } from '@app/jws';

export interface RegistrarConfig {
  /** Public registry API base — the ARF TS5 `registryURI`, e.g. `https://…/registrar/registry`. */
  registryUrl: string;
  /**
   * URL of the PEM-encoded Registrar CA that every signed registry response must chain to. Point it
   * at the copy the Scheme Operator republishes on its Trusted List, not at the registrar's own
   * `/ca-certificate` — an anchor served by the party it vouches for anchors nothing.
   */
  trustAnchorUrl?: string;
  /** Per-request network timeout. Default 10 s — the registrar's dev deployment cold-starts slowly. */
  timeoutMs?: number;
}

/** Tolerance for clock skew when checking a response's `exp`. */
const SKEW_MS = 60_000;

/** Calls the registrar's public registry and verifies the JWS it answers with. */
export class RegistrarClient {
  private readonly registryUrl: string;
  private trustAnchorPem?: Promise<string>;

  constructor(private readonly cfg: RegistrarConfig) {
    this.registryUrl = cfg.registryUrl.replace(/\/+$/, '');
  }

  private async anchor(): Promise<string | undefined> {
    if (!this.cfg.trustAnchorUrl) return undefined;
    // A CA certificate is long-lived, so the first successful fetch is reused for the process
    // lifetime; a failed one is not cached, so a transient outage does not disable the adapter.
    this.trustAnchorPem ??= this.fetchText(this.cfg.trustAnchorUrl, 'trust anchor').catch((e) => {
      this.trustAnchorPem = undefined;
      throw e;
    });
    return this.trustAnchorPem;
  }

  private async fetchText(url: string, what: string): Promise<string> {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 10_000) });
    } catch (e) {
      throw new TrustSourceUnavailableError(
        `registrar ${what} unreachable: GET ${url} (${(e as Error).message})`,
      );
    }
    if (!res.ok)
      throw new TrustSourceUnavailableError(
        `registrar ${what} returned ${res.status} for GET ${url}`,
      );
    return res.text();
  }

  /** GET a registry endpoint and return the verified payload of the JWS it responds with. */
  async signedGet<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
    const url = new URL(`${this.registryUrl}${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);

    const [jws, issuerPem] = await Promise.all([
      this.fetchText(url.toString(), 'registry'),
      this.anchor(),
    ]);

    let payload: T & { exp?: number };
    try {
      ({ payload } = verifyCompactJws<T & { exp?: number }>(jws, { issuerPem }));
    } catch (e) {
      if (e instanceof JwsVerificationError) {
        throw new TrustSourceUnavailableError(
          `registrar response failed verification (GET ${url.pathname}): ${e.message}`,
        );
      }
      throw e;
    }

    if (typeof payload.exp === 'number' && payload.exp * 1000 + SKEW_MS < Date.now()) {
      throw new TrustSourceUnavailableError(
        `registrar response expired at ${new Date(payload.exp * 1000).toISOString()}`,
      );
    }
    return payload;
  }
}
