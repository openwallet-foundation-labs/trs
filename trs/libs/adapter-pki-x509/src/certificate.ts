import { createHash, X509Certificate } from 'node:crypto';
import {
  children,
  content,
  decodeOid,
  integerHex,
  raw,
  readTlv,
  TAG,
  Tlv,
} from './der';

export const OID = {
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  extKeyUsage: '2.5.29.37',
  subjectKeyIdentifier: '2.5.29.14',
  authorityKeyIdentifier: '2.5.29.35',
  subjectAltName: '2.5.29.17',
  crlDistributionPoints: '2.5.29.31',
  authorityInfoAccess: '1.3.6.1.5.5.7.1.1',
  anyExtendedKeyUsage: '2.5.29.37.0',
} as const;

const PROCESSED_EXTENSIONS = new Set<string>([
  OID.basicConstraints,
  OID.keyUsage,
  OID.extKeyUsage,
  OID.subjectKeyIdentifier,
  OID.authorityKeyIdentifier,
  OID.subjectAltName,
  OID.crlDistributionPoints,
  OID.authorityInfoAccess,
]);

export const KEY_USAGES = [
  'digitalSignature',
  'nonRepudiation',
  'keyEncipherment',
  'dataEncipherment',
  'keyAgreement',
  'keyCertSign',
  'cRLSign',
  'encipherOnly',
  'decipherOnly',
] as const;
export type KeyUsage = (typeof KEY_USAGES)[number];

export const EXT_KEY_USAGES: Record<string, string> = {
  serverAuth: '1.3.6.1.5.5.7.3.1',
  clientAuth: '1.3.6.1.5.5.7.3.2',
  codeSigning: '1.3.6.1.5.5.7.3.3',
  emailProtection: '1.3.6.1.5.5.7.3.4',
  timeStamping: '1.3.6.1.5.5.7.3.8',
  OCSPSigning: '1.3.6.1.5.5.7.3.9',
};

export interface Certificate {
  der: Buffer;
  x509: X509Certificate;
  sha256: string;
  serial: string;
  issuerName: Buffer;
  subjectName: Buffer;
  notBefore: Date;
  notAfter: Date;
  basicConstraints?: { ca: boolean; pathLength?: number };
  keyUsage?: Set<KeyUsage>;
  extKeyUsage?: string[];
  crlUrls: string[];
  unhandledCritical: string[];
}

export function pemOrBase64ToDer(input: string): Buffer {
  const body = input
    .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Buffer.from(body, 'base64');
}

export function splitPem(input: string): string[] {
  const blocks = input.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  );
  return blocks ?? [input];
}

export function parseCertificate(der: Buffer): Certificate {
  const x509 = new X509Certificate(der);
  const cert = readTlv(der, 0);
  const tbsFields = children(der, children(der, cert)[0]);
  const base = tbsFields[0]?.tag === 0xa0 ? 1 : 0;
  const [serial, , issuer, , subject] = tbsFields.slice(base, base + 5);
  if (serial?.tag !== TAG.INTEGER || !issuer || !subject) {
    throw new Error('not an X.509 certificate');
  }

  const parsed: Certificate = {
    der,
    x509,
    sha256: createHash('sha256').update(der).digest('hex'),
    serial: integerHex(der, serial),
    issuerName: Buffer.from(raw(der, issuer)),
    subjectName: Buffer.from(raw(der, subject)),
    notBefore: new Date(x509.validFrom),
    notAfter: new Date(x509.validTo),
    crlUrls: [],
    unhandledCritical: [],
  };

  const extsWrapper = tbsFields.find((t) => t.tag === 0xa3);
  if (!extsWrapper) return parsed;
  for (const ext of children(der, children(der, extsWrapper)[0])) {
    const parts = children(der, ext);
    const oid = decodeOid(content(der, parts[0]));
    const critical =
      parts.length === 3 &&
      parts[1].tag === TAG.BOOLEAN &&
      der[parts[1].start] !== 0;
    const value = readTlv(der, parts[parts.length - 1].start);

    switch (oid) {
      case OID.basicConstraints:
        parsed.basicConstraints = basicConstraints(der, value);
        break;
      case OID.keyUsage:
        parsed.keyUsage = keyUsage(content(der, value));
        break;
      case OID.extKeyUsage:
        parsed.extKeyUsage = children(der, value).map((t) =>
          decodeOid(content(der, t)),
        );
        break;
      case OID.crlDistributionPoints:
        parsed.crlUrls = uris(der, value);
        break;
    }
    if (critical && !PROCESSED_EXTENSIONS.has(oid)) {
      parsed.unhandledCritical.push(oid);
    }
  }
  return parsed;
}

function basicConstraints(der: Buffer, seq: Tlv) {
  let ca = false;
  let pathLength: number | undefined;
  for (const t of children(der, seq)) {
    if (t.tag === TAG.BOOLEAN) ca = der[t.start] !== 0;
    if (t.tag === TAG.INTEGER) pathLength = parseInt(integerHex(der, t), 16);
  }
  return { ca, pathLength };
}

function keyUsage(bits: Buffer): Set<KeyUsage> {
  const set = new Set<KeyUsage>();
  KEY_USAGES.forEach((name, i) => {
    const byte = bits[1 + (i >> 3)];
    if (byte !== undefined && (byte >> (7 - (i & 7))) & 1) set.add(name);
  });
  return set;
}

function uris(der: Buffer, t: Tlv): string[] {
  if (t.tag === 0x86) return [content(der, t).toString('ascii')];
  if (!(t.tag & 0x20)) return [];
  return children(der, t).flatMap((c) => uris(der, c));
}

export function isIssuedBy(subject: Certificate, issuer: Certificate): boolean {
  try {
    return (
      subject.issuerName.equals(issuer.subjectName) &&
      subject.x509.verify(issuer.x509.publicKey)
    );
  } catch {
    return false;
  }
}

export const isSelfIssued = (c: Certificate) =>
  c.issuerName.equals(c.subjectName);
