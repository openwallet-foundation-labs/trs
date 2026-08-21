/** A credential claim a relying party wants to request, as named by a TRQP `resource`. */
export interface RequestedClaim {
  /** Credential format, e.g. `mso_mdoc` or `dc+sd-jwt`. Absent = any registered format. */
  format?: string;
  /**
   * One segment of the claim path, e.g. `given_name`. The registry matches a segment rather than a
   * whole path, so `given_name` hits both `["org.iso.18013.5.1","given_name"]` and `["given_name"]`.
   */
  claim: string;
}

/**
 * Parse a TRQP `resource` naming a claim: `"<format>/<claim>"`, or just `"<claim>"` when the format
 * does not matter. Slash-separated (not colon) so it never collides with a URI-shaped resource.
 */
export function parseRequestedClaim(resource: string): RequestedClaim {
  const slash = resource.indexOf('/');
  if (slash <= 0 || slash === resource.length - 1) return { claim: resource };
  return { format: resource.slice(0, slash), claim: resource.slice(slash + 1) };
}

/**
 * Extract the registered relying-party identifier (LEI, EUID, …) from a TRQP `entity_id`.
 *
 * TRQP requires a recognition `entity_id` to be a URI, while the registry keys relying parties by a
 * bare real-world identifier — `urn:eudi:rp:<identifier>` bridges the two. A registry URL pointing
 * at the party (`…/wrp/<identifier>`) and a bare identifier are accepted as well.
 */
export function parseRelyingPartyId(entityId: string): string {
  const urn = /^urn:eudi:rp:(.+)$/i.exec(entityId);
  if (urn) return urn[1];
  const wrp = /\/wrp\/([^/?#]+)$/.exec(entityId);
  if (wrp) return decodeURIComponent(wrp[1]);
  return entityId;
}
