import { AdapterError } from '@app/adapter-kit';
import {
  Certificate,
  parseCertificate,
  pemOrBase64ToDer,
  splitPem,
} from './certificate';

export class InvalidEntityIdError extends AdapterError {
  constructor(reason: string) {
    super(`Invalid entity_id for PKI resolution: ${reason}`, 400);
  }
}

export function parseEntityId(entityId: string): Certificate[] {
  const id = entityId.trim();
  let parts: string[];
  if (id.startsWith('-----BEGIN CERTIFICATE-----')) parts = splitPem(id);
  else if (id.startsWith('x509:x5c:')) parts = id.slice(9).split(',');
  else if (id.startsWith('x509:cert:')) parts = [id.slice(10)];
  else if (/^MII[A-Za-z0-9+/]/.test(id)) parts = [id];
  else {
    throw new InvalidEntityIdError(
      'expected x509:cert:, x509:x5c: or a PEM certificate',
    );
  }
  return parts.map((p, i) => {
    if (!p.trim())
      throw new InvalidEntityIdError(`empty certificate #${i + 1}`);
    try {
      return parseCertificate(pemOrBase64ToDer(p));
    } catch {
      throw new InvalidEntityIdError(
        `certificate #${i + 1} could not be parsed`,
      );
    }
  });
}
