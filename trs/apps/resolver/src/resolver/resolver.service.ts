import { Injectable } from '@nestjs/common';
import { AdapterRegistry } from '@app/adapter-kit';
import { CacheService } from '@app/cache';
import type {
  AuthorizationQuery,
  AuthorizationResponse,
  RecognitionQuery,
  RecognitionResponse,
} from '@trs/trqp-core';

/** Orchestration: cache → route (registry) → adapter → TRQP response mapping. */
@Injectable()
export class ResolverService {
  constructor(
    private readonly registry: AdapterRegistry,
    private readonly cache: CacheService,
  ) {}

  async authorize(q: AuthorizationQuery): Promise<AuthorizationResponse> {
    const key = `authz|${q.authority_id}|${q.entity_id}|${q.action}|${q.resource}|${q.context?.time ?? ''}`;
    return this.cache.wrap(key, async () => {
      const adapter = await this.registry.select(q.authority_id, q.context);
      const outcome = await adapter.resolveAuthorization({
        entityId: q.entity_id,
        authorityId: q.authority_id,
        action: q.action,
        resource: q.resource,
        context: q.context,
      });
      return {
        authorized: outcome.authorized,
        entity_id: q.entity_id,
        authority_id: q.authority_id,
        action: q.action,
        resource: q.resource,
        time_requested: q.context?.time,
        time_evaluated: new Date().toISOString(),
        message: outcome.message,
      };
    });
  }

  async recognize(q: RecognitionQuery): Promise<RecognitionResponse> {
    const key = `recog|${q.authority_id}|${q.entity_id}|${q.action}|${q.resource}|${q.context?.time ?? ''}`;
    return this.cache.wrap(key, async () => {
      const adapter = await this.registry.select(q.authority_id, q.context);
      const outcome = await adapter.resolveRecognition({
        entityId: q.entity_id,
        authorityId: q.authority_id,
        action: q.action,
        resource: q.resource,
        context: q.context,
      });
      return {
        recognized: outcome.recognized,
        entity_id: q.entity_id,
        authority_id: q.authority_id,
        action: q.action,
        resource: q.resource,
        time_requested: q.context?.time,
        time_evaluated: new Date().toISOString(),
        message: outcome.message,
      };
    });
  }
}
