import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { PkiAuthority, PkiX509AdapterOptions } from './pki-x509.options';

export const PKI_X509_ENV = {
  config: 'TRS_PKI_CONFIG',
} as const;

const isInline = (v: string) =>
  v.includes('-----BEGIN') || /^[A-Za-z0-9+/=_-]{64,}$/.test(v.trim());

export function pkiX509OptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  read: (path: string) => string = (p) => readFileSync(p, 'utf8'),
): PkiX509AdapterOptions {
  const file = env[PKI_X509_ENV.config]?.trim();
  if (!file) return {};

  let parsed: { authorities?: PkiAuthority[] };
  try {
    parsed = JSON.parse(read(file));
  } catch (e) {
    throw new Error(
      `${PKI_X509_ENV.config} (${file}): ${(e as Error).message}`,
    );
  }
  if (!Array.isArray(parsed.authorities)) {
    throw new Error(
      `${PKI_X509_ENV.config} (${file}): missing "authorities" array`,
    );
  }
  const base = dirname(file);
  const load = (values: unknown, field: string, id: string): string[] => {
    if (values === undefined) return [];
    if (!Array.isArray(values) || values.some((v) => typeof v !== 'string')) {
      throw new Error(
        `${PKI_X509_ENV.config}: ${id}.${field} must be an array of strings`,
      );
    }
    return values.map((v: string) =>
      isInline(v) ? v : read(resolve(base, v)),
    );
  };
  return {
    authorities: parsed.authorities.map((a) => {
      if (typeof a?.id !== 'string' || !a.id.trim()) {
        throw new Error(
          `${PKI_X509_ENV.config}: every authority needs an "id"`,
        );
      }
      return {
        id: a.id,
        trustAnchors: load(a.trustAnchors, 'trustAnchors', a.id),
        intermediates: load(a.intermediates, 'intermediates', a.id),
        crls: load(a.crls, 'crls', a.id),
      };
    }),
  };
}
