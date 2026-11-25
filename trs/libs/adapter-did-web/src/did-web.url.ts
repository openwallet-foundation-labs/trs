/**
 * did:web DID → DID document URL, per the did:web method spec
 * (https://w3c-ccg.github.io/did-method-web/#read-resolve):
 *
 *   did:web:example.com                 → https://example.com/.well-known/did.json
 *   did:web:example.com%3A8443          → https://example.com:8443/.well-known/did.json
 *   did:web:example.com:user:alice      → https://example.com/user/alice/did.json
 *
 * Input is validated strictly because the result is fetched: anything that is
 * not a plain host[:port] plus simple path segments is rejected.
 */

export const DID_WEB_PREFIX = 'did:web:';

export class InvalidDidWebError extends Error {
  constructor(did: string, reason: string) {
    super(`invalid did:web "${did}": ${reason}`);
    this.name = 'InvalidDidWebError';
  }
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i;
const PATH_SEGMENT = /^[A-Za-z0-9._~!$&'()*+,;=@-]+$/;

export function didWebToUrl(did: string): string {
  if (!did.startsWith(DID_WEB_PREFIX)) {
    throw new InvalidDidWebError(did, 'must start with did:web:');
  }
  const msid = did.slice(DID_WEB_PREFIX.length);
  if (/[/?#]/.test(msid)) {
    throw new InvalidDidWebError(
      did,
      'DID URLs (path, query, fragment) are not DIDs',
    );
  }

  const [rawHost, ...segments] = msid.split(':');
  const { host, port } = parseHost(did, rawHost);

  for (const seg of segments) {
    if (!PATH_SEGMENT.test(seg) || seg === '.' || seg === '..') {
      throw new InvalidDidWebError(did, `invalid path segment "${seg}"`);
    }
  }

  const authority = port ? `${host}:${port}` : host;
  const path = segments.length
    ? `/${segments.join('/')}/did.json`
    : '/.well-known/did.json';
  return `https://${authority}${path}`;
}

function parseHost(did: string, raw: string): { host: string; port?: string } {
  // The spec only allows the port colon to be percent-encoded.
  const m = /^([^%]+?)(?:%3A(\d{1,5}))?$/i.exec(raw ?? '');
  if (!m) throw new InvalidDidWebError(did, 'invalid host');
  const host = m[1].toLowerCase();
  const port = m[2];

  const labels = host.split('.');
  if (
    host.length > 253 ||
    labels.length < 2 ||
    !labels.every((l) => LABEL.test(l))
  ) {
    throw new InvalidDidWebError(did, `invalid host "${host}"`);
  }
  // A numeric last label means an IPv4 literal; did:web identifies domains.
  if (/^\d+$/.test(labels[labels.length - 1])) {
    throw new InvalidDidWebError(
      did,
      `IP addresses are not allowed ("${host}")`,
    );
  }
  if (port !== undefined) {
    const n = Number(port);
    if (n < 1 || n > 65535) {
      throw new InvalidDidWebError(did, `invalid port "${port}"`);
    }
  }
  return { host, port };
}
