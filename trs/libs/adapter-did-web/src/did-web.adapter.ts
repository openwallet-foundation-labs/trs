import { TrustAdapter } from '@app/adapter-kit';
import type {
  AuthorizationInput,
  AuthorizationOutcome,
  RecognitionInput,
  RecognitionOutcome,
  TrustProtocolAdapter,
} from '@app/adapter-kit';

/**
 * did:web adapter. Routing (`canHandle`) is real — a cheap method-prefix
 * check with no I/O. Resolution is a deterministic stub for now; the real
 * did.json fetch + verification lands in #17.
 */
@TrustAdapter('did:web', { order: 10 })
export class DidWebAdapter implements TrustProtocolAdapter {
  readonly id = 'did:web';

  async canHandle(authorityId: string): Promise<boolean> {
    return authorityId.startsWith('did:web:');
  }

  async resolveAuthorization(input: AuthorizationInput): Promise<AuthorizationOutcome> {
    // TODO(#17): fetch /.well-known/did.json, verify, map to a real decision.
    return { authorized: true, message: `did:web resolved (stub) for ${input.authorityId}` };
  }

  async resolveRecognition(input: RecognitionInput): Promise<RecognitionOutcome> {
    return { recognized: true, message: `did:web resolved (stub) for ${input.authorityId}` };
  }
}
