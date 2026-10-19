import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AdapterKitModule,
  AdapterRegistry,
  NoAdapterError,
  UnsupportedOperationError,
} from '@app/adapter-kit';
import {
  b64,
  ISSUING_CRL_URL,
  pem,
  ROOT_CRL_URL,
} from '../test/fixtures/fixtures';
import type { CrlFetcher } from './crl.store';
import { InvalidEntityIdError } from './entity-id';
import {
  InvalidUsageError,
  PkiX509Adapter,
  RevocationUnavailableError,
} from './pki-x509.adapter';
import { PkiX509AdapterModule } from './pki-x509.module';
import type { PkiX509AdapterOptions } from './pki-x509.options';

/** In-memory CRL fetcher that records every request. */
class FakeFetcher implements CrlFetcher {
  readonly calls: string[] = [];
  constructor(public crls: Record<string, string | Error>) {}
  async fetch(url: string): Promise<Buffer> {
    this.calls.push(url);
    const crl = this.crls[url];
    if (crl === undefined) throw new Error(`404 ${url}`);
    if (crl instanceof Error) throw crl;
    return Buffer.from(crl);
  }
}

const AUTHORITY = 'https://pki.example.com';
const NOW = new Date('2030-01-01T00:00:00Z');

async function setup(
  over: Partial<PkiX509AdapterOptions> = {},
  crls?: Record<string, string | Error>,
) {
  const fetcher = new FakeFetcher(
    crls ?? {
      [ROOT_CRL_URL]: pem('root.crl.pem'),
      [ISSUING_CRL_URL]: pem('issuing.crl.pem'),
    },
  );
  const mod = await Test.createTestingModule({
    imports: [
      AdapterKitModule,
      PkiX509AdapterModule.forRoot({
        authorities: [
          {
            id: AUTHORITY,
            trustAnchors: [pem('root.pem')],
            intermediates: [pem('intermediate.pem')],
          },
        ],
        crlFetcher: fetcher,
        now: () => NOW,
        ...over,
      }),
    ],
  }).compile();
  const app: INestApplication = mod.createNestApplication();
  await app.init();
  return {
    app,
    fetcher,
    registry: app.get(AdapterRegistry),
    adapter: app.get(PkiX509Adapter),
  };
}

const authz = (
  entityId: string,
  resource = 'serverAuth',
  action = 'digitalSignature',
  time?: string,
) => ({
  authorityId: AUTHORITY,
  entityId,
  resource,
  action,
  context: time ? { time } : undefined,
});

const cert = (name: string) => `x509:cert:${b64(name)}`;

