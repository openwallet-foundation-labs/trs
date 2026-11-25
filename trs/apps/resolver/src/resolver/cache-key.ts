import type { AuthorizationQuery, RecognitionQuery } from '@trs/trqp-core';

/**
 * Cache key for a TRQP query. Covers every field that can change the answer,
 * including `context.locator` (it is passed to routing). Values are encoded as
 * a JSON array so free-form strings such as `entity_id` cannot collide by
 * containing the separator.
 */
export function queryCacheKey(
  kind: 'authz' | 'recog',
  q: AuthorizationQuery | RecognitionQuery,
): string {
  return JSON.stringify([
    kind,
    q.authority_id,
    q.entity_id,
    q.action,
    q.resource,
    q.context?.time ?? null,
    q.context?.locator ?? null,
  ]);
}
