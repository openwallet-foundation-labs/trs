import type { EuTrustedListAdapterOptions } from './eu-trusted-list.options';

/**
 * Environment variables read by {@link euTrustedListOptionsFromEnv}.
 *
 * - `TRS_EU_LOTL_URL`       — list of trusted lists to serve instead of the EU
 *                             LoTL (e.g. a local mirror). Default: the EU LoTL.
 * - `TRS_EU_TL_ALLOW_HTTP`  — `true` / `1` accepts plain `http://` lists.
 *                             For a local mirror only; never in production.
 */
export const EU_TL_ENV = {
  lotlUrl: 'TRS_EU_LOTL_URL',
  allowHttp: 'TRS_EU_TL_ALLOW_HTTP',
} as const;

const truthy = (v: string | undefined) =>
  v !== undefined && /^(1|true|yes|on)$/i.test(v.trim());

/**
 * Builds adapter options from the environment, so a deployment (or a local
 * mirror test) can point the adapter elsewhere without a code change.
 * Throws at startup on a malformed URL, or on an `http://` URL without
 * `TRS_EU_TL_ALLOW_HTTP` — a misconfiguration should not surface later as
 * "list unavailable".
 */
export function euTrustedListOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EuTrustedListAdapterOptions {
  const raw = env[EU_TL_ENV.lotlUrl]?.trim();
  const allowInsecureHttp = truthy(env[EU_TL_ENV.allowHttp]);
  if (!raw) return allowInsecureHttp ? { http: { allowInsecureHttp } } : {};

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${EU_TL_ENV.lotlUrl} is not a valid URL: ${raw}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${EU_TL_ENV.lotlUrl} must be an http(s) URL: ${raw}`);
  }
  if (url.protocol === 'http:' && !allowInsecureHttp) {
    throw new Error(
      `${EU_TL_ENV.lotlUrl} is plain http (${raw}); set ${EU_TL_ENV.allowHttp}=true to allow it (local testing only)`,
    );
  }
  return {
    sources: [{ url: raw, kind: 'lotl' }], // kept verbatim: it is the authority_id
    ...(allowInsecureHttp ? { http: { allowInsecureHttp } } : {}),
  };
}
