import type { CrlFetcher, HttpCrlFetcherOptions } from './crl.store';

export const PKI_X509_OPTIONS = 'PKI_X509_OPTIONS';

/** A PKI the resolver answers for, addressed by `id` as `authority_id`. */
export interface PkiAuthority {
  /** The `authority_id` (any URI, e.g. `https://pki.example.com` or `urn:example:pki`). */
  id: string;
  /** Root CA certificates (PEM, PEM bundles or base64 DER). */
  trustAnchors: string[];
  /** Intermediate CA certificates available for path building. */
  intermediates?: string[];
  /** CRLs (PEM or base64 DER) used before any distribution point is fetched. */
  crls?: string[];
}

export interface PkiX509AdapterOptions {
  authorities?: PkiAuthority[];
  /** Fetch CRLs from the certificates' CRL distribution points. Default true. */
  fetchCrls?: boolean;
  crlFetcher?: CrlFetcher;
  /** Options for the default HTTP fetcher (ignored if `crlFetcher` is given). */
  http?: HttpCrlFetcherOptions;
  /**
   * A certificate names CRLs but none could be loaded: `error` → 503
   * (default, fail closed), `ignore` → treat it as not revoked.
   */
  onRevocationUnavailable?: 'error' | 'ignore';
  /** Deny certificates that have no configured CRL and no distribution point. Default false. */
  requireRevocationInfo?: boolean;
  /** Upper bound on caching a CRL, even if its NextUpdate is later. Default 24h. */
  maxCrlCacheAgeMs?: number;
  /** Back-off before retrying a CRL that failed to load. Default 60s. */
  retryAfterFailureMs?: number;
  /** Maximum intermediate CAs between leaf and trust anchor. Default 8. */
  maxIntermediates?: number;
  /** Clock override (tests). */
  now?: () => Date;
}
