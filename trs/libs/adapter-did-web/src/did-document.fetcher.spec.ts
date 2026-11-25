import {
  DidDocumentFetchError,
  HttpDidDocumentFetcher,
} from './did-document.fetcher';

const DID = 'did:web:issuer.example';
const URL_ = 'https://issuer.example/.well-known/did.json';

const doc = {
  '@context': ['https://www.w3.org/ns/did/v1'],
  id: DID,
  verificationMethod: [
    {
      id: `${DID}#key-1`,
      type: 'JsonWebKey2020',
      controller: DID,
      publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'abc' },
    },
  ],
  assertionMethod: [`${DID}#key-1`],
};

type Route = (url: string) => Response;

function mockFetch(route: Route) {
  return jest
    .spyOn(global, 'fetch')
    .mockImplementation(async (input) => route(String(input)));
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

describe('HttpDidDocumentFetcher', () => {
  afterEach(() => jest.restoreAllMocks());

  it('fetches and validates the document from the did:web URL', async () => {
    const spy = mockFetch(() => json(doc));
    const result = await new HttpDidDocumentFetcher().fetch(DID);
    expect(String(spy.mock.calls[0][0])).toBe(URL_);
    expect(result.id).toBe(DID);
    expect(result.verificationMethod?.[0].publicKeyJwk).toEqual(
      doc.verificationMethod[0].publicKeyJwk,
    );
  });

  it('rejects a document whose id does not match the DID', async () => {
    mockFetch(() => json({ ...doc, id: 'did:web:attacker.example' }));
    await expect(new HttpDidDocumentFetcher().fetch(DID)).rejects.toThrow(
      'does not match',
    );
  });

  it('rejects non-JSON and structurally invalid documents', async () => {
    mockFetch(() => new Response('<html>', { status: 200 }));
    await expect(new HttpDidDocumentFetcher().fetch(DID)).rejects.toThrow(
      'not valid JSON',
    );
    mockFetch(() => json({ ...doc, verificationMethod: [{ id: 'x' }] }));
    await expect(new HttpDidDocumentFetcher().fetch(DID)).rejects.toThrow(
      'invalid DID document: verificationMethod.0.type',
    );
  });

  it('surfaces HTTP errors', async () => {
    mockFetch(() => new Response('nope', { status: 404 }));
    await expect(new HttpDidDocumentFetcher().fetch(DID)).rejects.toThrow(
      `${DID}: HTTP 404`,
    );
  });

  it('follows same-origin redirects', async () => {
    mockFetch((url) =>
      url === URL_
        ? new Response(null, {
            status: 302,
            headers: { location: '/did/v2.json' },
          })
        : json(doc),
    );
    await expect(
      new HttpDidDocumentFetcher().fetch(DID),
    ).resolves.toMatchObject({ id: DID });
  });

  it('refuses cross-origin redirects', async () => {
    mockFetch(
      () =>
        new Response(null, {
          status: 301,
          headers: { location: 'https://evil.example/did.json' },
        }),
    );
    await expect(new HttpDidDocumentFetcher().fetch(DID)).rejects.toThrow(
      'cross-origin redirect',
    );
  });

  it('stops after maxRedirects', async () => {
    mockFetch(
      () =>
        new Response(null, { status: 302, headers: { location: '/again' } }),
    );
    await expect(
      new HttpDidDocumentFetcher({ maxRedirects: 2 }).fetch(DID),
    ).rejects.toThrow('too many or invalid redirects');
  });

  it('enforces maxBytes even without content-length', async () => {
    const big = JSON.stringify({ ...doc, pad: 'x'.repeat(2_000) });
    mockFetch(
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(big));
              c.close();
            },
          }),
        ),
    );
    await expect(
      new HttpDidDocumentFetcher({ maxBytes: 1_000 }).fetch(DID),
    ).rejects.toThrow('larger than 1000 bytes');
  });

  it('wraps network failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const err = await new HttpDidDocumentFetcher()
      .fetch(DID)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DidDocumentFetchError);
    expect((err as Error).message).toContain('ECONNREFUSED');
  });

  it('rejects invalid DIDs before any request', async () => {
    const spy = mockFetch(() => json(doc));
    await expect(
      new HttpDidDocumentFetcher().fetch('did:web:127.0.0.1'),
    ).rejects.toThrow('IP addresses are not allowed');
    expect(spy).not.toHaveBeenCalled();
  });
});
