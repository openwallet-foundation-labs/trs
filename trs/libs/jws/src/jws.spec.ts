import { JwsVerificationError, normalizeHex, verifyCompactJws } from './jws';

/** Build a syntactically valid compact JWS with an attacker-chosen protected header. */
const jwsWithHeader = (header: Record<string, unknown>) =>
  [
    Buffer.from(JSON.stringify(header)).toString('base64url'),
    Buffer.from('{}').toString('base64url'),
    'c2ln',
  ].join('.');

describe('normalizeHex', () => {
  it('strips separators and lowercases', () => {
    expect(normalizeHex('46:EC:78:35')).toBe('46ec7835');
  });
});

describe('verifyCompactJws', () => {
  const rejects = (jws: string, match: RegExp) =>
    expect(() => verifyCompactJws(jws)).toThrow(
      expect.objectContaining({
        name: 'JwsVerificationError',
        message: expect.stringMatching(match),
      }),
    );

  it('rejects anything that is not three dot-separated parts', () => {
    rejects('not-a-jws', /compact JWS/);
  });

  it('rejects an unparseable protected header', () => {
    rejects(['bm90LWpzb24', 'e30', 'c2ln'].join('.'), /not valid JSON/);
  });

  it('rejects an algorithm it cannot check', () => {
    rejects(jwsWithHeader({ alg: 'none', x5c: ['x'] }), /unsupported alg: none/);
    rejects(jwsWithHeader({ alg: 'HS256', x5c: ['x'] }), /unsupported alg: HS256/);
  });

  it('rejects a crit parameter it does not understand', () => {
    rejects(
      jwsWithHeader({ alg: 'ES256', crit: ['sigT', 'exotic'], x5c: ['x'] }),
      /unsupported crit.*exotic/,
    );
  });

  it('rejects an unencoded payload, whose signing input differs', () => {
    rejects(jwsWithHeader({ alg: 'ES256', b64: false, crit: ['b64'], x5c: ['x'] }), /b64=false/);
  });

  it('rejects a JWS carrying no certificate to check against', () => {
    rejects(jwsWithHeader({ alg: 'ES256' }), /no x5c/);
    rejects(jwsWithHeader({ alg: 'ES256', x5c: [] }), /no x5c/);
  });

  it('rejects an x5c entry that is not a certificate', () => {
    rejects(jwsWithHeader({ alg: 'ES256', x5c: ['bm90LWEtY2VydA'] }), /not a parseable X.509/);
  });

  it('throws JwsVerificationError, not a bare Error, so adapters can map it to 503', () => {
    expect(() => verifyCompactJws('nope')).toThrow(JwsVerificationError);
  });
});
