import { Module } from '@nestjs/common';
import { DidWebAdapterModule } from '@app/adapter-did-web';
import {
  EuTrustedListAdapterModule,
  euTrustedListOptionsFromEnv,
} from '@app/adapter-eu-trusted-list';

/**
 * Trust-protocol adapter registration — the single place contributors touch.
 *
 * To add an adapter: build it as a `libs/adapter-*` module and add that module
 * to `imports` below. The AdapterRegistry auto-discovers it (order-based
 * first-match); nothing else in the resolver changes.
 */
@Module({
  imports: [
    DidWebAdapterModule,
    // EU LoTL + national trusted lists (ETSI TS 119 612). Lists are fetched
    // lazily on first use; see libs/adapter-eu-trusted-list for options.
    // TRS_EU_LOTL_URL / TRS_EU_TL_ALLOW_HTTP point it elsewhere (e.g. a mirror).
    EuTrustedListAdapterModule.forRoot(euTrustedListOptionsFromEnv()),
    // 👇 add new adapter modules here — e.g. DidWebvhAdapterModule (#18),
    //    OpenIdFederationAdapterModule (#20), PkiX509AdapterModule (#21) …
  ],
})
export class AdaptersModule {}
