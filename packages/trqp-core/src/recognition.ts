import { z } from 'zod';
import { TrqpContext, Uri } from './common';

/** TRQP recognition query — `POST /recognition` request body. */
export const RecognitionQuery = z.object({
  entity_id: Uri, // the peer authority being tested for recognition
  authority_id: Uri, // the authority doing the recognizing
  action: z.string().min(1),
  resource: z.string().min(1),
  context: TrqpContext.optional(),
});
export type RecognitionQuery = z.infer<typeof RecognitionQuery>;

/** TRQP recognition response. */
export const RecognitionResponse = z.object({
  recognized: z.boolean(),
  entity_id: z.string(),
  authority_id: z.string(),
  action: z.string(),
  resource: z.string(),
  time_requested: z.string().optional(),
  time_evaluated: z.string(),
  message: z.string().optional(),
});
export type RecognitionResponse = z.infer<typeof RecognitionResponse>;
