import {
  lotl,
  skiB64,
  XY_TL_URL,
  ZZ_TL_URL,
  zzTrustedList,
} from '../test/fixtures/trusted-lists';
import { parseTrustedList, TrustedListParseError } from './tsl.parser';

describe('parseTrustedList (ETSI TS 119 612)', () => {
  it('parses a national list regardless of namespace prefix', () => {
    const tl = parseTrustedList(zzTrustedList());
    expect(tl.versionIdentifier).toBe(6);
    expect(tl.sequenceNumber).toBe(42);
    expect(tl.schemeTerritory).toBe('ZZ');
    expect(tl.nextUpdate?.toISOString()).toBe('2099-01-01T00:00:00.000Z');
    expect(tl.hasSignature).toBe(true);
    expect(tl.providers).toHaveLength(1);

    const [tsp] = tl.providers;
    expect(tsp.names[0]).toEqual({ lang: 'en', value: 'Example QTSP S.A.' });
    expect(tsp.tradeNames.map((n) => n.value)).toContain('VATZZ-12345678');
    expect(tsp.services).toHaveLength(3);

    const [g1, g0] = tsp.services;
    expect(g1.current.serviceType).toBe(
      'http://uri.etsi.org/TrstSvc/Svctype/CA/QC',
    );
    expect(g1.current.digitalIds[0].certificate?.length).toBeGreaterThan(100);
    expect(g1.current.additionalServiceInformation).toEqual([
      'http://uri.etsi.org/TrstSvc/TrustedList/SvcInfoExt/ForeSignatures',
    ]);
    expect(g0.history).toHaveLength(2);
    expect(g0.history[0].digitalIds[0].ski?.toString('base64')).toBe(
      skiB64('ca-qc-withdrawn'),
    );
  });

  it('parses LoTL pointers with territory, type, MIME type and signer certificates', () => {
    const l = parseTrustedList(lotl());
    expect(l.tslType).toMatch(/EUlistofthelists$/);
    expect(l.providers).toEqual([]);
    const zz = l.pointers.find((p) => p.location === ZZ_TL_URL)!;
    expect(zz.schemeTerritory).toBe('ZZ');
    expect(zz.mimeType).toBe('application/vnd.etsi.tsl+xml');
    expect(zz.signingCertificates).toHaveLength(1);
    expect(
      l.pointers.find((p) => p.location === XY_TL_URL)?.signingCertificates,
    ).toEqual([]);
    expect(l.pointers).toHaveLength(4);
  });

  it('skips incomplete services with a warning instead of failing the list', () => {
    const xml = zzTrustedList().replace(
      /<tsl:ServiceStatus>[^<]*granted<\/tsl:ServiceStatus>/,
      '',
    );
    const tl = parseTrustedList(xml);
    expect(tl.providers[0].services).toHaveLength(2);
    expect(tl.warnings[0]).toMatch(/incomplete ServiceInformation/);
  });

  it('rejects DOCTYPE (XXE / entity expansion)', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><TrustServiceStatusList>&e;</TrustServiceStatusList>`;
    expect(() => parseTrustedList(xml)).toThrow(TrustedListParseError);
  });

  it('rejects malformed XML and non-TSL documents', () => {
    expect(() => parseTrustedList(zzTrustedList().slice(0, 900))).toThrow(
      /Malformed XML/,
    );
    expect(() => parseTrustedList('<html><body/></html>')).toThrow(
      /TrustServiceStatusList/,
    );
  });
});
