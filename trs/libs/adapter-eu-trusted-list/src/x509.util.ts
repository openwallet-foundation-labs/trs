import { createHash, X509Certificate } from 'node:crypto';

/** Minimal DER TLV reader — just enough to walk to certificate extensions. */
interface Tlv {
  tag: number;
  start: number; // first content byte
  end: number; // one past last content byte
}

function readTlv(buf: Buffer, offset: number): Tlv {
  if (offset + 2 > buf.length) throw new Error('DER: truncated');
  const tag = buf[offset];
  let len = buf[offset + 1];
  let start = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || start + n > buf.length) {
      throw new Error('DER: bad length');
    }
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[start + i];
    start += n;
  }
  const end = start + len;
  if (end > buf.length) throw new Error('DER: truncated');
  return { tag, start, end };
}

function children(buf: Buffer, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let off = parent.start; off < parent.end;) {
    const t = readTlv(buf, off);
    out.push(t);
    off = t.end;
  }
  return out;
}

/** OID 2.5.29.14 (subjectKeyIdentifier), DER-encoded content bytes. */
const OID_SKI = Buffer.from([0x55, 0x1d, 0x0e]);

/**
 * Extracts the subjectKeyIdentifier extension value from a DER certificate.
 * Returns undefined if the certificate has no SKI extension.
 */
export function extractSki(der: Buffer): Buffer | undefined {
  try {
    const cert = readTlv(der, 0);
    const tbs = children(der, cert)[0];
    const extsWrapper = children(der, tbs).find((t) => t.tag === 0xa3); // [3]
    if (!extsWrapper) return undefined;
    const exts = children(der, extsWrapper)[0];
    for (const ext of children(der, exts)) {
      const parts = children(der, ext);
      const oid = parts[0];
      if (
        oid?.tag !== 0x06 ||
        !der.subarray(oid.start, oid.end).equals(OID_SKI)
      ) {
        continue;
      }
      const extnValue = parts[parts.length - 1]; // OCTET STRING wrapping KeyIdentifier
      const keyId = readTlv(der, extnValue.start); // inner OCTET STRING
      return keyId.tag === 0x04
        ? Buffer.from(der.subarray(keyId.start, keyId.end))
        : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** A parsed certificate plus the identifiers used for trusted-list matching. */
export interface CertInfo {
  der: Buffer;
  x509: X509Certificate;
  sha256: string; // lowercase hex
  ski?: string; // lowercase hex
}

export function certInfo(der: Buffer): CertInfo | undefined {
  try {
    const x509 = new X509Certificate(der);
    const ski = extractSki(der);
    return {
      der,
      x509,
      sha256: createHash('sha256').update(der).digest('hex'),
      ski: ski?.toString('hex'),
    };
  } catch {
    return undefined;
  }
}

/**
 * True iff `issuer` directly issued `subject`: names chain AND the signature
 * on `subject` verifies with `issuer`'s public key.
 */
export function isDirectlyIssuedBy(
  subject: CertInfo,
  issuer: CertInfo,
): boolean {
  try {
    return (
      subject.x509.checkIssued(issuer.x509) &&
      subject.x509.verify(issuer.x509.publicKey)
    );
  } catch {
    return false;
  }
}

export function pemOrBase64ToDer(input: string): Buffer {
  const body = input
    .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Buffer.from(body, 'base64');
}
