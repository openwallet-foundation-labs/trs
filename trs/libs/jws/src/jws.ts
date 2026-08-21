import { X509Certificate, verify as verifySignature } from 'node:crypto';

/** Raised when a JWS cannot be parsed, or is parsed but does not verify. */
export class JwsVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwsVerificationError';
  }
}

/**
 * JWS `alg` values the trust sources actually sign with, mapped to `crypto.verify`
 * parameters. Anything else is rejected rather than silently accepted.
 */
const ALGS: Record<string, { hash: string; dsaEncoding?: 'ieee-p1363' }> = {
  ES256: { hash: 'sha256', dsaEncoding: 'ieee-p1363' },
  ES384: { hash: 'sha384', dsaEncoding: 'ieee-p1363' },
  RS256: { hash: 'sha256' },
};

/** JWS `crit` header parameters we understand. RFC 7515 §4.1.11 requires rejecting the rest. */
const UNDERSTOOD_CRIT = new Set(['b64', 'sigT']);

export interface VerifyJwsOptions {
  /** Reject unless the signer certificate's SHA-256 fingerprint equals this (hex; colons/case ignored). */
  pinCertSha256?: string;
  /** Reject unless the signer certificate was issued by — and verifies against — this PEM CA. */
  issuerPem?: string;
  /** Evaluation time for certificate validity. Defaults to now. */
  now?: Date;
}

export interface VerifiedJws<T> {
  payload: T;
  header: Record<string, unknown>;
  /** The `x5c[0]` certificate whose key produced the signature. */
  signer: X509Certificate;
}

/** Lowercase hex with separators stripped — so `AB:CD` and `abcd` compare equal. */
export const normalizeHex = (value: string): string =>
  value.replace(/[^0-9a-fA-F]/g, '').toLowerCase();

/**
 * Verify a compact JWS signed with an `x5c` certificate chain and return its JSON payload.
 *
 * The signer is taken from `x5c[0]`; a signature alone proves nothing, so callers are expected to
 * anchor it with `pinCertSha256` (a known trust anchor) or `issuerPem` (a known CA).
 */
export function verifyCompactJws<T = unknown>(
  jws: string,
  opts: VerifyJwsOptions = {},
): VerifiedJws<T> {
  const parts = jws.trim().split('.');
  if (parts.length !== 3)
    throw new JwsVerificationError('not a compact JWS (expected three dot-separated parts)');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
  } catch {
    throw new JwsVerificationError('protected header is not valid JSON');
  }

  const crit = header.crit;
  if (Array.isArray(crit)) {
    const unknown = crit.filter((c) => !UNDERSTOOD_CRIT.has(String(c)));
    if (unknown.length)
      throw new JwsVerificationError(`unsupported crit header parameter(s): ${unknown.join(', ')}`);
  }
  // `b64: false` means the payload is not base64url-encoded (RFC 7797) — a different signing input.
  if (header.b64 === false)
    throw new JwsVerificationError('unencoded payload (b64=false) is not supported');

  const alg = ALGS[String(header.alg)];
  if (!alg) throw new JwsVerificationError(`unsupported alg: ${String(header.alg)}`);

  const x5c = header.x5c;
  if (!Array.isArray(x5c) || typeof x5c[0] !== 'string') {
    throw new JwsVerificationError('protected header carries no x5c certificate chain');
  }

  let signer: X509Certificate;
  try {
    signer = new X509Certificate(Buffer.from(x5c[0], 'base64'));
  } catch {
    throw new JwsVerificationError('x5c[0] is not a parseable X.509 certificate');
  }

  const now = opts.now ?? new Date();
  if (now < new Date(signer.validFrom) || now > new Date(signer.validTo)) {
    throw new JwsVerificationError(
      `signer certificate is outside its validity window (${signer.validFrom} … ${signer.validTo})`,
    );
  }

  if (opts.pinCertSha256) {
    const actual = normalizeHex(signer.fingerprint256);
    if (actual !== normalizeHex(opts.pinCertSha256)) {
      throw new JwsVerificationError(
        `signer certificate ${actual} does not match the pinned trust anchor`,
      );
    }
  }

  if (opts.issuerPem) {
    const issuer = new X509Certificate(opts.issuerPem);
    if (!signer.checkIssued(issuer) || !signer.verify(issuer.publicKey)) {
      throw new JwsVerificationError(
        `signer certificate does not chain to the configured trust anchor (${issuer.subject.replace(/\n/g, ', ')})`,
      );
    }
  }

  const signed = Buffer.from(`${encodedHeader}.${encodedPayload}`, 'ascii');
  const signature = Buffer.from(encodedSignature, 'base64url');
  const ok = verifySignature(
    alg.hash,
    signed,
    { key: signer.publicKey, ...(alg.dsaEncoding ? { dsaEncoding: alg.dsaEncoding } : {}) },
    signature,
  );
  if (!ok)
    throw new JwsVerificationError('signature does not verify against the x5c[0] certificate');

  try {
    return {
      payload: JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as T,
      header,
      signer,
    };
  } catch {
    throw new JwsVerificationError('payload is not valid JSON');
  }
}
