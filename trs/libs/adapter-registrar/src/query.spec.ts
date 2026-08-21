import { parseRelyingPartyId, parseRequestedClaim } from './query';

describe('parseRequestedClaim', () => {
  it('splits "<format>/<claim>"', () => {
    expect(parseRequestedClaim('mso_mdoc/given_name')).toEqual({
      format: 'mso_mdoc',
      claim: 'given_name',
    });
    expect(parseRequestedClaim('dc+sd-jwt/birthdate')).toEqual({
      format: 'dc+sd-jwt',
      claim: 'birthdate',
    });
  });

  it('treats a resource without a separator as a bare claim', () => {
    expect(parseRequestedClaim('given_name')).toEqual({ claim: 'given_name' });
  });

  it('does not read an empty format or claim out of a stray slash', () => {
    expect(parseRequestedClaim('/given_name')).toEqual({ claim: '/given_name' });
    expect(parseRequestedClaim('mso_mdoc/')).toEqual({ claim: 'mso_mdoc/' });
  });
});

describe('parseRelyingPartyId', () => {
  it('unwraps the urn form TRQP recognition needs', () => {
    expect(parseRelyingPartyId('urn:eudi:rp:HOPAE-DEMO-INTERMEDIARY-LU-01')).toBe(
      'HOPAE-DEMO-INTERMEDIARY-LU-01',
    );
  });

  it('takes the identifier out of a registry URL', () => {
    expect(
      parseRelyingPartyId('https://dev.api.hopae.com/registrar/registry/wrp/DEMO.87654321'),
    ).toBe('DEMO.87654321');
  });

  it('passes a bare identifier through', () => {
    expect(parseRelyingPartyId('HOPAE-DEMO-VERIFIER-LU-01')).toBe('HOPAE-DEMO-VERIFIER-LU-01');
  });
});
