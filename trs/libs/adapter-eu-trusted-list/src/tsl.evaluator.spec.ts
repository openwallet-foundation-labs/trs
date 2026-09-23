import {
  b64,
  pem,
  skiB64,
  zzTrustedList,
} from '../test/fixtures/trusted-lists';
import { InvalidEntityIdError, parseEntityId } from './entity-id';
import { evaluate, indexTrustedList, ServiceQuery } from './tsl.evaluator';
import { parseTrustedList } from './tsl.parser';
import { certInfo } from './x509.util';

const CA_QC = 'http://uri.etsi.org/TrstSvc/Svctype/CA/QC';
const TSA = 'http://uri.etsi.org/TrstSvc/Svctype/TSA/QTST';
const ESIG =
  'http://uri.etsi.org/TrstSvc/TrustedList/SvcInfoExt/ForeSignatures';
const ESEAL = 'http://uri.etsi.org/TrstSvc/TrustedList/SvcInfoExt/ForeSeals';

describe('entity_id parsing', () => {
  it('accepts PEM, x509:cert:, bare base64 DER', () => {
    expect(parseEntityId(pem('leaf-issued')).kind).toBe('cert');
    expect(parseEntityId(`x509:cert:${b64('leaf-issued')}`).kind).toBe('cert');
    expect(parseEntityId(b64('leaf-issued')).kind).toBe('cert');
  });

  it('accepts x509:ski: as base64 or 20-byte hex, x509:sha256:, tsp:', () => {
    const ski = skiB64('ca-qc-granted');
    const hex = Buffer.from(ski, 'base64').toString('hex');
    expect(parseEntityId(`x509:ski:${ski}`)).toEqual({ kind: 'ski', ski: hex });
    expect(parseEntityId(`x509:ski:${hex.toUpperCase()}`)).toEqual({
      kind: 'ski',
      ski: hex,
    });
    expect(parseEntityId(`x509:sha256:${'AB'.repeat(32)}`)).toEqual({
      kind: 'sha256',
      sha256: 'ab'.repeat(32),
    });
    expect(parseEntityId('tsp:VATZZ-12345678')).toEqual({
      kind: 'tsp',
      name: 'VATZZ-12345678',
    });
  });

  it('rejects unknown forms and unparseable certificates with a 400', () => {
    expect(() => parseEntityId('did:web:example.com')).toThrow(
      InvalidEntityIdError,
    );
    expect(() => parseEntityId('x509:cert:AAAA')).toThrow(
      /could not be parsed/,
    );
    expect(() => parseEntityId('x509:sha256:abcd')).toThrow(/32 bytes/);
    try {
      parseEntityId('nope');
    } catch (e) {
      expect((e as InvalidEntityIdError).status).toBe(400);
    }
  });
});

describe('evaluate (service identity × type × usage × status at time)', () => {
  const idx = indexTrustedList(parseTrustedList(zzTrustedList()));
  const q = (
    entityId: string,
    over: Partial<ServiceQuery> = {},
  ): ServiceQuery => ({
    entity: parseEntityId(entityId),
    serviceType: CA_QC,
    usage: ESIG,
    at: new Date('2026-06-01T00:00:00Z'),
    ...over,
  });

  it('grants a listed CA/QC by its own certificate', () => {
    const r = evaluate(idx, q(pem('ca-qc-granted')));
    expect(r.granted?.matchedBy).toBe('certificate');
    expect(r.granted?.instance.serviceNames[0].value).toBe('Example QC CA G1');
  });

  it('grants by SKI (base64/hex), SHA-256 fingerprint and TSP trade name', () => {
    const sha = certInfo(Buffer.from(b64('ca-qc-granted'), 'base64'))!.sha256;
    expect(
      evaluate(idx, q(`x509:ski:${skiB64('ca-qc-granted')}`)).granted
        ?.matchedBy,
    ).toBe('ski');
    expect(evaluate(idx, q(`x509:sha256:${sha}`)).granted?.matchedBy).toBe(
      'sha256',
    );
    expect(evaluate(idx, q('tsp:vatzz-12345678')).granted?.matchedBy).toBe(
      'tsp-name',
    );
  });

  it('grants an end-entity certificate directly issued (signature-verified) by a listed CA', () => {
    const r = evaluate(idx, q(pem('leaf-issued')));
    expect(r.granted?.matchedBy).toBe('issued-by');
  });

  it('never matches a certificate that only copies the CA name (bad signature)', () => {
    const r = evaluate(idx, q(pem('leaf-forged')));
    expect(r.granted).toBeUndefined();
    expect(r.identityMatches).toBe(0);
  });

  it('rejects an issued certificate outside its validity at the evaluation time', () => {
    const r = evaluate(idx, q(pem('leaf-expired')));
    expect(r.granted).toBeUndefined();
    expect(r.rejections[0]).toMatch(/certificate not valid/);
  });

  it('follows ServiceHistory: withdrawn now, granted in 2020, legacy undersupervision in 2014', () => {
    const g0 = pem('ca-qc-withdrawn');
    const now = evaluate(idx, q(g0));
    expect(now.granted).toBeUndefined();
    expect(now.rejections[0]).toMatch(/status withdrawn/);

    const y2020 = evaluate(
      idx,
      q(g0, { at: new Date('2020-01-01T00:00:00Z') }),
    );
    expect(y2020.granted?.instance.status).toMatch(/granted$/);

    // 2014: legacy status is positive, but that historical instance declares no usage.
    const y2014 = evaluate(
      idx,
      q(g0, { at: new Date('2014-01-01T00:00:00Z'), usage: undefined }),
    );
    expect(y2014.granted?.instance.status).toMatch(/undersupervision$/);

    const before = evaluate(
      idx,
      q(g0, { at: new Date('2011-01-01T00:00:00Z') }),
    );
    expect(before.rejections[0]).toMatch(/no status/);
  });

  it('enforces service type and usage', () => {
    expect(
      evaluate(idx, q(pem('ca-qc-granted'), { usage: ESEAL })).rejections[0],
    ).toMatch(/not listed for ForeSeals/);
    expect(evaluate(idx, q(pem('tsa-qtst'))).rejections[0]).toMatch(
      /service type is QTST/,
    );
    expect(
      evaluate(idx, q(pem('tsa-qtst'), { serviceType: TSA, usage: undefined }))
        .granted,
    ).toBeDefined();
  });

  it('does not match unlisted entities', () => {
    const r = evaluate(
      idx,
      q(pem('unlisted-ca'), { serviceType: undefined, usage: undefined }),
    );
    expect(r).toEqual({ identityMatches: 0, rejections: [] });
  });
});
