import { createServer, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  HttpTrustedListFetcher,
  TrustedListFetchError,
} from './trusted-list.fetcher';

describe('HttpTrustedListFetcher', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      switch (req.url) {
        case '/tl.xml':
          res.writeHead(200, {
            'content-type': 'application/vnd.etsi.tsl+xml',
          });
          return res.end('<TrustServiceStatusList/>');
        case '/moved':
          res.writeHead(302, { location: '/tl.xml' });
          return res.end();
        case '/elsewhere':
          res.writeHead(302, { location: 'http://127.0.0.2:1/tl.xml' });
          return res.end();
        case '/big':
          res.writeHead(200);
          return res.end('x'.repeat(2048));
        default:
          res.writeHead(404);
          return res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const fetcher = () =>
    new HttpTrustedListFetcher({ allowInsecureHttp: true, maxBytes: 1024 });

  it('refuses non-https URLs by default', async () => {
    await expect(
      new HttpTrustedListFetcher().fetch(`${base}/tl.xml`),
    ).rejects.toThrow(/refusing http:/);
  });

  it('fetches and follows same-origin redirects', async () => {
    await expect(fetcher().fetch(`${base}/tl.xml`)).resolves.toBe(
      '<TrustServiceStatusList/>',
    );
    await expect(fetcher().fetch(`${base}/moved`)).resolves.toBe(
      '<TrustServiceStatusList/>',
    );
  });

  it('refuses cross-origin redirects, oversize bodies and HTTP errors', async () => {
    await expect(fetcher().fetch(`${base}/elsewhere`)).rejects.toThrow(
      /cross-origin redirect/,
    );
    await expect(fetcher().fetch(`${base}/big`)).rejects.toThrow(
      /larger than 1024 bytes/,
    );
    await expect(fetcher().fetch(`${base}/missing`)).rejects.toBeInstanceOf(
      TrustedListFetchError,
    );
  });
});
