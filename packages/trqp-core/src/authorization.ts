import { z } from 'zod';
import { TrqpContext, Uri } from './common';

/** TRQP authorization query — `POST /authorization` request body. */
export const AuthorizationQuery = z.object({
  entity_id: z.string().min(1),
  authority_id: Uri,
  action: z.string().min(1),
  resource: z.string().min(1),
  context: TrqpContext.optional(),
});
export type AuthorizationQuery = z.infer<typeof AuthorizationQuery>;

/** TRQP authorization response. */
export const AuthorizationResponse = z.object({
  authorized: z.boolean(),
  entity_id: z.string(),
  authority_id: z.string(),
  action: z.string(),
  resource: z.string(),
  time_requested: z.string().optional(),
  time_evaluated: z.string(), // RFC 3339, server time when evaluated
  message: z.string().optional(),
});
export type AuthorizationResponse = z.infer<typeof AuthorizationResponse>;
