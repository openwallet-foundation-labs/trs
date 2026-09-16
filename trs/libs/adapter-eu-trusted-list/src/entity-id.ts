import { AdapterError } from '@app/adapter-kit';
import { CertInfo, certInfo, pemOrBase64ToDer } from './x509.util';

/**
 * How a TRQP `entity_id` identifies something on a trusted list.
 *
 * | entity_id                           | meaning                                    |
 * |-------------------------------------|--------------------------------------------|
 * | `x509:cert:<base64/base64url DER>`  | a certificate (also: PEM, or bare `MII…`)  |
 * | `x509:ski:<base64 or hex>`          | a service's subject key identifier         |
 * | `x509:sha256:<hex>`                 | SHA-256 fingerprint of a service cert      |
 * | `tsp:<name>`                        | a TSP by TSPName / TSPTradeName (VATxx-…)  |
 */
export type EntityRef =
  | { kind: 'cert'; cert: CertInfo }
  | { kind: 'ski'; ski: string }
  | { kind: 'sha256'; sha256: string }
  | { kind: 'tsp'; name: string };

export class InvalidEntityIdError extends AdapterError {
  constructor(reason: string) {
    super(`Invalid entity_id for EU trusted list resolution: ${reason}`, 400);
  }
}

const HEX = /^[0-9a-f]+$/i;

function toHex(value: string, expectedBytes?: number): string | undefined {
  const compact = value.replace(/[:\s]/g, '');
  if (HEX.test(compact) && compact.length % 2 === 0) {
    if (!expectedBytes || compact.length === expectedBytes * 2) {
      return compact.toLowerCase();
    }
  }
  return undefined;
}

export function parseEntityId(entityId: string): EntityRef {
  const id = entityId.trim();

  if (
    id.startsWith('-----BEGIN CERTIFICATE-----') ||
    /^MII[A-Za-z0-9+/]/.test(id)
  ) {
    return certRef(id);
  }
  if (id.startsWith('x509:cert:'))
    return certRef(id.slice('x509:cert:'.length));

  if (id.startsWith('x509:ski:')) {
    const v = id.slice('x509:ski:'.length);
    // 20-byte SHA-1 key ids are the norm; hex is only accepted when unambiguous.
    const hex = toHex(v, 20) ?? Buffer.from(v, 'base64').toString('hex');
    if (!hex) throw new InvalidEntityIdError('empty x509:ski value');
    return { kind: 'ski', ski: hex };
  }

  if (id.startsWith('x509:sha256:')) {
    const hex = toHex(id.slice('x509:sha256:'.length), 32);
    if (!hex)
      throw new InvalidEntityIdError('x509:sha256 must be 32 bytes of hex');
    return { kind: 'sha256', sha256: hex };
  }

  if (id.startsWith('tsp:')) {
    const name = id.slice('tsp:'.length).trim();
    if (!name) throw new InvalidEntityIdError('empty tsp name');
    return { kind: 'tsp', name };
  }

  throw new InvalidEntityIdError(
    'expected x509:cert:, x509:ski:, x509:sha256:, tsp: or a PEM certificate',
  );
}

function certRef(value: string): EntityRef {
  const cert = certInfo(pemOrBase64ToDer(value));
  if (!cert) throw new InvalidEntityIdError('certificate could not be parsed');
  return { kind: 'cert', cert };
}
