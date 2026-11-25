import { InvalidDidWebError, didWebToUrl } from './did-web.url';

describe('didWebToUrl', () => {
  it.each([
    ['did:web:example.com', 'https://example.com/.well-known/did.json'],
    [
      'did:web:w3c-ccg.github.io',
      'https://w3c-ccg.github.io/.well-known/did.json',
    ],
    [
      'did:web:example.com%3A8443',
      'https://example.com:8443/.well-known/did.json',
    ],
    [
      'did:web:example.com:user:alice',
      'https://example.com/user/alice/did.json',
    ],
    [
      'did:web:example.com%3A3000:issuers:acme',
      'https://example.com:3000/issuers/acme/did.json',
    ],
    ['did:web:Example.COM', 'https://example.com/.well-known/did.json'],
  ])('%s → %s', (did, url) => {
    expect(didWebToUrl(did)).toBe(url);
  });

  it.each([
    ['did:key:z6Mk', 'must start with did:web:'],
    ['did:web:', 'invalid host'],
    ['did:web:localhost', 'invalid host'],
    ['did:web:exa_mple.com', 'invalid host'],
    ['did:web:-bad.example.com', 'invalid host'],
    ['did:web:127.0.0.1', 'IP addresses are not allowed'],
    ['did:web:10.0.0.1%3A8080', 'IP addresses are not allowed'],
    ['did:web:example.com%3A0', 'invalid port'],
    ['did:web:example.com%3A70000', 'invalid port'],
    ['did:web:example.com%2Fevil', 'invalid host'],
    ['did:web:example.com#key-1', 'not DIDs'],
    ['did:web:example.com/path', 'not DIDs'],
    ['did:web:example.com?x=1', 'not DIDs'],
    ['did:web:example.com::alice', 'invalid path segment ""'],
    ['did:web:example.com:..:admin', 'invalid path segment ".."'],
    ['did:web:example.com:.', 'invalid path segment "."'],
    ['did:web:example.com:a%2F..', 'invalid path segment'],
  ])('rejects %s', (did, reason) => {
    expect(() => didWebToUrl(did)).toThrow(InvalidDidWebError);
    expect(() => didWebToUrl(did)).toThrow(reason);
  });
});