describe('PkiX509Adapter', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  describe('routing', () => {
    it('handles only configured authorities, without I/O', async () => {
      const s = await setup();
      app = s.app;
      await expect(s.registry.select(AUTHORITY)).resolves.toBe(s.adapter);
      await expect(
        s.registry.select('https://other.example.com'),
      ).rejects.toBeInstanceOf(NoAdapterError);
      expect(s.fetcher.calls).toEqual([]);
    });

    it('never matches without authorities', async () => {
      const s = await setup({ authorities: [] });
      app = s.app;
      await expect(s.adapter.canHandle(AUTHORITY)).resolves.toBe(false);
    });

    it('rejects an authority without trust anchors at startup', async () => {
      await expect(
        setup({ authorities: [{ id: AUTHORITY, trustAnchors: [] }] }),
      ).rejects.toThrow('has no trust anchors');
    });
  });

  describe('authorization', () => {
    it('authorizes a valid leaf that chains to the trust anchor', async () => {
      const s = await setup();
      app = s.app;
      const r = await s.adapter.resolveAuthorization(
        authz(cert('leaf-valid.pem')),
      );
      expect(r.authorized).toBe(true);
      expect(r.message).toContain('valid.example chains to Example Root CA');
      // Earliest of the chain's NotAfter (2040) and the CRLs' cache limit (24h).
      expect(r.freshUntil).toEqual(new Date('2030-01-02T00:00:00Z'));
      expect(s.fetcher.calls.sort()).toEqual([ISSUING_CRL_URL, ROOT_CRL_URL]);
    });

    it('accepts PEM and x5c entity ids', async () => {
      const s = await setup({
        authorities: [{ id: AUTHORITY, trustAnchors: [pem('root.pem')] }],
      });
      app = s.app;
      const pemChain = pem('leaf-valid.pem') + pem('intermediate.pem');
      const x5c = `x509:x5c:${b64('leaf-valid.pem')},${b64('intermediate.pem')}`;
      for (const entityId of [pemChain, x5c]) {
        const r = await s.adapter.resolveAuthorization(authz(entityId));
        expect(r.authorized).toBe(true);
      }
      // Without the offered intermediate there is no path.
      const r = await s.adapter.resolveAuthorization(
        authz(cert('leaf-valid.pem')),
      );
      expect(r.authorized).toBe(false);
      expect(r.message).toContain('does not chain to a trust anchor');
    });

    it('denies an expired leaf, but allows it at a time it was valid', async () => {
      const s = await setup();
      app = s.app;
      const now = await s.adapter.resolveAuthorization(
        authz(cert('leaf-expired.pem')),
      );
      expect(now.authorized).toBe(false);
      expect(now.message).toContain('expired.example has expired');

      const then = await s.adapter.resolveAuthorization(
        authz(
          cert('leaf-expired.pem'),
          'serverAuth',
          'digitalSignature',
          '2016-06-01T00:00:00Z',
        ),
      );
      expect(then.authorized).toBe(true);
    });

    it('denies a revoked leaf after its revocation date only', async () => {
      const s = await setup();
      app = s.app;
      const after = await s.adapter.resolveAuthorization(
        authz(cert('leaf-revoked.pem')),
      );
      expect(after.authorized).toBe(false);
      expect(after.message).toContain(
        'revoked.example was revoked on 2028-01-01',
      );

      const before = await s.adapter.resolveAuthorization(
        authz(cert('leaf-revoked.pem'), '*', 'any', '2027-06-01T00:00:00Z'),
      );
      expect(before.authorized).toBe(true);
    });

    it('denies a leaf from an untrusted root', async () => {
      const s = await setup();
      app = s.app;
      const r = await s.adapter.resolveAuthorization(
        authz(`x509:x5c:${b64('leaf-untrusted.pem')},${b64('rogue-root.pem')}`),
      );
      expect(r.authorized).toBe(false);
      expect(r.message).toContain('does not chain to a trust anchor');
    });

    it('denies when the issuer is not a CA', async () => {
      const s = await setup();
      app = s.app;
      const r = await s.adapter.resolveAuthorization(
        authz(
          `x509:x5c:${b64('leaf-by-leaf.pem')},${b64('leaf-valid.pem')}`,
          '*',
          'any',
        ),
      );
      expect(r.authorized).toBe(false);
      expect(r.message).toContain('valid.example is not a CA certificate');
    });

    it('enforces the path length constraint', async () => {
      const s = await setup();
      app = s.app;
      const r = await s.adapter.resolveAuthorization(
        authz(
          `x509:x5c:${b64('leaf-too-deep.pem')},${b64('sub-ca.pem')}`,
          '*',
          'any',
        ),
      );
      expect(r.authorized).toBe(false);
      expect(r.message).toContain(
        'Example Issuing CA path length constraint (0) exceeded',
      );
    });

    it('denies a leaf with an unsupported critical extension', async () => {
      const s = await setup();
      app = s.app;
      const r = await s.adapter.resolveAuthorization(
        authz(cert('leaf-critical.pem')),
      );
      expect(r.authorized).toBe(false);
      expect(r.message).toContain(
        'unsupported critical extension(s) 1.3.6.1.4.1.55555.1',
      );
    });

    it('checks the requested key usage and extended key usage', async () => {
      const s = await setup();
      app = s.app;
      const client = await s.adapter.resolveAuthorization(
        authz(cert('leaf-client.pem')),
      );
      expect(client.authorized).toBe(false);
      expect(client.message).toContain(
        'does not allow extended key usage 1.3.6.1.5.5.7.3.1',
      );

      const byOid = await s.adapter.resolveAuthorization(
        authz(cert('leaf-client.pem'), '1.3.6.1.5.5.7.3.2'),
      );
      expect(byOid.authorized).toBe(true);

      const ku = await s.adapter.resolveAuthorization(
        authz(cert('leaf-valid.pem'), 'serverAuth', 'keyEncipherment'),
      );
      expect(ku.authorized).toBe(false);
      expect(ku.message).toContain('does not allow keyEncipherment');
    });

    it('rejects unknown usages and malformed entity ids', async () => {
      const s = await setup();
      app = s.app;
      await expect(
        s.adapter.resolveAuthorization(authz(cert('leaf-valid.pem'), 'banana')),
      ).rejects.toBeInstanceOf(InvalidUsageError);
      await expect(
        s.adapter.resolveAuthorization(
          authz(cert('leaf-valid.pem'), '*', 'banana'),
        ),
      ).rejects.toBeInstanceOf(InvalidUsageError);
      await expect(
        s.adapter.resolveAuthorization(authz('did:web:example.com')),
      ).rejects.toBeInstanceOf(InvalidEntityIdError);
      await expect(
        s.adapter.resolveAuthorization(authz('x509:cert:AAAA')),
      ).rejects.toBeInstanceOf(InvalidEntityIdError);
    });

    it('rejects an unknown authority', async () => {
      const s = await setup();
      app = s.app;
      await expect(
        s.adapter.resolveAuthorization({
          ...authz(cert('leaf-valid.pem')),
          authorityId: 'urn:x',
        }),
      ).rejects.toBeInstanceOf(UnsupportedOperationError);
    });
  });

  describe('revocation', () => {
    it('uses configured CRLs before fetching', async () => {
      const s = await setup(
        {
          authorities: [
            {
              id: AUTHORITY,
              trustAnchors: [pem('root.pem')],
              intermediates: [pem('intermediate.pem')],
              crls: [pem('issuing.crl.pem'), pem('root.crl.pem')],
            },
          ],
        },
        {},
      );
      app = s.app;
      const r = await s.adapter.resolveAuthorization(
        authz(cert('leaf-revoked.pem')),
      );
      expect(r.authorized).toBe(false);
      expect(s.fetcher.calls).toEqual([]);
    });

    it('caches fetched CRLs', async () => {
      const s = await setup();
      app = s.app;
      await s.adapter.resolveAuthorization(authz(cert('leaf-valid.pem')));
      await s.adapter.resolveAuthorization(authz(cert('leaf-revoked.pem')));
      expect(s.fetcher.calls).toHaveLength(2);
    });

    it('fails closed when a CRL cannot be loaded', async () => {
      const s = await setup({}, { [ROOT_CRL_URL]: pem('root.crl.pem') });
      app = s.app;
      await expect(
        s.adapter.resolveAuthorization(authz(cert('leaf-valid.pem'))),
      ).rejects.toBeInstanceOf(RevocationUnavailableError);
    });

    it('never accepts a forged or stale CRL', async () => {
      for (const crl of ['issuing-forged.crl.pem', 'issuing-stale.crl.pem']) {
        const s = await setup(
          {},
          {
            [ROOT_CRL_URL]: pem('root.crl.pem'),
            [ISSUING_CRL_URL]: pem(crl),
          },
        );
        await expect(
          s.adapter.resolveAuthorization(authz(cert('leaf-valid.pem'))),
        ).rejects.toBeInstanceOf(RevocationUnavailableError);
        await s.app.close();
      }
    });

    it('can skip unavailable revocation information', async () => {
      const s = await setup({ onRevocationUnavailable: 'ignore' }, {});
      app = s.app;
      const r = await s.adapter.resolveAuthorization(
        authz(cert('leaf-valid.pem')),
      );
      expect(r.authorized).toBe(true);
      expect(r.message).toContain('revocation not checked for valid.example');
    });

    it('can require revocation information', async () => {
      const s = await setup({ fetchCrls: false, requireRevocationInfo: true });
      app = s.app;
      const r = await s.adapter.resolveAuthorization(
        authz(cert('leaf-valid.pem')),
      );
      expect(r.authorized).toBe(false);
      expect(r.message).toContain(
        'no revocation information for valid.example',
      );
    });
  });

  describe('recognition', () => {
    it('recognizes a CA that chains to the trust anchor', async () => {
      const s = await setup({
        authorities: [{ id: AUTHORITY, trustAnchors: [pem('root.pem')] }],
      });
      app = s.app;
      const r = await s.adapter.resolveRecognition(
        authz(cert('intermediate.pem')),
      );
      expect(r.recognized).toBe(true);
      expect(r.message).toContain(
        'Example Issuing CA chains to Example Root CA',
      );
    });

    it('does not recognize end-entity or foreign certificates', async () => {
      const s = await setup();
      app = s.app;
      const leaf = await s.adapter.resolveRecognition(
        authz(cert('leaf-valid.pem')),
      );
      expect(leaf.recognized).toBe(false);
      expect(leaf.message).toContain('is not a CA certificate');

      const rogue = await s.adapter.resolveRecognition(
        authz(cert('rogue-root.pem')),
      );
      expect(rogue.recognized).toBe(false);
    });
  });
});
