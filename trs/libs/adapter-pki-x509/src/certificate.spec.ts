import { pem } from '../test/fixtures/fixtures';
import {
  EXT_KEY_USAGES,
  OID,
  parseCertificate,
  pemOrBase64ToDer,
  splitPem,
} from './certificate';

const parse = (name: string) => parseCertificate(pemOrBase64ToDer(pem(name)));

describe('parseCertificate', () => {
  it('reads basic constraints, key usage, EKU and CRL distribution points', () => {
    const leaf = parse('leaf-valid.pem');
    expect(leaf.basicConstraints).toEqual({ ca: false, pathLength: undefined });
    expect([...(leaf.keyUsage ?? [])]).toEqual(['digitalSignature']);
    expect(leaf.extKeyUsage).toEqual([EXT_KEY_USAGES.serverAuth]);
    expect(leaf.crlUrls).toEqual(['http://pki.test/issuing.crl']);
    expect(leaf.unhandledCritical).toEqual([]);

    const ca = parse('intermediate.pem');
    expect(ca.basicConstraints).toEqual({ ca: true, pathLength: 0 });
    expect([...(ca.keyUsage ?? [])].sort()).toEqual(['cRLSign', 'keyCertSign']);
  });

  it('reads the serial number without leading zeros', () => {
    expect(parse('leaf-revoked.pem').serial).toBe('5ec0de');
  });

  it('reports critical extensions it does not process', () => {
    expect(parse('leaf-critical.pem').unhandledCritical).toEqual([
      '1.3.6.1.4.1.55555.1',
    ]);
  });

  it('keeps the exact DER issuer and subject names', () => {
    const leaf = parse('leaf-valid.pem');
    expect(leaf.issuerName.equals(parse('intermediate.pem').subjectName)).toBe(
      true,
    );
  });

  it('splits PEM bundles', () => {
    expect(
      splitPem(pem('leaf-valid.pem') + pem('intermediate.pem')),
    ).toHaveLength(2);
    expect(OID.anyExtendedKeyUsage).toBe('2.5.29.37.0');
  });
});
