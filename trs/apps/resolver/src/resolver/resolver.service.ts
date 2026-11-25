import { Injectable } from '@nestjs/common';
import { AdapterRegistry } from '@app/adapter-kit';
import type { AuthorizationInput } from '@app/adapter-kit';
import { CacheService } from '@app/cache';
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
    return this.cache.wrap(queryCacheKey('authz', q), async () => {
      const adapter = await this.registry.select(q.authority_id, q.context);
      const outcome = await adapter.resolveAuthorization(toInput(q));
      return {
        authorized: outcome.authorized,
        ...echo(q),
        message: outcome.message,
      };
    });
  }

  async recognize(q: RecognitionQuery): Promise<RecognitionResponse> {
    return this.cache.wrap(queryCacheKey('recog', q), async () => {
      const adapter = await this.registry.select(q.authority_id, q.context);
      const outcome = await adapter.resolveRecognition(toInput(q));
      return {
        recognized: outcome.recognized,
        ...echo(q),
        message: outcome.message,
      };
    });
  }
}

type Query = AuthorizationQuery | RecognitionQuery;

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
