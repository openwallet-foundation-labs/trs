import type { TrustedList } from './tsl.model';

export interface TrustedListSignatureContext {
  url: string;
  kind: 'lotl' | 'tl';
  /** The parsed list (e.g. to read `TSLVersionIdentifier` for the profile). */
  list: TrustedList;
  /**
   * DER certificates allowed to sign this list: the configured pins for a
   * root source, or the LoTL's `OtherTSLPointer` certificates for a national
   * list. Empty when nothing is known.
   */
  expectedSigners: Buffer[];
}

export interface SignatureCheck {
  /** True only if the enveloped signature was cryptographically verified. */
  verified: boolean;
  detail?: string;
}

/**
 * Verifies the enveloped XAdES signature of a trusted list (ETSI TS 119 612
 * Annex B; XAdES-BASELINE-B for TLv6). Implementations MUST throw when a
 * signature is present but invalid or not made by one of `expectedSigners`.
 *
 * The default `NoopSignatureVerifier` does not verify anything; provide a
 * real implementation via `EuTrustedListAdapterModule.forRoot({ signatureVerifier })`.
 */
export interface TrustedListSignatureVerifier {
  readonly id: string;
  verify(
    xml: string,
    ctx: TrustedListSignatureContext,
  ): Promise<SignatureCheck>;
}

export class NoopSignatureVerifier implements TrustedListSignatureVerifier {
  readonly id = 'none';

  async verify(): Promise<SignatureCheck> {
    return { verified: false, detail: 'signature verification not configured' };
  }
}
