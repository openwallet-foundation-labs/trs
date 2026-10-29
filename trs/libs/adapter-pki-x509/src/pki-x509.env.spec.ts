import { pkiX509OptionsFromEnv } from './pki-x509.env';

const files: Record<string, string> = {
  '/etc/trs/pki.json': JSON.stringify({
    authorities: [
      {
        id: 'https://pki.example.com',
        trustAnchors: [
          'root.pem',
          '-----BEGIN CERTIFICATE-----\nINLINE\n-----END CERTIFICATE-----',
        ],
        crls: ['crls/root.crl'],
      },
    ],
  }),
  '/etc/trs/root.pem': 'ROOT',
  '/etc/trs/crls/root.crl': 'CRL',
};
const read = (p: string) => {
  if (!(p in files)) throw new Error(`ENOENT ${p}`);
  return files[p];
};

describe('pkiX509OptionsFromEnv', () => {
  it('returns no authorities without TRS_PKI_CONFIG', () => {
    expect(pkiX509OptionsFromEnv({}, read)).toEqual({});
  });

  it('loads authorities and resolves file paths relative to the config', () => {
    const opts = pkiX509OptionsFromEnv(
      { TRS_PKI_CONFIG: '/etc/trs/pki.json' },
      read,
    );
    expect(opts.authorities).toEqual([
      {
        id: 'https://pki.example.com',
        trustAnchors: [
          'ROOT',
          '-----BEGIN CERTIFICATE-----\nINLINE\n-----END CERTIFICATE-----',
        ],
        intermediates: [],
        crls: ['CRL'],
      },
    ]);
  });

  it('fails at startup on a broken config', () => {
    expect(() =>
      pkiX509OptionsFromEnv({ TRS_PKI_CONFIG: '/missing.json' }, read),
    ).toThrow('TRS_PKI_CONFIG (/missing.json)');
    files['/bad.json'] = '{"authorities": [{"trustAnchors": []}]}';
    expect(() =>
      pkiX509OptionsFromEnv({ TRS_PKI_CONFIG: '/bad.json' }, read),
    ).toThrow('every authority needs an "id"');
  });
});
