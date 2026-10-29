import { pem } from '../test/fixtures/fixtures';
import { parseCertificate, pemOrBase64ToDer } from './certificate';
import {
  CrlParseError,
  isCrlIssuedBy,
  parseCrl,
  pemOrBase64CrlToDer,
} from './crl';

const crl = (name: string) => parseCrl(pemOrBase64CrlToDer(pem(name)));
const cert = (name: string) => parseCertificate(pemOrBase64ToDer(pem(name)));

describe('parseCrl', () => {
  it('reads the revoked serials, dates and update times', () => {
    const list = crl('issuing.crl.pem');
    expect([...list.revoked]).toEqual([
      ['5ec0de', new Date('2028-01-01T00:00:00Z')],
    ]);
    expect(list.thisUpdate).toEqual(new Date('2025-01-01T00:00:00Z'));
    expect(list.nextUpdate).toEqual(new Date('2045-01-01T00:00:00Z'));
  });

  it('reads an empty CRL', () => {
    expect(crl('root.crl.pem').revoked.size).toBe(0);
  });

  it('rejects input that is not a CRL', () => {
    expect(() => parseCrl(pemOrBase64ToDer(pem('root.pem')))).toThrow(
      CrlParseError,
    );
    expect(() => parseCrl(Buffer.from([0x30, 0x05]))).toThrow(CrlParseError);
  });
});

describe('isCrlIssuedBy', () => {
  it('accepts a CRL signed by the issuer', () => {
    expect(
      isCrlIssuedBy(crl('issuing.crl.pem'), cert('intermediate.pem')),
    ).toBe(true);
  });

  it('rejects a CRL with the issuer name but another key', () => {
    expect(
      isCrlIssuedBy(crl('issuing-forged.crl.pem'), cert('intermediate.pem')),
    ).toBe(false);
  });

  it('rejects a CRL from a different issuer', () => {
    expect(isCrlIssuedBy(crl('root.crl.pem'), cert('intermediate.pem'))).toBe(
      false,
    );
  });
});
