import type { ListedService } from './lote';
import {
  actionForService,
  entityMatchesService,
  findAuthorizingService,
  resourceMatchesService,
  serviceTypeTags,
} from './matching';

const MDL = 'http://uri.etsi.org/19602/SvcType/EAA/Issuance/mDL';
const MIRRORED_MDL = 'https://trusted-list.vercel.app/svctype/EAA/Issuance/mDL/mirrored-iaca';
const RP_REGISTRATION = 'http://uri.etsi.org/19602/SvcType/RP/Registration';

const service = (over: Partial<ListedService> = {}): ListedService => ({
  listSlug: 'attestation-issuers',
  entityName: 'Utah DLD',
  entityInfoUri: [],
  serviceTypeIdentifier: MIRRORED_MDL,
  serviceName: 'mDL IACA — IACA-UTAH-USA-002',
  ski: 'f67f496c3189b5d8fa1a7dabf2d0714c1db1e2c8',
  subject: 'CN=IACA-UTAH-USA-002, C=US',
  certSha256: 'aa'.repeat(32),
  ...over,
});

describe('serviceTypeTags', () => {
  it('takes the segments after the SvcType marker, for both ETSI and scheme-local URIs', () => {
    expect(serviceTypeTags(MDL)).toEqual(['EAA', 'Issuance', 'mDL']);
    expect(serviceTypeTags(MIRRORED_MDL)).toEqual(['EAA', 'Issuance', 'mDL', 'mirrored-iaca']);
  });

  it('falls back to the last segment when there is no marker', () => {
    expect(serviceTypeTags('https://example.test/trust/anchors')).toEqual(['anchors']);
  });
});

describe('resourceMatchesService', () => {
  it('matches the full service-type URI', () => {
    expect(resourceMatchesService(MDL, MDL)).toBe(true);
  });

  it('matches a type segment, so mirrored and scheme-operated services answer the same query', () => {
    expect(resourceMatchesService(MDL, 'mDL')).toBe(true);
    expect(resourceMatchesService(MIRRORED_MDL, 'mDL')).toBe(true);
  });

  it('resolves a credential doctype through the alias table', () => {
    expect(resourceMatchesService(MDL, 'org.iso.18013.5.1.mDL')).toBe(true);
    expect(
      resourceMatchesService(
        'http://uri.etsi.org/19602/SvcType/PID/Issuance/mdoc',
        'eu.europa.ec.eudi.pid.1',
      ),
    ).toBe(true);
  });

  it('does not match an unrelated resource', () => {
    expect(resourceMatchesService(MDL, 'PID')).toBe(false);
  });
});

describe('actionForService', () => {
  it('maps issuance services to issue and registration services to register', () => {
    expect(actionForService(MDL)).toBe('issue');
    expect(actionForService(MIRRORED_MDL)).toBe('issue');
    expect(actionForService(RP_REGISTRATION)).toBe('register');
  });
});

describe('entityMatchesService', () => {
  it('matches on subject key identifier, ignoring separators and case', () => {
    expect(
      entityMatchesService(
        service(),
        'x509:ski:F6:7F:49:6C:31:89:B5:D8:FA:1A:7D:AB:F2:D0:71:4C:1D:B1:E2:C8',
      ),
    ).toBe(true);
    expect(entityMatchesService(service(), 'x509:ski:0000')).toBe(false);
  });

  it('matches on certificate fingerprint', () => {
    expect(entityMatchesService(service(), `x509:sha256:${'AA'.repeat(32)}`)).toBe(true);
  });

  it('matches on entity name, subject DN and information URI, ignoring a trailing slash', () => {
    expect(entityMatchesService(service(), 'utah dld')).toBe(true);
    expect(entityMatchesService(service(), 'CN=IACA-UTAH-USA-002, C=US')).toBe(true);
    expect(
      entityMatchesService(
        service({ entityInfoUri: ['https://registrar.hopae.dev/'] }),
        'https://registrar.hopae.dev',
      ),
    ).toBe(true);
  });

  it('does not fall back to a name match when an x509 form is given but absent from the list', () => {
    expect(entityMatchesService(service({ ski: undefined }), 'x509:ski:f67f496c')).toBe(false);
  });
});

describe('findAuthorizingService', () => {
  const services = [
    service(),
    service({
      listSlug: 'registrar',
      entityName: 'Hopae Registrar',
      serviceTypeIdentifier: RP_REGISTRATION,
      ski: '46ec7835',
    }),
  ];

  it('finds the service that authorizes the action on the resource', () => {
    expect(
      findAuthorizingService(services, 'x509:ski:46ec7835', 'register', 'Registration')?.listSlug,
    ).toBe('registrar');
  });

  it('requires the action to match the kind of service that is listed', () => {
    expect(findAuthorizingService(services, 'Utah DLD', 'register', 'mDL')).toBeUndefined();
    expect(findAuthorizingService(services, 'Utah DLD', 'issue', 'mDL')).toBeDefined();
  });
});
