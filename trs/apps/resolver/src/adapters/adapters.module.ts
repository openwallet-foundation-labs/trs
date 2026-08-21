import { Module } from '@nestjs/common';
import { DidWebAdapterModule } from '@app/adapter-did-web';
import { RegistrarAdapterModule } from '@app/adapter-registrar';
import { TrustedListAdapterModule } from '@app/adapter-trusted-list';

/**
 * Trust-protocol adapter registration — the single place contributors touch.
 *
 * To add an adapter: build it as a `libs/adapter-*` module and add that module
 * to `imports` below. The AdapterRegistry auto-discovers it (order-based
 * first-match); nothing else in the resolver changes.
 */

/** Scheme Operator publishing the ETSI TS 119 602 Trusted Lists. */
const TRUSTED_LIST_URL = process.env.TRUSTED_LIST_URL ?? 'https://trusted-list.vercel.app';
/**
 * The Scheme Operator certificate every Trusted List must be signed by. It is pinned here rather
 * than read from the list's own origin: a list that vouches for its own signer vouches for nothing.
 * Published at `${TRUSTED_LIST_URL}/tl/scheme-operator.pem`; rotate via the env var.
 */
const TRUSTED_LIST_SO_CERT_SHA256 =
  process.env.TRUSTED_LIST_SO_CERT_SHA256 ??
  'e5418dfd7173396738200c97ffa4e728a5dc05bee5f1e3062dee0eafe3cbac66';

/** Relying-party registrar (EUDI ARF TS5) — its public registry API base is the TRQP authority. */
const REGISTRAR_REGISTRY_URL =
  process.env.REGISTRAR_REGISTRY_URL ?? 'https://dev.api.hopae.com/registrar/registry';
/**
 * The registrar's CA, taken from the Scheme Operator's Trusted List rather than from the registrar
 * itself — that copy is covered by the Scheme Operator's signature, which is what makes the
 * registrar's own answers checkable.
 */
const REGISTRAR_TRUST_ANCHOR_URL =
  process.env.REGISTRAR_TRUST_ANCHOR_URL ?? `${TRUSTED_LIST_URL}/tl/registrar-ca.pem`;

@Module({
  imports: [
    DidWebAdapterModule,
    TrustedListAdapterModule.forRoot({
      baseUrl: TRUSTED_LIST_URL,
      schemeOperatorCertSha256: TRUSTED_LIST_SO_CERT_SHA256,
    }),
    RegistrarAdapterModule.forRoot({
      registryUrl: REGISTRAR_REGISTRY_URL,
      trustAnchorUrl: REGISTRAR_TRUST_ANCHOR_URL,
    }),
    // 👇 add new adapter modules here — e.g. DidWebvhAdapterModule (#18),
    //    OpenIdFederationAdapterModule (#20), PkiX509AdapterModule (#21) …
  ],
})
export class AdaptersModule {}
