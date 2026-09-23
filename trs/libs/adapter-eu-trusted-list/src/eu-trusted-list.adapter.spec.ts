import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AdapterKitModule,
  AdapterRegistry,
  NoAdapterError,
  RoutingUnavailableError,
  UnsupportedOperationError,
} from '@app/adapter-kit';
import {
  lotl,
  LOTL_URL,
  pem,
  XY_TL_URL,
  xyTrustedList,
  ZZ_TL_URL,
  zzTrustedList,
} from '../test/fixtures/trusted-lists';
import {
  EuTrustedListAdapter,
  TrustedListUnavailableError,
} from './eu-trusted-list.adapter';
import { EuTrustedListAdapterModule } from './eu-trusted-list.module';
import type { EuTrustedListAdapterOptions } from './eu-trusted-list.options';
import type {
  TrustedListSignatureContext,
  TrustedListSignatureVerifier,
} from './signature-verifier';
import type { TrustedListFetcher } from './trusted-list.fetcher';

/** In-memory fetcher that records every request. */
class FakeFetcher implements TrustedListFetcher {
  readonly calls: string[] = [];
  constructor(public docs: Record<string, string | Error>) {}
  async fetch(url: string): Promise<string> {
    this.calls.push(url);
    const doc = this.docs[url];
    if (doc === undefined) throw new Error(`404 ${url}`);
    if (doc instanceof Error) throw doc;
    return doc;
  }
}

const NOW = new Date('2026-06-01T00:00:00Z');

