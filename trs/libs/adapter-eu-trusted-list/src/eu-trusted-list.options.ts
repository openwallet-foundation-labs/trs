import type { TrustedListSignatureVerifier } from './signature-verifier';
import type { TrustedListFetcher } from './trusted-list.fetcher';

export const EU_TRUSTED_LIST_OPTIONS = 'EU_TRUSTED_LIST_OPTIONS';

/** A trusted list the resolver answers for, addressed by its URL as `authority_id`. */
export interface EuTrustedListSource {
  url: string;
  /** `lotl` = list of trusted lists (its national lists become authorities too). */
  kind: 'lotl' | 'tl';
  /**
   * Pinned signer certificates (PEM or base64 DER), handed to the signature
   * verifier. For the EU LoTL these are the certificates announced in the
   * Official Journal of the EU.
   */
  signingCertificates?: string[];
}

export interface EuTrustedListAdapterOptions {
  /** Defaults to the EU LoTL. */
  sources?: EuTrustedListSource[];
  fetcher?: TrustedListFetcher;
  /** Defaults to `NoopSignatureVerifier` (no verification). */
  signatureVerifier?: TrustedListSignatureVerifier;
  /** Refuse lists whose signature was not verified. Needs a real verifier. */
  requireSignatureVerification?: boolean;
  /** Upper bound on caching a list, even if its NextUpdate is later. Default 6h. */
  maxCacheAgeMs?: number;
  /** Back-off before retrying a list that failed to load. Default 60s. */
  retryAfterFailureMs?: number;
  /**
   * When a LoTL-level query cannot load some national list and nothing
   * matched: `error` → 503 (default, fail closed & honest), `ignore` → deny.
   */
  onListUnavailable?: 'error' | 'ignore';
  /** Parallel list downloads when expanding a LoTL. Default 6. */
  loadConcurrency?: number;
  /** Options for the default HTTP fetcher (ignored if `fetcher` is given). */
  http?: { timeoutMs?: number; maxBytes?: number; allowInsecureHttp?: boolean };
  /** Clock override (tests). */
  now?: () => Date;
}
