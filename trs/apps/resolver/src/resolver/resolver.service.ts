import { Injectable } from '@nestjs/common';
import { AdapterRegistry } from '@app/adapter-kit';
import type { AuthorizationInput } from '@app/adapter-kit';
import { CacheService, DEFAULT_TTL_MS } from '@app/cache';
import type {
  AuthorizationQuery,
  AuthorizationResponse,
  RecognitionQuery,
  RecognitionResponse,
} from '@trs/trqp-core';
import { queryCacheKey } from './cache-key';

/** Orchestration: cache → route (registry) → adapter → TRQP response mapping. */
@Injectable()
export class ResolverService {
  constructor(
    private readonly registry: AdapterRegistry,
    private readonly cache: CacheService,
  ) {}

  async authorize(q: AuthorizationQuery): Promise<AuthorizationResponse> {
    let freshUntil: Date | undefined;
    return this.cache.wrap(
      queryCacheKey('authz', q),
      async () => {
        const adapter = await this.registry.select(q.authority_id, q.context);
        const outcome = await adapter.resolveAuthorization(toInput(q));
        freshUntil = outcome.freshUntil;
        return {
          authorized: outcome.authorized,
          ...echo(q),
          message: outcome.message,
        };
      },
      () => ttlFor(freshUntil),
    );
  }

  async recognize(q: RecognitionQuery): Promise<RecognitionResponse> {
    let freshUntil: Date | undefined;
    return this.cache.wrap(
      queryCacheKey('recog', q),
      async () => {
        const adapter = await this.registry.select(q.authority_id, q.context);
        const outcome = await adapter.resolveRecognition(toInput(q));
        freshUntil = outcome.freshUntil;
        return {
          recognized: outcome.recognized,
          ...echo(q),
          message: outcome.message,
        };
      },
      () => ttlFor(freshUntil),
    );
  }
}

type Query = AuthorizationQuery | RecognitionQuery;

/**
 * Cache TTL for an adapter outcome: the default, shortened to the adapter's
 * `freshUntil` when that comes sooner. Already-stale outcomes are not cached.
 */
export function ttlFor(freshUntil: Date | undefined, now = Date.now()): number {
  if (!freshUntil) return DEFAULT_TTL_MS;
  return Math.min(DEFAULT_TTL_MS, freshUntil.getTime() - now);
}

function toInput(q: Query): AuthorizationInput {
  return {
    entityId: q.entity_id,
    authorityId: q.authority_id,
    action: q.action,
    resource: q.resource,
    context: q.context,
  };
}

/** Query fields TRQP responses echo back, plus the evaluation timestamp. */
function echo(q: Query) {
  return {
    entity_id: q.entity_id,
    authority_id: q.authority_id,
    action: q.action,
    resource: q.resource,
    time_requested: q.context?.time,
    time_evaluated: new Date().toISOString(),
  };
}
