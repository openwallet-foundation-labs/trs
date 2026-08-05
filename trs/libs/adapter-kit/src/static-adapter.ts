import { Inject } from '@nestjs/common';
import { TrustAdapter } from './trust-adapter.decorator';
import type {
  AuthorizationInput,
  AuthorizationOutcome,
  RecognitionInput,
  RecognitionOutcome,
  TrustProtocolAdapter,
} from './adapter.interface';

export interface StaticEntry {
  authorized?: boolean;
  recognized?: boolean;
}
export interface StaticAdapterConfig {
  entries: Record<string, StaticEntry>;
}
export const STATIC_ADAPTER_CONFIG = 'STATIC_ADAPTER_CONFIG';

/**
 * Reference adapter: resolves against a static in-memory config. Useful for
 * local dev, tests, and as a copy template for new adapters.
 */
@TrustAdapter('static', { order: 50 })
export class StaticAdapter implements TrustProtocolAdapter {
  readonly id = 'static';

  constructor(@Inject(STATIC_ADAPTER_CONFIG) private readonly cfg: StaticAdapterConfig) {}

  async canHandle(authorityId: string): Promise<boolean> {
    return Object.prototype.hasOwnProperty.call(this.cfg.entries, authorityId);
  }

  async resolveAuthorization(input: AuthorizationInput): Promise<AuthorizationOutcome> {
    return { authorized: !!this.cfg.entries[input.authorityId]?.authorized, message: 'static decision' };
  }

  async resolveRecognition(input: RecognitionInput): Promise<RecognitionOutcome> {
    return { recognized: !!this.cfg.entries[input.authorityId]?.recognized, message: 'static decision' };
  }
}