async function setup(
  over: Partial<EuTrustedListAdapterOptions> = {},
  docs?: Record<string, string | Error>,
) {
  const fetcher = new FakeFetcher(
    docs ?? {
      [LOTL_URL]: lotl(),
      [ZZ_TL_URL]: zzTrustedList(),
      [XY_TL_URL]: xyTrustedList(),
    },
  );
  const mod = await Test.createTestingModule({
    imports: [
      AdapterKitModule,
      EuTrustedListAdapterModule.forRoot({
        sources: [{ url: LOTL_URL, kind: 'lotl' }],
        fetcher,
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
    adapter: app.get(EuTrustedListAdapter),
  };
}

const authz = (
  authorityId: string,
  entityId: string,
  resource = 'CA/QC',
  action = 'ForeSignatures',
  time?: string,
) => ({
  authorityId,
  entityId,
  resource,
  action,
  context: time ? { time } : undefined,
});

describe('EuTrustedListAdapter', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await ctx.app.close();
  });

  describe('routing', () => {
    it('is discovered by the registry', () => {
      expect(ctx.registry.list().map((a) => a.id)).toContain('eu-trusted-list');
    });

    it('handles a configured LoTL without any I/O', async () => {
      expect((await ctx.registry.select(LOTL_URL)).id).toBe('eu-trusted-list');
      expect(ctx.fetcher.calls).toEqual([]);
    });

    it('rejects non-http(s) authorities without any I/O', async () => {
      await expect(
        ctx.registry.select('did:web:example.com'),
      ).rejects.toBeInstanceOf(NoAdapterError);
      expect(ctx.fetcher.calls).toEqual([]);
    });

    it('handles a national list pointed to by the LoTL (loads the LoTL once)', async () => {
      expect(await ctx.adapter.canHandle(ZZ_TL_URL)).toBe(true);
      expect(await ctx.adapter.canHandle(XY_TL_URL)).toBe(true);
      expect(
        await ctx.adapter.canHandle('https://unknown.example/tl.xml'),
      ).toBe(false);
      // PDF pointers and the LoTL self-pointer are not authorities of their own
      expect(await ctx.adapter.canHandle('https://tl.zz.example/tl.pdf')).toBe(
        false,
      );
      expect(ctx.fetcher.calls).toEqual([LOTL_URL]);
    });

    it('LoTL unreachable → canHandle throws → registry reports 503', async () => {
      await ctx.app.close();
      ctx = await setup({}, { [LOTL_URL]: new Error('ECONNRESET') });
      await expect(ctx.registry.select(ZZ_TL_URL)).rejects.toBeInstanceOf(
        RoutingUnavailableError,
      );
    });
  });

  describe('authorization', () => {
    it('LoTL authority: grants a listed QC CA and reports provenance', async () => {
      const out = await ctx.adapter.resolveAuthorization(
        authz(LOTL_URL, pem('ca-qc-granted')),
      );
      expect(out.authorized).toBe(true);
      expect(out.message).toContain(
        'Authorized by ZZ trusted list: Example QTSP S.A. / Example QC CA G1',
      );
      expect(out.message).toContain('list signature not verified');
      expect(out.freshUntil?.toISOString()).toBe('2026-06-01T06:00:00.000Z'); // 6h cap < NextUpdate
      expect(out.evidence).toMatchObject({
        signatureVerifier: 'none',
        match: {
          matchedBy: 'certificate',
          status: expect.stringMatching(/granted$/),
        },
      });
    });

    it('national list authority: grants an end-entity cert issued by a listed CA', async () => {
      const out = await ctx.adapter.resolveAuthorization(
        authz(ZZ_TL_URL, pem('leaf-issued')),
      );
      expect(out.authorized).toBe(true);
      expect(out.message).toContain('matched by issued-by');
      expect(ctx.fetcher.calls).toEqual([LOTL_URL, ZZ_TL_URL]);
    });

    it('uses context.time against ServiceHistory', async () => {
      const g0 = pem('ca-qc-withdrawn');
      expect(
        (await ctx.adapter.resolveAuthorization(authz(LOTL_URL, g0)))
          .authorized,
      ).toBe(false);
      const past = await ctx.adapter.resolveAuthorization(
        authz(LOTL_URL, g0, 'CA/QC', 'ForeSignatures', '2020-01-01T00:00:00Z'),
      );
      expect(past.authorized).toBe(true);
    });

    it('denies with a reason; accepts `*` / `any` and full URIs', async () => {
      const denied = await ctx.adapter.resolveAuthorization(
        authz(LOTL_URL, pem('ca-qc-granted'), 'CA/QC', 'ForeSeals'),
      );
      expect(denied.authorized).toBe(false);
      expect(denied.message).toMatch(/not listed for ForeSeals/);

      const anyUsage = await ctx.adapter.resolveAuthorization(
        authz(
          LOTL_URL,
          pem('tsa-qtst'),
          'http://uri.etsi.org/TrstSvc/Svctype/TSA/QTST',
          'any',
        ),
      );
      expect(anyUsage.authorized).toBe(true);

      const unlisted = await ctx.adapter.resolveAuthorization(
        authz(LOTL_URL, pem('unlisted-ca'), '*', '*'),
      );
      expect(unlisted).toMatchObject({
        authorized: false,
        message: expect.stringContaining('no matching trust service'),
      });
    });

    it('tsp:VATxx-… only downloads the hinted territory', async () => {
      const out = await ctx.adapter.resolveAuthorization(
        authz(LOTL_URL, 'tsp:VATZZ-12345678', '*', 'any'),
      );
      expect(out.authorized).toBe(true);
      expect(ctx.fetcher.calls).toEqual([LOTL_URL, ZZ_TL_URL]);
    });

    it('caches lists: repeated queries do not refetch', async () => {
      await ctx.adapter.resolveAuthorization(
        authz(LOTL_URL, pem('ca-qc-granted')),
      );
      await ctx.adapter.resolveAuthorization(
        authz(LOTL_URL, pem('leaf-issued')),
      );
      await ctx.adapter.resolveAuthorization(
        authz(ZZ_TL_URL, pem('ca-qc-granted')),
      );
      expect(ctx.fetcher.calls.sort()).toEqual(
        [LOTL_URL, XY_TL_URL, ZZ_TL_URL].sort(),
      );
    });

    it('one national list down: still grants on a match, but a negative answer is 503', async () => {
      ctx.fetcher.docs[XY_TL_URL] = new Error('timeout');
      expect(
        (
          await ctx.adapter.resolveAuthorization(
            authz(LOTL_URL, pem('ca-qc-granted')),
          )
        ).authorized,
      ).toBe(true);
      await expect(
        ctx.adapter.resolveAuthorization(
          authz(LOTL_URL, pem('unlisted-ca'), '*', '*'),
        ),
      ).rejects.toBeInstanceOf(TrustedListUnavailableError);
    });

    it("onListUnavailable: 'ignore' turns the 503 into a deny", async () => {
      await ctx.app.close();
      ctx = await setup({ onListUnavailable: 'ignore' });
      ctx.fetcher.docs[XY_TL_URL] = new Error('timeout');
      const out = await ctx.adapter.resolveAuthorization(
        authz(LOTL_URL, pem('unlisted-ca'), '*', '*'),
      );
      expect(out.authorized).toBe(false);
      expect(out.evidence).toMatchObject({
        failures: [expect.stringContaining('XY')],
      });
    });

    it('rejects a malformed entity_id with 400', async () => {
      await expect(
        ctx.adapter.resolveAuthorization(authz(LOTL_URL, 'did:web:x')),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('recognition', () => {
    it('LoTL recognizes the national lists it points to', async () => {
      const yes = await ctx.adapter.resolveRecognition({
        authorityId: LOTL_URL,
        entityId: ZZ_TL_URL,
        action: 'recognize',
        resource: 'trusted-list',
      });
      expect(yes.recognized).toBe(true);
      const no = await ctx.adapter.resolveRecognition({
        authorityId: LOTL_URL,
        entityId: 'https://rogue.example/tl.xml',
        action: 'recognize',
        resource: 'trusted-list',
      });
      expect(no.recognized).toBe(false);
    });

    it('a national list is not a recognizing authority → 501', async () => {
      await expect(
        ctx.adapter.resolveRecognition({
          authorityId: ZZ_TL_URL,
          entityId: XY_TL_URL,
          action: 'a',
          resource: 'r',
        }),
      ).rejects.toBeInstanceOf(UnsupportedOperationError);
    });
  });

  describe('signature verification hook', () => {
    it('passes LoTL-announced signer certificates to the verifier', async () => {
      await ctx.app.close();
      const seen: TrustedListSignatureContext[] = [];
      const verifier: TrustedListSignatureVerifier = {
        id: 'test',
        async verify(_xml, c) {
          seen.push(c);
          return { verified: true };
        },
      };
      ctx = await setup({
        signatureVerifier: verifier,
        requireSignatureVerification: true,
      });
      const out = await ctx.adapter.resolveAuthorization(
        authz(ZZ_TL_URL, pem('ca-qc-granted')),
      );
      expect(out.authorized).toBe(true);
      expect(out.message).not.toContain('not verified');
      const zz = seen.find((c) => c.url === ZZ_TL_URL)!;
      expect(zz.kind).toBe('tl');
      expect(zz.expectedSigners).toHaveLength(1);
    });

    it('requireSignatureVerification: an unverified list is unusable', async () => {
      await ctx.app.close();
      const verifier: TrustedListSignatureVerifier = {
        id: 'strict',
        async verify() {
          return { verified: false, detail: 'bad signature' };
        },
      };
      ctx = await setup({
        signatureVerifier: verifier,
        requireSignatureVerification: true,
      });
      await expect(
        ctx.adapter.resolveAuthorization(authz(LOTL_URL, pem('ca-qc-granted'))),
      ).rejects.toBeInstanceOf(TrustedListUnavailableError);
    });

    it('requireSignatureVerification without a verifier fails at startup', async () => {
      await expect(
        setup({ requireSignatureVerification: true }),
      ).rejects.toThrow(/needs a signatureVerifier/);
    });
  });
});
