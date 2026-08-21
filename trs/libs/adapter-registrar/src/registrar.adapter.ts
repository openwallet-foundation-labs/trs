import { Inject } from '@nestjs/common';
import { TrustAdapter } from '@app/adapter-kit';
import type {
  AuthorizationInput,
  AuthorizationOutcome,
  RecognitionInput,
  RecognitionOutcome,
  TrustProtocolAdapter,
} from '@app/adapter-kit';
import { RegistrarClient, type RegistrarConfig } from './registrar.client';
import { parseRelyingPartyId, parseRequestedClaim } from './query';

export const REGISTRAR_CONFIG = 'REGISTRAR_CONFIG';

/** Asking a relying party to hand over a claim. */
const REQUEST_ACTIONS = new Set(['request', 'present']);
/** An intermediary acting on a relying party's behalf. */
const MEDIATE_ACTION = 'mediate';

/**
 * Registrar adapter — resolves against an EUDI ARF relying-party registrar (ETSI TS 119 475 / TS5).
 *
 * A registrar records what each relying party registered itself to do, and which intermediary may
 * act for it. The two TRQP operations map onto the registrar's own public-registry endpoints:
 *
 * - authorization — may this relying party request this claim?  → `/wrp/check-intended-use`
 * - recognition   — does the registrar accept this intermediary as acting for that relying party?
 *                                                                → `/wrp/verify-intermediary`
 *
 * Every registry answer is JWS-signed, including the negative ones, so a "no" is as trustworthy as
 * a "yes" — the adapter verifies each response before turning it into a TRQP decision.
 */
@TrustAdapter('registrar', { order: 20 })
export class RegistrarAdapter implements TrustProtocolAdapter {
  readonly id = 'registrar';
  private readonly client: RegistrarClient;
  private readonly registryUrl: string;

  constructor(@Inject(REGISTRAR_CONFIG) cfg: RegistrarConfig) {
    this.client = new RegistrarClient(cfg);
    this.registryUrl = cfg.registryUrl.replace(/\/+$/, '');
  }

  /** The registry API base is the authority; the deployment prefix above it routes here too. */
  async canHandle(authorityId: string): Promise<boolean> {
    const id = authorityId.replace(/\/+$/, '');
    return id === this.registryUrl || this.registryUrl.startsWith(`${id}/`);
  }

  async resolveAuthorization(input: AuthorizationInput): Promise<AuthorizationOutcome> {
    if (!REQUEST_ACTIONS.has(input.action.toLowerCase())) {
      return {
        authorized: false,
        message: `the registrar only answers for actions ${[...REQUEST_ACTIONS].join('/')}, not '${input.action}'`,
      };
    }

    const rp = parseRelyingPartyId(input.entityId);
    const { format, claim } = parseRequestedClaim(input.resource);
    const result = await this.client.signedGet<{ isRegistered: boolean }>(
      '/wrp/check-intended-use',
      {
        rpidentifier: rp,
        credentialformat: format,
        claimpath: claim,
      },
    );

    const scope = `'${claim}'${format ? ` in ${format}` : ''}`;
    return {
      authorized: result.isRegistered,
      message: result.isRegistered
        ? `${rp} has a registered intended use covering ${scope}`
        : `${rp} has no registered intended use covering ${scope}`,
      evidence: result,
    };
  }

  async resolveRecognition(input: RecognitionInput): Promise<RecognitionOutcome> {
    if (input.action.toLowerCase() !== MEDIATE_ACTION) {
      return {
        recognized: false,
        message: `the registrar only answers recognition for action '${MEDIATE_ACTION}', not '${input.action}'`,
      };
    }

    const intermediary = parseRelyingPartyId(input.entityId);
    const rp = parseRelyingPartyId(input.resource);
    const result = await this.client.signedGet<{ verified: boolean }>('/wrp/verify-intermediary', {
      rp,
      intermediary,
    });

    return {
      recognized: result.verified,
      message: result.verified
        ? `${rp} registered ${intermediary} as its intermediary`
        : `${rp} did not register ${intermediary} as its intermediary`,
      evidence: result,
    };
  }
}
