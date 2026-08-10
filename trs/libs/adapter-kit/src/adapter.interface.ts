import type { TrqpContext } from '@trs/trqp-core';

export interface AuthorizationInput {
  entityId: string;
  authorityId: string;
  action: string;
  resource: string;
  context?: TrqpContext;
}

export type RecognitionInput = AuthorizationInput;

export interface AuthorizationOutcome {
  authorized: boolean;
  message?: string;
  /** Adapter-known freshness → used as cache TTL (#16). */
  freshUntil?: Date;
  /** Audit/provenance — logged only, NOT surfaced in the TRQP response (O-5). */
  evidence?: unknown;
}

export interface RecognitionOutcome {
  recognized: boolean;
  message?: string;
  freshUntil?: Date;
  evidence?: unknown;
}

/**
 * A TRQP "Bridge": translates a TRQP query into protocol-specific trust
 * resolution and back. Routing is owned by the adapter via `canHandle`
 * (single async, order-based first-match — see #14).
 */
export interface TrustProtocolAdapter {
  readonly id: string;
  /** Return true iff this adapter is authoritative for `authorityId`. */
  canHandle(authorityId: string, ctx?: TrqpContext): Promise<boolean>;
  resolveAuthorization(input: AuthorizationInput): Promise<AuthorizationOutcome>;
  resolveRecognition(input: RecognitionInput): Promise<RecognitionOutcome>;
}
