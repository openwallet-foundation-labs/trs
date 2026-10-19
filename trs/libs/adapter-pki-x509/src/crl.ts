import { verify as verifySignature } from 'node:crypto';
import type { Certificate } from './certificate';
import {
  children,
  content,
  decodeOid,
  decodeTime,
  integerHex,
  raw,
  readTlv,
  TAG,
} from './der';

/** CRL extensions that do not change how the list is read. */
const PROCESSED_CRL_EXTENSIONS = new Set([
  '2.5.29.20', // cRLNumber
  '2.5.29.35', // authorityKeyIdentifier
]);

/** Entry extensions that do not change which certificate is revoked. */
const PROCESSED_ENTRY_EXTENSIONS = new Set([
  '2.5.29.21', // reasonCode
  '2.5.29.24', // invalidityDate
]);

/** Signature algorithm OID → digest for `crypto.verify` (null = built into the key type). */
const SIGNATURE_DIGESTS: Record<string, string | null> = {
  '1.2.840.113549.1.1.11': 'sha256', // sha256WithRSAEncryption
  '1.2.840.113549.1.1.12': 'sha384',
  '1.2.840.113549.1.1.13': 'sha512',
  '1.2.840.10045.4.3.2': 'sha256', // ecdsa-with-SHA256
  '1.2.840.10045.4.3.3': 'sha384',
  '1.2.840.10045.4.3.4': 'sha512',
  '1.3.101.112': null, // Ed25519
  '1.3.101.113': null, // Ed448
};

/** A parsed, complete (non-delta, direct) certificate revocation list. */
export interface Crl {
  der: Buffer;
  issuerName: Buffer;
  thisUpdate: Date;
  nextUpdate?: Date;
  /** Revoked serial (lowercase hex) → revocation date. */
  revoked: Map<string, Date>;
  tbs: Buffer;
  signatureAlgorithm: string;
  signature: Buffer;
}

export class CrlParseError extends Error {
  constructor(message: string) {
    super(`CRL: ${message}`);
    this.name = 'CrlParseError';
  }
}

export function pemOrBase64CrlToDer(input: string): Buffer {
  return Buffer.from(
    input.replace(/-----(BEGIN|END) X509 CRL-----/g, '').replace(/\s+/g, ''),
    'base64',
  );
}

/**
 * Parses an RFC 5280 CRL. Delta CRLs, CRLs scoped by an issuing distribution
 * point and indirect CRLs are refused (their critical extensions are not
 * processed), so a parsed CRL always covers every certificate of its issuer.
 */
export function parseCrl(der: Buffer): Crl {
  try {
    const list = readTlv(der, 0);
    const [tbs, algorithm, signature] = children(der, list);
    if (tbs?.tag !== TAG.SEQUENCE || signature?.tag !== TAG.BIT_STRING) {
      throw new CrlParseError('not a CertificateList');
    }
    const fields = children(der, tbs);
    let i = fields[0]?.tag === TAG.INTEGER ? 1 : 0; // optional version
    i++; // signature algorithm (repeated in the outer structure)
    const issuer = fields[i++];
    const thisUpdate = decodeTime(der, fields[i++]);
    let nextUpdate: Date | undefined;
    if (
      fields[i]?.tag === TAG.UTC_TIME ||
      fields[i]?.tag === TAG.GENERALIZED_TIME
    ) {
      nextUpdate = decodeTime(der, fields[i++]);
    }

    const revoked = new Map<string, Date>();
    if (fields[i]?.tag === TAG.SEQUENCE) {
      for (const entry of children(der, fields[i++])) {
        const [serial, date, exts] = children(der, entry);
        if (exts)
          assertProcessed(der, exts, PROCESSED_ENTRY_EXTENSIONS, 'entry');
        revoked.set(integerHex(der, serial), decodeTime(der, date));
      }
    }
    if (fields[i]?.tag === 0xa0) {
      assertProcessed(
        der,
        children(der, fields[i])[0],
        PROCESSED_CRL_EXTENSIONS,
        'list',
      );
    }

    const sigBits = content(der, signature);
    return {
      der,
      issuerName: Buffer.from(raw(der, issuer)),
      thisUpdate,
      nextUpdate,
      revoked,
      tbs: Buffer.from(raw(der, tbs)),
      signatureAlgorithm: decodeOid(content(der, children(der, algorithm)[0])),
      signature: Buffer.from(sigBits.subarray(1)), // skip unused-bits byte
    };
  } catch (e) {
    if (e instanceof CrlParseError) throw e;
    throw new CrlParseError((e as Error).message);
  }
}

function assertProcessed(
  der: Buffer,
  extensions: ReturnType<typeof readTlv>,
  processed: Set<string>,
  where: string,
) {
  for (const ext of children(der, extensions)) {
    const parts = children(der, ext);
    const oid = decodeOid(content(der, parts[0]));
    const critical =
      parts.length === 3 &&
      parts[1].tag === TAG.BOOLEAN &&
      der[parts[1].start] !== 0;
    if (critical && !processed.has(oid)) {
      throw new CrlParseError(`unsupported critical ${where} extension ${oid}`);
    }
  }
}

/** True iff `issuer` issued and signed the CRL. */
export function isCrlIssuedBy(crl: Crl, issuer: Certificate): boolean {
  if (!crl.issuerName.equals(issuer.subjectName)) return false;
  if (issuer.keyUsage && !issuer.keyUsage.has('cRLSign')) return false;
  if (!(crl.signatureAlgorithm in SIGNATURE_DIGESTS)) return false;
  try {
    return verifySignature(
      SIGNATURE_DIGESTS[crl.signatureAlgorithm],
      crl.tbs,
      issuer.x509.publicKey,
      crl.signature,
    );
  } catch {
    return false;
  }
}
