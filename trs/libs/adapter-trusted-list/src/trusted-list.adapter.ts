import { Inject } from '@nestjs/common';
import { TrustAdapter } from '@app/adapter-kit';
import type {
  AuthorizationInput,
  AuthorizationOutcome,
  RecognitionInput,
  RecognitionOutcome,
  TrustProtocolAdapter,
} from '@app/adapter-kit';
import { TrustedListClient, type ListedService, type TrustedListConfig } from './lote';
import { actionForService, findAuthorizingService, servicesForEntity } from './matching';

export const TRUSTED_LIST_CONFIG = 'TRUSTED_LIST_CONFIG';

const describe = (s: ListedService) =>
  `listed on '${s.listSlug}' as '${s.serviceName}' of ${s.entityName} (${s.serviceTypeIdentifier})`;

/** What the entity *is* listed for — turns a bare "no" into an actionable one. */
const otherwiseListedAs = (services: ListedService[]) =>
  services.length
    ? `; it is listed for ${services.map((s) => `${actionForService(s.serviceTypeIdentifier)}:${s.serviceTypeIdentifier}`).join(', ')}`
    : '';

/**
 * Trusted List adapter — resolves against an ETSI TS 119 602 Scheme Operator.
 *
 * The Scheme Operator publishes JAdES-signed Lists of Trusted Entities; each (entity, service) pair
 * on a list is a statement that the Scheme Operator vouches for that entity operating that service.
 * Both TRQP operations answer from the same statement, differing in what the caller is asking:
 *
 * - authorization — may this entity *do* this (issue an mDL, register relying parties)?
 * - recognition   — does the Scheme Operator accept this entity as an authority of this type?
 */
@TrustAdapter('trusted-list', { order: 20 })
export class TrustedListAdapter implements TrustProtocolAdapter {
  readonly id = 'trusted-list';
  private readonly client: TrustedListClient;
  private readonly baseUrl: string;

  constructor(@Inject(TRUSTED_LIST_CONFIG) cfg: TrustedListConfig) {
    this.client = new TrustedListClient(cfg);
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
  }

  /** The Scheme Operator's origin is the authority; its distribution points route here too. */
  async canHandle(authorityId: string): Promise<boolean> {
    const id = authorityId.replace(/\/+$/, '');
    return id === this.baseUrl || id.startsWith(`${this.baseUrl}/`);
  }

  async resolveAuthorization(input: AuthorizationInput): Promise<AuthorizationOutcome> {
    const services = await this.client.services();
    const match = findAuthorizingService(services, input.entityId, input.action, input.resource);
    return {
      authorized: !!match,
      message: match
        ? `${input.entityId} is ${describe(match)}`
        : `${input.entityId} is not listed by ${this.baseUrl} for '${input.action}' on '${input.resource}'${otherwiseListedAs(servicesForEntity(services, input.entityId))}`,
      freshUntil: this.client.freshUntil,
      evidence: match,
    };
  }

  async resolveRecognition(input: RecognitionInput): Promise<RecognitionOutcome> {
    const services = await this.client.services();
    const match = findAuthorizingService(services, input.entityId, input.action, input.resource);
    return {
      recognized: !!match,
      message: match
        ? `${this.baseUrl} recognizes ${input.entityId} as an authority for '${input.resource}' — ${describe(match)}`
        : `${this.baseUrl} does not recognize ${input.entityId} as an authority for '${input.action}' on '${input.resource}'${otherwiseListedAs(servicesForEntity(services, input.entityId))}`,
      freshUntil: this.client.freshUntil,
      evidence: match,
    };
  }
}
