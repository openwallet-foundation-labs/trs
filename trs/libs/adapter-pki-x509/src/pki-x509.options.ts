import type { CrlFetcher, HttpCrlFetcherOptions } from './crl.store';

export const PKI_X509_OPTIONS = 'PKI_X509_OPTIONS';

export interface PkiAuthority {
  id: string;
  trustAnchors: string[];
  intermediates?: string[];
  crls?: string[];
}

export interface PkiX509AdapterOptions {
  authorities?: PkiAuthority[];
  fetchCrls?: boolean;
  crlFetcher?: CrlFetcher;
  http?: HttpCrlFetcherOptions;
  onRevocationUnavailable?: 'error' | 'ignore';
  requireRevocationInfo?: boolean;
  maxCrlCacheAgeMs?: number;
  retryAfterFailureMs?: number;
  maxIntermediates?: number;
  now?: () => Date;
}
