import { z } from 'zod';

/**
 * The subset of a DID document (DID Core §5) the adapter relies on. Unknown
 * members are kept, so adapters can read extensions without re-fetching.
 */
const VerificationMethod = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    controller: z.string().min(1),
  })
  .passthrough();

const Service = z
  .object({
    id: z.string().min(1),
    type: z.union([z.string(), z.array(z.string())]),
    serviceEndpoint: z.unknown(),
  })
  .passthrough();

const VerificationRelationship = z.array(
  z.union([z.string(), VerificationMethod]),
);

export const DidDocument = z
  .object({
    id: z.string().min(1),
    controller: z.union([z.string(), z.array(z.string())]).optional(),
    alsoKnownAs: z.array(z.string()).optional(),
    verificationMethod: z.array(VerificationMethod).optional(),
    authentication: VerificationRelationship.optional(),
    assertionMethod: VerificationRelationship.optional(),
    keyAgreement: VerificationRelationship.optional(),
    capabilityInvocation: VerificationRelationship.optional(),
    capabilityDelegation: VerificationRelationship.optional(),
    service: z.array(Service).optional(),
  })
  .passthrough();
export type DidDocument = z.infer<typeof DidDocument>;
