import { normalizeHex } from '@app/jws';
import type { ListedService } from './lote';

/**
 * The type segments of a service-type identifier — the vocabulary a query's `resource` names.
 *
 *   http://uri.etsi.org/19602/SvcType/EAA/Issuance/mDL        → EAA, Issuance, mDL
 *   https://…/svctype/EAA/Issuance/mDL/mirrored-iaca          → EAA, Issuance, mDL, mirrored-iaca
 *
 * Both ETSI-registered and scheme-local ("mirrored") identifiers use a `…/SvcType/…` marker, so the
 * segments after it are the portable part; anything else falls back to the last path segment.
 */
export function serviceTypeTags(serviceTypeIdentifier: string): string[] {
  const segments = serviceTypeIdentifier.split('/').filter(Boolean);
  const marker = segments.findIndex((s) => s.toLowerCase() === 'svctype');
  if (marker >= 0) return segments.slice(marker + 1);
  return segments.slice(-1);
}

/**
 * Credential types a caller is likely to hold, mapped to the service-type segment that covers them,
 * so a verifier can ask about the doctype it actually received instead of an ETSI URI.
 */
const RESOURCE_ALIASES: Record<string, string> = {
  'org.iso.18013.5.1.mdl': 'mDL',
  'eu.europa.ec.eudi.pid.1': 'PID',
  'urn:eudi:pid:1': 'PID',
  'eu.europa.ec.av.1': 'PID',
  'org.iso.23220.photoid.1': 'PhotoID',
};

/** A `resource` matches a service if it is the full service-type URI, or one of its type segments. */
export function resourceMatchesService(serviceTypeIdentifier: string, resource: string): boolean {
  if (serviceTypeIdentifier === resource) return true;
  const wanted = (RESOURCE_ALIASES[resource.toLowerCase()] ?? resource).toLowerCase();
  return serviceTypeTags(serviceTypeIdentifier).some((tag) => tag.toLowerCase() === wanted);
}

/**
 * The one action a listed service authorizes. A Trusted List states that an entity *operates* a
 * service of some type; `…/Issuance/…` is a licence to issue, `…/Registration` a licence to register.
 */
export function actionForService(serviceTypeIdentifier: string): string {
  const tags = serviceTypeTags(serviceTypeIdentifier).map((t) => t.toLowerCase());
  if (tags.includes('issuance')) return 'issue';
  if (tags.includes('registration')) return 'register';
  return tags[tags.length - 1] ?? '';
}

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, '');

/**
 * Does `entityId` name the entity behind this service?
 *
 * A caller normally holds the trust anchor certificate itself, so the precise forms are
 * `x509:ski:<hex>` and `x509:sha256:<hex>`. Anything else is compared, case-insensitively, against
 * the entity's name, trade name, information URIs and the anchor's subject DN.
 */
export function entityMatchesService(service: ListedService, entityId: string): boolean {
  const ski = /^x509:ski:(.+)$/i.exec(entityId);
  if (ski) return !!service.ski && service.ski === normalizeHex(ski[1]);

  const sha = /^x509:sha256:(.+)$/i.exec(entityId);
  if (sha) return !!service.certSha256 && service.certSha256 === normalizeHex(sha[1]);

  const wanted = stripTrailingSlash(entityId).toLowerCase();
  const candidates = [
    service.entityName,
    service.entityTradeName,
    service.subject,
    ...service.entityInfoUri,
  ];
  return candidates.some((c) => !!c && stripTrailingSlash(c).toLowerCase() === wanted);
}

/** The services `entityId` is listed for, whatever the action or resource. */
export const servicesForEntity = (services: ListedService[], entityId: string): ListedService[] =>
  services.filter((s) => entityMatchesService(s, entityId));

/** The first listed service that authorizes `entityId` to perform `action` on `resource`. */
export const findAuthorizingService = (
  services: ListedService[],
  entityId: string,
  action: string,
  resource: string,
): ListedService | undefined =>
  servicesForEntity(services, entityId).find(
    (s) =>
      resourceMatchesService(s.serviceTypeIdentifier, resource) &&
      actionForService(s.serviceTypeIdentifier) === action.toLowerCase(),
  );
