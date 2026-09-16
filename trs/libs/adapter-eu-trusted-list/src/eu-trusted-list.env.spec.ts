import { euTrustedListOptionsFromEnv } from './eu-trusted-list.env';

describe('euTrustedListOptionsFromEnv', () => {
  it('returns no options when nothing is set (adapter serves the EU LoTL)', () => {
    expect(euTrustedListOptionsFromEnv({})).toEqual({});
  });

  it('replaces the LoTL with an https URL, verbatim', () => {
    expect(
      euTrustedListOptionsFromEnv({
        TRS_EU_LOTL_URL: ' https://mirror.example/eu-lotl.xml ',
      }),
    ).toEqual({
      sources: [{ url: 'https://mirror.example/eu-lotl.xml', kind: 'lotl' }],
    });
  });

  it('accepts an http mirror only with TRS_EU_TL_ALLOW_HTTP', () => {
    const env = { TRS_EU_LOTL_URL: 'http://localhost:8080/eu-lotl.xml' };
    expect(() => euTrustedListOptionsFromEnv(env)).toThrow(
      /TRS_EU_TL_ALLOW_HTTP/,
    );
    expect(
      euTrustedListOptionsFromEnv({ ...env, TRS_EU_TL_ALLOW_HTTP: 'true' }),
    ).toEqual({
      sources: [{ url: 'http://localhost:8080/eu-lotl.xml', kind: 'lotl' }],
      http: { allowInsecureHttp: true },
    });
  });

  it('rejects malformed and non-http(s) URLs at startup', () => {
    expect(() =>
      euTrustedListOptionsFromEnv({ TRS_EU_LOTL_URL: 'not a url' }),
    ).toThrow(/not a valid URL/);
    expect(() =>
      euTrustedListOptionsFromEnv({
        TRS_EU_LOTL_URL: 'file:///etc/eu-lotl.xml',
      }),
    ).toThrow(/http\(s\)/);
  });

  it('treats only explicit truthy values as enabling http', () => {
    const env = { TRS_EU_LOTL_URL: 'http://localhost:8080/eu-lotl.xml' };
    expect(() =>
      euTrustedListOptionsFromEnv({ ...env, TRS_EU_TL_ALLOW_HTTP: 'false' }),
    ).toThrow();
    expect(() =>
      euTrustedListOptionsFromEnv({ ...env, TRS_EU_TL_ALLOW_HTTP: '1' }),
    ).not.toThrow();
  });
});
