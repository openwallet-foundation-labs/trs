import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const pem = (name: string): string =>
  readFileSync(join(__dirname, name), 'utf8');

export const b64 = (name: string): string =>
  pem(name)
    .replace(/-----(BEGIN|END) [A-Z0-9 ]+-----/g, '')
    .replace(/\s+/g, '');

export const ROOT_CRL_URL = 'http://pki.test/root.crl';
export const ISSUING_CRL_URL = 'http://pki.test/issuing.crl';
