import { z } from 'zod';

/**
 * An RFC 3986 URI. We do NOT use z.string().url() because that rejects
 * non-`scheme://` URIs such as `did:web:example.com`, which are valid
 * authority identifiers. We only require a leading scheme.
 */
export const Uri = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9+.\-]*:/, 'must be a URI (RFC 3986, e.g. did:web:… or https://…)');

/** TRQP context object. Unrecognized members are ignored (forward compatible). */
export const TrqpContext = z.object({
  time: z.string().datetime({ offset: true }).optional(), // RFC 3339
  locator: z.string().optional(),
});
export type TrqpContext = z.infer<typeof TrqpContext>;
