import type { EntityRef } from './entity-id';
import { POSITIVE_SERVICE_STATUSES } from './tsl.constants';
import type {
  ServiceStatusInstance,
  TrustedList,
  TrustService,
  TrustServiceProvider,
} from './tsl.model';
import { CertInfo, certInfo, isDirectlyIssuedBy } from './x509.util';

/** A service with its identifiers pre-computed once per list load. */
interface IndexedService {
  provider: TrustServiceProvider;
  service: TrustService;
  certs: CertInfo[];
  skis: Set<string>; // hex
  sha256s: Set<string>; // hex
}

export interface IndexedTrustedList {
  list: TrustedList;
  services: IndexedService[];
}

export function indexTrustedList(list: TrustedList): IndexedTrustedList {
  const services: IndexedService[] = [];
  for (const provider of list.providers) {
    for (const service of provider.services) {
      const certs: CertInfo[] = [];
      const skis = new Set<string>();
      const sha256s = new Set<string>();
      // The service identity is stable across its history (TS 119 612 §5.5.3),
      // so identifiers from every instance identify the same service.
      for (const inst of [service.current, ...service.history]) {
        for (const id of inst.digitalIds) {
          if (id.ski) skis.add(id.ski.toString('hex'));
          if (id.certificate) {
            const c = certInfo(id.certificate);
            if (!c) continue;
            if (!sha256s.has(c.sha256)) certs.push(c);
            sha256s.add(c.sha256);
            if (c.ski) skis.add(c.ski);
          }
        }
      }
      services.push({ provider, service, certs, skis, sha256s });
    }
  }
  return { list, services };
}

export type MatchedBy =
  'certificate' | 'ski' | 'sha256' | 'issued-by' | 'tsp-name';

export interface ServiceQuery {
  entity: EntityRef;
  /** Full ServiceTypeIdentifier URI; undefined = any type. */
  serviceType?: string;
  /** Full AdditionalServiceInformation URI; undefined = any usage. */
  usage?: string;
  /** Evaluation time. */
  at: Date;
}

export interface ServiceMatch {
  provider: TrustServiceProvider;
  /** The service instance (current or historical) in effect at `at`. */
  instance: ServiceStatusInstance;
  matchedBy: MatchedBy;
}

export interface Evaluation {
  /** Present iff some matching service satisfies type, usage and status at `at`. */
  granted?: ServiceMatch;
  /** Number of services whose identity matched the entity. */
  identityMatches: number;
  /** Why identity-matched services were rejected (for the TRQP message). */
  rejections: string[];
}

/** The service instance in effect at `at` (latest StatusStartingTime ≤ at). */
export function statusAt(
  service: TrustService,
  at: Date,
): ServiceStatusInstance | undefined {
  return [service.current, ...service.history]
    .filter((i) => i.statusStartingTime.getTime() <= at.getTime())
    .sort(
      (a, b) => b.statusStartingTime.getTime() - a.statusStartingTime.getTime(),
    )[0];
}

const lastSegment = (uri: string) =>
  uri.replace(/\/+$/, '').split('/').pop() ?? uri;

function matchIdentity(
  s: IndexedService,
  entity: EntityRef,
): MatchedBy | undefined {
  switch (entity.kind) {
    case 'cert': {
      if (s.sha256s.has(entity.cert.sha256)) return 'certificate';
      if (entity.cert.ski && s.skis.has(entity.cert.ski)) return 'ski';
      return s.certs.some((c) => isDirectlyIssuedBy(entity.cert, c))
        ? 'issued-by'
        : undefined;
    }
    case 'ski':
      return s.skis.has(entity.ski) ? 'ski' : undefined;
    case 'sha256':
      return s.sha256s.has(entity.sha256) ? 'sha256' : undefined;
    case 'tsp': {
      const want = entity.name.toLowerCase();
      return [...s.provider.names, ...s.provider.tradeNames].some(
        (n) => n.value.toLowerCase() === want,
      )
        ? 'tsp-name'
        : undefined;
    }
  }
}

/**
 * Pure decision over one indexed trusted list: is there a service that (1) is
 * identified by the entity, and at `query.at` (2) has the requested type,
 * (3) carries the requested usage, and (4) has a positive status?
 */
export function evaluate(
  idx: IndexedTrustedList,
  query: ServiceQuery,
): Evaluation {
  const rejections: string[] = [];
  let identityMatches = 0;

  for (const s of idx.services) {
    const matchedBy = matchIdentity(s, query.entity);
    if (!matchedBy) continue;
    identityMatches++;

    const name = s.service.current.serviceNames[0]?.value ?? 'unnamed service';
    const inst = statusAt(s.service, query.at);
    if (!inst) {
      rejections.push(`${name}: no status at ${query.at.toISOString()}`);
      continue;
    }
    if (query.serviceType && inst.serviceType !== query.serviceType) {
      rejections.push(
        `${name}: service type is ${lastSegment(inst.serviceType)}`,
      );
      continue;
    }
    if (
      query.usage &&
      !inst.additionalServiceInformation.includes(query.usage)
    ) {
      rejections.push(`${name}: not listed for ${lastSegment(query.usage)}`);
      continue;
    }
    if (!POSITIVE_SERVICE_STATUSES.has(inst.status)) {
      rejections.push(`${name}: status ${lastSegment(inst.status)}`);
      continue;
    }
    if (matchedBy === 'issued-by' && query.entity.kind === 'cert') {
      const x = query.entity.cert.x509;
      const t = query.at.getTime();
      if (
        t < new Date(x.validFrom).getTime() ||
        t > new Date(x.validTo).getTime()
      ) {
        rejections.push(
          `${name}: certificate not valid at ${query.at.toISOString()}`,
        );
        continue;
      }
    }
    return {
      granted: { provider: s.provider, instance: inst, matchedBy },
      identityMatches,
      rejections,
    };
  }
  return { identityMatches, rejections };
}
