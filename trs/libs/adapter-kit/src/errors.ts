/** Base for adapter/routing errors; `status` maps to the RFC 7807 HTTP status. */
export class AdapterError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** No adapter is authoritative for the authority → 404. */
export class NoAdapterError extends AdapterError {
  constructor(readonly authorityId: string) {
    super(`No adapter can handle authority: ${authorityId}`, 404);
  }
}

/** Routing could not be determined (a canHandle threw, e.g. network) → 503. */
export class RoutingUnavailableError extends AdapterError {
  constructor(readonly authorityId: string) {
    super(`Routing could not be determined for authority: ${authorityId}`, 503);
  }
}

/** The adapter's upstream trust source is unreachable, unparseable, or fails verification → 503. */
export class TrustSourceUnavailableError extends AdapterError {
  constructor(message: string) {
    super(message, 503);
  }
}

/** Adapter matched but does not implement the requested operation → 501. */
export class UnsupportedOperationError extends AdapterError {
  constructor(operation: string, adapterId: string) {
    super(`Adapter '${adapterId}' does not support '${operation}'`, 501);
  }
}
